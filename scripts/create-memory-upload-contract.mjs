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
const pinsContext = read("src/hooks/PinsContext.tsx");
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
assert.match(
  coupleRealtime,
  /activeSpaceIdRef\.current !== spaceId/,
  "Late events from a removed realtime channel must not update the next active space.",
);
assert.match(
  usePins,
  /fetchRequestIdRef[\s\S]*activeSpaceIdRef\.current === targetSpaceId[\s\S]*activeUserIdRef\.current === targetUserId/,
  "Full pin fetches must be scoped to the account and space that started the request.",
);
assert.match(
  usePins,
  /if \(imageError\)[\s\S]*throw new Error\('pin_images_load_failed'/,
  "A media read failure must not be interpreted as an empty media collection.",
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
  /pendingUploadIds = await savePendingUploads\([\s\S]*await removePendingUploads\(pendingUploadIds\);/,
  "CreatePinForm should clear only the pending ids created for the current upload batch.",
);
assert.match(
  editForm,
  /let pendingUploadIds: string\[\] = \[\];[\s\S]*pendingUploadIds = await savePendingUploads\([\s\S]*await removePendingUploads\(pendingUploadIds\);/,
  "EditPinForm should clear only the pending ids created for the current upload batch.",
);
assert.match(
  pendingUploads,
  /claimedPendingUploadIds[\s\S]*entry\.coupleId === coupleId[\s\S]*!claimedPendingUploadIds\.has\(entry\.id\)/,
  "Pending upload recovery should process only the active space and skip batches already uploading directly.",
);
assert.match(
  pendingUploads,
  /pendingUploadRuns\.get\(coupleId\)[\s\S]*pendingUploadRuns\.set\(coupleId, run\)/,
  "Pending upload recovery should be single-flight per space.",
);
assert.match(
  pendingUploads,
  /\.select\("sort_order"\)[\s\S]*existingOrders[\s\S]*alreadyAttached/,
  "Recovery must not attach a batch again after its DB insert already succeeded.",
);
assert.match(
  pendingUploads,
  /\.from\("pins"\)[\s\S]*\.eq\("space_id", coupleId\)[\s\S]*if \(!pin\)/,
  "Recovery must discard queued media when its memory no longer exists in the active space.",
);
assert.match(
  editForm,
  /existingImages\.reduce\([\s\S]*image\.sort_order \+ 1/,
  "Editing media must append after the highest existing sort order, even after removals.",
);
assert.match(
  createForm,
  /catch \(queueError\)[\s\S]*continuing with the direct upload/,
  "A failed IndexedDB retry queue must not block a direct create upload.",
);
assert.match(
  editForm,
  /catch \(queueError\)[\s\S]*continuing with the direct upload/,
  "A failed IndexedDB retry queue must not block a direct edit upload.",
);
assert.match(
  createForm,
  /\.catch\(\(err\) => \{[\s\S]*releasePendingUploads\(pendingUploadIds\)/,
  "CreatePinForm should release failed batches so recovery can retry them.",
);
assert.match(
  editForm,
  /\.catch\(\(err\) => \{[\s\S]*releasePendingUploads\(pendingUploadIds\)/,
  "EditPinForm should release failed batches so recovery can retry them.",
);
assert.match(
  pinsContext,
  /processPendingUploads\(\s*spaceId,/,
  "PinsProvider should resume pending uploads only for the active space.",
);
assert.match(
  pinsContext,
  /uploadSnapshot\.spaceId === spaceId/,
  "Upload progress from a previous space must not appear in the active space.",
);
assert.match(
  pinsContext,
  /useLayoutEffect\(\(\) => \{[\s\S]*userIdRef\.current = userId;[\s\S]*activeSpaceIdRef\.current = spaceId;/,
  "PinsProvider async guards must update before passive effects after an account or space change.",
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
