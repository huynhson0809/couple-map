import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeAddress,
  normalizeCityName,
  normalizeCountryName,
  localizeCountryName,
  pickLocalityName,
} from "../src/lib/locationNames.ts";
import {
  canonicalCountryList,
  canonicalCountryName,
} from "../supabase/functions/_shared/country-names.ts";

const placeSearch = readFileSync(resolve("src/lib/placeSearch.ts"), "utf8");
const createPinForm = readFileSync(
  resolve("src/components/pins/CreatePinForm.tsx"),
  "utf8",
);
const wishlistPage = readFileSync(resolve("src/pages/WishlistPage.tsx"), "utf8");
const usePins = readFileSync(resolve("src/hooks/usePins.ts"), "utf8");

assert.doesNotMatch(
  placeSearch,
  /country:\s*["']vn["']/,
  "Forward geocoding must not be restricted to Vietnam.",
);
assert.doesNotMatch(
  placeSearch,
  /\$\{query\}, Vietnam/,
  "Nominatim fallback must not redirect global searches to Vietnam.",
);

assert.equal(
  pickLocalityName({
    country: "United States",
    city: "San Francisco",
    state: "California",
  }),
  "San Francisco",
  "International locations should prefer the city over the state.",
);
assert.equal(
  pickLocalityName({
    country: "Việt Nam",
    state: "Quảng Nam",
    city: "Hội An",
  }),
  "Đà Nẵng",
  "Vietnam province normalization should remain intact.",
);
assert.equal(normalizeCountryName("Vietnam", "VN"), "Vietnam");
assert.equal(normalizeCountryName("Việt Nam"), "Vietnam");
assert.equal(canonicalCountryName("Việt Nam"), "Vietnam");
assert.deepEqual(
  canonicalCountryList(["Việt Nam", "Vietnam", "VN", "Hoa Kỳ", "United States"]),
  ["United States", "Vietnam"],
  "Stats should not count localized and canonical names as separate countries.",
);
assert.equal(
  normalizeCountryName("United States of America", "US"),
  "United States",
);
assert.equal(localizeCountryName("United States of America", "vi"), "Hoa Kỳ");
assert.equal(localizeCountryName("Việt Nam", "en"), "Vietnam");
assert.equal(normalizeAddress("Ho Chi Minh City, Vietnam", "en"), "Ho Chi Minh City, Vietnam");
assert.equal(normalizeAddress("Ho Chi Minh City, Vietnam", "vi"), "Thành phố Hồ Chí Minh, Vietnam");
assert.equal(normalizeCityName("Bình Dương", "Vietnam"), "Thành phố Hồ Chí Minh");
assert.equal(
  normalizeCityName("Long An", "United States"),
  "Long An",
  "International city names must not be rewritten through Vietnam province aliases.",
);

assert.match(
  createPinForm,
  /reverseGeocode\(pinCoords\.lat, pinCoords\.lng, lang\)/,
  "Memory creation should reverse geocode using the active UI language.",
);
assert.match(
  createPinForm,
  /searchPlaces\(address, \{ language: lang, proximity \}\)/,
  "Memory address search should use the active UI language.",
);
assert.match(
  wishlistPage,
  /searchPlaces\(query, \{ language: lang \}\)/,
  "Wishlist search should use the active UI language.",
);
assert.match(
  usePins,
  /reverseGeocode\(input\.lat, input\.lng, language\)/,
  "Fallback reverse geocoding should receive the active UI language.",
);

console.log("International geocoding contract passed.");
