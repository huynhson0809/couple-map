/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_MULTI_SPACE_ENABLED?: "true" | "false";
  readonly VITE_SOCIAL_LINKEDIN_URL?: string;
  readonly VITE_SOCIAL_FACEBOOK_URL?: string;
  readonly VITE_SOCIAL_INSTAGRAM_URL?: string;
  readonly VITE_SOCIAL_THREADS_URL?: string;
  readonly VITE_SOCIAL_TIKTOK_URL?: string;
  readonly VITE_SOCIAL_X_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
