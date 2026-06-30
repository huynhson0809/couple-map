import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readOptional(path) {
  try {
    return read(path);
  } catch {
    return "";
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

function indexOfRequired(source, needle, label) {
  const index = source.indexOf(needle);
  assert(index >= 0, `${label} must exist.`);
  return index;
}

function escapeRegExp(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sqlFunctionBlock(source, functionName) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${escapeRegExp(
      functionName,
    )}\\s*\\([^)]*\\)[\\s\\S]*?\\$\\$;`,
    "i",
  );
  return source.match(pattern)?.[0] ?? "";
}

function jsFunctionBlock(source, functionName) {
  const declaration = new RegExp(
    `(?:async\\s+)?function\\s+${escapeRegExp(functionName)}\\s*\\([^)]*\\)`,
  );
  const match = declaration.exec(source);
  if (!match) return "";

  const openBrace = source.indexOf("{", match.index + match[0].length);
  if (openBrace < 0) return "";

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(match.index, index + 1);
      }
    }
  }

  return "";
}

function appStatusScreenErrorBlock(source) {
  const start = source.indexOf('<AppStatusScreen title="Something went wrong"');
  if (start < 0) return "";

  const close = "</AppStatusScreen>";
  const end = source.indexOf(close, start);
  if (end < 0) return "";

  return source.slice(start, end + close.length);
}

function hasGetInvoke(source) {
  const invokeIndex = source.indexOf("functions.invoke");
  if (invokeIndex < 0) return false;

  const statsIndex = source.indexOf("couple-stats", invokeIndex);
  if (statsIndex < 0) return false;

  return /method:\s*['"]GET['"]/.test(source.slice(statsIndex, statsIndex + 500));
}

const app = read("src/App.tsx");
const packageJson = read("package.json");
const viteConfig = read("vite.config.ts");
const mainEntry = read("src/main.tsx");
const mapPage = read("src/pages/MapPage.tsx");
const pricingPage = read("src/pages/PricingPage.tsx");
const mapView = read("src/components/map/MapView.tsx");
const wishlistPage = read("src/pages/WishlistPage.tsx");
const settingsPage = read("src/pages/SettingsPage.tsx");
const pinDetail = read("src/components/pins/PinDetail.tsx");
const createPinForm = read("src/components/pins/CreatePinForm.tsx");
const editPinForm = read("src/components/pins/EditPinForm.tsx");
const pinMediaUpload = read("src/lib/pinMediaUpload.ts");
const mapStylePreviewSheet = readOptional(
  "src/components/settings/MapStylePreviewSheet.tsx",
);
const styles = read("src/index.css");
const pinsContext = read("src/hooks/PinsContext.tsx");
const useBucket = read("src/hooks/useBucket.ts");
const useCouple = read("src/hooks/useCouple.ts");
const useSubscription = read("src/hooks/useSubscription.tsx");
const useMapStyleHook = read("src/hooks/useMapStyle.ts");
const useLocationHook = read("src/hooks/useLocation.ts");
const useViewportPins = read("src/hooks/useViewportPins.ts");
const statsApi = read("src/hooks/useStatsApi.ts");
const serviceWorker = read("src/sw-push.ts");
const timelinePins = read("src/hooks/useTimelinePins.ts");
const notificationFeed = read("src/hooks/useNotificationFeed.ts");
const mapPreviewGenerator = readOptional(
  "scripts/generate-map-style-previews.mjs",
);
const generatedMapPreviewDir = resolve(root, "public/map-style-previews");
const coupleStats = read("supabase/functions/couple-stats/index.ts");
const checkout = read("supabase/functions/create-checkout/index.ts");
const activationCodeHelper = read("supabase/functions/_shared/activation-code.ts");
const cloudinaryUpload = read("supabase/functions/sign-cloudinary-upload/index.ts");
const cloudinaryDelete = read("supabase/functions/delete-pin-media/index.ts");
const cloudinaryClient = read("src/lib/cloudinary.ts");
const securityMigration = read("supabase/migration_security_hardening.sql");
const subscriptionsMigration = read("supabase/migration_subscriptions.sql");
const notificationsMigration = read("supabase/migration_notifications.sql");
const apiPerformanceMigration = readOptional(
  "supabase/migration_api_performance.sql",
);
const privacyConsent = readOptional("src/lib/privacyConsent.ts");
const legalContent = readOptional("src/lib/legalContent.ts");
const i18nContext = read("src/hooks/I18nContext.tsx");
const privacyConsentHook = readOptional("src/hooks/usePrivacyConsent.ts");
const policyPage = readOptional("src/components/legal/PolicyPage.tsx");
const consentGate = readOptional("src/components/auth/ConsentGate.tsx");
const registerPage = read("src/components/auth/RegisterPage.tsx");
const oneCoupleLockMigration = readOptional(
  "supabase/migration_one_couple_lock.sql",
);
const coupleSetup = read("src/components/auth/CoupleSetup.tsx");
const appStatusErrorCopy = appStatusScreenErrorBlock(app);
const userFacingCopy = [legalContent, i18nContext, appStatusErrorCopy].join("\n");
const createCoupleLockFunction = sqlFunctionBlock(
  oneCoupleLockMigration,
  "create_couple_for_current_user",
);
const joinCoupleLockFunction = sqlFunctionBlock(
  oneCoupleLockMigration,
  "join_couple_by_invite",
);
const protectUserIdentityFieldsFunction = sqlFunctionBlock(
  oneCoupleLockMigration,
  "protect_user_identity_fields",
);
const handleCreateCoupleBlock = jsFunctionBlock(coupleSetup, "handleCreate");
const handleJoinCoupleBlock = jsFunctionBlock(coupleSetup, "handleJoin");
const secureSignup = read("supabase/functions/secure-signup/index.ts");
const secureSignupCode = stripComments(secureSignup);
const consentMigration = readOptional("supabase/migration_user_consents.sql");

assert(
  hasGetInvoke(statsApi),
  "useStatsApi must call couple-stats with method: GET.",
);

assert(
  /req\.method\s*!==\s*["']GET["']/.test(coupleStats),
  "couple-stats must reject non-GET requests server-side.",
);

assert(
  /Cache-Control/.test(coupleStats) && /Vary/.test(coupleStats),
  "couple-stats must return explicit private cache headers.",
);

assert(
  !/cacheName:\s*["']supabase-api["']/.test(serviceWorker),
  "Service worker must not runtime-cache authenticated Supabase REST responses.",
);

assert(
  !/import\s+\{\s*(MapPage|TimelinePage|WishlistPage|NotificationsPage|SettingsPage)\s*\}/.test(
    app,
  ) && /lazy\(/.test(app),
  "Authenticated route pages should be lazy-loaded to keep the login bundle light.",
);

assert(
  /MAPLIBRE_CSS_URL\s*=\s*["']\/vendor\/maplibre-gl\.css["']/.test(
    mainEntry,
  ) &&
    /ensureMapLibreStylesheet/.test(mainEntry) &&
    !/maplibre-gl\/dist\/maplibre-gl\.css/.test(mainEntry),
  "main entry should load vendored MapLibre base CSS before the lazy map route initializes without importing MapLibre into the entry graph.",
);

assert(
  !/maplibre-gl\/dist\/maplibre-gl\.css/.test(mapView),
  "MapView should rely on the entry-level MapLibre CSS and keep only MapLibre JS lazy.",
);

assert(
  /id\.includes\(["']node_modules\/maplibre-gl["']\)[\s\S]*return\s+["']maplibre["']/.test(
    viteConfig,
  ),
  "Vite should split MapLibre into a stable manual chunk.",
);

assert(
  /id\.includes\(["']node_modules\/react["']\)[\s\S]*return\s+["']react-vendor["']/.test(
    viteConfig,
  ),
  "Vite should split React into a stable vendor chunk.",
);

assert(
  !/globPatterns:\s*\[[^\]]*\*\*\/\*\.\{js,css,html,ico,png,svg,json,woff2\}/.test(
    viteConfig,
  ) && !/icons\/\*\.\{png,svg\}/.test(viteConfig),
  "PWA precache should not eagerly include every generated JS/CSS chunk or broad icon folders.",
);

assert(
  /cacheName:\s*["']static-assets["']/.test(serviceWorker) &&
    /url\.pathname\.startsWith\(["']\/assets\/["']\)/.test(serviceWorker) &&
    /request\.destination/.test(serviceWorker),
  "Service worker should runtime-cache lazy static assets after first use instead of precaching every chunk.",
);

assert(
  /lazy\(\(\)\s*=>\s*import\(["']\.\.\/share\/ShareCard["']\)/.test(
    pinDetail,
  ),
  "ShareCard should load only when the user opens the card/share UI.",
);

assert(
  !/import\s+\{\s*compressImage\s*\}\s+from\s+["']\.\.\/\.\.\/lib\/imageCompress["']/.test(
    createPinForm,
  ),
  "CreatePinForm should not statically import image compression.",
);

assert(
  !/import\s+\{\s*compressImage\s*\}\s+from\s+["']\.\.\/\.\.\/lib\/imageCompress["']/.test(
    editPinForm,
  ),
  "EditPinForm should not statically import image compression.",
);

assert(
  !/import\s+\{\s*compressImage\s*\}\s+from\s+["']\.\/imageCompress["']/.test(
    pinMediaUpload,
  ),
  "Pin media upload helper should lazy-load image compression only during image upload.",
);

assert(
  /import\(["']\.\/imageCompress["']\)/.test(pinMediaUpload),
  "Pin media upload helper should dynamically import image compression.",
);

assert(
  !/import\s+\{\s*compressImage\s*\}\s+from\s+["']\.\.\/lib\/imageCompress["']/.test(
    settingsPage,
  ),
  "SettingsPage should not statically import image compression.",
);

assert(
  /import\(["']\.\.\/lib\/imageCompress["']\)/.test(settingsPage),
  "SettingsPage should dynamically import image compression for background uploads.",
);

assert(
  /handleActivateCodeRequest/.test(checkout) &&
    /create-checkout compatibility/.test(checkout),
  "create-checkout must delegate activation-code compatibility behavior to the shared helper.",
);

assert(
  /req\.method\s*===\s*["']OPTIONS["']/.test(activationCodeHelper) &&
    /req\.method\s*!==\s*["']POST["']/.test(activationCodeHelper) &&
    /Method not allowed/.test(activationCodeHelper) &&
    /Allow["']?:\s*["']POST, OPTIONS["']/.test(activationCodeHelper),
  "Activation-code helper must handle OPTIONS and reject non-POST requests server-side.",
);

assert(
  /check_edge_rate_limit/.test(activationCodeHelper) &&
    /limit_key:\s*`activate-code:\$\{user\.id\}`/.test(activationCodeHelper) &&
    /window_seconds:\s*3600/.test(activationCodeHelper) &&
    /max_requests:\s*20/.test(activationCodeHelper),
  "Activation-code helper must rate-limit activation code attempts.",
);

assert(
  /rpc\(["']activate_account_code["']/.test(activationCodeHelper) &&
    /p_user_id:\s*user\.id/.test(activationCodeHelper) &&
    /p_code:\s*normalizedCode/.test(activationCodeHelper) &&
    /p_user_email:/.test(activationCodeHelper),
  "Activation-code helper must redeem via the atomic activate_account_code RPC.",
);

assert(
  !/import\s+\{\s*MapView\s*\}\s+from\s+["']\.\.\/components\/map\/MapView["']/.test(
    mapPage,
  ) && /lazy\([\s\S]*\.\.\/components\/map\/MapView/.test(mapPage),
  "MapView should be lazy-loaded so MapPage does not eagerly bundle MapLibre.",
);

assert(
  /explicitCameraTargetRef/.test(mapView) &&
    /didInitialFitRef\.current\s*=\s*true[\s\S]{0,500}map\.(?:easeTo|flyTo)/.test(
      mapView,
    ),
  "MapView flyTo must mark an explicit camera target so initial auto-fit cannot override show-on-map.",
);

assert(
  /function\s+hasExplicitCameraIntent/.test(mapView) &&
    /if\s*\(hasExplicitCameraIntent\(\)\)\s*return/.test(mapView),
  "MapView initial fit must skip while an explicit show-on-map camera target is active.",
);

assert(
  /map\.stop\(\)/.test(mapView) &&
    /map\.resize\(\)/.test(mapView) &&
    /emitMapCenter\(map\)/.test(mapView),
  "MapView flyTo must stop stale animations, resize, and emit bounds after camera changes.",
);

assert(
  /const\s+FLY_TO_ZOOM\s*=\s*19/.test(mapView) &&
    /const\s+FLY_TO_DURATION_MS/.test(mapView) &&
    /duration:\s*FLY_TO_DURATION_MS/.test(mapView) &&
    /function\s+getFlyToCenter/.test(mapView) &&
    /function\s+ensureFlyToCentered/.test(mapView) &&
    /function\s+isFlyToCloseEnough/.test(mapView) &&
    /map\.easeTo\(\{[\s\S]{0,180}center:\s*getFlyToCenter\(target\)[\s\S]{0,180}duration:\s*FLY_TO_CORRECTION_MS/.test(
      mapView,
    ) &&
    !/function\s+ensureFlyToCentered[\s\S]{0,360}map\.jumpTo/.test(mapView) &&
    !/offset:\s*getVisibleFlyToOffset\(\)/.test(mapView),
  "MapView show-on-map must animate smoothly, avoid jumpTo snaps, and correct only when meaningfully off target.",
);

assert(
  /requestAnimationFrame\(\(\)\s*=>\s*\{[\s\S]{0,160}map\.resize\(\)[\s\S]{0,220}applyFlyTo\(pendingFlyToRef\.current\)/.test(
    mapView,
  ),
  "MapView must resize the canvas before applying a pending show-on-map flyTo after map load.",
);

assert(
  /new\s+maplibregl\.GeolocateControl[\s\S]*maximumAge:\s*0[\s\S]*timeout:\s*15_000/.test(
    mapView,
  ),
  "MapView geolocate control must request fresh high-accuracy fixes instead of stale cached positions.",
);

assert(
  /function\s+isAccurateEnough/.test(mapPage) &&
    /function\s+getInitialNewPinCoords/.test(mapPage) &&
    /Date\.now\(\)\s*-\s*lastUserLocation\.receivedAt\s*<\s*RECENT_LOCATION_MS/.test(
      mapPage,
    ) &&
    /isAccurateEnough\(lastUserLocation\)/.test(mapPage) &&
    /void\s+getCurrentPosition\(\)\s*\.then/.test(mapPage) &&
    !/const\s+GPS_QUICK_MS/.test(mapPage) &&
    !/Date\.now\(\)\s*-\s*lastUserLocation\.receivedAt\s*<\s*60_000\)\s*\{/.test(
      mapPage,
    ),
  "MapPage FAB should open immediately, refine GPS in the background, and only reuse recent user location when its accuracy is good enough.",
);

assert(
  /STREAK_FLOAT_STORAGE_KEY/.test(mapPage) &&
    /handleStreakPointerDown/.test(mapPage) &&
    /handleStreakPointerMove/.test(mapPage) &&
    /handleStreakPointerUp/.test(mapPage) &&
    /setPointerCapture/.test(mapPage) &&
    /localStorage\.setItem\(STREAK_FLOAT_STORAGE_KEY/.test(mapPage) &&
    /clampStreakFloatPosition/.test(mapPage) &&
    /useState<StreakFloatPosition \| null>\(\(\) => readStreakFloatPosition\(\)\)/.test(
      mapPage,
    ) &&
    /useLayoutEffect\(\(\) =>/.test(mapPage) &&
    /\}, \[couple\?\.id,\s*user\?\.id\]\);/.test(mapPage) &&
    /STREAK_CLICK_SUPPRESS_MS/.test(mapPage) &&
    /suppressStreakClickTimerRef/.test(mapPage) &&
    /function suppressNextStreakClickBriefly/.test(mapPage) &&
    /window\.setTimeout\(\s*clearStreakClickSuppress,\s*STREAK_CLICK_SUPPRESS_MS\s*,?\s*\)/.test(
      mapPage,
    ) &&
    /clearStreakClickSuppress\(\);\s*return;/.test(mapPage),
  "Map streak floating button must hydrate persisted drag position before first interaction and reclamp after map context mounts.",
);

assert(
  /\.map-streak-float[\s\S]{0,500}touch-action:\s*none/.test(styles) &&
    /\.map-streak-float\.dragging/.test(styles),
  "Map streak floating button CSS must disable touch gestures while dragging and expose a dragging state.",
);

assert(
  /MapStylePreviewSheet/.test(settingsPage) &&
    /previewStyle/.test(settingsPage) &&
    /setPreviewStyle\(s\)/.test(settingsPage) &&
    /map-style-card-visual/.test(settingsPage) &&
    /map-style-card-thumb/.test(settingsPage) &&
    /\/map-style-previews\/\$\{s\.id\}\.png/.test(settingsPage) &&
    /currentTarget\.hidden\s*=\s*true/.test(settingsPage) &&
    /map-style-card-map/.test(settingsPage) &&
    /map-style-card-route/.test(settingsPage) &&
    !/className="map-style-swatch"/.test(settingsPage) &&
    /onApply=\{\(\) => \{[\s\S]*setStyleId\(previewStyle\.id\);[\s\S]*setPreviewStyle\(null\);[\s\S]*\}\}/.test(
      settingsPage,
    ) &&
    !/else\s*\{\s*setStyleId\(s\.id\);\s*\}/.test(settingsPage) &&
    /import\("maplibre-gl"\)/.test(mapStylePreviewSheet) &&
    /mapRef\.current\?\.remove\(\)/.test(mapStylePreviewSheet) &&
    /document\.body\.classList\.add\("map-style-preview-open"\)/.test(
      mapStylePreviewSheet,
    ) &&
    !/useMapStyle\s*\(/.test(mapStylePreviewSheet) &&
    /body\.map-style-preview-open\s+\.bottom-nav[\s\S]{0,240}pointer-events:\s*none/.test(
      styles,
    ) &&
    /\.map-style-preview-actions[\s\S]{0,500}position:\s*sticky/.test(styles) &&
    /\.map-style-preview-actions[\s\S]{0,500}bottom:\s*0/.test(styles),
  "Settings map styles must prefer screenshot thumbnails, open an isolated real-map preview, hide bottom nav while previewing, and keep preview apply actions visible.",
);

assert(
  /plus:\s*\{[\s\S]*pins:\s*300/.test(useSubscription) &&
    !/plus:\s*\{[\s\S]*pins:\s*500/.test(useSubscription),
  "Plus plan must allow exactly 300 memories in frontend limits.",
);

assert(
  /\{\s*key:\s*"pins",\s*value:\s*"300"\s*\}/.test(pricingPage) &&
    /plus:\s*cycle\s*===\s*"annual"\s*\?\s*278400\s*:\s*29000/.test(
      pricingPage,
    ) &&
    /pro:\s*cycle\s*===\s*"annual"\s*\?\s*374400\s*:\s*39000/.test(
      pricingPage,
    ) &&
    !/470000|49000|950000|99000/.test(pricingPage),
  "Pricing page must show Plus 29k/month, Plus 278.4k/year, Pro 39k/month, and Pro 374.4k/year.",
);

const checkPinLimitSql = sqlFunctionBlock(
  subscriptionsMigration,
  "check_pin_limit",
);
assert(
  /when\s+'plus'\s+then\s+300/i.test(checkPinLimitSql) &&
    !/when\s+'plus'\s+then\s+500/i.test(checkPinLimitSql),
  "Subscription SQL pin limit must enforce Plus at 300 memories.",
);

assert(
  /export\s+function\s+sanitizeMapStyleId/.test(useMapStyleHook) &&
    /canUseMapStyle\?:\s*\(styleId:\s*string\)\s*=>\s*boolean/.test(
      useMapStyleHook,
    ) &&
    /sanitizeMapStyleId\(\s*localStorage\.getItem\(KEY\),\s*canUseMapStyle\s*\)/.test(
      useMapStyleHook,
    ) &&
    /sanitizeMapStyleId\(\s*styleId,\s*canUseMapStyle\s*\)/.test(
      useMapStyleHook,
    ) &&
    /const\s+next\s*=\s*sanitizeMapStyleId\(\s*id,\s*canUseMapStyle\s*\)[\s\S]{0,300}localStorage\.setItem\(KEY,\s*next\)/.test(
      useMapStyleHook,
    ),
  "useMapStyle must sanitize stored and requested style IDs against the active plan.",
);

assert(
  /const\s+\{(?=[^}]*\bcanCreatePin\b)(?=[^}]*\bcanUseMapStyle\b)[^}]*\}\s*=\s*useSubscription\(\)/.test(
    mapPage,
  ) &&
    /useMapStyle\(canUseMapStyle\)/.test(mapPage),
  "MapPage must sanitize the real map style against active plan permissions.",
);

assert(
  /const\s+\{(?=[^}]*\bplan\b)(?=[^}]*\bsubscription\b)(?=[^}]*\bcanUseMapStyle\b)[^}]*\}\s*=\s*useSubscription\(\)/.test(
    settingsPage,
  ) &&
    /useMapStyle\(canUseMapStyle\)/.test(settingsPage) &&
    /onClick=\{\(\)\s*=>\s*setPreviewStyle\(s\)\}/.test(settingsPage) &&
    /onApply=\{\(\)\s*=>\s*\{[\s\S]*if\s*\(!previewStyle\)\s*return;[\s\S]*if\s*\(!canUseMapStyle\(previewStyle\.id\)\)\s*\{[\s\S]*setUpgradeFeature[\s\S]*return;[\s\S]*\}[\s\S]*setStyleId\(previewStyle\.id\);[\s\S]*setPreviewStyle\(null\);/.test(
      settingsPage,
    ),
  "Settings must preview locked map styles but guard the apply handler before persisting.",
);

assert(
  /"generate:map-previews":\s*"node scripts\/generate-map-style-previews\.mjs"/.test(
    packageJson,
  ) &&
    /public\/map-style-previews/.test(mapPreviewGenerator) &&
    /remote-debugging-port=0/.test(mapPreviewGenerator) &&
    /Page\.captureScreenshot/.test(mapPreviewGenerator) &&
    /src\/hooks\/useMapStyle\.ts/.test(mapPreviewGenerator) &&
    /minRenderedPreviewBytes/.test(mapPreviewGenerator) &&
    /getPreviewStatus/.test(mapPreviewGenerator) &&
    /--enable-webgl/.test(mapPreviewGenerator) &&
    /--use-gl=swiftshader/.test(mapPreviewGenerator),
  "Map style screenshot thumbnails must be generated automatically by a headless Chrome script that rejects blank captures.",
);

const generatedMapPreviews = readdirSync(generatedMapPreviewDir).filter((file) =>
  file.endsWith(".png")
);
assert(
  generatedMapPreviews.length >= 15 &&
    generatedMapPreviews.every(
      (file) => statSync(resolve(generatedMapPreviewDir, file)).size > 10_000,
    ),
  "Generated map style thumbnails must contain rendered map detail instead of blank canvases.",
);

assert(
  /isUsableCachedPosition/.test(useLocationHook) &&
    /maximumAge:\s*0/.test(useLocationHook) &&
    /GOOD_ACCURACY_METERS\s*=\s*35/.test(useLocationHook),
  "useLocation must avoid stale/low-accuracy cached GPS positions and request fresh high-accuracy fixes.",
);

assert(
  /const\s+pins\s*=\s*useMemo/.test(pinsContext),
  "PinsContext must memoize the derived pins array to avoid marker rebuild churn.",
);

assert(
  !/eslint-disable-line react-hooks\/exhaustive-deps/.test(pinsContext) &&
    !/Parameters<typeof pinsHook\./.test(pinsContext),
  "PinsContext must be zero-warning clean without hook dependency suppressions.",
);

assert(
  /rpc\(["']get_timeline_pin_page_ids["']/.test(timelinePins) &&
    /if\s*\(!append\)\s*setTotal\(Number\(pageIds\[0\]\?\.total_count\s*\?\?\s*0\)\)/.test(
      timelinePins,
    ) &&
    !/count:\s*["']exact["']/.test(timelinePins),
  "Timeline load-more must avoid exact count side queries and only refresh total from the first RPC page.",
);

assert(
  /rpc\(["']get_notification_feed["']/.test(notificationFeed),
  "useNotificationFeed should fetch notification page and unread count through one RPC.",
);

assert(
  !/from\(["']notifications["']\)[\s\S]{0,160}\.select\(["']\*["']/.test(
    notificationFeed,
  ) && !/count:\s*["']exact["']/.test(notificationFeed),
  "useNotificationFeed must not use broad notification selects or exact count side queries.",
);

assert(
  /mergeNotifications/.test(notificationFeed) &&
    /nextOffsetRef/.test(notificationFeed) &&
    !/notificationsLengthRef/.test(notificationFeed),
  "useNotificationFeed must dedupe realtime/page rows without using UI length as DB offset.",
);

assert(
  /get_couple_context_for_current_user/.test(useCouple),
  "useCouple should fetch profile/couple/partner through one RPC round-trip.",
);

assert(
  /rpc\s*\(\s*["']get_subscription_context_for_couple["']/.test(
    useSubscription,
  ),
  "useSubscription should fetch plan and active subscription through one RPC.",
);

assert(
  !/from\(["']couples["']\)[\s\S]{0,180}\.select\(["']plan["']/.test(
    useSubscription,
  ) &&
    !/from\(["']subscriptions["']\)[\s\S]{0,220}\.select\(["']\*["']/.test(
      useSubscription,
    ),
  "useSubscription must not issue separate couple/subscription selects.",
);

assert(
  /get_couple_stats_summary/.test(coupleStats),
  "couple-stats should use a database summary RPC before falling back to row scans.",
);

assert(
  /statusFilter/.test(useBucket) &&
    /useBucket\(couple\?\.id,\s*user\?\.id\)/.test(mapPage) &&
    !/useBucket\(couple\?\.id,\s*user\?\.id,\s*["']dream["']\)/.test(mapPage),
  "MapPage should request all bucket markers so wishlist show-on-map works for done and dream places.",
);

assert(
  /bucketId:\s*b\.id/.test(wishlistPage) &&
    /highlightedBucketIdRef/.test(mapView) &&
    /bucket-marker \$\{b\.id === highlightedBucketId/.test(mapView),
  "Wishlist show-on-map must carry a bucketId and MapView must highlight that exact bucket marker.",
);

assert(
  /const\s+MEMORY_SOURCE_ID\s*=\s*["']memory-pins["']/.test(mapView) &&
    /map\.addSource\(MEMORY_SOURCE_ID,\s*\{[\s\S]*cluster:\s*true/.test(
      mapView,
    ) &&
    /clusterProperties/.test(mapView) &&
    /syncMemorySource/.test(mapView) &&
    /handleMemoryFeatureClick/.test(mapView) &&
    !/from\s+["']supercluster["']/.test(mapView) &&
    !/function\s+renderMarkers/.test(mapView) &&
    !/function\s+createClusterEl/.test(mapView) &&
    !/function\s+createPinEl/.test(mapView),
  "MapView must render memory pins/clusters through a clustered MapLibre GeoJSON source, not DOM marker clustering.",
);

assert(
  /loadPinById/.test(useViewportPins) &&
    /\.eq\(["']id["'],\s*id\)/.test(useViewportPins) &&
    /loadPinById/.test(pinsContext) &&
    /loadPinById\(pinId\)/.test(mapPage),
  "MapPage show-on-map must load a missing target pin into the viewport pin store instead of calling the unrelated full fetchPins state.",
);

assert(
  /create\s+or\s+replace\s+function\s+public\.get_couple_context_for_current_user/i.test(
    apiPerformanceMigration,
  ) &&
    /create\s+or\s+replace\s+function\s+public\.get_couple_stats_summary/i.test(
      apiPerformanceMigration,
    ),
  "API performance migration must define couple context and stats summary RPCs.",
);

assert(
  /idx_pins_couple_category_created/.test(apiPerformanceMigration) &&
    /idx_bucket_list_couple_status_created/.test(apiPerformanceMigration),
  "API performance migration must add indexes for timeline/stats/bucket reads.",
);

assert(
  /resourceType/.test(cloudinaryUpload) &&
    /allowedFormats/.test(cloudinaryUpload) &&
    /MAX_VIDEO_BYTES/.test(cloudinaryUpload),
  "Cloudinary upload signatures must validate resource type, allowed formats, and media size.",
);

assert(
  /canUploadVideo|plan\s*===\s*["']pro["']/.test(cloudinaryUpload) &&
    /Video upload requires Pro/.test(cloudinaryUpload),
  "Cloudinary upload signatures must enforce the server-side video plan gate.",
);

assert(
  /allowed_formats/.test(cloudinaryClient) &&
    /max_file_size/.test(cloudinaryClient) &&
    /resourceType/.test(cloudinaryClient),
  "Cloudinary client must send signed resource constraints with the upload request.",
);

assert(
  /check_edge_rate_limit/.test(cloudinaryDelete),
  "delete-pin-media must rate-limit delete attempts.",
);

assert(
  /cloudinary_public_id\s*\?\?/.test(cloudinaryDelete) === false &&
    /Missing Cloudinary public id/.test(cloudinaryDelete),
  "delete-pin-media must not fall back to client-provided public IDs.",
);

assert(
  /pinly\/\$\{coupleId\}/.test(cloudinaryDelete) &&
    /Forbidden media folder/.test(cloudinaryDelete),
  "delete-pin-media must ensure Cloudinary public IDs belong to the user's couple folder.",
);

assert(
  /protect_bucket_ownership_fields/.test(securityMigration),
  "Security migration must protect bucket_list ownership fields from client updates.",
);

assert(
  /drop policy if exists "Couple members can CRUD bucket list"/.test(
    securityMigration,
  ) &&
    /on public\.bucket_list for insert[\s\S]*with check \([\s\S]*created_by = auth\.uid\(\)/.test(
      securityMigration,
    ),
  "bucket_list insert RLS must explicitly require created_by = auth.uid().",
);

assert(
  /pin_images_cloudinary_url_check/.test(securityMigration) &&
    /pin_images_public_id_check/.test(securityMigration) &&
    /pin_images_dimensions_check/.test(securityMigration) &&
    /pin_images_sort_order_check/.test(securityMigration),
  "Security migration must constrain pin_images media URL, public ID, dimensions, and sort order.",
);

assert(
  /validate_pin_image_media_fields/.test(securityMigration) &&
    /pinly\/'\s*\|\|\s*v_couple_id::text/.test(securityMigration),
  "pin_images inserts must validate Cloudinary media belongs to the pin's couple folder.",
);

assert(
  /protect_pin_image_identity_fields/.test(securityMigration),
  "Security migration must protect pin_images identity fields from future update policies.",
);

assert(
  /v_couple_plan\s+is\s+distinct\s+from\s+'pro'/.test(subscriptionsMigration) &&
    /Video upload requires Pro/.test(subscriptionsMigration),
  "DB video upload trigger must enforce Pro-only video uploads.",
);

assert(
  /create\s+or\s+replace\s+function\s+public\.get_subscription_context_for_couple/i.test(
    subscriptionsMigration,
  ) &&
    /auth\.uid\(\)/.test(subscriptionsMigration),
  "Subscription migration must expose an auth-scoped subscription context RPC.",
);

const subscriptionIndexStatements =
  subscriptionsMigration.match(/^create\s+(?:unique\s+)?index\b[^;]*;/gim) ?? [];
const nonIdempotentSubscriptionIndexes = subscriptionIndexStatements.filter(
  (statement) =>
    !/^create\s+(?:unique\s+)?index\s+if\s+not\s+exists\b/i.test(statement),
);

assert(
  nonIdempotentSubscriptionIndexes.length === 0,
  `Subscription migration indexes must use IF NOT EXISTS: ${nonIdempotentSubscriptionIndexes.join(" ")}`,
);

assert(
  /drop policy if exists "Couple members can read own subscription"/.test(
    subscriptionsMigration,
  ),
  "Subscription migration must drop existing subscription policy before creating it.",
);

assert(
  /create\s+or\s+replace\s+function\s+public\.get_notification_feed/i.test(
    notificationsMigration,
  ),
  "Notifications migration must expose get_notification_feed RPC.",
);

assert(
  /drop policy if exists "Users can read own notifications"/.test(
    notificationsMigration,
  ) &&
    /drop policy if exists "Users can update own notifications"/.test(
      notificationsMigration,
    ) &&
    /drop policy if exists "Service can insert notifications"/.test(
      notificationsMigration,
    ),
  "Notifications migration policies must be idempotent.",
);

assert(
  /duplicate_object/.test(notificationsMigration) &&
    /supabase_realtime add table public\.notifications/.test(
      notificationsMigration,
    ),
  "Notifications realtime publication migration must be rerunnable.",
);

assert(
  /TERMS_VERSION\s*=\s*["']2026-06-07["']/.test(privacyConsent) &&
    /PRIVACY_VERSION\s*=\s*["']2026-06-07["']/.test(privacyConsent) &&
    /buildSignupConsent/.test(privacyConsent) &&
    /isCurrentConsent/.test(privacyConsent),
  "Privacy consent constants and helpers must exist with current versions.",
);

assert(
  /create table if not exists public\.user_consents/.test(consentMigration) &&
    /terms_version text not null/.test(consentMigration) &&
    /privacy_version text not null/.test(consentMigration) &&
    /accepted_at timestamptz not null default now\(\)/.test(consentMigration) &&
    /source text not null/.test(consentMigration) &&
    /enable row level security/.test(consentMigration) &&
    /Users can read own consent rows/.test(consentMigration) &&
    /Users can insert own consent rows/.test(consentMigration) &&
    /set_user_consent_server_timestamp/.test(consentMigration) &&
    /insert into public\.user_consents/.test(consentMigration),
  "A user_consents migration must create append-only consent history, RLS, and signup trigger insertion.",
);

assert(
  /consent/.test(secureSignupCode) &&
    /terms_version/.test(secureSignupCode) &&
    /privacy_version/.test(secureSignupCode) &&
    /CONSENT_SOURCE_SIGNUP/.test(secureSignupCode) &&
    /Missing required consent/.test(secureSignupCode) &&
    /options:\s*\{[\s\S]*data:\s*\{[\s\S]*consent/.test(secureSignupCode) &&
    !/accepted_at/.test(secureSignupCode),
  "secure-signup must validate consent and pass consent metadata into auth signup.",
);

const passwordValidationIndex = indexOfRequired(
  secureSignupCode,
  "Password must be at least 6 characters",
  "secure-signup password validation",
);
const consentValidationIndex = indexOfRequired(
  secureSignupCode,
  "Missing required consent",
  "secure-signup consent validation",
);
const supabaseClientIndex = indexOfRequired(
  secureSignupCode,
  "const supabaseAdmin = createClient",
  "secure-signup Supabase client creation",
);
const authSignupIndex = indexOfRequired(
  secureSignupCode,
  "auth.signUp",
  "secure-signup auth signup",
);

assert(
  passwordValidationIndex < consentValidationIndex &&
    consentValidationIndex < supabaseClientIndex &&
    consentValidationIndex < authSignupIndex,
  "secure-signup must validate consent after password checks and before user lookup/signup.",
);

assert(
  /signUp:\s*async\s*\([^)]*consent/.test(read("src/hooks/useAuth.ts")) &&
    /body:\s*\{[\s\S]*consent/.test(read("src/hooks/useAuth.ts")),
  "useAuth.signUp must accept and forward consent payload.",
);

assert(
  /type="checkbox"/.test(registerPage) &&
    /buildSignupConsent/.test(registerPage) &&
    /\/terms/.test(registerPage) &&
    /\/privacy/.test(registerPage) &&
    /auth\.consentRequired/.test(registerPage),
  "RegisterPage must require Terms and Privacy consent before signup.",
);

assert(
  /function\s+usePrivacyConsent/.test(privacyConsentHook) &&
    /user_consents/.test(privacyConsentHook) &&
    /existing_user_gate/.test(privacyConsentHook) &&
    /checked/.test(privacyConsentHook),
  "usePrivacyConsent must fetch and insert current consent rows for existing users without blocking initial render.",
);

assert(
  /ConsentGate/.test(consentGate) &&
    /usePrivacyConsent/.test(consentGate) &&
    /\/terms/.test(consentGate) &&
    /\/privacy/.test(consentGate) &&
    /consent\.checked/.test(consentGate) &&
    !/legal\.loadingConsent/.test(consentGate),
  "ConsentGate must only show when a completed background check finds missing consent.",
);

assert(
  /PolicyPage/.test(policyPage) &&
    /privacySections/.test(legalContent) &&
    /termsSections/.test(legalContent) &&
    /liên kết media|đường dẫn media/.test(legalContent) &&
    !/MVP|free tier|free operation|goi mien phi|gói miễn phí|public-style|miễn phí|khong|Chinh sach|Dieu khoan/.test(
      legalContent,
    ),
  "Policy pages must use polished Vietnamese copy and avoid temporary/free/public-style wording.",
);

assert(
  !/\b(Supabase|Cloudinary|Cloudiary|OpenFreeMap|Gemini)\b/i.test(
    userFacingCopy,
  ),
  "User-facing legal/auth/setup copy must not expose provider or internal technology names.",
);

assert(
  /path="\/privacy"/.test(app) &&
    /path="\/terms"/.test(app) &&
    /ConsentGate/.test(app),
  "App must expose public Terms/Privacy routes and gate authenticated users without current consent.",
);

assert(
  /settings\.legal/.test(settingsPage) &&
    /settings\.legalDesc/.test(settingsPage) &&
    /navigate\(["']\/privacy["']\)/.test(settingsPage) &&
    /navigate\(["']\/terms["']\)/.test(settingsPage),
  "SettingsPage must expose Privacy and Terms links for authenticated users.",
);

assert(
  /first_couple_id\s+uuid/.test(oneCoupleLockMigration) &&
    /couple_locked_at\s+timestamptz/.test(oneCoupleLockMigration) &&
    /update\s+public\.users[\s\S]*first_couple_id\s*=\s*couple_id/i.test(
      oneCoupleLockMigration,
    ) &&
    /couple_locked_at\s*=\s*coalesce\s*\(\s*couple_locked_at\s*,\s*now\(\)\s*\)/i.test(
      oneCoupleLockMigration,
    ),
  "One-couple migration must add permanent lock fields and backfill existing coupled users.",
);

assert(
  /ONE_COUPLE_ACCOUNT_LOCKED/.test(createCoupleLockFunction) &&
    /locked_couple_id\s+is\s+not\s+null/i.test(createCoupleLockFunction) &&
    /locked_couple_id[\s\S]{0,500}select[\s\S]{0,500}into\s+c[\s\S]{0,500}locked_couple_id/i.test(
      createCoupleLockFunction,
    ) &&
    /locked_couple_id[\s\S]{0,700}return\s+c/i.test(
      createCoupleLockFunction,
    ) &&
    /raise\s+exception\s+['"]ONE_COUPLE_ACCOUNT_LOCKED['"]/i.test(
      createCoupleLockFunction,
    ) &&
    /first_couple_id\s*=\s*c\.id/i.test(
      createCoupleLockFunction,
    ) &&
    /ONE_COUPLE_ACCOUNT_LOCKED/.test(joinCoupleLockFunction) &&
    /locked_couple_id\s+is\s+not\s+null[\s\S]*locked_couple_id\s*<>\s*c\.id/i.test(
      joinCoupleLockFunction,
    ) &&
    /raise\s+exception\s+['"]ONE_COUPLE_ACCOUNT_LOCKED['"]/i.test(
      joinCoupleLockFunction,
    ),
  "Create/join RPCs must reject accounts locked to a different couple.",
);

assert(
  /old\.couple_id\s+is\s+distinct\s+from\s+new\.couple_id/.test(
    protectUserIdentityFieldsFunction,
  ) &&
    /old\.first_couple_id\s+is\s+distinct\s+from\s+new\.first_couple_id/.test(
      protectUserIdentityFieldsFunction,
    ) &&
    /old\.couple_locked_at\s+is\s+distinct\s+from\s+new\.couple_locked_at/.test(
      protectUserIdentityFieldsFunction,
    ) &&
    /if\s+not\s+public\.pinly_membership_mutation_allowed\(\)\s+then[\s\S]*raise\s+exception/i.test(
      protectUserIdentityFieldsFunction,
    ) &&
    /drop\s+trigger\s+if\s+exists\s+protect_user_identity_fields\s+on\s+public\.users/i.test(
      oneCoupleLockMigration,
    ) &&
    /create\s+trigger\s+protect_user_identity_fields[\s\S]*before\s+update\s+on\s+public\.users[\s\S]*execute\s+function\s+public\.protect_user_identity_fields\(\)/i.test(
      oneCoupleLockMigration,
    ),
  "Direct user profile updates must not bypass one-couple lock fields.",
);

assert(
  /pair\.oneCoupleWarning/.test(coupleSetup) &&
    /pair\.oneCoupleConfirm/.test(coupleSetup) &&
    /acceptedCoupleLock/.test(coupleSetup) &&
    /!acceptedCoupleLock[\s\S]{0,240}pair\.lockRequired[\s\S]{0,120}return/.test(
      handleCreateCoupleBlock,
    ) &&
    /!acceptedCoupleLock[\s\S]{0,240}pair\.lockRequired[\s\S]{0,120}return/.test(
      handleJoinCoupleBlock,
    ) &&
    /onClick=\{handleCreate\}[\s\S]{0,240}disabled=\{[^}]*!acceptedCoupleLock/.test(
      coupleSetup,
    ) &&
    /type="submit"[\s\S]{0,260}disabled=\{[^}]*!acceptedCoupleLock/.test(
      coupleSetup,
    ),
  "Couple setup must require an explicit one-couple acknowledgement before create/join.",
);

assert(
  !/url\.hostname\s*===\s*["']res\.cloudinary\.com["']/.test(serviceWorker) &&
    !/cacheName:\s*["']cloudinary-images["']/.test(serviceWorker),
  "Service worker must not keep an app-managed Cloudinary media cache.",
);

console.log("Performance/API/security contracts passed.");
