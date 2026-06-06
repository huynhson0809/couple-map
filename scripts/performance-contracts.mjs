import { readFileSync } from "node:fs";
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

function hasGetInvoke(source) {
  const invokeIndex = source.indexOf("functions.invoke");
  if (invokeIndex < 0) return false;

  const statsIndex = source.indexOf("couple-stats", invokeIndex);
  if (statsIndex < 0) return false;

  return /method:\s*['"]GET['"]/.test(source.slice(statsIndex, statsIndex + 500));
}

const app = read("src/App.tsx");
const mapPage = read("src/pages/MapPage.tsx");
const mapView = read("src/components/map/MapView.tsx");
const wishlistPage = read("src/pages/WishlistPage.tsx");
const styles = read("src/index.css");
const pinsContext = read("src/hooks/PinsContext.tsx");
const useBucket = read("src/hooks/useBucket.ts");
const useCouple = read("src/hooks/useCouple.ts");
const useSubscription = read("src/hooks/useSubscription.tsx");
const useLocationHook = read("src/hooks/useLocation.ts");
const useViewportPins = read("src/hooks/useViewportPins.ts");
const statsApi = read("src/hooks/useStatsApi.ts");
const serviceWorker = read("src/sw-push.ts");
const timelinePins = read("src/hooks/useTimelinePins.ts");
const notificationFeed = read("src/hooks/useNotificationFeed.ts");
const coupleStats = read("supabase/functions/couple-stats/index.ts");
const checkout = read("supabase/functions/create-checkout/index.ts");
const cloudinaryUpload = read("supabase/functions/sign-cloudinary-upload/index.ts");
const cloudinaryDelete = read("supabase/functions/delete-pin-media/index.ts");
const cloudinaryClient = read("src/lib/cloudinary.ts");
const securityMigration = read("supabase/migration_security_hardening.sql");
const subscriptionsMigration = read("supabase/migration_subscriptions.sql");
const notificationsMigration = read("supabase/migration_notifications.sql");
const apiPerformanceMigration = readOptional(
  "supabase/migration_api_performance.sql",
);

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
  /req\.method\s*!==\s*["']POST["']/.test(checkout),
  "create-checkout must reject non-POST requests server-side.",
);

assert(
  /check_edge_rate_limit/.test(checkout),
  "create-checkout must rate-limit activation code attempts.",
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
  /isAccurateEnough/.test(mapPage) &&
    /GPS_QUICK_MS\s*=\s*6000/.test(mapPage) &&
    !/Date\.now\(\)\s*-\s*lastUserLocation\.receivedAt\s*<\s*60_000\)\s*\{/.test(
      mapPage,
    ),
  "MapPage FAB should only reuse recent user location when its accuracy is good enough.",
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
  /append\s*\?\s*undefined\s*:\s*["']exact["']/.test(timelinePins),
  "Timeline load-more must not request exact total counts on every page.",
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
  /function\s+shouldSkipHighlightedCluster/.test(mapView) &&
    /function\s+getRenderablePins/.test(mapView) &&
    /const\s+queue/.test(mapView) &&
    /SAME_PLACE_RADIUS_METERS/.test(mapView) &&
    /CLUSTER_SCREEN_MAX_ZOOM/.test(mapView) &&
    /if\s*\(shouldSkipHighlightedCluster\(current\.pin,\s*other\.pin\)\)\s*continue/.test(
      mapView,
    ),
  "MapView must cluster only renderable viewport pins, use connected groups, and avoid over-grouping at high zoom.",
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

console.log("Performance/API/security contracts passed.");
