import { useCallback, useEffect, useState } from "react";

const MAP_3D_MODE_STORAGE_KEY = "pinly.map-3d-enabled";

function readStoredMap3DMode() {
  try {
    return localStorage.getItem(MAP_3D_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredMap3DMode(enabled: boolean) {
  try {
    localStorage.setItem(MAP_3D_MODE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* localStorage can be unavailable in constrained browser modes. */
  }
}

export function useMap3DMode(canUseMap3D: boolean) {
  const [map3DEnabled, setMap3DEnabledState] = useState<boolean>(() =>
    canUseMap3D ? readStoredMap3DMode() : false,
  );

  useEffect(() => {
    if (!canUseMap3D) {
      setMap3DEnabledState(false);
      return;
    }
    setMap3DEnabledState(readStoredMap3DMode());
  }, [canUseMap3D]);

  const setMap3DEnabled = useCallback(
    (enabled: boolean) => {
      if (!canUseMap3D) return;
      setMap3DEnabledState(enabled);
      writeStoredMap3DMode(enabled);
    },
    [canUseMap3D],
  );

  return { map3DEnabled, setMap3DEnabled };
}
