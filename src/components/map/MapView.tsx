import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Pin } from "../../types";
import { getImageUrl } from "../../lib/cloudinary";
import { supabase } from "../../lib/supabase";
import { useCategoriesCtx } from "../../hooks/CategoriesContext";
import { getPrimaryCategory } from "../../lib/pinCategories";

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
const SAME_PLACE_RADIUS_METERS = 8;
const MEMORY_SOURCE_ID = "memory-pins";
const MEMORY_CLUSTER_CIRCLE_LAYER = "memory-cluster-circle";
const MEMORY_CLUSTER_COUNT_LAYER = "memory-cluster-count";
const MEMORY_SAME_PLACE_CIRCLE_LAYER = "memory-same-place-circle";
const MEMORY_SAME_PLACE_COUNT_LAYER = "memory-same-place-count";
const MEMORY_PIN_CIRCLE_LAYER = "memory-pin-circle";
const MEMORY_PIN_LABEL_LAYER = "memory-pin-label";
const MEMORY_PIN_HIGHLIGHT_LAYER = "memory-pin-highlight";
const MEMORY_CLUSTER_MAX_ZOOM = 15;
const MEMORY_CLUSTER_RADIUS_PX = 56;
const MEMORY_PIN_SPRITE_SIZE = 56;
const MEMORY_PIN_SPRITE_PIXEL_RATIO = 2;
const MEMORY_PIN_BADGE_RADIUS = 22;
const MEMORY_PIN_IMAGE_RADIUS = 17.5;
const EXPLICIT_CAMERA_INTENT_MS = 8000;
const FLY_TO_ZOOM = 19;
const FLY_TO_DURATION_MS = 1150;
const FLY_TO_CORRECTION_MS = 240;
const FLY_TO_CENTER_TOLERANCE_METERS = 2.5;
const FLY_TO_ZOOM_TOLERANCE = 0.03;

const MEMORY_LAYER_IDS = [
  MEMORY_CLUSTER_CIRCLE_LAYER,
  MEMORY_CLUSTER_COUNT_LAYER,
  MEMORY_SAME_PLACE_CIRCLE_LAYER,
  MEMORY_SAME_PLACE_COUNT_LAYER,
  MEMORY_PIN_HIGHLIGHT_LAYER,
  MEMORY_PIN_CIRCLE_LAYER,
  MEMORY_PIN_LABEL_LAYER,
] as const;

const MEMORY_INTERACTION_LAYER_IDS = [
  MEMORY_CLUSTER_CIRCLE_LAYER,
  MEMORY_CLUSTER_COUNT_LAYER,
  MEMORY_SAME_PLACE_CIRCLE_LAYER,
  MEMORY_SAME_PLACE_COUNT_LAYER,
  MEMORY_PIN_CIRCLE_LAYER,
  MEMORY_PIN_LABEL_LAYER,
] as const;

type MemoryFeatureType = "memory-pin" | "same-place";

type MemoryFeatureProperties = {
  type: MemoryFeatureType;
  pinId: string;
  pinIdsJson: string;
  memoryCount: number;
  emoji: string;
  markerImageUrl: string;
  iconImageId: string;
  color: string;
  highlighted: boolean;
};

type MemorySpriteInput = {
  emoji: string;
  color: string;
  markerImageUrl: string;
};

type MemorySpriteRenderInput = MemorySpriteInput & {
  image?: HTMLImageElement;
};

