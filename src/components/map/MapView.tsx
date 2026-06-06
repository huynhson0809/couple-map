import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Pin } from "../../types";
import { getImageUrl } from "../../lib/cloudinary";
import { supabase } from "../../lib/supabase";
import { useCategoriesCtx } from "../../hooks/CategoriesContext";

interface Props {
  pins: Pin[];
  currentUserId: string | undefined;
  partnerUserId: string | null | undefined;
  onLongPress: (coords: { lat: number; lng: number }) => void;
  onPinClick: (pin: Pin) => void;
  onUserLocation?: (coords: {
    lat: number;
    lng: number;
    accuracy?: number | null;
  }) => void;
  onMapCenterChange?: (coords: { lat: number; lng: number }) => void;
  onBoundsChange?: (bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  }) => void;
  flyTo?: {
    lat: number;
    lng: number;
    key: number;
    pinId?: string;
    bucketId?: string;
  } | null;
  showHeatmap?: boolean;
  bucketItems?: { id: string; lat: number; lng: number }[];
  onBucketClick?: (id: string) => void;
  newestPinId?: string | null;
  mapStyleUrl?: string;
}

const COLOR_USER_A = "#E24B4A";
const COLOR_USER_B = "#378ADD";
const CLUSTER_RADIUS_PX = 56;
const VENUE_CLUSTER_RADIUS_METERS = 45;
const SAME_PLACE_RADIUS_METERS = 4;
const CLUSTER_SCREEN_MAX_ZOOM = 16.5;
const CLUSTER_VENUE_MAX_ZOOM = 15.5;
const EXPLICIT_CAMERA_INTENT_MS = 8000;
const FLY_TO_ZOOM = 19;
const FLY_TO_DURATION_MS = 1150;
const FLY_TO_CORRECTION_MS = 240;
const FLY_TO_CENTER_TOLERANCE_METERS = 2.5;
const FLY_TO_ZOOM_TOLERANCE = 0.03;

interface Group {
  key: string;
  center: { lat: number; lng: number };
  pins: Pin[];
  highlighted: boolean;
}

interface ProjectedPin {
  pin: Pin;
  pt: { x: number; y: number };
}

