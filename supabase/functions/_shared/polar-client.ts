export type PolarServer = "sandbox" | "production";

export function getPolarServer(): PolarServer {
  return Deno.env.get("POLAR_SERVER") === "production"
    ? "production"
    : "sandbox";
}

export function getPolarBaseUrl() {
  return getPolarServer() === "production"
    ? "https://api.polar.sh"
    : "https://sandbox-api.polar.sh";
}

export function getPolarAccessToken() {
  const token = Deno.env.get("POLAR_ACCESS_TOKEN");
  if (!token) throw new Error("missing_polar_access_token");
  return token;
}

export async function polarJson<T>(
  path: string,
  init: RequestInit & { body?: BodyInit | null },
): Promise<T> {
  const res = await fetch(`${getPolarBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${getPolarAccessToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: unknown = null;
  let parseError = false;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      parseError = true;
    }
  }

  if (!res.ok) {
    console.error("Polar API error", {
      path,
      status: res.status,
      body: data ?? text,
    });
    throw new Error(`polar_api_${res.status}`);
  }

  if (parseError) {
    throw new Error("invalid_polar_json");
  }

  return data as T;
}

export function productIdFor(plan: string, cycle: string) {
  const key = `POLAR_${plan.toUpperCase()}_${cycle.toUpperCase()}_PRODUCT_ID`;
  const productId = Deno.env.get(key);
  if (!productId) throw new Error(`missing_${key.toLowerCase()}`);
  return productId;
}
