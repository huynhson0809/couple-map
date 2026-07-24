import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATEGORIES,
  getAllCategories,
  getBuiltInCategories,
  getCategory,
  isBuiltInCategory,
} from "../src/lib/categoryCatalog.ts";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

const english = getBuiltInCategories("en");
const vietnamese = getBuiltInCategories("vi");

assert.deepEqual(
  english.map(({ id }) => id),
  vietnamese.map(({ id }) => id),
  "Locale changes must never alter category IDs stored in the database.",
);
assert.equal(getCategory("breakfast", [], "en")?.label, "Breakfast");
assert.equal(getCategory("breakfast", [], "vi")?.label, "Ăn sáng");
assert.equal(getCategory("travel", [], "en")?.label, "Travel");
assert.equal(getCategory("travel", [], "vi")?.label, "Du lịch");
assert.equal(
  CATEGORIES.find(({ id }) => id === "movie")?.label,
  "Movies",
  "Non-React helpers should use English as the international fallback.",
);
assert.equal(isBuiltInCategory("travel"), true);
assert.equal(isBuiltInCategory("custom_weekend"), false);

const customCategory = {
  id: "custom_weekend",
  label: "Weekend crew",
  emoji: "🏷️",
  color: "#6b7280",
};
assert.equal(
  getAllCategories([customCategory], "vi").at(-1)?.label,
  "Weekend crew",
  "User-created category names should remain exactly as entered.",
);

const suppliedLocalizedCategory = vietnamese.find(({ id }) => id === "cafe");
assert.equal(
  getCategory("cafe", suppliedLocalizedCategory ? [suppliedLocalizedCategory] : [])
    ?.label,
  "Cà phê",
  "A localized category list supplied by context must take priority.",
);

const categoriesContext = readProjectFile("src/hooks/CategoriesContext.tsx");
const mapView = readProjectFile("src/components/map/MapView.tsx");

assert.match(categoriesContext, /getAllCategories\(customCategories, lang\)/);
assert.match(categoriesContext, /getCategory\(id, customCategories, lang\)/);
assert.match(mapView, /const \{ allCategories \} = useCategoriesCtx\(\)/);
assert.doesNotMatch(mapView, /\{pins\.length\} memories here/);
assert.match(mapView, /t\("map\.memoriesHere"/);

console.log("international categories contract: ok");
