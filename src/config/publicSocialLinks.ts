export const PUBLIC_SOCIAL_PLATFORMS = [
  {
    id: "linkedin",
    label: "LinkedIn",
    environmentKey: "VITE_SOCIAL_LINKEDIN_URL",
    hosts: ["linkedin.com"],
  },
  {
    id: "facebook",
    label: "Facebook",
    environmentKey: "VITE_SOCIAL_FACEBOOK_URL",
    hosts: ["facebook.com", "fb.com"],
  },
  {
    id: "instagram",
    label: "Instagram",
    environmentKey: "VITE_SOCIAL_INSTAGRAM_URL",
    hosts: ["instagram.com"],
  },
  {
    id: "threads",
    label: "Threads",
    environmentKey: "VITE_SOCIAL_THREADS_URL",
    hosts: ["threads.net"],
  },
  {
    id: "tiktok",
    label: "TikTok",
    environmentKey: "VITE_SOCIAL_TIKTOK_URL",
    hosts: ["tiktok.com"],
  },
  {
    id: "x",
    label: "X",
    environmentKey: "VITE_SOCIAL_X_URL",
    hosts: ["x.com", "twitter.com"],
  },
] as const;

export type PublicSocialPlatformId =
  (typeof PUBLIC_SOCIAL_PLATFORMS)[number]["id"];
export type PublicSocialEnvironmentKey =
  (typeof PUBLIC_SOCIAL_PLATFORMS)[number]["environmentKey"];

export interface PublicSocialLink {
  id: PublicSocialPlatformId;
  label: string;
  url: string;
}

type PublicSocialEnvironment = Partial<
  Record<PublicSocialEnvironmentKey, string | undefined>
>;

function isExpectedHost(hostname: string, hosts: readonly string[]) {
  return hosts.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

function normalizeProfileUrl(
  value: string | undefined,
  hosts: readonly string[],
) {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      !isExpectedHost(url.hostname.toLowerCase(), hosts) ||
      url.pathname === "/"
    ) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function resolvePublicSocialLinks(
  environment: PublicSocialEnvironment,
): PublicSocialLink[] {
  return PUBLIC_SOCIAL_PLATFORMS.flatMap((platform) => {
    const url = normalizeProfileUrl(
      environment[platform.environmentKey],
      platform.hosts,
    );
    return url
      ? [{ id: platform.id, label: platform.label, url }]
      : [];
  });
}
