import { useEffect } from "react";
import {
  resolvePublicSocialLinks,
  type PublicSocialPlatformId,
} from "../../config/publicSocialLinks";
import type { PublicLanguage } from "../../content/publicPages";
import "./PublicSocialLinks.css";

const SOCIAL_LINKS = resolvePublicSocialLinks({
  VITE_SOCIAL_LINKEDIN_URL: import.meta.env.VITE_SOCIAL_LINKEDIN_URL,
  VITE_SOCIAL_FACEBOOK_URL: import.meta.env.VITE_SOCIAL_FACEBOOK_URL,
  VITE_SOCIAL_INSTAGRAM_URL: import.meta.env.VITE_SOCIAL_INSTAGRAM_URL,
  VITE_SOCIAL_THREADS_URL: import.meta.env.VITE_SOCIAL_THREADS_URL,
  VITE_SOCIAL_TIKTOK_URL: import.meta.env.VITE_SOCIAL_TIKTOK_URL,
  VITE_SOCIAL_X_URL: import.meta.env.VITE_SOCIAL_X_URL,
});

function SocialBrandIcon({
  platform,
}: {
  platform: PublicSocialPlatformId;
}) {
  if (platform === "instagram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.25" />
        <circle className="public-social-icon-dot" cx="17.4" cy="6.7" r="1" />
      </svg>
    );
  }

  if (platform === "threads") {
    return (
      <svg
        className="public-social-icon--threads"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M17.7 9.3c-.6-3.2-2.5-5-5.5-5.1C8.3 4.1 6 6.8 6 11.9c0 5.4 2.3 8 6.3 8 3.2 0 5.5-1.7 5.5-4.3 0-2.3-1.7-3.7-4.3-3.7-2.1 0-3.6 1.1-3.6 2.7 0 1.4 1.1 2.3 2.6 2.3 2.8 0 5-2.4 5.2-5.5.2-3.2-1.5-5.6-4.4-5.7-1.8-.1-3.2.5-4.2 1.7" />
      </svg>
    );
  }

  const path =
    platform === "linkedin"
      ? "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zm1.78 13.02H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z"
      : platform === "facebook"
        ? "M24 12.07C24 5.45 18.63.07 12 .07S0 5.45 0 12.07c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08v-3.47h3.05V9.43c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v3h-1.54c-1.51 0-1.98.94-1.98 1.9v2.28h3.33l-.53 3.47h-2.8v8.38C19.61 23.03 24 18.06 24 12.07z"
        : platform === "tiktok"
          ? "M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03a10.7 10.7 0 0 1-4.2-.97c-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75a7.18 7.18 0 0 1-1.35 3.94 7.32 7.32 0 0 1-5.91 3.21 7.14 7.14 0 0 1-4.08-1.03 7.26 7.26 0 0 1-3.65-5.72c-.03-.5-.04-1-.01-1.49a7.23 7.23 0 0 1 2.58-4.96 7.19 7.19 0 0 1 6.15-1.74c.02 1.48-.04 2.96-.04 4.44a3.32 3.32 0 0 0-3.02.37 3.23 3.23 0 0 0-1.5 3.36c.24 1.64 1.82 3.02 3.5 2.87a3.35 3.35 0 0 0 3.18-2.67c.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
          : "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z";

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function syncOrganizationSameAs() {
  const schema = document.getElementById("pinly-organization-schema");
  if (!schema || SOCIAL_LINKS.length === 0) return;

  try {
    const data = JSON.parse(schema.textContent ?? "{}") as Record<
      string,
      unknown
    >;
    data.sameAs = SOCIAL_LINKS.map((link) => link.url);
    schema.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
  } catch {
    // Keep the original schema intact when third-party markup changes it.
  }
}

export function PublicSocialLinks({
  language,
  tone,
}: {
  language: PublicLanguage;
  tone: "light" | "dark";
}) {
  useEffect(syncOrganizationSameAs, []);

  if (SOCIAL_LINKS.length === 0) return null;

  const followLabel =
    language === "vi" ? "Theo dõi Pinly" : "Follow Pinly";

  return (
    <nav
      className={`public-social-links public-social-links--${tone}`}
      aria-label={followLabel}
    >
      {SOCIAL_LINKS.map((link) => (
        <a
          key={link.id}
          className="public-social-link"
          href={link.url}
          target="_blank"
          rel="me noopener noreferrer"
          aria-label={`${followLabel} · ${link.label}`}
          title={link.label}
        >
          <SocialBrandIcon platform={link.id} />
        </a>
      ))}
    </nav>
  );
}