export function MapView({
  pins,
  currentUserId,
  partnerUserId,
  onLongPress,
  onPinClick,
  onUserLocation,
  onMapCenterChange,
  onBoundsChange,
  flyTo,
  showHeatmap = false,
  bucketItems = [],
  onBucketClick,
  newestPinId,
  mapStyleUrl = "https://tiles.openfreemap.org/styles/bright",
}: Props) {
  const { customCategories, getCategory } = useCategoriesCtx();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const bucketMarkersRef = useRef<maplibregl.Marker[]>([]);
  const longPressTimer = useRef<number | null>(null);
  const renderMarkersTimer = useRef<number | null>(null);
  const styleLoadedRef = useRef(false);
  const didInitialFitRef = useRef<boolean>(false);
  const pinsRef = useRef<Pin[]>([]);
  const onLongPressRef = useRef(onLongPress);
  const onPinClickRef = useRef(onPinClick);
  const onUserLocationRef = useRef(onUserLocation);
  const onMapCenterChangeRef = useRef(onMapCenterChange);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const newestPinIdRef = useRef(newestPinId);
  const highlightedPinIdRef = useRef<string | null>(null);
  const highlightedBucketIdRef = useRef<string | null>(null);
  const pendingFlyToRef = useRef<Props["flyTo"]>(null);
  const explicitCameraTargetRef = useRef<{
    lat: number;
    lng: number;
    expiresAt: number;
  } | null>(null);
  const getCategoryRef = useRef(getCategory);
  const [clusterPinIds, setClusterPinIds] = useState<string[] | null>(null);

  useEffect(() => {
    pinsRef.current = pins;
    onLongPressRef.current = onLongPress;
    onPinClickRef.current = onPinClick;
    onUserLocationRef.current = onUserLocation;
    onMapCenterChangeRef.current = onMapCenterChange;
    onBoundsChangeRef.current = onBoundsChange;
    newestPinIdRef.current = newestPinId;
    getCategoryRef.current = getCategory;
  }, [
    pins,
    onLongPress,
    onPinClick,
    onUserLocation,
    onMapCenterChange,
    onBoundsChange,
    newestPinId,
    getCategory,
  ]);

  function pinColor(p: Pin) {
    if (p.created_by === currentUserId) return COLOR_USER_A;
    if (partnerUserId && p.created_by === partnerUserId) return COLOR_USER_B;
    return "#9333ea";
  }

  function computeGroups(map: maplibregl.Map): Group[] {
    const items = getRenderablePins(map).map((p) => ({
      pin: p,
      pt: map.project([p.lng, p.lat]),
    }));
    const groups: Group[] = [];
    const taken = new Set<string>();
    const highlightedPinId = highlightedPinIdRef.current;

    // Grid-based spatial bucketing — O(n) instead of O(n²)
    const cellSize = CLUSTER_RADIUS_PX;
    const grid = new Map<string, typeof items>();
    for (const it of items) {
      const cx = Math.floor(it.pt.x / cellSize);
      const cy = Math.floor(it.pt.y / cellSize);
      const key = `${cx},${cy}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(it);
      else grid.set(key, [it]);
    }

    for (const it of items) {
      if (taken.has(it.pin.id)) continue;
      taken.add(it.pin.id);
      const queue = [it];
      const groupPins: Pin[] = [];
      let sumLat = 0;
      let sumLng = 0;

      for (let i = 0; i < queue.length; i += 1) {
        const current = queue[i];
        groupPins.push(current.pin);
        sumLat += current.pin.lat;
        sumLng += current.pin.lng;

        // Only check neighboring grid cells instead of all items
        const cx = Math.floor(current.pt.x / cellSize);
        const cy = Math.floor(current.pt.y / cellSize);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const neighbors = grid.get(`${cx + dx},${cy + dy}`);
            if (!neighbors) continue;
            for (const other of neighbors) {
              if (taken.has(other.pin.id)) continue;
              if (shouldSkipHighlightedCluster(current.pin, other.pin))
                continue;
              if (shouldClusterPins(map, current, other)) {
                taken.add(other.pin.id);
                queue.push(other);
              }
            }
          }
        }
      }

      const n = groupPins.length;
      const key =
        n === 1
          ? `pin:${groupPins[0].id}`
          : `cl:${groupPins
              .map((p) => p.id)
              .sort((a, b) => a.localeCompare(b))
              .join(",")}`;
      groups.push({
        key,
        center: { lat: sumLat / n, lng: sumLng / n },
        pins: groupPins,
        highlighted: Boolean(
          highlightedPinId &&
          groupPins.some((pin) => pin.id === highlightedPinId),
        ),
      });
    }
    return groups;
  }

  function getRenderablePins(map: maplibregl.Map) {
    const bounds = map.getBounds();
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();
    const latPad = Math.max((north - south) * 0.18, 0.004);
    const lngPad = Math.max((east - west) * 0.18, 0.004);
    return pinsRef.current.filter(
      (pin) =>
        pin.lat >= south - latPad &&
        pin.lat <= north + latPad &&
        pin.lng >= west - lngPad &&
        pin.lng <= east + lngPad,
    );
  }

  function shouldSkipHighlightedCluster(a: Pin, b: Pin) {
    const highlightedPinId = highlightedPinIdRef.current;
    return Boolean(
      highlightedPinId &&
      (a.id === highlightedPinId || b.id === highlightedPinId),
    );
  }

  function distanceMeters(a: Pin, b: Pin) {
    return distanceLngLatMeters(a.lat, a.lng, b.lat, b.lng);
  }

  function distanceLngLatMeters(
    aLat: number,
    aLng: number,
    bLat: number,
    bLng: number,
  ) {
    const earthRadius = 6_371_000;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(h));
  }

  function shouldClusterPins(
    map: maplibregl.Map,
    a: ProjectedPin,
    b: ProjectedPin,
  ) {
    const zoom = map.getZoom();
    const meters = distanceMeters(a.pin, b.pin);
    if (meters <= SAME_PLACE_RADIUS_METERS) return true;
    if (zoom >= CLUSTER_SCREEN_MAX_ZOOM) return false;

    const dx = a.pt.x - b.pt.x;
    const dy = a.pt.y - b.pt.y;
    const closeOnScreen =
      dx * dx + dy * dy < CLUSTER_RADIUS_PX * CLUSTER_RADIUS_PX;
    if (closeOnScreen) return true;
    return (
      zoom < CLUSTER_VENUE_MAX_ZOOM && meters <= VENUE_CLUSTER_RADIUS_METERS
    );
  }

  function createPinEl(p: Pin) {
    const el = document.createElement("div");
    el.className = "circle-marker";
    if (newestPinIdRef.current && p.id === newestPinIdRef.current)
      el.classList.add("pulse");
    if (highlightedPinIdRef.current && p.id === highlightedPinIdRef.current)
      el.classList.add("showing");
    el.style.borderColor = pinColor(p);
    const cat = getCategoryRef.current(p.category);
    if (p.marker_image_url) {
      const img = document.createElement("img");
      img.src = getImageUrl(p.marker_image_url, 80);
      img.alt = "";
      el.appendChild(img);
    } else {
      const span = document.createElement("span");
      const text = p.marker_emoji ?? cat?.emoji ?? "📍";
      span.textContent = text;
      // Auto-scale font for multi-character text markers
      const len = [...text].length;
      if (len > 2) span.style.fontSize = "12px";
      else if (len > 1) span.style.fontSize = "16px";
      el.appendChild(span);
    }
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onPinClickRef.current(p);
    });
    return el;
  }

  function pinsShareLocation(groupPins: Pin[]) {
    if (groupPins.length < 2) return false;
    const first = groupPins[0];
    return groupPins.every(
      (pin) =>
        Math.abs(pin.lat - first.lat) < 0.000003 &&
        Math.abs(pin.lng - first.lng) < 0.000003,
    );
  }

  function openClusterList(pinIds: string[]) {
    setClusterPinIds(pinIds);
  }

  const closeClusterList = useCallback(() => {
    setClusterPinIds(null);
  }, []);

  function createClusterEl(
    count: number,
    _pins: Pin[],
    map: maplibregl.Map,
    _center: { lat: number; lng: number },
    groupPins: Pin[],
    highlighted: boolean,
  ) {
    // Store pin IDs to look up fresh data at click time
    const pinIds = groupPins.map((p) => p.id);

    const el = document.createElement("div");
    el.className = "cluster-bubble";
    if (highlighted) el.classList.add("showing");
    // size + color tier based on count
    let tier = 0;
    if (count >= 50) tier = 3;
    else if (count >= 25) tier = 2;
    else if (count >= 10) tier = 1;
    el.dataset.tier = String(tier);
    el.textContent = count > 999 ? "999+" : String(count);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      // Look up current pins at click time
      const currentPins = pinIds
        .map((id) => pinsRef.current.find((p) => p.id === id))
        .filter((p): p is Pin => p !== undefined);

      if (currentPins.length === 0) return;

      if (pinsShareLocation(currentPins) || map.getZoom() >= 17.5) {
        openClusterList(pinIds);
        return;
      }
      const bounds = new maplibregl.LngLatBounds();
      currentPins.forEach((p) => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 100, maxZoom: 18, duration: 600 });
    });
    return el;
  }

  function renderMarkers() {
    const map = mapRef.current;
    if (!map) return;
    const groups = computeGroups(map);
    const keep = new Set<string>();
    for (const g of groups) {
      keep.add(g.key);
      if (markersRef.current.has(g.key)) continue;
      let el: HTMLDivElement;
      if (g.pins.length === 1) {
        el = createPinEl(g.pins[0]);
      } else {
        el = createClusterEl(
          g.pins.length,
          g.pins,
          map,
          g.center,
          g.pins,
          g.highlighted,
        );
      }
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([g.center.lng, g.center.lat])
        .addTo(map);
      markersRef.current.set(g.key, marker);
    }
    for (const [key, m] of markersRef.current) {
      if (!keep.has(key)) {
        m.remove();
        markersRef.current.delete(key);
      }
    }
  }

  function fitToPinsOnce(map: maplibregl.Map) {
    if (didInitialFitRef.current) return;
    if (hasExplicitCameraIntent()) return;
    if (pinsRef.current.length === 0) return;
    didInitialFitRef.current = true;
    if (pinsRef.current.length === 1) {
      map.jumpTo({
        center: [pinsRef.current[0].lng, pinsRef.current[0].lat],
        zoom: 15,
      });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    pinsRef.current.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 0 });
  }

  function emitMapCenter(map: maplibregl.Map) {
    const center = map.getCenter();
    onMapCenterChangeRef.current?.({ lat: center.lat, lng: center.lng });
    const bounds = map.getBounds();
    onBoundsChangeRef.current?.({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    });
  }

  function hasExplicitCameraIntent() {
    const target = explicitCameraTargetRef.current;
    if (pendingFlyToRef.current) return true;
    if (!target) return false;
    if (target.expiresAt > Date.now()) return true;
    explicitCameraTargetRef.current = null;
    return false;
  }

  function rebuildMarkers() {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    if (styleLoadedRef.current) renderMarkers();
  }

  function renderBucketMarkers() {
    const map = mapRef.current;
    if (!map) return;
    const highlightedBucketId = highlightedBucketIdRef.current;
    bucketMarkersRef.current.forEach((m) => m.remove());
    bucketMarkersRef.current = [];
    bucketItems.forEach((b) => {
      const el = document.createElement("div");
      el.className = `bucket-marker ${b.id === highlightedBucketId ? "showing" : ""}`;
      el.innerHTML = "<span>★</span>";
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([b.lng, b.lat])
        .addTo(map);
      if (onBucketClick) {
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onBucketClick(b.id);
        });
      }
      bucketMarkersRef.current.push(marker);
    });
  }

  function getFlyToCenter(target: NonNullable<Props["flyTo"]>) {
    return [target.lng, target.lat] as [number, number];
  }

  function ensureFlyToCentered(
    map: maplibregl.Map,
    target: NonNullable<Props["flyTo"]>,
  ) {
    if (isFlyToCloseEnough(map, target)) {
      emitMapCenter(map);
      rebuildMarkers();
      renderBucketMarkers();
      return;
    }

    map.easeTo({
      center: getFlyToCenter(target),
      zoom: FLY_TO_ZOOM,
      duration: FLY_TO_CORRECTION_MS,
      easing: easeOutCubic,
      essential: true,
    });
    map.once("moveend", () => {
      emitMapCenter(map);
      rebuildMarkers();
      renderBucketMarkers();
    });
  }

  function isFlyToCloseEnough(
    map: maplibregl.Map,
    target: NonNullable<Props["flyTo"]>,
  ) {
    const center = map.getCenter();
    const distance = distanceLngLatMeters(
      center.lat,
      center.lng,
      target.lat,
      target.lng,
    );
    return (
      distance <= FLY_TO_CENTER_TOLERANCE_METERS &&
      Math.abs(map.getZoom() - FLY_TO_ZOOM) <= FLY_TO_ZOOM_TOLERANCE
    );
  }

  function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
  }

  function applyFlyTo(target: NonNullable<Props["flyTo"]>) {
    const map = mapRef.current;
    if (!map) return;
    if (
      !Number.isFinite(target.lat) ||
      !Number.isFinite(target.lng) ||
      Math.abs(target.lat) > 90 ||
      Math.abs(target.lng) > 180
    ) {
      return;
    }

    explicitCameraTargetRef.current = {
      lat: target.lat,
      lng: target.lng,
      expiresAt: Date.now() + EXPLICIT_CAMERA_INTENT_MS,
    };
    didInitialFitRef.current = true;
    highlightedPinIdRef.current = target.pinId ?? null;
    highlightedBucketIdRef.current = target.bucketId ?? null;
    map.stop();
    map.resize();
    rebuildMarkers();
    renderBucketMarkers();
    map.flyTo({
      center: getFlyToCenter(target),
      zoom: FLY_TO_ZOOM,
      duration: FLY_TO_DURATION_MS,
      curve: 1.35,
      easing: easeOutCubic,
      essential: true,
    });
    map.once("moveend", () => {
      ensureFlyToCentered(map, target);
    });
    window.setTimeout(() => {
      if (highlightedPinIdRef.current !== target.pinId) return;
      highlightedPinIdRef.current = null;
      rebuildMarkers();
    }, 5000);
    window.setTimeout(() => {
      if (highlightedBucketIdRef.current !== target.bucketId) return;
      highlightedBucketIdRef.current = null;
      renderBucketMarkers();
    }, 5000);
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl,
      center: [106.6297, 10.8231],
      zoom: 12,
      attributionControl: false,
      ...({ preserveDrawingBuffer: true } as Record<string, unknown>),
    } as ConstructorParameters<typeof maplibregl.Map>[0]);
    const geolocateControl = new maplibregl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      },
      trackUserLocation: false,
    });
    geolocateControl.on("geolocate", (event) => {
      const position = event as GeolocationPosition;
      onUserLocationRef.current?.({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null,
      });
    });
    geolocateControl.on("error", () => {
      /* The browser may report POSITION_UNAVAILABLE while GPS is warming up. */
    });
    map.addControl(geolocateControl, "bottom-right");

    function startLongPress(
      e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent,
    ) {
      // Ignore multi-touch (pinch/zoom) and right-click
      const native = e.originalEvent as TouchEvent | MouseEvent;
      if ("touches" in native && native.touches.length > 1) {
        cancelLongPress();
        return;
      }
      if ("button" in native && (native as MouseEvent).button !== 0) return;
      const lngLat =
        "lngLat" in e
          ? e.lngLat
          : (e as unknown as { lngLat: maplibregl.LngLat }).lngLat;
      cancelLongPress();
      longPressTimer.current = window.setTimeout(() => {
        onLongPressRef.current({ lat: lngLat.lat, lng: lngLat.lng });
      }, 500);
    }
    function cancelLongPress() {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
    map.on("touchstart", startLongPress);
    map.on("touchend", cancelLongPress);
    map.on("touchmove", cancelLongPress);
    map.on("touchcancel", cancelLongPress);
    map.on("mousedown", startLongPress);
    map.on("mouseup", cancelLongPress);
    map.on("mousemove", cancelLongPress);
    map.on("dragstart", cancelLongPress);
    map.on("zoomstart", cancelLongPress);
    map.on("rotatestart", cancelLongPress);
    map.on("pitchstart", cancelLongPress);

    map.on("load", () => {
      styleLoadedRef.current = true;
      fitToPinsOnce(map);
      emitMapCenter(map);
      renderMarkers();
      requestAnimationFrame(() => {
        map.resize();
        if (pendingFlyToRef.current) applyFlyTo(pendingFlyToRef.current);
      });
    });
    map.on("moveend", () => {
      emitMapCenter(map);
      if (renderMarkersTimer.current) clearTimeout(renderMarkersTimer.current);
      renderMarkersTimer.current = window.setTimeout(() => {
        renderMarkers();
      }, 60);
    });
    map.on("error", (e) => console.error("[MapLibre]", e?.error ?? e));

    const ro = new ResizeObserver(() => map.resize());
    if (containerRef.current) ro.observe(containerRef.current);

    mapRef.current = map;
    const markerStore = markersRef.current;
    return () => {
      ro.disconnect();
      markerStore.forEach((m) => m.remove());
      markerStore.clear();
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
    // MapLibre owns this imperative lifecycle. Dynamic callbacks are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Change map style when mapStyleUrl changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapStyleUrl);
    map.once("styledata", () => {
      styleLoadedRef.current = true;
      renderMarkers();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyleUrl]);

  // Re-render markers when pins / users / newestPinId change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    fitToPinsOnce(map);
    renderMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, currentUserId, partnerUserId, newestPinId, customCategories]);

  // Bucket markers
  useEffect(() => {
    renderBucketMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketItems, onBucketClick]);

  // Fly to
  useEffect(() => {
    pendingFlyToRef.current = flyTo;
    if (flyTo) applyFlyTo(flyTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  // Heatmap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function syncHeatmap() {
      if (!map) return;
      const geojson = {
        type: "FeatureCollection" as const,
        features: pins.map((p) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        })),
      };
      const src = map.getSource("pins-heat") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (src) src.setData(geojson);
      else map.addSource("pins-heat", { type: "geojson", data: geojson });
      if (!map.getLayer("heatmap-layer")) {
        map.addLayer({
          id: "heatmap-layer",
          type: "heatmap",
          source: "pins-heat",
          paint: {
            "heatmap-weight": 1,
            "heatmap-intensity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              1,
              15,
              3,
            ],
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              12,
              15,
              40,
            ],
            "heatmap-opacity": showHeatmap ? 0.75 : 0,
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(0,0,0,0)",
              0.2,
              "#67e8f9",
              0.4,
              "#a3e635",
              0.6,
              "#facc15",
              0.8,
              "#fb923c",
              1,
              "#e11d48",
            ],
          },
        });
      } else {
        map.setPaintProperty(
          "heatmap-layer",
          "heatmap-opacity",
          showHeatmap ? 0.75 : 0,
        );
      }
    }

    if (styleLoadedRef.current) syncHeatmap();
    else map.once("load", syncHeatmap);
  }, [pins, showHeatmap]);

  // Resolve cluster pins from IDs
  const clusterPins = clusterPinIds
    ? clusterPinIds
        .map((id) => pins.find((p) => p.id === id))
        .filter((p): p is Pin => p !== undefined)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
    : null;

  return (
    <div className="map-container-wrapper">
      <div ref={containerRef} className="map-container" />
      {clusterPins && clusterPins.length > 0 && (
        <ClusterListOverlay
          pins={clusterPins}
          getCategory={getCategory}
          onPinClick={(pin) => {
            highlightedPinIdRef.current = pin.id;
            rebuildMarkers();
            onPinClick(pin);
          }}
          onClose={closeClusterList}
        />
      )}
    </div>
  );
}

function ClusterListOverlay({
  pins,
  getCategory,
  onPinClick,
  onClose,
}: {
  pins: Pin[];
  getCategory: (
    id: string | null | undefined,
  ) => { emoji: string; label: string } | undefined;
  onPinClick: (pin: Pin) => void;
  onClose: () => void;
}) {
  const [loadedPins, setLoadedPins] = useState<(Pin & { coverUrl?: string })[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  // Load all cover images in one batch
  useEffect(() => {
    let cancelled = false;
    async function loadCovers() {
      const batchIds = pins.map((p) => p.id);
      const { data: imgData } = await supabase
        .from("pin_images")
        .select("pin_id, cloudinary_url")
        .in("pin_id", batchIds)
        .not("cloudinary_url", "ilike", "%/video/upload/%")
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      const coverMap: Record<string, string> = {};
      if (imgData) {
        for (const img of imgData) {
          if (!coverMap[img.pin_id]) {
            coverMap[img.pin_id] = img.cloudinary_url;
          }
        }
      }

      setLoadedPins(
        pins.map((p) => ({ ...p, coverUrl: coverMap[p.id] || undefined })),
      );
      setLoading(false);
    }
    loadCovers();
    return () => {
      cancelled = true;
    };
  }, [pins]);

  return (
    <div className="cluster-overlay-backdrop" onClick={onClose}>
      <div
        className="cluster-overlay-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="map-cluster-list-title">
          {pins.length} memories here
          <button className="cluster-overlay-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="cluster-overlay-scroll">
          {loading && (
            <div className="cluster-scroll-sentinel">
              <span
                className="cluster-img-loading"
                style={{ width: 32, height: 32, borderRadius: "50%" }}
              />
            </div>
          )}
          {loadedPins.map((pin) => {
            const cat = getCategory(pin.category);
            const categoryLabel =
              cat?.label ??
              (pin.category?.startsWith("custom_")
                ? "Memory"
                : (pin.category ?? "Memory"));
            return (
              <button
                key={pin.id}
                type="button"
                className="map-cluster-memory"
                onClick={() => onPinClick(pin)}
              >
                <span className="map-cluster-memory-media">
                  {pin.coverUrl ? (
                    <img src={getImageUrl(pin.coverUrl, 96, 70)} alt="" />
                  ) : (
                    (pin.marker_emoji ?? cat?.emoji ?? "📍")
                  )}
                </span>
                <span className="map-cluster-memory-copy">
                  <strong>{pin.title}</strong>
                  <small>
                    {cat?.emoji ?? pin.marker_emoji ?? "📍"} {categoryLabel}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
