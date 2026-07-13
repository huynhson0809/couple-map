import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migration = readFileSync(
  resolve(root, "supabase/migration_timeline_search_title.sql"),
  "utf8",
);
const canonicalMigration = readFileSync(
  resolve(root, "supabase/migration_pin_categories.sql"),
  "utf8",
);
const schema = readFileSync(resolve(root, "supabase/schema.sql"), "utf8");
const i18n = readFileSync(resolve(root, "src/hooks/I18nContext.tsx"), "utf8");

for (const [label, source] of [
  ["production migration", migration],
  ["canonical migration", canonicalMigration],
  ["schema", schema],
]) {
  assert.match(
    source,
    /or p\.title ilike '%' \|\| trim\(in_address\) \|\| '%'/i,
    `${label} must search memory titles.`,
  );
  assert.match(
    source,
    /or p\.address ilike '%' \|\| trim\(in_address\) \|\| '%'/i,
    `${label} must keep searching addresses.`,
  );
  assert.match(
    source,
    /or p\.city ilike '%' \|\| trim\(in_address\) \|\| '%'/i,
    `${label} must keep searching cities.`,
  );
  assert.match(
    source,
    /or p\.country ilike '%' \|\| trim\(in_address\) \|\| '%'/i,
    `${label} must keep searching countries.`,
  );
}

assert.match(
  i18n,
  /"timeline\.address": "Title or location"/,
  "English search label must describe both supported search targets.",
);
assert.match(
  i18n,
  /"timeline\.address": "Tên hoặc địa điểm"/,
  "Vietnamese search label must describe both supported search targets.",
);
assert.match(
  i18n,
  /Search title, city, street, place/,
  "English placeholder must mention title search.",
);
assert.match(
  i18n,
  /Tìm tên kỷ niệm, thành phố, đường, địa điểm/,
  "Vietnamese placeholder must mention memory title search.",
);

console.log("Timeline title search contract passed.");