type MemoryFeature = GeoJSON.Feature<GeoJSON.Point, MemoryFeatureProperties>;
type MemoryFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  MemoryFeatureProperties
>;

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
  const { customCategories } = useCategoriesCtx();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const memoryFeaturesRef = useRef<MemoryFeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const memoryLayerReadyRef = useRef(false);
  const memorySpriteLoadIdsRef = useRef<Set<string>>(new Set());
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
  const highlightedBucketIdRef = useRef<string | null>(null);
  const pendingFlyToRef = useRef<Props["flyTo"]>(null);
  const explicitCameraTargetRef = useRef<{
    lat: number;
    lng: number;
    expiresAt: number;
  } | null>(null);
  const [clusterPinIds, setClusterPinIds] = useState<string[] | null>(null);

  useEffect(() => {
    pinsRef.current = pins;
    onLongPressRef.current = onLongPress;
    onPinClickRef.current = onPinClick;
    onUserLocationRef.current = onUserLocation;
    onMapCenterChangeRef.current = onMapCenterChange;
    onBoundsChangeRef.current = onBoundsChange;
    newestPinIdRef.current = newestPinId;
  }, [
    pins,
    onLongPress,
    onPinClick,
    onUserLocation,
    onMapCenterChange,
    onBoundsChange,
    newestPinId,
  ]);

  function pinColor(p: Pin) {
    if (p.created_by === currentUserId) return COLOR_USER_A;
    if (partnerUserId && p.created_by === partnerUserId) return COLOR_USER_B;
    return "#9333ea";
  }

  function buildMemoryFeatureCollection(): MemoryFeatureCollection {
    const groups = groupPinsBySamePlace(getClusterablePins());
    return {
      type: "FeatureCollection",
      features: groups.map((groupPins) =>
        groupPins.length === 1
          ? pinToMemoryFeature(groupPins[0])
          : samePlacePinsToMemoryFeature(groupPins),
      ),
    };
  }

  function getClusterablePins() {
    return pinsRef.current;
  }

  function groupPinsBySamePlace(sourcePins: Pin[]) {
    const groups: Pin[][] = [];
    const consumed = new Set<string>();

    for (const pin of sourcePins) {
      if (consumed.has(pin.id)) continue;
      const group = [pin];
      consumed.add(pin.id);

      for (const other of sourcePins) {
        if (consumed.has(other.id)) continue;
        if (!isSamePlaceGroup([...group, other])) continue;
        group.push(other);
        consumed.add(other.id);
      }

      groups.push(group);
    }

    return groups;
  }

  function pinToMemoryFeature(pin: Pin): MemoryFeature {
    const cat = getPrimaryCategory(pin, customCategories);
    const emoji = pin.marker_emoji ?? cat?.emoji ?? "📍";
    const color = pinColor(pin);
    const markerImageUrl = pin.marker_image_url
      ? getImageUrl(pin.marker_image_url, 120, 80)
      : "";
    return {
      type: "Feature",
      properties: {
        type: "memory-pin",
        pinId: pin.id,
        pinIdsJson: JSON.stringify([pin.id]),
        memoryCount: 1,
        emoji,
        markerImageUrl,
        iconImageId: getMemorySpriteId({ emoji, color, markerImageUrl }),
        color,
        highlighted: Boolean(
          newestPinIdRef.current === pin.id || highlightedPinIdRef.current === pin.id,
        ),
      },
      geometry: {
        type: "Point",
        coordinates: [pin.lng, pin.lat],
      },
    };
  }

  function samePlacePinsToMemoryFeature(groupPins: Pin[]): MemoryFeature {
    const sortedPins = [...groupPins].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const representative = sortedPins[0];
    const cat = getPrimaryCategory(representative, customCategories);
    const emoji = representative.marker_emoji ?? cat?.emoji ?? "📍";
    const color = pinColor(representative);
    const markerImageUrl = representative.marker_image_url
      ? getImageUrl(representative.marker_image_url, 120, 80)
      : "";
    return {
      type: "Feature",
      properties: {
        type: "same-place",
        pinId: representative.id,
        pinIdsJson: JSON.stringify(sortedPins.map((pin) => pin.id)),
        memoryCount: sortedPins.length,
        emoji,
        markerImageUrl,
        iconImageId: getMemorySpriteId({ emoji, color, markerImageUrl }),
        color,
        highlighted: sortedPins.some(
          (pin) =>
            newestPinIdRef.current === pin.id ||
            highlightedPinIdRef.current === pin.id,
        ),
      },
      geometry: {
        type: "Point",
        coordinates: [representative.lng, representative.lat],
      },
    };
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

  function pinsShareLocation(groupPins: Pin[]) {
    return isSamePlaceGroup(groupPins);
  }

  function isSamePlaceGroup(groupPins: Pin[]) {
    if (groupPins.length < 2) return false;
    const first = groupPins[0];
    return groupPins.every(
      (pin) =>
        distanceLngLatMeters(pin.lat, pin.lng, first.lat, first.lng) <=
        SAME_PLACE_RADIUS_METERS,
    );
  }

  function openClusterList(pinIds: string[]) {
    setClusterPinIds(pinIds);
  }

  const closeClusterList = useCallback(() => {
    setClusterPinIds(null);
  }, []);

  function getMemorySpriteId(input: MemorySpriteInput) {
    return `memory-marker-${hashMemorySpriteKey(
      `${input.markerImageUrl || input.emoji}|${input.color}`,
    )}`;
  }

  function hashMemorySpriteKey(value: string) {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 33) ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
  }

  function registerMemorySprites(
    map: maplibregl.Map,
    featureCollection: MemoryFeatureCollection,
  ) {
    for (const feature of featureCollection.features) {
      const props = feature.properties;
      if (props.type !== "memory-pin") continue;
      if (!map.hasImage(props.iconImageId)) {
        map.addImage(props.iconImageId, renderMemorySprite(props), {
          pixelRatio: MEMORY_PIN_SPRITE_PIXEL_RATIO,
        });
      }
      if (props.markerImageUrl) loadMemorySpriteImage(map, props);
    }
  }

  function loadMemorySpriteImage(
    map: maplibregl.Map,
    input: MemoryFeatureProperties,
  ) {
    if (memorySpriteLoadIdsRef.current.has(input.iconImageId)) return;
    memorySpriteLoadIdsRef.current.add(input.iconImageId);

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (mapRef.current !== map || !map.isStyleLoaded()) return;
      const sprite = renderMemorySprite({ ...input, image });
      if (map.hasImage(input.iconImageId)) {
        map.updateImage(input.iconImageId, sprite);
      } else {
        map.addImage(input.iconImageId, sprite, {
          pixelRatio: MEMORY_PIN_SPRITE_PIXEL_RATIO,
        });
      }
      map.triggerRepaint();
    };
    image.src = input.markerImageUrl;
  }

  function renderMemorySprite(input: MemorySpriteRenderInput) {
    const canvas = document.createElement("canvas");
    const canvasSize = MEMORY_PIN_SPRITE_SIZE * MEMORY_PIN_SPRITE_PIXEL_RATIO;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return new ImageData(canvasSize, canvasSize);
    }

    ctx.scale(MEMORY_PIN_SPRITE_PIXEL_RATIO, MEMORY_PIN_SPRITE_PIXEL_RATIO);

    const center = MEMORY_PIN_SPRITE_SIZE / 2;
    const ringRadius = MEMORY_PIN_BADGE_RADIUS;
    const gradient = ctx.createLinearGradient(
      0,
      center - ringRadius,
      0,
      center + ringRadius,
    );
    gradient.addColorStop(0, "rgba(255,255,255,0.96)");
    gradient.addColorStop(1, "rgba(248,250,255,0.86)");

    ctx.save();
    ctx.shadowColor = "rgba(44,52,72,0.22)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.beginPath();
    ctx.arc(center, center, ringRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    if (input.image) {
      drawCoverImage(
        ctx,
        input.image,
        center,
        center,
        MEMORY_PIN_IMAGE_RADIUS,
      );
    } else {
      drawEmojiSprite(ctx, input.emoji, center, center);
    }

    ctx.beginPath();
    ctx.arc(center, center, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = input.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, ringRadius - 2.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 1;
    ctx.stroke();

    return ctx.getImageData(0, 0, canvasSize, canvasSize);
  }

  function drawCoverImage(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    centerX: number,
    centerY: number,
    radius: number,
  ) {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return;

    const size = radius * 2;
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = 1;
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (sourceRatio > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx = (sourceWidth - sw) / 2;
    } else {
      sh = sourceWidth / targetRatio;
      sy = (sourceHeight - sh) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      image,
      sx,
      sy,
      sw,
      sh,
      centerX - radius,
      centerY - radius,
      size,
      size,
    );
    ctx.restore();
  }

  function drawEmojiSprite(
    ctx: CanvasRenderingContext2D,
    emoji: string,
    centerX: number,
    centerY: number,
  ) {
    const glyphCount = [...emoji].length;
    const fontSize = glyphCount > 2 ? 15 : glyphCount > 1 ? 19 : 23;
    ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, centerX, centerY + 1);
  }

  function syncMemoryLayers() {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current || !map.isStyleLoaded()) return;
    ensureMemoryLayers(map);
    syncMemorySource(map);
    raiseMemoryLayers(map);
  }

  function ensureMemoryLayers(map: maplibregl.Map) {
    if (!map.getSource(MEMORY_SOURCE_ID)) {
      map.addSource(MEMORY_SOURCE_ID, {
        type: "geojson",
        data: memoryFeaturesRef.current,
        cluster: true,
        clusterRadius: MEMORY_CLUSTER_RADIUS_PX,
        clusterMaxZoom: MEMORY_CLUSTER_MAX_ZOOM,
        clusterProperties: {
          memoryCount: ["+", ["get", "memoryCount"]],
        },
      } as unknown as maplibregl.SourceSpecification);
    }

    if (!map.getLayer(MEMORY_CLUSTER_CIRCLE_LAYER)) {
      map.addLayer({
        id: MEMORY_CLUSTER_CIRCLE_LAYER,
        type: "circle",
        source: MEMORY_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": [
            "step",
            ["coalesce", ["get", "memoryCount"], ["get", "point_count"]],
            24,
            10,
            28,
            25,
            34,
            50,
            40,
          ],
          "circle-color": [
            "step",
            ["coalesce", ["get", "memoryCount"], ["get", "point_count"]],
            "#ff8a4c",
            10,
            "#ff5a5f",
            25,
            "#d84fc7",
            50,
            "#a93ce8",
          ],
          "circle-stroke-color": "rgba(255,255,255,0.92)",
          "circle-stroke-width": 3,
          "circle-blur": 0,
        },
      });
    }

    if (!map.getLayer(MEMORY_CLUSTER_COUNT_LAYER)) {
      map.addLayer({
        id: MEMORY_CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: MEMORY_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": [
            "to-string",
            ["coalesce", ["get", "memoryCount"], ["get", "point_count"]],
          ],
          "text-size": 16,
          "text-font": ["Noto Sans Bold"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.08)",
          "text-halo-width": 1,
        },
      });
    }

    if (!map.getLayer(MEMORY_SAME_PLACE_CIRCLE_LAYER)) {
      map.addLayer({
        id: MEMORY_SAME_PLACE_CIRCLE_LAYER,
        type: "circle",
        source: MEMORY_SOURCE_ID,
        filter: ["==", ["get", "type"], "same-place"],
        paint: {
          "circle-radius": 24,
          "circle-color": ["get", "color"],
          "circle-stroke-color": "rgba(255,255,255,0.92)",
          "circle-stroke-width": 3,
        },
      });
    }

    if (!map.getLayer(MEMORY_SAME_PLACE_COUNT_LAYER)) {
      map.addLayer({
        id: MEMORY_SAME_PLACE_COUNT_LAYER,
        type: "symbol",
        source: MEMORY_SOURCE_ID,
        filter: ["==", ["get", "type"], "same-place"],
        layout: {
          "text-field": ["to-string", ["get", "memoryCount"]],
          "text-size": 14,
          "text-font": ["Noto Sans Bold"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.12)",
          "text-halo-width": 1,
        },
      });
    }

    if (!map.getLayer(MEMORY_PIN_HIGHLIGHT_LAYER)) {
      map.addLayer({
        id: MEMORY_PIN_HIGHLIGHT_LAYER,
        type: "circle",
        source: MEMORY_SOURCE_ID,
        filter: [
          "all",
          ["==", ["get", "type"], "memory-pin"],
          ["==", ["get", "highlighted"], true],
        ],
        paint: {
          "circle-radius": 32,
          "circle-color": "rgba(255,90,95,0.16)",
          "circle-stroke-color": "rgba(255,90,95,0.52)",
          "circle-stroke-width": 3,
        },
      });
    }

    if (!map.getLayer(MEMORY_PIN_CIRCLE_LAYER)) {
      map.addLayer({
        id: MEMORY_PIN_CIRCLE_LAYER,
        type: "circle",
        source: MEMORY_SOURCE_ID,
        filter: ["==", ["get", "type"], "memory-pin"],
        paint: {
          "circle-radius": 24,
          "circle-color": "rgba(255,255,255,0.01)",
          "circle-stroke-color": "rgba(255,255,255,0)",
          "circle-stroke-width": 0,
        },
      });
    }

    if (!map.getLayer(MEMORY_PIN_LABEL_LAYER)) {
      map.addLayer({
        id: MEMORY_PIN_LABEL_LAYER,
        type: "symbol",
        source: MEMORY_SOURCE_ID,
        filter: ["==", ["get", "type"], "memory-pin"],
        layout: {
          "icon-image": ["get", "iconImageId"],
          "icon-size": 1,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-anchor": "center",
        },
      });
    }

    memoryLayerReadyRef.current = true;
  }

  function syncMemorySource(map: maplibregl.Map) {
    memoryFeaturesRef.current = buildMemoryFeatureCollection();
    registerMemorySprites(map, memoryFeaturesRef.current);
    const source = map.getSource(MEMORY_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData(memoryFeaturesRef.current);
  }

  function removeMemoryLayersAndSource(map: maplibregl.Map) {
    for (const layerId of MEMORY_LAYER_IDS) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    if (map.getSource(MEMORY_SOURCE_ID)) map.removeSource(MEMORY_SOURCE_ID);
    memorySpriteLoadIdsRef.current.clear();
    memoryLayerReadyRef.current = false;
  }

  function getExistingMemoryInteractionLayers(map: maplibregl.Map) {
    return MEMORY_INTERACTION_LAYER_IDS.filter((layerId) => map.getLayer(layerId));
  }

  function raiseMemoryLayers(map: maplibregl.Map) {
    for (const layerId of MEMORY_LAYER_IDS) {
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    }
  }

  function getPinIdsFromFeature(feature: maplibregl.MapGeoJSONFeature) {
    const raw = feature.properties?.pinIdsJson;
    if (typeof raw !== "string") return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  }

  function getFirstMemoryFeatureAtPoint(
    map: maplibregl.Map,
    point: maplibregl.PointLike,
  ) {
    const layers = getExistingMemoryInteractionLayers(map);
    if (layers.length === 0) return null;
    const features = map.queryRenderedFeatures(point, { layers });
    return features[0] ?? null;
  }

  async function handleMemoryFeatureClick(e: maplibregl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;
    const feature = getFirstMemoryFeatureAtPoint(map, e.point);
    if (!feature) return;

    e.preventDefault();
    const properties = feature.properties ?? {};

    if (properties.cluster === true) {
      const clusterId = Number(properties.cluster_id);
      const source = map.getSource(MEMORY_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!source || !Number.isFinite(clusterId)) return;
      const expansionZoom = await source.getClusterExpansionZoom(clusterId);
      const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
      map.easeTo({
        center: [lng, lat],
        zoom: Math.min(expansionZoom, FLY_TO_ZOOM),
        duration: 600,
        easing: easeOutCubic,
      });
      return;
    }

    const pinIds = getPinIdsFromFeature(feature);
    if (pinIds.length === 0) return;

    const currentPins = pinIds
      .map((id) => pinsRef.current.find((pin) => pin.id === id))
      .filter((pin): pin is Pin => pin !== undefined);

    if (
      properties.type === "same-place" ||
      pinIds.length > 1 ||
      pinsShareLocation(currentPins)
    ) {
      openClusterList(pinIds);
      return;
    }

    const pin = currentPins[0];
    if (!pin) return;
    onPinClickRef.current(pin);
  }

  function handleMemoryPointerMove(e: maplibregl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = getFirstMemoryFeatureAtPoint(map, e.point)
      ? "pointer"
      : "";
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
      syncMemoryLayers();
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
      syncMemoryLayers();
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
    syncMemoryLayers();
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
      syncMemoryLayers();
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
      if (getFirstMemoryFeatureAtPoint(map, e.point)) {
        cancelLongPress();
        return;
      }
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
      syncMemoryLayers();
      requestAnimationFrame(() => {
        map.resize();
        if (pendingFlyToRef.current) applyFlyTo(pendingFlyToRef.current);
      });
    });
    map.on("moveend", () => {
      emitMapCenter(map);
    });
    map.on("click", handleMemoryFeatureClick);
    map.on("mousemove", handleMemoryPointerMove);
    map.on("error", (e) => console.error("[MapLibre]", e?.error ?? e));

    const ro = new ResizeObserver(() => map.resize());
    if (containerRef.current) ro.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.off("click", handleMemoryFeatureClick);
      map.off("mousemove", handleMemoryPointerMove);
      bucketMarkersRef.current.forEach((marker) => marker.remove());
      bucketMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
    // MapLibre owns this imperative lifecycle. Dynamic callbacks are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Change map style when mapStyleUrl changes (skip initial render)
  const initialStyleRef = useRef(mapStyleUrl);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mapStyleUrl === initialStyleRef.current) {
      initialStyleRef.current = "";
      return;
    }
    initialStyleRef.current = "";
    styleLoadedRef.current = false;
    removeMemoryLayersAndSource(map);
    map.setStyle(mapStyleUrl);
    map.once("styledata", () => {
      styleLoadedRef.current = true;
      syncMemoryLayers();
      renderBucketMarkers();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyleUrl]);

  // Re-render memory layers when pins / users / newestPinId change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    fitToPinsOnce(map);
    syncMemoryLayers();
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
        map.addLayer(
          {
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
          },
          map.getLayer(MEMORY_CLUSTER_CIRCLE_LAYER)
            ? MEMORY_CLUSTER_CIRCLE_LAYER
            : undefined,
        );
      } else {
        map.setPaintProperty(
          "heatmap-layer",
          "heatmap-opacity",
          showHeatmap ? 0.75 : 0,
        );
      }
      if (memoryLayerReadyRef.current) raiseMemoryLayers(map);
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
          customCategories={customCategories}
          onPinClick={(pin) => {
            highlightedPinIdRef.current = pin.id;
            syncMemoryLayers();
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
  customCategories,
  onPinClick,
  onClose,
}: {
  pins: Pin[];
  customCategories: Parameters<typeof getPrimaryCategory>[1];
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
            const cat = getPrimaryCategory(pin, customCategories);
            const categoryLabel = cat?.label ?? "Memory";
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
