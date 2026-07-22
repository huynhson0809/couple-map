function readBooleanFlag(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

// Keep multi-space opt-in while the product temporarily runs in single-space mode.
export const MULTI_SPACE_ENABLED = readBooleanFlag(
  import.meta.env.VITE_MULTI_SPACE_ENABLED,
  false,
);

export const YEAR_REPLAY_ENABLED = readBooleanFlag(
  import.meta.env.VITE_YEAR_REPLAY_ENABLED,
  true,
);
