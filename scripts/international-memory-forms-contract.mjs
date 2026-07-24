import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

const createForm = readProjectFile("src/components/pins/CreatePinForm.tsx");
const editForm = readProjectFile("src/components/pins/EditPinForm.tsx");
const mediaUpload = readProjectFile("src/lib/pinMediaUpload.ts");
const mapPage = readProjectFile("src/pages/MapPage.tsx");
const locationHook = readProjectFile("src/hooks/useLocation.ts");
const i18n = readProjectFile("src/hooks/I18nContext.tsx");

for (const form of [createForm, editForm]) {
  assert.match(form, /t\("pin\.videoTooLarge"/);
  assert.match(form, /t\("pin\.videoRequiresPro"/);
  assert.match(form, /t\("pin\.categorySelectionLimit"/);
  assert.match(form, /aria-label=\{t\("pin\.removeMedia"\)\}/);
  assert.doesNotMatch(form, /Video quá lớn|Video cần gói Pro/);
  assert.doesNotMatch(form, /aria-label="(?:Delete tag|Edit tag|Remove)"/);
}

assert.match(editForm, /limits\.photosPerPin - existingImages\.length - newFiles\.length/);
assert.match(mediaUpload, /messages\.videoTooLarge/);
assert.doesNotMatch(mediaUpload, /Video quá lớn/);
assert.match(mapPage, /useGeo\(lang\)/);
assert.match(locationHook, /getLocationErrorMessage\(lang, err\)/);
assert.doesNotMatch(locationHook, /Không thể lấy vị trí/);
for (const key of [
  "location.notSupported",
  "location.permissionDenied",
  "location.temporarilyUnavailable",
  "location.timeout",
  "location.unavailable",
]) {
  assert.equal(
    i18n.split(`"${key}"`).length - 1,
    2,
    `${key} must exist in both languages.`,
  );
}

console.log("international memory forms contract: ok");
