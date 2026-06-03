import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Flame, Plus } from "lucide-react";
import { useI18n } from "../hooks/I18nContext";
import { MapView } from "../components/map/MapView";
import { BottomSheet } from "../components/ui/BottomSheet";
import { CreatePinForm } from "../components/pins/CreatePinForm";
import { PinDetail } from "../components/pins/PinDetail";
import { useAuth } from "../hooks/useAuth";
import { useCoupleCtx } from "../hooks/CoupleContext";
import { usePinsCtx } from "../hooks/PinsContext";
import { useBucket } from "../hooks/useBucket";
import { useLocation as useGeo } from "../hooks/useLocation";
import { useMapStyle } from "../hooks/useMapStyle";
import { useStreak } from "../hooks/useStreak";
import type { Pin } from "../types";

interface FlyToState {
  flyTo?: { lat: number; lng: number; pinId?: string; openDetail?: boolean };
}

export function MapPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { couple, profile, partner } = useCoupleCtx();
  const { pins, deletePin, fetchPins, onViewportChange } = usePinsCtx();
  const { items: bucketItems } = useBucket(couple?.id, user?.id);
  const { getCurrentPosition } = useGeo();
  const { styleUrl } = useMapStyle();
  const streak = useStreak(couple, profile?.id ?? user?.id);
  const routeLocation = useLocation();
  const navigate = useNavigate();

  const newestPinId =
    pins.length > 0
      ? [...pins].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0].id
      : null;
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
  } | null>(null);
  const [lastUserLocation, setLastUserLocation] = useState<{
    lat: number;
    lng: number;
    accuracy?: number | null;
    receivedAt: number;
  } | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 10.8231, lng: 106.6297 });
  const flyKey = useRef(0);
  const pendingPinIdRef = useRef<string | null>(null);

  useEffect(() => {
    const s = routeLocation.state as FlyToState | null;
    if (!s?.flyTo) return;

    flyKey.current += 1;
    setFlyTo({ ...s.flyTo, key: flyKey.current });
    pendingPinIdRef.current = s.flyTo.openDetail === false ? null : (s.flyTo.pinId ?? null);
    navigate(`${routeLocation.pathname}${routeLocation.search}`, {
      replace: true,
      state: null,
    });
  }, [navigate, routeLocation.key, routeLocation.pathname, routeLocation.search, routeLocation.state]);

  useEffect(() => {
    const pinId = new URLSearchParams(routeLocation.search).get("pin");
    if (!pinId) return;

    const pin = pins.find((p) => p.id === pinId);
    if (!pin) {
      pendingPinIdRef.current = pinId;
      void fetchPins();
      return;
    }

    flyKey.current += 1;
    setFlyTo({ lat: pin.lat, lng: pin.lng, pinId: pin.id, key: flyKey.current });
    setSelectedPin(pin);
    navigate(routeLocation.pathname, { replace: true, state: null });
  }, [fetchPins, navigate, pins, routeLocation.pathname, routeLocation.search]);

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

  const handleLongPress = useCallback((c: { lat: number; lng: number }) => {
    setNewPinCoords(c);
  }, []);

  const handlePinClick = useCallback((p: Pin) => {
    setSelectedPin(p);
  }, []);

  async function handleFabClick() {
    if (lastUserLocation && Date.now() - lastUserLocation.receivedAt < 60_000) {
      setNewPinCoords({
        lat: lastUserLocation.lat,
        lng: lastUserLocation.lng,
        accuracy: lastUserLocation.accuracy,
      });
      return;
    }

    // Race GPS against a short timeout so FAB never blocks more than 3s
    const GPS_QUICK_MS = 3000;
    try {
      const c = await Promise.race([
        getCurrentPosition(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), GPS_QUICK_MS)
        ),
      ]);
      setLastUserLocation({ ...c, receivedAt: Date.now() });
      setNewPinCoords(c);
    } catch {
      // GPS too slow or failed — use map center, let GPS update in background
      setNewPinCoords({ ...mapCenter, accuracy: null });
      getCurrentPosition()
        .then((c) => {
          setLastUserLocation({ ...c, receivedAt: Date.now() });
          setNewPinCoords(c);
        })
        .catch(() => {});
    }
  }

  if (!couple || !user)
    return <div className="full-center muted">Loading map…</div>;

  return (
    <div className="map-page">
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
        bucketItems={bucketItems
          .filter((b) => b.status === "dream")
          .map((b) => ({ id: b.id, lat: b.lat, lng: b.lng }))}
        newestPinId={newestPinId}
        mapStyleUrl={styleUrl}
      />

      <button className="fab" onClick={handleFabClick} aria-label="Pin here">
        <Plus size={24} />
      </button>

      <button
        type="button"
        className={`map-streak-float ${streak.todayCompleted ? "complete" : streak.atRisk ? "risk" : ""}`}
        onClick={() => navigate("/wishlist")}
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
    </div>
  );
}
