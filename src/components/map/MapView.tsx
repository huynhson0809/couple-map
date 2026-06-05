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
const VENUE_CLUSTER_RADIUS_METERS = 45;

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
  const pendingFlyToRef = useRef<Props["flyTo"]>(null);
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
    const items = pinsRef.current.map((p) => ({
      pin: p,
      pt: map.project([p.lng, p.lat]),
    }));
    const groups: Group[] = [];
    const taken = new Set<string>();
    const highlightedPinId = highlightedPinIdRef.current;
    for (const it of items) {
      if (taken.has(it.pin.id)) continue;
      taken.add(it.pin.id);
      const groupPins = [it.pin];
      let sumLat = it.pin.lat;
      let sumLng = it.pin.lng;
      for (const other of items) {
        if (taken.has(other.pin.id)) continue;
        if (shouldClusterPins(it, other)) {
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

  function distanceMeters(a: Pin, b: Pin) {
    const earthRadius = 6_371_000;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadius * Math.asin(Math.sqrt(h));
  }

  function shouldClusterPins(a: ProjectedPin, b: ProjectedPin) {
    const dx = a.pt.x - b.pt.x;
    const dy = a.pt.y - b.pt.y;
    const closeOnScreen =
      dx * dx + dy * dy < CLUSTER_RADIUS_PX * CLUSTER_RADIUS_PX;
    if (closeOnScreen) return true;
    return distanceMeters(a.pin, b.pin) <= VENUE_CLUSTER_RADIUS_METERS;
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
      attributionControl: false,
      ...({ preserveDrawingBuffer: true } as Record<string, unknown>),
    } as ConstructorParameters<typeof maplibregl.Map>[0]);
    const geolocateControl = new maplibregl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 12_000,
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
