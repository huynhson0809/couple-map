import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import type { Lang } from "../../hooks/I18nContext";
import type { MapStyleId, MapStyleOption } from "../../hooks/useMapStyle";

type MapLibreModule = typeof import("maplibre-gl");
type MapLibreMap = InstanceType<MapLibreModule["Map"]>;

interface Props {
  style: MapStyleOption | null;
  open: boolean;
  currentStyleId: MapStyleId;
  locked?: boolean;
  initialCenter: { lat: number; lng: number };
  lang: Lang;
  labels: {
    title: string;
    hint: string;
    cancel: string;
    apply: string;
    applied: string;
    loading: string;
    error: string;
    upgrade?: string;
  };
  onApply: () => void;
  onClose: () => void;
}

export function MapStylePreviewSheet({
  style,
  open,
  currentStyleId,
  locked,
  initialCenter,
  lang,
  labels,
  onApply,
  onClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add("map-style-preview-open");
    return () => {
      document.body.classList.remove("map-style-preview-open");
    };
  }, [open]);

  useEffect(() => {
    if (!open || !style || !containerRef.current) return undefined;

    let disposed = false;
    let mapLoaded = false;
    setLoading(true);
    setLoadError(false);

    void import("maplibre-gl")
      .then((maplibregl) => {
        if (disposed || !containerRef.current) return;

        try {
          const map = new maplibregl.Map({
            container: containerRef.current,
            style: style.url,
            center: [initialCenter.lng, initialCenter.lat],
            zoom: 11.5,
            attributionControl: false,
          });

          mapRef.current = map;
          map.addControl(
            new maplibregl.NavigationControl({ showCompass: false }),
            "bottom-right",
          );

          const timeout = window.setTimeout(() => {
            if (!disposed && !mapLoaded) {
              setLoading(false);
              setLoadError(true);
            }
          }, 15_000);

          map.once("load", () => {
            if (!disposed) {
              mapLoaded = true;
              clearTimeout(timeout);
              setLoading(false);
            }
          });
          map.on("error", (e) => {
            // Only treat style-level errors as fatal (not tile 404s)
            if (
              !disposed &&
              !mapLoaded &&
              e.error?.message?.includes("style")
            ) {
              clearTimeout(timeout);
              setLoading(false);
              setLoadError(true);
            }
          });
        } catch {
          if (!disposed) {
            setLoading(false);
            setLoadError(true);
          }
        }
      })
      .catch(() => {
        if (!disposed) {
          setLoading(false);
          setLoadError(true);
        }
      });

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initialCenter.lat, initialCenter.lng, open, style]);

  if (!style) return null;

  const applied = style.id === currentStyleId;
  const styleName = lang === "vi" ? style.labelVi : style.labelEn;

  return (
    <BottomSheet open={open} onClose={onClose} title={labels.title}>
      <div className="map-style-preview-sheet">
        <div className="map-style-preview-copy">
          <strong>{styleName}</strong>
          <p className="map-style-preview-hint">{labels.hint}</p>
        </div>

        <div
          className="map-style-preview-map"
          style={{
            background: style.colors[0],
          }}
        >
          <div
            ref={containerRef}
            className="map-style-preview-canvas"
            aria-label={styleName}
          />

          {(loading || loadError) && (
            <div
              className="map-style-preview-overlay"
              role={loadError ? "alert" : "status"}
            >
              <span>{loadError ? labels.error : labels.loading}</span>
            </div>
          )}
        </div>

        <div className="map-style-preview-actions">
          <Button variant="ghost" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button
            onClick={onApply}
            disabled={locked || applied || loading || loadError}
          >
            {locked
              ? (labels.upgrade ?? labels.apply)
              : applied
                ? labels.applied
                : labels.apply}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
