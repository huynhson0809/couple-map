function normalizeAppUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredAppUrls() {
  const values = [
    Deno.env.get("APP_URL"),
    ...(Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ];

  return new Set(
    values
      .map((value) => normalizeAppUrl(value))
      .filter((value): value is string => Boolean(value)),
  );
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isLocalDevUrl(appUrl: string) {
  try {
    const url = new URL(appUrl);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      isPrivateIpv4(url.hostname)
    );
  } catch {
    return false;
  }
}

function canTrustLocalDevOrigins() {
  return Deno.env.get("POLAR_SERVER") !== "production";
}

export function resolveTrustedAppUrl(requestedAppUrl: unknown): string | null {
  const requested = normalizeAppUrl(requestedAppUrl);
  const allowedUrls = configuredAppUrls();

  if (requested) {
    if (allowedUrls.has(requested)) return requested;
    if (canTrustLocalDevOrigins() && isLocalDevUrl(requested)) return requested;
  }

  return normalizeAppUrl(Deno.env.get("APP_URL"));
}
