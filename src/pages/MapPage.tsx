import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
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
import type { Pin } from "../types";

interface FlyToState {
  flyTo?: { lat: number; lng: number; pinId?: string };
}

export function MapPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { couple, partner } = useCoupleCtx();
  const { pins, deletePin, fetchPins } = usePinsCtx();
  const { items: bucketItems } = useBucket(couple?.id, user?.id);
  const { getCurrentPosition } = useGeo();
  const { styleUrl } = useMapStyle();
  const routeLocation = useLocation();

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
  } | null>(null);
  const [lastUserLocation, setLastUserLocation] = useState<{
    lat: number;
    lng: number;
    accuracy?: number | null;
    receivedAt: number;
  } | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 10.8231, lng: 106.6297 });
  const flyKey = useRef(0);

  useEffect(() => {
    const s = routeLocation.state as FlyToState | null;
    if (s?.flyTo) {
      flyKey.current += 1;
      setFlyTo({ ...s.flyTo, key: flyKey.current });
      if (s.flyTo.pinId) {
        const p = pins.find((x) => x.id === s.flyTo!.pinId);
        if (p) setSelectedPin(p);
      }
      window.history.replaceState({}, "");
    }
  }, [routeLocation.state, pins]);

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

    try {
      const c = await getCurrentPosition();
      setLastUserLocation({ ...c, receivedAt: Date.now() });
      setNewPinCoords(c);
    } catch {
      setNewPinCoords({ ...mapCenter, accuracy: null });
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
