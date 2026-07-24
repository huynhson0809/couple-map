export type CheckoutLocale = "en" | "vi";

export function resolveCheckoutLocale(
  value: unknown,
  acceptLanguage: string | null,
): CheckoutLocale {
  if (value === "vi" || value === "en") return value;

  const firstLanguage = acceptLanguage
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  return firstLanguage?.startsWith("vi") ? "vi" : "en";
}

export function currencyForCheckoutLocale(locale: CheckoutLocale) {
  return locale === "vi" ? "vnd" : "usd";
}

function validIp(value: string | null) {
  if (!value) return null;
  const candidate = value.split(",")[0]?.trim() ?? "";
  return candidate.length > 0 &&
      candidate.length <= 45 &&
      /^[0-9a-f:.]+$/i.test(candidate)
    ? candidate
    : null;
}

export function resolveCustomerIp(headers: Headers) {
  return (
    validIp(headers.get("cf-connecting-ip")) ??
    validIp(headers.get("x-forwarded-for")) ??
    validIp(headers.get("x-real-ip"))
  );
}
