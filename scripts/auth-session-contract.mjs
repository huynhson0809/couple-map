import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, "../src/hooks/useAuth.ts");
const source = readFileSync(sourcePath, "utf8");

assert.match(
  source,
  /auth\.getUser\(/,
  "useAuth must validate cached sessions with supabase.auth.getUser().",
);

assert.match(
  source,
  /auth\.signOut\(/,
  "useAuth must clear the cached session when validation fails.",
);

assert.match(
  source,
  /setUser\(validatedUser/,
  "useAuth should set state from the validated Supabase user, not only the cached session user.",
);

assert.match(
  source,
  /loadVersion !== authVersion/,
  "A stale auth bootstrap response must not overwrite a newer auth event.",
);

assert.match(
  source,
  /cachedSession\.user\.id !== validatedUser\.id/,
  "The validated user must belong to the cached session being accepted.",
);

assert.match(
  source,
  /onAuthStateChange\([\s\S]*authVersion \+= 1;[\s\S]*setLoading\(false\)/,
  "Auth events must invalidate bootstrap work and resolve the loading state themselves.",
);
