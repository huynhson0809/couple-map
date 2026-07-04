import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const migration = read("supabase/migration_space_aware_pin_creation.sql");
const usePins = read("src/hooks/usePins.ts");
const mapPage = read("src/pages/MapPage.tsx");
const createForm = read("src/components/pins/CreatePinForm.tsx");
const editForm = read("src/components/pins/EditPinForm.tsx");
const cloudinary = read("src/lib/cloudinary.ts");
const pinMediaUpload = read("src/lib/pinMediaUpload.ts");
const pendingUploads = read("src/lib/pendingUploads.ts");
const errorMessage = read("src/lib/errorMessage.ts");
const viewportPins = read("src/hooks/useViewportPins.ts");
const coupleRealtime = read("src/hooks/useCoupleRealtime.ts");

assert.equal(
  packageJson.scripts["check:create-memory-upload"],
  "node scripts/create-memory-upload-contract.mjs",
  "package.json should expose the create-memory upload contract.",
);

assert.match(
  migration,
  /create or replace function public\.create_pin_with_categories\([\s\S]*in_couple_id uuid[\s\S]*\)/,
  "Migration should replace create_pin_with_categories with the existing client signature.",
);
assert.match(
  migration,
  /v_space_id uuid := in_couple_id;/,
  "create_pin_with_categories should treat the first id as the target space id.",
);
assert.match(
  migration,
  /if not public\.is_space_member\(v_space_id\) then[\s\S]*Not a space member/,
  "create_pin_with_categories should verify active space membership.",
);
assert.match(
  migration,
  /v_legacy_couple_id := public\.ensure_space_legacy_couple\(v_space_id\);/,
  "create_pin_with_categories should resolve the compatible legacy couple id.",
);
assert.match(
  migration,
  /insert into public\.pins \([\s\S]*space_id,[\s\S]*couple_id,/,
  "New pins should store both space_id and couple_id.",
);
assert.match(
  migration,
  /v_space_id,[\s\S]*v_legacy_couple_id,/,
  "Pin insert should write the target space id and resolved legacy couple id.",
);
assert.match(
  migration,
  /insert into public\.pin_categories \([\s\S]*space_id,[\s\S]*couple_id,/,
  "Pin categories should store space_id.",
);
assert.match(
  migration,
  /pinly\/'\s*\|\|\s*v_effective_space_id::text/,
  "Pin image validation should use the effective space id for Cloudinary folders.",
);
assert.match(
  migration,
  /public\.is_space_member\(coalesce\(space_id, couple_id\)\)/,
  "Policies should authorize through effective space membership.",
);

assert.match(
  mapPage,
  /const \{ activeSpace, capabilities \} = useSpaceCtx\(\);/,
  "MapPage should read the active space directly.",
);
assert.match(
  mapPage,
  /spaceId=\{currentSpaceId\}/,
  "CreatePinForm should receive the current active space id directly.",
);

assert.match(
  usePins,
  /\.rpc\('create_pin_with_categories'/,
  "usePins should still create pins through the category-aware RPC.",
);
assert.doesNotMatch(
  usePins,
  /\.eq\('couple_id', spaceId\)/,
  "usePins should fetch pins by space_id, not legacy couple_id.",
);
assert.doesNotMatch(
  viewportPins,
  /\.eq\("couple_id", spaceId\)/,
  "useViewportPins should fetch pins by space_id, not legacy couple_id.",
);
assert.doesNotMatch(
  coupleRealtime,
  /filter: `couple_id=eq\.\$\{coupleId\}`/,
  "Pin realtime subscriptions should listen by space_id, not legacy couple_id.",
);

for (const [name, source] of [
  ["CreatePinForm", createForm],
  ["EditPinForm", editForm],
  ["cloudinary", cloudinary],
  ["pinMediaUpload", pinMediaUpload],
  ["pendingUploads", pendingUploads],
]) {
  assert.doesNotMatch(
    source,
    /String\(e\)|String\(err\)|String\(error\)/,
    `${name} should not stringify user-facing errors with String(error).`,
  );
}

assert.match(
  createForm,
  /formatErrorMessage/,
  "CreatePinForm should use the shared error formatter.",
);
assert.match(
  editForm,
  /formatErrorMessage/,
  "EditPinForm should use the shared error formatter.",
);
assert.match(
  createForm,
  /if \(activeSpaceId !== spaceId\)/,
  "CreatePinForm should guard against stale active-space submissions.",
);
assert.match(
  pendingUploads,
  /insertPendingUploadRows/,
  "Pending upload processing should separate Cloudinary upload from DB row insertion.",
);
assert.match(
  pendingUploads,
  /await insertPendingUploadRows\(pinId, results\);[\s\S]*await removePendingUpload/,
  "Pending uploads should be removed only after pin_images rows are inserted.",
);
assert.match(
  pendingUploads,
  /export async function savePendingUploads\([\s\S]*\): Promise<string\[]>/,
  "savePendingUploads should return the exact pending ids it queued.",
);
assert.match(
  pendingUploads,
  /export async function removePendingUploads\(ids: string\[\]\)/,
  "Pending uploads should support removing only a specific queued batch.",
);
assert.match(
  createForm,
  /const pendingUploadIds = await savePendingUploads\([\s\S]*await removePendingUploads\(pendingUploadIds\);/,
  "CreatePinForm should clear only the pending ids created for the current upload batch.",
);
assert.match(
  editForm,
  /const pendingUploadIds = await savePendingUploads\([\s\S]*await removePendingUploads\(pendingUploadIds\);/,
  "EditPinForm should clear only the pending ids created for the current upload batch.",
);

assert.match(
  errorMessage,
  /export function formatErrorMessage/,
  "errorMessage.ts should export formatErrorMessage.",
);
assert.match(
  errorMessage,
  /\[object Object\]/,
  "errorMessage.ts should explicitly guard against object-string output.",
);
assert.match(
  errorMessage,
  /context/,
  "errorMessage.ts should inspect Supabase Function error context.",
);
