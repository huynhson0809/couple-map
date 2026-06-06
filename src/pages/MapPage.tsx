import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Flame, Plus } from "lucide-react";
import { useI18n } from "../hooks/I18nContext";
import { BottomSheet } from "../components/ui/BottomSheet";
import { CreatePinForm } from "../components/pins/CreatePinForm";
import { PinDetail } from "../components/pins/PinDetail";
import { UpgradePrompt } from "../components/ui/UpgradePrompt";
import { useAuth } from "../hooks/useAuth";
import { useCoupleCtx } from "../hooks/CoupleContext";
import { usePinsCtx } from "../hooks/PinsContext";
import { useBucket } from "../hooks/useBucket";
import { useLocation as useGeo } from "../hooks/useLocation";
import { useMapStyle } from "../hooks/useMapStyle";
import { useStreak } from "../hooks/useStreak";
import { useSubscription } from "../hooks/useSubscription";
import type { Pin } from "../types";

const MapView = lazy(() =>
  import("../components/map/MapView").then((module) => ({
    default: module.MapView,
  })),
);

interface FlyToState {
  flyTo?: {
    lat: number;
    lng: number;
    pinId?: string;
    bucketId?: string;
    openDetail?: boolean;
  };
}

const RECENT_LOCATION_MS = 60_000;
const GOOD_PIN_ACCURACY_METERS = 80;
const GPS_QUICK_MS = 6000;
const STREAK_FLOAT_STORAGE_KEY = "pinly.map.streakFloatPosition";
const STREAK_DRAG_HOLD_MS = 220;
const STREAK_DRAG_EDGE_PADDING = 12;
const STREAK_DRAG_MOVE_TOLERANCE = 6;
const STREAK_CLICK_SUPPRESS_MS = 180;

interface StreakFloatPosition {
  x: number;
  y: number;
}

interface StreakDragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  latestClientX: number;
  latestClientY: number;
  origin: StreakFloatPosition;
  timerId: number;
  dragging: boolean;
  moved: boolean;
}

function isAccurateEnough(coords: { accuracy?: number | null }) {
  return (
    coords.accuracy !== null &&
    coords.accuracy !== undefined &&
    Number.isFinite(coords.accuracy) &&
    coords.accuracy <= GOOD_PIN_ACCURACY_METERS
  );
}

function readStreakFloatPosition(): StreakFloatPosition | null {
  try {
    const raw = localStorage.getItem(STREAK_FLOAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StreakFloatPosition>;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: Number(parsed.x), y: Number(parsed.y) };
  } catch {
    return null;
  }
}

function writeStreakFloatPosition(position: StreakFloatPosition) {
  try {
    localStorage.setItem(STREAK_FLOAT_STORAGE_KEY, JSON.stringify(position));
  } catch {
    /* localStorage can be unavailable in constrained browser modes. */
  }
}

function getBottomNavHeight() {
  return (
    document.querySelector<HTMLElement>(".bottom-nav")?.getBoundingClientRect()
      .height ?? 0
  );
}

function getStreakButtonPosition(button: HTMLElement): StreakFloatPosition {
  const rect = button.getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}

function clampStreakFloatPosition(
  position: StreakFloatPosition,
  button: HTMLElement,
): StreakFloatPosition {
  const rect = button.getBoundingClientRect();
  const width = rect.width || button.offsetWidth || 76;
  const height = rect.height || button.offsetHeight || 44;
  const bottomNavHeight = getBottomNavHeight();
  const minX = STREAK_DRAG_EDGE_PADDING;
  const minY = STREAK_DRAG_EDGE_PADDING;
  const maxX = Math.max(minX, window.innerWidth - width - STREAK_DRAG_EDGE_PADDING);
  const maxY = Math.max(
    minY,
    window.innerHeight - bottomNavHeight - height - STREAK_DRAG_EDGE_PADDING,
  );

  return {
    x: Math.min(maxX, Math.max(minX, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y)),
  };
}

