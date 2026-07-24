import {
  translate,
  type I18nKey,
  type Lang,
} from "../hooks/I18nContext";

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    return `${String(record.code ?? "")} ${String(record.message ?? "")}`;
  }
  return "";
}

export function localizedMemoryError(
  error: unknown,
  lang: Lang,
  fallbackKey: I18nKey,
) {
  const message = errorText(error).toLowerCase();

  if (message.includes("space_read_only") || message.includes("read-only")) {
    return translate(lang, "settings.spaceReadOnlyBannerTitle");
  }
  if (message.includes("pin limit reached")) {
    return translate(lang, "pin.memoryLimitReached");
  }
  if (message.includes("photo limit reached")) {
    return translate(lang, "pin.mediaPlanLimitReached");
  }
  if (message.includes("video upload requires pro")) {
    return translate(lang, "pin.videoRequiresPro");
  }
  if (message.includes("too many memories") || message.includes("rate limit")) {
    return translate(lang, "pin.createRateLimited");
  }
  if (
    message.includes("media_delete_failed") ||
    message.includes("media_delete_auth_required")
  ) {
    return translate(lang, "pin.mediaDeleteFailed");
  }

  return translate(lang, fallbackKey);
}
