import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

function sqlFunctionSignature(sql, functionName) {
  const match = sql.match(
    new RegExp(`create or replace function public\\.${functionName}\\(([\\s\\S]*?)\\)\\nreturns`, "m"),
  );
  assert.ok(match, `should find ${functionName} SQL function signature`);
  return match[1];
}

async function importPinCategoryHelpers(helpersSource) {
  const ts = await import("typescript");
  const runtimeSource = transformPinCategoryHelperSource(helpersSource);

  const { outputText } = ts.transpileModule(runtimeSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );
}

function transformPinCategoryHelperSource(helpersSource) {
  const runtimeSource = helpersSource
    .replace(
      /import\s+[\s\S]*?from\s+["']\.\/categories["'];?\n?/m,
      `function getCategory(id, customCategories = []) {
  if (!id) return undefined;
  return customCategories.find((category) => category.id === id);
}
`,
    )
    .replace(/import\s+type\s+[\s\S]*?from\s+["']\.\.\/types["'];?\n?/m, "");

  assert.doesNotMatch(
    runtimeSource,
    /from "\.\/categories"/,
    'runtime helper import transform should remove from "./categories"',
  );
  assert.doesNotMatch(
    runtimeSource,
    /from '\.\/categories'/,
    "runtime helper import transform should remove from './categories'",
  );
  assert.doesNotMatch(
    runtimeSource,
    /from "\.\.\/types"/,
    'runtime helper import transform should remove from "../types"',
  );
  assert.doesNotMatch(
    runtimeSource,
    /from '\.\.\/types'/,
    "runtime helper import transform should remove from '../types'",
  );

  return runtimeSource;
}

function assertPinCategoryHelperTransformHandlesImportStyles() {
  const transformedSource = transformPinCategoryHelperSource(`import {
  getCategory,
  type Category,
} from './categories';
import type {
  Pin,
  PinCategory as PinCategoryRow,
} from '../types';

export const value = getCategory("custom", []);
`);

  assert.match(
    transformedSource,
    /function getCategory\(id, customCategories = \[\]\)/,
    "runtime helper import transform should stub category imports with varied quote and multiline specifier shapes",
  );
  assert.doesNotMatch(
    transformedSource,
    /PinCategoryRow/,
    "runtime helper import transform should remove varied type import shapes",
  );
}

function assertPinCategoryHelperBehaviors(pinCategoryHelpers) {
  const {
    getPinCategoryIds,
    getPrimaryCategory,
    getPrimaryCategoryId,
    normalizeCategoryIds,
    normalizePinCategories,
    resolvePinCategories,
    toPinCategoryRows,
  } = pinCategoryHelpers;

  assert.deepEqual(
    normalizeCategoryIds([
      " cafe ",
      "",
      null,
      undefined,
      "travel",
      "cafe",
      "date",
      "extra",
    ]),
    ["cafe", "travel", "date"],
    "normalizeCategoryIds should trim, remove empty ids, dedupe, preserve order, and cap at three",
  );

  const unorderedRows = [
    pinCategoryRow("date", 5),
    pinCategoryRow("travel", 1),
    pinCategoryRow("cafe", 3),
  ];

  assert.deepEqual(
    normalizePinCategories(unorderedRows).map(({ category_id, position }) => ({
      category_id,
      position,
    })),
    [
      { category_id: "travel", position: 0 },
      { category_id: "cafe", position: 1 },
      { category_id: "date", position: 2 },
    ],
    "normalizePinCategories should sort by position and reindex from zero",
  );

  const cappedRows = normalizePinCategories([
    pinCategoryRow("travel", 0),
    pinCategoryRow("cafe", 1),
    pinCategoryRow("date", 2),
    pinCategoryRow("extra", 3),
  ]);

  assert.equal(
    cappedRows.length,
    3,
    "normalizePinCategories should cap rows at three categories",
  );
  assert.deepEqual(
    cappedRows.map((row) => row.position),
    [0, 1, 2],
    "normalizePinCategories should reindex capped rows from zero",
  );

  const dedupedRows = normalizePinCategories([
    pinCategoryRow("", 0),
    pinCategoryRow(" travel ", 1),
    pinCategoryRow("travel", 2),
    pinCategoryRow("cafe", 3),
    pinCategoryRow("date", 4),
    pinCategoryRow("extra", 5),
  ]);

  assert.deepEqual(
    dedupedRows.map(({ category_id, position }) => ({
      category_id,
      position,
    })),
    [
      { category_id: "travel", position: 0 },
      { category_id: "cafe", position: 1 },
      { category_id: "date", position: 2 },
    ],
    "normalizePinCategories should trim ids, skip empty and duplicate rows, then cap valid rows at three",
  );

  assert.deepEqual(
    getPinCategoryIds({
      category: "fallback",
      categories: [pinCategoryRow("date", 1), pinCategoryRow("travel", 0)],
    }),
    ["travel", "date"],
    "getPinCategoryIds should prefer ordered categories rows",
  );
  assert.deepEqual(
    getPinCategoryIds({ category: "cafe", categories: [] }),
    ["cafe"],
    "getPinCategoryIds should fall back to Pin.category when category rows are empty",
  );
  assert.deepEqual(
    getPinCategoryIds({ category: "travel" }),
    ["travel"],
    "getPinCategoryIds should fall back to Pin.category when category rows are missing",
  );

  assert.equal(
    getPrimaryCategoryId({
      category: "fallback",
      categories: [pinCategoryRow("date", 1), pinCategoryRow("travel", 0)],
    }),
    "travel",
    "getPrimaryCategoryId should return the first ordered category id",
  );
  assert.equal(
    getPrimaryCategoryId({ category: null, categories: [] }),
    null,
    "getPrimaryCategoryId should return null when no category id exists",
  );

  const customDate = {
    id: "custom_date",
    label: "Custom Date",
    emoji: "💌",
    color: "#abc",
  };

  assert.deepEqual(
    getPrimaryCategory(
      {
        category: null,
        categories: [pinCategoryRow("custom_date", 0)],
      },
      [customDate],
    ),
    customDate,
    "getPrimaryCategory should resolve the first ordered category with custom category support",
  );

  const travel = category("travel", "Travel");
  const cafe = category("cafe", "Cafe");
  const date = category("date", "Date");

  assert.deepEqual(
    resolvePinCategories(
      {
        category: null,
        categories: [pinCategoryRow("date", 2), pinCategoryRow("travel", 0)],
      },
      [cafe, travel, date],
    ),
    [travel, date],
    "resolvePinCategories should return ordered category objects from supplied categories",
  );

  assert.deepEqual(
    toPinCategoryRows("pin-1", "couple-1", [
      "travel",
      "cafe",
      "travel",
      "date",
      "extra",
    ]),
    [
      {
        pin_id: "pin-1",
        couple_id: "couple-1",
        category_id: "travel",
        position: 0,
      },
      {
        pin_id: "pin-1",
        couple_id: "couple-1",
        category_id: "cafe",
        position: 1,
      },
      {
        pin_id: "pin-1",
        couple_id: "couple-1",
        category_id: "date",
        position: 2,
      },
    ],
    "toPinCategoryRows should dedupe ids, cap at three, and assign ordered positions",
  );
}

function pinCategoryRow(categoryId, position) {
  return {
    pin_id: "pin-1",
    couple_id: "couple-1",
    category_id: categoryId,
    position,
  };
}

function category(id, label) {
  return {
    id,
    label,
    emoji: "",
    color: "#000000",
  };
}

const migration = readProjectFile("supabase/migration_pin_categories.sql");
const schema = readProjectFile("supabase/schema.sql");
const packageJson = readProjectFile("package.json");
const migrationCreatePinSignature = sqlFunctionSignature(migration, "create_pin_with_categories");
const schemaCreatePinSignature = sqlFunctionSignature(schema, "create_pin_with_categories");
const migrationUpdatePinSignature = sqlFunctionSignature(migration, "update_pin_with_categories");
const schemaUpdatePinSignature = sqlFunctionSignature(schema, "update_pin_with_categories");

assert.match(migration, /create table if not exists public\.pin_categories/, "migration should create pin_categories");
assert.match(migration, /pin_id uuid not null references public\.pins\(id\) on delete cascade/, "pin_categories should cascade with pins");
assert.match(migration, /couple_id uuid not null references public\.couples\(id\) on delete cascade/, "pin_categories should scope rows by couple");
assert.match(migration, /category_id text not null/, "pin_categories should store built-in or custom category ids");
assert.match(migration, /position int not null/, "pin_categories should preserve selection order");
assert.match(migration, /created_at timestamptz default now\(\)/, "pin_categories should timestamp category selections");
assert.match(migration, /primary key \(pin_id, category_id\)/, "pin_categories should primary key pin category membership");
assert.doesNotMatch(migration, /unique \(pin_id, category_id\)/, "pin_categories should not duplicate primary key uniqueness");
assert.match(migration, /unique \(pin_id, position\)/, "pin_categories should keep one category per position");
assert.match(migration, /check \(position >= 0 and position < 3\)/, "pin_categories should enforce max three positions");
assert.match(migration, /create index if not exists idx_pin_categories_couple_category_pin[\s\S]*on public\.pin_categories\(couple_id, category_id, pin_id\);/, "pin_categories should support category filter lookup");
assert.match(migration, /create index if not exists idx_pin_categories_pin_position[\s\S]*on public\.pin_categories\(pin_id, position\);/, "pin_categories should support ordered pin category lookup");
assert.match(migration, /alter table public\.pin_categories enable row level security/, "pin_categories should enable RLS");
assert.match(migration, /create policy "Couple members can read pin categories"[\s\S]*?on public\.pin_categories for select[\s\S]*?using \(couple_id = get_my_couple_id\(\)\);/, "read policy should use exact couple membership guard");
assert.match(migration, /create policy "Couple members can insert pin categories"[\s\S]*?on public\.pin_categories for insert[\s\S]*?with check \(\s*couple_id = get_my_couple_id\(\)[\s\S]*?and exists \(\s*select 1\s*from public\.pins p\s*where p\.id = pin_id\s*and p\.couple_id = pin_categories\.couple_id[\s\S]*?\);/, "insert policy should use exact couple membership and pin ownership guard");
assert.match(migration, /create policy "Couple members can update pin categories"[\s\S]*?on public\.pin_categories for update[\s\S]*?using \(couple_id = get_my_couple_id\(\)\)[\s\S]*?with check \(\s*couple_id = get_my_couple_id\(\)[\s\S]*?and exists \(\s*select 1\s*from public\.pins p\s*where p\.id = pin_id\s*and p\.couple_id = pin_categories\.couple_id[\s\S]*?\);/, "update policy should use exact couple membership and pin ownership guard");
assert.match(migration, /create policy "Couple members can delete pin categories"[\s\S]*?on public\.pin_categories for delete[\s\S]*?using \(couple_id = get_my_couple_id\(\)\);/, "delete policy should use exact couple membership guard");
assert.match(migration, /insert into public\.pin_categories[\s\S]*select id, couple_id, category, 0[\s\S]*from public\.pins[\s\S]*category is not null\s*on conflict do nothing;/, "migration should backfill existing pins.category rows idempotently");
assert.match(migration, /alter publication supabase_realtime add table public\.pin_categories;/, "migration should publish pin_categories realtime changes");

assert.match(schema, /create table public\.pin_categories/, "schema snapshot should include pin_categories");
assert.match(schema, /pin_id uuid not null references public\.pins\(id\) on delete cascade/, "schema snapshot should cascade pin_categories with pins");
assert.match(schema, /couple_id uuid not null references public\.couples\(id\) on delete cascade/, "schema snapshot should scope pin_categories by couple");
assert.match(schema, /category_id text not null/, "schema snapshot should include category_id");
assert.match(schema, /position int not null/, "schema snapshot should include position");
assert.match(schema, /created_at timestamptz default now\(\)/, "schema snapshot should timestamp category selections");
assert.match(schema, /primary key \(pin_id, category_id\)/, "schema snapshot should primary key pin category membership");
assert.doesNotMatch(schema, /unique \(pin_id, category_id\)/, "schema snapshot should not duplicate primary key uniqueness");
assert.match(schema, /unique \(pin_id, position\)/, "schema snapshot should keep one category per position");
assert.match(schema, /check \(position >= 0 and position < 3\)/, "schema snapshot should enforce max three positions");
assert.match(schema, /create index idx_pin_categories_couple_category_pin on public\.pin_categories\(couple_id, category_id, pin_id\);/, "schema snapshot should include category filter lookup index");
assert.match(schema, /create index idx_pin_categories_pin_position on public\.pin_categories\(pin_id, position\);/, "schema snapshot should include ordered pin category lookup index");
assert.match(schema, /alter table public\.pin_categories enable row level security/, "schema snapshot should enable pin_categories RLS");
assert.match(schema, /create policy "Couple members can read pin categories"[\s\S]*?on public\.pin_categories for select[\s\S]*?using \(couple_id = get_my_couple_id\(\)\);/, "schema read policy should use exact couple membership guard");
assert.match(schema, /create policy "Couple members can insert pin categories"[\s\S]*?on public\.pin_categories for insert[\s\S]*?with check \(\s*couple_id = get_my_couple_id\(\)[\s\S]*?and exists \(\s*select 1\s*from public\.pins p\s*where p\.id = pin_id\s*and p\.couple_id = pin_categories\.couple_id[\s\S]*?\);/, "schema insert policy should use exact couple membership and pin ownership guard");
assert.match(schema, /create policy "Couple members can update pin categories"[\s\S]*?on public\.pin_categories for update[\s\S]*?using \(couple_id = get_my_couple_id\(\)\)[\s\S]*?with check \(\s*couple_id = get_my_couple_id\(\)[\s\S]*?and exists \(\s*select 1\s*from public\.pins p\s*where p\.id = pin_id\s*and p\.couple_id = pin_categories\.couple_id[\s\S]*?\);/, "schema update policy should use exact couple membership and pin ownership guard");
assert.match(schema, /create policy "Couple members can delete pin categories"[\s\S]*?on public\.pin_categories for delete[\s\S]*?using \(couple_id = get_my_couple_id\(\)\);/, "schema delete policy should use exact couple membership guard");
assert.match(schema, /alter publication supabase_realtime add table public\.pin_categories;/, "schema snapshot should publish pin_categories realtime changes");
assert.match(packageJson, /"check:multi-category-timeline": "node scripts\/multi-category-timeline-contract\.mjs"/, "package.json should expose multi-category contract");

for (const functionName of [
  "normalized_pin_category_ids",
  "set_pin_categories",
  "create_pin_with_categories",
  "update_pin_with_categories",
  "get_timeline_pin_page_ids",
]) {
  assert.match(
    migration,
    new RegExp(`create or replace function public\\.${functionName}\\(`),
    `migration should define ${functionName}`,
  );
  assert.match(
    schema,
    new RegExp(`create or replace function public\\.${functionName}\\(`),
    `schema snapshot should define ${functionName}`,
  );
}

assert.match(migration, /public\.normalized_pin_category_ids\(in_category_ids text\[\]\)[\s\S]*returns table\(category_id text, category_position int\)[\s\S]*language sql immutable/, "migration should normalize category ids in immutable SQL");
assert.match(schema, /public\.normalized_pin_category_ids\(in_category_ids text\[\]\)[\s\S]*returns table\(category_id text, category_position int\)[\s\S]*language sql immutable/, "schema should normalize category ids in immutable SQL");
assert.doesNotMatch(migration, /returns table\([^)]*\bposition int\b/, "migration function outputs should avoid keyword-like position output names");
assert.doesNotMatch(schema, /returns table\([^)]*\bposition int\b/, "schema function outputs should avoid keyword-like position output names");
assert.match(migration, /public\.set_pin_categories\(in_pin_id uuid, in_category_ids text\[\]\)[\s\S]*security invoker[\s\S]*set search_path = public[\s\S]*update public\.pins[\s\S]*delete from public\.pin_categories[\s\S]*insert into public\.pin_categories/, "migration should atomically replace pin categories and primary fallback");
assert.match(schema, /public\.set_pin_categories\(in_pin_id uuid, in_category_ids text\[\]\)[\s\S]*security invoker[\s\S]*set search_path = public[\s\S]*update public\.pins[\s\S]*delete from public\.pin_categories[\s\S]*insert into public\.pin_categories/, "schema should atomically replace pin categories and primary fallback");
assert.match(migration, /public\.create_pin_with_categories\([\s\S]*in_couple_id uuid[\s\S]*in_created_by uuid[\s\S]*in_category_ids text\[\][\s\S]*public\.set_pin_categories/, "migration should create pins through category-aware RPC");
assert.match(schema, /public\.create_pin_with_categories\([\s\S]*in_couple_id uuid[\s\S]*in_created_by uuid[\s\S]*in_category_ids text\[\][\s\S]*public\.set_pin_categories/, "schema should create pins through category-aware RPC");
assert.doesNotMatch(migrationCreatePinSignature, /\bdefault\b/i, "create_pin_with_categories should not place default params before required params");
assert.doesNotMatch(schemaCreatePinSignature, /\bdefault\b/i, "schema create_pin_with_categories should not place default params before required params");
assert.doesNotMatch(migrationUpdatePinSignature, /\bdefault\b/i, "update_pin_with_categories should not place default params before required params");
assert.doesNotMatch(schemaUpdatePinSignature, /\bdefault\b/i, "schema update_pin_with_categories should not place default params before required params");
assert.match(migration, /public\.update_pin_with_categories\([\s\S]*in_pin_id uuid[\s\S]*in_category_ids text\[\][\s\S]*in_title_set boolean[\s\S]*public\.set_pin_categories/, "migration should update pins through category-aware RPC with patch flags");
assert.match(schema, /public\.update_pin_with_categories\([\s\S]*in_pin_id uuid[\s\S]*in_category_ids text\[\][\s\S]*in_title_set boolean[\s\S]*public\.set_pin_categories/, "schema should update pins through category-aware RPC with patch flags");
assert.match(migration, /title = case when in_title_set then in_title else p\.title end[\s\S]*note = case when in_note_set then in_note else p\.note end[\s\S]*marker_emoji = case when in_marker_emoji_set then in_marker_emoji else p\.marker_emoji end[\s\S]*marker_image_url = case when in_marker_image_url_set then in_marker_image_url else p\.marker_image_url end/, "migration should not overwrite unchanged pin fields during category edits");
assert.match(schema, /title = case when in_title_set then in_title else p\.title end[\s\S]*note = case when in_note_set then in_note else p\.note end[\s\S]*marker_emoji = case when in_marker_emoji_set then in_marker_emoji else p\.marker_emoji end[\s\S]*marker_image_url = case when in_marker_image_url_set then in_marker_image_url else p\.marker_image_url end/, "schema should not overwrite unchanged pin fields during category edits");
assert.match(migration, /public\.get_timeline_pin_page_ids\([\s\S]*returns table\(pin_id uuid, total_count bigint\)[\s\S]*language sql[\s\S]*stable[\s\S]*count\(\*\) over\(\)/, "migration should page timeline ids and total count in SQL");
assert.match(schema, /public\.get_timeline_pin_page_ids\([\s\S]*returns table\(pin_id uuid, total_count bigint\)[\s\S]*language sql[\s\S]*stable[\s\S]*count\(\*\) over\(\)/, "schema should page timeline ids and total count in SQL");
assert.match(migration, /in_include_favorites boolean default false/, "migration should name favorite chip semantics as include_favorites");
assert.match(schema, /in_include_favorites boolean default false/, "schema should name favorite chip semantics as include_favorites");
assert.match(migration, /when in_include_favorites and exists \(select 1 from normalized_categories\) then[\s\S]*p\.is_favorite[\s\S]*or exists \([\s\S]*from public\.pin_categories pc[\s\S]*pc\.category_id in \(select category_id from normalized_categories\)/, "migration should use OR semantics for favorite plus category timeline filters");
assert.match(schema, /when in_include_favorites and exists \(select 1 from normalized_categories\) then[\s\S]*p\.is_favorite[\s\S]*or exists \([\s\S]*from public\.pin_categories pc[\s\S]*pc\.category_id in \(select category_id from normalized_categories\)/, "schema should use OR semantics for favorite plus category timeline filters");
assert.match(migration, /when exists \(select 1 from normalized_categories\) then[\s\S]*exists \([\s\S]*from public\.pin_categories pc[\s\S]*pc\.category_id in \(select category_id from normalized_categories\)/, "migration should match any selected category for timeline category filters");
assert.match(schema, /when exists \(select 1 from normalized_categories\) then[\s\S]*exists \([\s\S]*from public\.pin_categories pc[\s\S]*pc\.category_id in \(select category_id from normalized_categories\)/, "schema should match any selected category for timeline category filters");

const pinsIndex = schema.indexOf("create table public.pins");
const pinCategoriesIndex = schema.indexOf("create table public.pin_categories");
const pinImagesIndex = schema.indexOf("create table public.pin_images");

assert.ok(pinsIndex >= 0, "schema snapshot should include pins before pin_categories");
assert.ok(pinCategoriesIndex > pinsIndex, "schema snapshot should place pin_categories after pins");
assert.ok(pinImagesIndex > pinCategoriesIndex, "schema snapshot should place pin_categories before pin_images");

const types = readProjectFile("src/types/index.ts");
const helpers = readProjectFile("src/lib/pinCategories.ts");
assertPinCategoryHelperTransformHandlesImportStyles();
const pinCategoryHelpers = await importPinCategoryHelpers(helpers);
const pinCategoryDefinition = types.match(
  /export interface PinCategory\s*{([\s\S]*?)\n}/,
)?.[1];

assert.match(types, /export interface PinCategory/, "types should define PinCategory");
assert.ok(pinCategoryDefinition, "types should define PinCategory fields");
assert.match(pinCategoryDefinition, /\bpin_id: string;/, "PinCategory should include pin_id");
assert.match(pinCategoryDefinition, /\bcouple_id: string;/, "PinCategory should include couple_id");
assert.match(pinCategoryDefinition, /\bcategory_id: string;/, "PinCategory should include category_id");
assert.match(pinCategoryDefinition, /\bposition: number;/, "PinCategory should include position");
assert.match(pinCategoryDefinition, /\bcreated_at\?: string;/, "PinCategory should include optional created_at");
assert.match(types, /categories\?: PinCategory\[\]/, "Pin should expose optional ordered categories");
assert.match(helpers, /export const MAX_PIN_CATEGORIES = 3/, "helpers should define max category count");
assert.match(helpers, /export function normalizeCategoryIds/, "helpers should normalize category ids");
assert.match(helpers, /export function normalizePinCategories/, "helpers should normalize ordered pin category rows");
assert.match(helpers, /export function getPinCategoryIds/, "helpers should expose ordered category ids");
assert.match(helpers, /export function getPrimaryCategoryId/, "helpers should expose primary category id");
assert.match(helpers, /export function getPrimaryCategory/, "helpers should resolve primary category");
assert.match(helpers, /export function resolvePinCategories/, "helpers should resolve ordered categories for display");
assert.match(helpers, /export function toPinCategoryRows/, "helpers should build insert rows for Supabase");
assert.match(helpers, /new Set<string>/, "helpers should dedupe category ids while preserving order");
assertPinCategoryHelperBehaviors(pinCategoryHelpers);

const usePins = readProjectFile("src/hooks/usePins.ts");
const useViewportPins = readProjectFile("src/hooks/useViewportPins.ts");
const useTimelinePins = readProjectFile("src/hooks/useTimelinePins.ts");
const pinsContext = readProjectFile("src/hooks/PinsContext.tsx");
const createPinForm = readProjectFile("src/components/pins/CreatePinForm.tsx");
const editPinForm = readProjectFile("src/components/pins/EditPinForm.tsx");
const timelinePage = readProjectFile("src/pages/TimelinePage.tsx");
const mapView = readProjectFile("src/components/map/MapView.tsx");
const circleView = readProjectFile("src/components/timeline/TimelineCircleView.tsx");
const pinDetail = readProjectFile("src/components/pins/PinDetail.tsx");
const shareCard = readProjectFile("src/components/share/ShareCard.tsx");
const categoriesLib = readProjectFile("src/lib/categories.ts");

assert.match(usePins, /PIN_SELECT_WITH_CATEGORIES/, "usePins should centralize category-aware pin select");
assert.match(usePins, /categories:pin_categories\(pin_id,couple_id,category_id,position,created_at\)/, "usePins should select nested pin categories");
assert.match(usePins, /categoryIds\?: string\[\]/, "CreatePinInput should accept ordered category ids");
assert.match(usePins, /\.rpc\(['"]create_pin_with_categories['"]/, "usePins should create pins through category-aware RPC");
assert.match(usePins, /\.rpc\(['"]update_pin_with_categories['"]/, "usePins should update category edits through category-aware RPC");
assert.match(usePins, /in_title_set: hasTitle/, "usePins should send title patch flag to category update RPC");
assert.match(usePins, /in_note_set: hasNote/, "usePins should send note patch flag to category update RPC");
assert.match(usePins, /in_marker_emoji_set: hasMarkerEmoji/, "usePins should send marker emoji patch flag to category update RPC");
assert.match(usePins, /in_marker_image_url_set: hasMarkerImageUrl/, "usePins should send marker image patch flag to category update RPC");
assert.doesNotMatch(usePins, /currentPin|pins\.find\(\(p\) => p\.id === id\)/, "usePins should not resend stale local pin fields for category edits");
assert.doesNotMatch(usePins, /replacePinCategories/, "usePins should not use client-side delete/insert as the primary category write path");
assert.doesNotMatch(usePins, /\.from\(['"]pin_categories['"]\)[\s\S]*\.(?:delete|insert|upsert)\(/, "usePins should not mutate pin_categories directly from the client");
assert.match(usePins, /input\.categoryIds \?\? \[input\.category\]/, "usePins should keep legacy category fallback for create");
assert.match(usePins, /order\(['"]position['"], \{ referencedTable: ['"]categories['"], ascending: true \}\)/, "usePins relation fetches should order aliased categories by position");
assert.match(useViewportPins, /categories:pin_categories\(pin_id,couple_id,category_id,position,created_at\)/, "viewport pin fetches should include categories");
assert.match(useViewportPins, /order\(['"]position['"], \{ referencedTable: ['"]categories['"], ascending: true \}\)/, "viewport pin fetches should order aliased categories by position");
assert.match(useViewportPins, /\[pin, \.\.\.prev\.filter\(\(p\) => p\.id !== pin\.id\)\]/, "viewport addPin should upsert by id");
assert.match(useTimelinePins, /\.rpc\(['"]get_timeline_pin_page_ids['"]/, "timeline filtering should use paginated SQL RPC");
assert.match(useTimelinePins, /includeFavorites: boolean/, "timeline filters should name favorite chip semantics as includeFavorites");
assert.match(useTimelinePins, /in_include_favorites: filters\.includeFavorites/, "timeline should pass includeFavorites to SQL RPC");
assert.match(useTimelinePins, /localDateBoundaryIso/, "timeline date filters should send local-day ISO boundaries to timestamptz RPC");
assert.doesNotMatch(useTimelinePins, /fetchPinIdsForCategories/, "timeline filtering should not broad-prefetch matching pin ids from pin_categories");
assert.doesNotMatch(useTimelinePins, /\.from\(\s*['"]pin_categories['"]\s*\)[\s\S]*\.select\(\s*['"][^'"]*pin_id/, "timeline filtering should not query pin_categories directly for broad ID prefetch");
assert.match(useTimelinePins, /order\(['"]position['"], \{ referencedTable: ['"]categories['"], ascending: true \}\)/, "timeline pin detail fetches should order aliased categories by position");
assert.match(pinsContext, /categories/, "PinsContext should preserve category rows in local state");
assert.match(pinsContext, /order\(['"]position['"], \{ referencedTable: ['"]categories['"], ascending: true \}\)/, "PinsContext realtime refetch should order aliased categories by position");
assert.match(pinsContext, /onInsert: async[\s\S]*select\(PIN_SELECT_WITH_IMAGES_AND_CATEGORIES\)[\s\S]*addPin\(pinWithRelations\)/, "PinsContext should refetch full relations before adding realtime insert payloads");
assert.match(pinsContext, /onUpdate: async[\s\S]*select\(PIN_SELECT_WITH_IMAGES_AND_CATEGORIES\)/, "PinsContext should refetch full relations on realtime update");

assert.match(createPinForm, /selectedCategoryIds/, "create form should track ordered multi-category state");
assert.match(createPinForm, /MAX_PIN_CATEGORIES/, "create form should enforce the shared max category count");
assert.match(createPinForm, /function toggleCategory/, "create form should check and uncheck category chips");
assert.match(createPinForm, /return current\.filter\(\(id\) => id !== categoryId\)/, "create form toggle should uncheck selected categories");
assert.match(createPinForm, /current\.length >= MAX_PIN_CATEGORIES[\s\S]*return current/, "create form toggle should block additions past max categories");
assert.match(createPinForm, /return \[\.\.\.current, categoryId\]/, "create form toggle should append categories to preserve order");
assert.match(createPinForm, /function selectCategoryIfPossible[\s\S]*current\.includes\(categoryId\)[\s\S]*current\.length >= MAX_PIN_CATEGORIES[\s\S]*return \[\.\.\.current, categoryId\]/, "create form custom category selection should preserve order, duplicates, and max");
assert.match(createPinForm, /await saveCustomCategory\(newCat\);[\s\S]*selectCategoryIfPossible\(id\)/, "create form should select newly saved custom categories when possible");
assert.match(createPinForm, /categoryIds: selectedCategoryIds/, "create form should submit ordered category ids");
assert.match(createPinForm, /category: selectedCategoryIds\[0\] \?\? undefined/, "create form should keep legacy primary category fallback");
assert.match(createPinForm, /getCategory\(selectedCategoryIds\[0\] \?\? null\)/, "create form preview should use the first selected category");
assert.match(createPinForm, /setSelectedCategoryIds\(\(current\) =>\s*current\.filter\(\(categoryId\) => categoryId !== id\)/, "create form should unselect deleted custom categories");
assert.match(editPinForm, /selectedCategoryIds/, "edit form should track ordered multi-category state");
assert.match(editPinForm, /MAX_PIN_CATEGORIES/, "edit form should enforce the shared max category count");
assert.match(editPinForm, /getPinCategoryIds\(pin\)/, "edit form should initialize from existing ordered pin categories");
assert.match(editPinForm, /function toggleCategory/, "edit form should check and uncheck category chips");
assert.match(editPinForm, /return current\.filter\(\(id\) => id !== categoryId\)/, "edit form toggle should uncheck selected categories");
assert.match(editPinForm, /current\.length >= MAX_PIN_CATEGORIES[\s\S]*return current/, "edit form toggle should block additions past max categories");
assert.match(editPinForm, /return \[\.\.\.current, categoryId\]/, "edit form toggle should append categories to preserve order");
assert.match(editPinForm, /function selectCategoryIfPossible[\s\S]*current\.includes\(categoryId\)[\s\S]*current\.length >= MAX_PIN_CATEGORIES[\s\S]*return \[\.\.\.current, categoryId\]/, "edit form custom category selection should preserve order, duplicates, and max");
assert.match(editPinForm, /await saveCustomCategory\(newCat\);[\s\S]*selectCategoryIfPossible\(id\)/, "edit form should select newly saved custom categories when possible");
assert.match(editPinForm, /categoryIds: selectedCategoryIds/, "edit form should save ordered category ids");
assert.match(editPinForm, /category: selectedCategoryIds\[0\] \?\? null/, "edit form should keep legacy primary category fallback");
assert.match(editPinForm, /getCategory\(selectedCategoryIds\[0\] \?\? null\)/, "edit form preview should use the first selected category");
assert.match(editPinForm, /setSelectedCategoryIds\(\(current\) =>\s*current\.filter\(\(categoryId\) => categoryId !== id\)/, "edit form should unselect deleted custom categories");

assert.match(timelinePage, /getPinCategoryIds/, "TimelinePage should count categories from multi-category pins");
assert.match(timelinePage, /getPinCategoryIds\(pin\)\.forEach\(\(categoryId\) => ids\.add\(categoryId\)\)/, "TimelinePage used categories should include every pin category");
assert.match(timelinePage, /some\(\s*\(categoryId\) => categoryId === c\.id,\s*\)/, "TimelinePage category counts should include any matching category");
assert.match(timelinePage, /draftCategoryFilters/, "TimelinePage should preserve existing draft category filter UI");

assert.match(mapView, /getPrimaryCategory/, "MapView should use primary category helper with custom categories");
assert.doesNotMatch(mapView, /pin\.category|representative\.category/, "MapView should not read legacy category directly for display");
assert.match(circleView, /getPrimaryCategoryId/, "TimelineCircleView should use primary category id helper and its existing getCategory prop");
assert.doesNotMatch(circleView, /pin\.category/, "TimelineCircleView should not read legacy category directly for display");
assert.match(pinDetail, /resolvePinCategories/, "PinDetail should render ordered category chips");
assert.match(pinDetail, /category-badge-row[\s\S]*resolvedCategories\.map/, "PinDetail should render all resolved categories");
assert.doesNotMatch(pinDetail, /getCategory\(pin\.category\)|pin\.category/, "PinDetail should not render only the legacy category");
assert.match(shareCard, /resolvePinCategories/, "ShareCard should render ordered category data");
assert.match(shareCard, /getPrimaryCategory/, "ShareCard marker should use primary category helper");
assert.doesNotMatch(shareCard, /getCategory\(pin\.category\)|pin\.category/, "ShareCard should not read only the legacy category");

assert.match(categoriesLib, /\.from\(["']pin_categories["']\)[\s\S]*\.delete\(\)[\s\S]*\.eq\(["']couple_id["'], coupleId\)[\s\S]*\.eq\(["']category_id["'], id\)/, "custom category deletion should remove related pin category rows");
assert.match(categoriesLib, /if \(pinCategoryError\) throw pinCategoryError/, "custom category deletion should stop if pin category cleanup fails");

console.log("Multi-category timeline contract passed.");
