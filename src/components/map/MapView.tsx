import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Pin } from "../../types";
import { getImageUrl } from "../../lib/cloudinary";
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
  flyTo?: { lat: number; lng: number; key: number; pinId?: string } | null;
  showHeatmap?: boolean;
  bucketItems?: { id: string; lat: number; lng: number }[];
  onBucketClick?: (id: string) => void;
  newestPinId?: string | null;
  mapStyleUrl?: string;
}

const COLOR_USER_A = "#E24B4A";
const COLOR_USER_B = "#378ADD";
const CLUSTER_RADIUS_PX = 56;

interface Group {
  key: string;
  center: { lat: number; lng: number };
  pins: Pin[];
}

export function MapView({
  pins,
  currentUserId,
  partnerUserId,
  onLongPress,
  onPinClick,
  onUserLocation,
  onMapCenterChange,
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
  const styleLoadedRef = useRef(false);
  const didInitialFitRef = useRef<boolean>(false);
  const pinsRef = useRef<Pin[]>([]);
  const onPinClickRef = useRef(onPinClick);
  const onUserLocationRef = useRef(onUserLocation);
  const onMapCenterChangeRef = useRef(onMapCenterChange);
  const newestPinIdRef = useRef(newestPinId);
  const highlightedPinIdRef = useRef<string | null>(null);
  const pendingFlyToRef = useRef<Props["flyTo"]>(null);

  useEffect(() => {
    pinsRef.current = pins;
    onPinClickRef.current = onPinClick;
    onUserLocationRef.current = onUserLocation;
    onMapCenterChangeRef.current = onMapCenterChange;
    newestPinIdRef.current = newestPinId;
  }, [pins, onPinClick, onUserLocation, onMapCenterChange, newestPinId]);

  function pinColor(p: Pin) {
    if (p.created_by === currentUserId) return COLOR_USER_A;
    if (partnerUserId && p.created_by === partnerUserId) return COLOR_USER_B;
    return "#9333ea";
  }

  function computeGroups(map: maplibregl.Map): Group[] {
    const items = pinsRef.current.map((p) => ({
      pin: p,
      pt: map.project([p.lng, p.lat]),
    }));
    const groups: Group[] = [];
    const taken = new Set<string>();
    const highlightedItem = highlightedPinIdRef.current
      ? items.find((item) => item.pin.id === highlightedPinIdRef.current)
      : undefined;
    if (highlightedItem) {
      taken.add(highlightedItem.pin.id);
      groups.push({
        key: `pin:${highlightedItem.pin.id}`,
        center: { lat: highlightedItem.pin.lat, lng: highlightedItem.pin.lng },
        pins: [highlightedItem.pin],
      });
    }
    for (const it of items) {
      if (taken.has(it.pin.id)) continue;
      taken.add(it.pin.id);
      const groupPins = [it.pin];
      let sumLat = it.pin.lat;
      let sumLng = it.pin.lng;
      for (const other of items) {
        if (taken.has(other.pin.id)) continue;
        const dx = it.pt.x - other.pt.x;
        const dy = it.pt.y - other.pt.y;
        if (dx * dx + dy * dy < CLUSTER_RADIUS_PX * CLUSTER_RADIUS_PX) {
          taken.add(other.pin.id);
          groupPins.push(other.pin);
          sumLat += other.pin.lat;
          sumLng += other.pin.lng;
        }
      }
      const n = groupPins.length;
      const key =
        n === 1
          ? `pin:${groupPins[0].id}`
          : `cl:${groupPins
              .map((p) => p.id)
              .sort()
              .join(",")}`;
      groups.push({
        key,
        center: { lat: sumLat / n, lng: sumLng / n },
        pins: groupPins,
      });
    }
    return groups;
  }

  function createPinEl(p: Pin) {
    const el = document.createElement("div");
    el.className = "circle-marker";
    if (newestPinIdRef.current && p.id === newestPinIdRef.current)
      el.classList.add("pulse");
    if (highlightedPinIdRef.current && p.id === highlightedPinIdRef.current)
      el.classList.add("showing");
    el.style.borderColor = pinColor(p);
    const cat = getCategory(p.category);
    if (p.marker_image_url) {
      const img = document.createElement("img");
      img.src = getImageUrl(p.marker_image_url, 80);
      img.alt = "";
      el.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.textContent = p.marker_emoji ?? cat?.emoji ?? "📍";
      el.appendChild(span);
    }
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onPinClickRef.current(p);
    });
    return el;
  }

  function createClusterEl(
    count: number,
    _pins: Pin[],
    map: maplibregl.Map,
    center: { lat: number; lng: number },
    groupPins: Pin[],
  ) {
    const el = document.createElement("div");
    el.className = "cluster-bubble";
    // size + color tier based on count
    let tier = 0;
    if (count >= 50) tier = 3;
    else if (count >= 25) tier = 2;
    else if (count >= 10) tier = 1;
    el.dataset.tier = String(tier);
    el.textContent = count > 999 ? "999+" : String(count);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const bounds = new maplibregl.LngLatBounds();
      groupPins.forEach((p) => bounds.extend([p.lng, p.lat]));
      if (groupPins.length === 1) {
        map.easeTo({
          center: [center.lng, center.lat],
          zoom: Math.min(map.getZoom() + 2, 18),
        });
      } else {
        map.fitBounds(bounds, { padding: 100, maxZoom: 18, duration: 600 });
      }
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
        el = createClusterEl(g.pins.length, g.pins, map, g.center, g.pins);
      }
      const m = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([g.center.lng, g.center.lat])
        .addTo(map);
      markersRef.current.set(g.key, m);
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
  }

  function rebuildMarkers() {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    if (styleLoadedRef.current) renderMarkers();
  }

  function applyFlyTo(target: NonNullable<Props["flyTo"]>) {
    const map = mapRef.current;
    if (!map) return;
    highlightedPinIdRef.current = target.pinId ?? null;
    rebuildMarkers();
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: 19,
      speed: 0.82,
      curve: 1.2,
      essential: true,
    });
    map.once("moveend", () => {
      rebuildMarkers();
    });
    window.setTimeout(() => {
      if (highlightedPinIdRef.current !== target.pinId) return;
      highlightedPinIdRef.current = null;
      rebuildMarkers();
    }, 5000);
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl,
      center: [106.6297, 10.8231],
      zoom: 12,
      ...({ preserveDrawingBuffer: true } as Record<string, unknown>),
    } as ConstructorParameters<typeof maplibregl.Map>[0]);
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    const geolocateControl = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
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
    map.addControl(geolocateControl, "top-right");

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
        onLongPress({ lat: lngLat.lat, lng: lngLat.lng });
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
      if (pendingFlyToRef.current) applyFlyTo(pendingFlyToRef.current);
      requestAnimationFrame(() => map.resize());
    });
    map.on("moveend", () => {
      emitMapCenter(map);
      renderMarkers();
    });
    map.on("error", (e) => console.error("[MapLibre]", e?.error ?? e));

    const ro = new ResizeObserver(() => map.resize());
    if (containerRef.current) ro.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
  }, [onLongPress]);

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
    if (!map) return;
    // Force full rebuild to refresh content (color/emoji/photo can change)
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    if (styleLoadedRef.current) {
      fitToPinsOnce(map);
      renderMarkers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, currentUserId, partnerUserId, newestPinId, customCategories]);

  // Bucket markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    bucketMarkersRef.current.forEach((m) => m.remove());
    bucketMarkersRef.current = [];
    bucketItems.forEach((b) => {
      const el = document.createElement("div");
      el.className = "bucket-marker";
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

  return <div ref={containerRef} className="map-container" />;
}
