import type { Lang } from "../hooks/I18nContext";

export const DEFAULT_MAP_CENTER: { lat: number; lng: number } = {
  lat: 20,
  lng: 0,
};
export const DEFAULT_MAP_ZOOM = 2.25;

const MAP_STYLE_PREVIEW_CENTERS: Record<
  Lang,
  { lat: number; lng: number }
> = {
  en: { lat: 51.5072, lng: -0.1276 },
  vi: { lat: 10.8231, lng: 106.6297 },
};

export function getMapStylePreviewCenter(lang: Lang) {
  return MAP_STYLE_PREVIEW_CENTERS[lang];
}

export function shouldAutoLocateMap({
  permissionState,
  pinCount,
  hasExplicitCameraIntent,
}: {
  permissionState: PermissionState;
  pinCount: number;
  hasExplicitCameraIntent: boolean;
}) {
  return (
    permissionState === "granted" &&
    pinCount === 0 &&
    !hasExplicitCameraIntent
  );
}
