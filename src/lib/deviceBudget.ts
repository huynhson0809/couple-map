interface DeviceHints {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export function getDeviceBudget(
  hints: DeviceHints = typeof navigator === "undefined" ? {} : navigator,
  pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio,
) {
  const isIOS =
    /iPad|iPhone|iPod/.test(hints.userAgent ?? "") ||
    (hints.platform === "MacIntel" && (hints.maxTouchPoints ?? 0) > 1);
  const constrained =
    isIOS ||
    ((hints.deviceMemory ?? 0) > 0 && hints.deviceMemory! <= 4) ||
    ((hints.hardwareConcurrency ?? 0) > 0 && hints.hardwareConcurrency! <= 4);

  return {
    constrained,
    mapPixelRatio: Math.min(
      Math.max(pixelRatio || 1, 1),
      constrained ? 1.5 : 2,
    ),
    mapTileCacheSize: constrained ? 32 : 128,
    imageMaxDimension: constrained ? 1024 : 1200,
  };
}