export function MapPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { couple, profile, partner } = useCoupleCtx();
  const { pins, deletePin, fetchPins, onViewportChange, loadPinById } =
    usePinsCtx();
  const { items: bucketItems } = useBucket(couple?.id, user?.id);
  const { getCurrentPosition } = useGeo();
  const { styleUrl } = useMapStyle();
  const streak = useStreak(couple, profile?.id ?? user?.id);
  const { canCreatePin } = useSubscription();
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  const newestPinId = useMemo(() => {
    let newest: Pin | null = null;
    let newestTime = Number.NEGATIVE_INFINITY;

    for (const pin of pins) {
      const time = new Date(pin.created_at).getTime();
      if (time > newestTime) {
        newest = pin;
        newestTime = time;
      }
    }

    return newest?.id ?? null;
  }, [pins]);
  const bucketMarkers = useMemo(
    () =>
      bucketItems.map((b) => ({ id: b.id, lat: b.lat, lng: b.lng })),
    [bucketItems],
  );
  const [newPinCoords, setNewPinCoords] = useState<{
    lat: number;
    lng: number;
    accuracy?: number | null;
  } | null>(null);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [flyTo, setFlyTo] = useState<{
    lat: number;
    lng: number;
    key: number;
    pinId?: string;
    bucketId?: string;
  } | null>(null);
  const [lastUserLocation, setLastUserLocation] = useState<{
    lat: number;
    lng: number;
    accuracy?: number | null;
    receivedAt: number;
  } | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 10.8231, lng: 106.6297 });
  const [streakFloatPosition, setStreakFloatPosition] =
    useState<StreakFloatPosition | null>(() => readStreakFloatPosition());
  const [streakDragging, setStreakDragging] = useState(false);
  const flyKey = useRef(0);
  const pendingPinIdRef = useRef<string | null>(null);
  const streakButtonRef = useRef<HTMLButtonElement | null>(null);
  const streakDragRef = useRef<StreakDragState | null>(null);
  const suppressStreakClickRef = useRef(false);
  const suppressStreakClickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const s = routeLocation.state as FlyToState | null;
    if (!s?.flyTo) return;

    flyKey.current += 1;
    setFlyTo({ ...s.flyTo, key: flyKey.current });
    const targetPinId = s.flyTo.pinId;
    if (targetPinId && !pins.some((pin) => pin.id === targetPinId)) {
      void loadPinById(targetPinId);
    }
    pendingPinIdRef.current =
      s.flyTo.openDetail === false ? null : (s.flyTo.pinId ?? null);
    navigate(`${routeLocation.pathname}${routeLocation.search}`, {
      replace: true,
      state: null,
    });
  }, [
    navigate,
    loadPinById,
    pins,
    routeLocation.key,
    routeLocation.pathname,
    routeLocation.search,
    routeLocation.state,
  ]);

  useEffect(() => {
    const pinId = new URLSearchParams(routeLocation.search).get("pin");
    if (!pinId) return;

    const pin = pins.find((p) => p.id === pinId);
    if (!pin) {
      pendingPinIdRef.current = pinId;
      void loadPinById(pinId);
      return;
    }

    flyKey.current += 1;
    setFlyTo({
      lat: pin.lat,
      lng: pin.lng,
      pinId: pin.id,
      key: flyKey.current,
    });
    setSelectedPin(pin);
    navigate(routeLocation.pathname, { replace: true, state: null });
  }, [
    loadPinById,
    navigate,
    pins,
    routeLocation.pathname,
    routeLocation.search,
  ]);

  useEffect(() => {
    const pendingPinId = pendingPinIdRef.current;
    if (!pendingPinId) return;
    const p = pins.find((x) => x.id === pendingPinId);
    if (!p) return;
    flyKey.current += 1;
    setFlyTo({ lat: p.lat, lng: p.lng, pinId: p.id, key: flyKey.current });
    setSelectedPin(p);
    pendingPinIdRef.current = null;
  }, [pins]);

  useLayoutEffect(() => {
    let rafId = 0;

    function syncPosition() {
      const button = streakButtonRef.current;
      if (!button) return;
      setStreakFloatPosition((current) => {
        const position =
          current ?? readStreakFloatPosition() ?? getStreakButtonPosition(button);
        return clampStreakFloatPosition(position, button);
      });
    }

    rafId = requestAnimationFrame(syncPosition);
    window.addEventListener("resize", syncPosition);
    window.visualViewport?.addEventListener("resize", syncPosition);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", syncPosition);
      window.visualViewport?.removeEventListener("resize", syncPosition);
    };
  }, [couple?.id, user?.id]);

  useEffect(() => {
    return () => {
      if (suppressStreakClickTimerRef.current !== null) {
        window.clearTimeout(suppressStreakClickTimerRef.current);
      }
    };
  }, []);

  function clearStreakClickSuppress() {
    if (suppressStreakClickTimerRef.current !== null) {
      window.clearTimeout(suppressStreakClickTimerRef.current);
      suppressStreakClickTimerRef.current = null;
    }
    suppressStreakClickRef.current = false;
  }

  function suppressNextStreakClickBriefly() {
    clearStreakClickSuppress();
    suppressStreakClickRef.current = true;
    suppressStreakClickTimerRef.current = window.setTimeout(
      clearStreakClickSuppress,
      STREAK_CLICK_SUPPRESS_MS,
    );
  }

  function resolveStreakPosition(button: HTMLButtonElement) {
    if (streakFloatPosition) return streakFloatPosition;
    const initial = clampStreakFloatPosition(
      readStreakFloatPosition() ?? getStreakButtonPosition(button),
      button,
    );
    setStreakFloatPosition(initial);
    return initial;
  }

  function getDragPosition(
    state: StreakDragState,
    button: HTMLButtonElement,
  ) {
    return clampStreakFloatPosition(
      {
        x: state.origin.x + state.latestClientX - state.startClientX,
        y: state.origin.y + state.latestClientY - state.startClientY,
      },
      button,
    );
  }

  function handleStreakPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    const button = streakButtonRef.current;
    if (!button) return;
    const pointerId = event.pointerId;
    const state: StreakDragState = {
      pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      latestClientX: event.clientX,
      latestClientY: event.clientY,
      origin: resolveStreakPosition(button),
      timerId: 0,
      dragging: false,
      moved: false,
    };

    button.setPointerCapture(pointerId);
    state.timerId = window.setTimeout(() => {
      const current = streakDragRef.current;
      if (!current || current.pointerId !== pointerId) return;
      current.dragging = true;
      setStreakDragging(true);
      setStreakFloatPosition(getDragPosition(current, button));
    }, STREAK_DRAG_HOLD_MS);
    streakDragRef.current = state;
  }

  function handleStreakPointerMove(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const state = streakDragRef.current;
    const button = streakButtonRef.current;
    if (!state || !button || state.pointerId !== event.pointerId) return;

    state.latestClientX = event.clientX;
    state.latestClientY = event.clientY;
    const distance = Math.hypot(
      state.latestClientX - state.startClientX,
      state.latestClientY - state.startClientY,
    );
    if (distance > STREAK_DRAG_MOVE_TOLERANCE) state.moved = true;
    if (!state.dragging) return;

    event.preventDefault();
    setStreakFloatPosition(getDragPosition(state, button));
  }

  function handleStreakPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = streakDragRef.current;
    const button = streakButtonRef.current;
    if (!state || !button || state.pointerId !== event.pointerId) return;

    window.clearTimeout(state.timerId);
    if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }

    if (state.dragging) {
      const next = getDragPosition(state, button);
      setStreakFloatPosition(next);
      writeStreakFloatPosition(next);
    }

    if (state.dragging || state.moved) suppressNextStreakClickBriefly();
    streakDragRef.current = null;
    setStreakDragging(false);
  }

  function handleStreakClick(event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressStreakClickRef.current) {
      event.preventDefault();
      clearStreakClickSuppress();
      return;
    }
    navigate("/wishlist");
  }

  const handleLongPress = useCallback(
    (c: { lat: number; lng: number }) => {
      if (!canCreatePin(pins.length)) {
        setShowUpgradePrompt(true);
        return;
      }
      setNewPinCoords(c);
    },
    [canCreatePin, pins.length],
  );

  const handlePinClick = useCallback((p: Pin) => {
    setSelectedPin(p);
  }, []);

  async function handleFabClick() {
    if (!canCreatePin(pins.length)) {
      setShowUpgradePrompt(true);
      return;
    }
    if (
      lastUserLocation &&
      Date.now() - lastUserLocation.receivedAt < RECENT_LOCATION_MS &&
      isAccurateEnough(lastUserLocation)
    ) {
      setNewPinCoords({
        lat: lastUserLocation.lat,
        lng: lastUserLocation.lng,
        accuracy: lastUserLocation.accuracy,
      });
      return;
    }

    // Prefer a fresh high-accuracy GPS fix before falling back to map center.
    try {
      const c = await Promise.race([
        getCurrentPosition(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), GPS_QUICK_MS),
        ),
      ]);
      setLastUserLocation({ ...c, receivedAt: Date.now() });
      setNewPinCoords(c);
    } catch {
      // GPS too slow or failed — use map center, then replace only with better GPS.
      setNewPinCoords({ ...mapCenter, accuracy: null });
      getCurrentPosition()
        .then((c) => {
          setLastUserLocation({ ...c, receivedAt: Date.now() });
          setNewPinCoords((current) => {
            if (!current) return current;
            const currentAccuracy =
              current.accuracy === null || current.accuracy === undefined
                ? Infinity
                : current.accuracy;
            const nextAccuracy =
              c.accuracy === null || c.accuracy === undefined
                ? Infinity
                : c.accuracy;
            return nextAccuracy < currentAccuracy ? c : current;
          });
        })
        .catch(() => {});
    }
  }

  if (!couple || !user)
    return <div className="full-center muted">Loading map…</div>;

  const streakFloatStyle: CSSProperties | undefined = streakFloatPosition
    ? {
        left: streakFloatPosition.x,
        right: "auto",
        top: streakFloatPosition.y,
      }
    : undefined;
  const streakFloatClassName = [
    "map-streak-float",
    streak.todayCompleted ? "complete" : "",
    streak.atRisk ? "risk" : "",
    streakFloatPosition ? "positioned" : "",
    streakDragging ? "dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="map-page">
      <Suspense fallback={<div className="full-center muted">Loading map…</div>}>
        <MapView
          pins={pins}
          currentUserId={user.id}
          partnerUserId={partner?.id ?? null}
          onLongPress={handleLongPress}
          onPinClick={handlePinClick}
          onUserLocation={(coords) =>
            setLastUserLocation({ ...coords, receivedAt: Date.now() })
          }
          onMapCenterChange={setMapCenter}
          onBoundsChange={onViewportChange}
          flyTo={flyTo}
          bucketItems={bucketMarkers}
          newestPinId={newestPinId}
          mapStyleUrl={styleUrl}
        />
      </Suspense>

      <button className="fab" onClick={handleFabClick} aria-label="Pin here">
        <Plus size={24} />
      </button>

      <button
        type="button"
        ref={streakButtonRef}
        className={streakFloatClassName}
        style={streakFloatStyle}
        onPointerDown={handleStreakPointerDown}
        onPointerMove={handleStreakPointerMove}
        onPointerUp={handleStreakPointerUp}
        onPointerCancel={handleStreakPointerUp}
        onClick={handleStreakClick}
        aria-label={t("streak.title")}
      >
        <Flame size={20} fill="currentColor" />
        <span>{streak.currentCount}</span>
      </button>

      <BottomSheet
        open={!!newPinCoords}
        onClose={() => setNewPinCoords(null)}
        title={t("pin.newMemory")}
      >
        {newPinCoords && couple && user && (
          <CreatePinForm
            coupleId={couple.id}
            userId={user.id}
            coords={newPinCoords}
            onCreated={() => {
              setNewPinCoords(null);
              fetchPins();
            }}
            onCancel={() => setNewPinCoords(null)}
          />
        )}
      </BottomSheet>

      <BottomSheet
        open={!!selectedPin}
        onClose={() => setSelectedPin(null)}
        title={t("pin.memory")}
      >
        {selectedPin && (
          <PinDetail
            pin={pins.find((p) => p.id === selectedPin.id) ?? selectedPin}
            currentUserId={user.id}
            currentUserName={profile?.display_name ?? user.email ?? null}
            onDelete={async (id) => {
              await deletePin(id);
              setSelectedPin(null);
            }}
            onUpdated={() => {
              // pins state already updated via usePinsCtx setPins; close sheet
              setSelectedPin(null);
            }}
          />
        )}
      </BottomSheet>

      {showUpgradePrompt && (
        <UpgradePrompt
          feature={lang === "vi" ? "Tạo kỷ niệm" : "Create memories"}
          onUpgrade={() => {
            setShowUpgradePrompt(false);
            navigate("/settings");
          }}
          onDismiss={() => setShowUpgradePrompt(false)}
        />
      )}
    </div>
  );
}
