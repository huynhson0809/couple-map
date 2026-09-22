import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");

function loadModule(path, dependencies, globals = {}) {
  const source = readFileSync(resolve(root, path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console,
    ...globals,
  });
  return exports;
}

function createHookRunner() {
  const slots = [];
  const timers = new Map();
  let cursor = 0;
  let timerId = 0;
  let dirty = true;
  let effects = [];
  let renderHook;
  let output;
  const sameDeps = (previous, next) =>
    previous &&
    next &&
    previous.length === next.length &&
    previous.every((value, index) => Object.is(value, next[index]));
  const react = {
    useId() {
      return react.useMemo(() => "test-hook", []);
    },
    useLayoutEffect(effect, deps) {
      react.useEffect(effect, deps);
    },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= {
        value: typeof initial === "function" ? initial() : initial,
      };
      return [
        slots[index].value,
        (update) => {
          const next =
            typeof update === "function" ? update(slots[index].value) : update;
          if (!Object.is(next, slots[index].value)) {
            slots[index].value = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps))
        slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, deps) {
      return react.useMemo(() => callback, deps);
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (sameDeps(slots[index]?.deps, deps)) return;
      const previous = slots[index];
      slots[index] = { deps };
      effects.push(() => {
        previous?.cleanup?.();
        slots[index].cleanup = effect();
      });
    },
  };
  return {
    react,
    window: {
      setTimeout(callback) {
        timers.set(++timerId, callback);
        return timerId;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
      setInterval() {
        return ++timerId;
      },
      clearInterval() {},
    },
    get current() {
      return output;
    },
    render(callback = renderHook) {
      renderHook = callback;
      cursor = 0;
      dirty = false;
      output = renderHook();
      const pending = effects;
      effects = [];
      pending.forEach((effect) => effect());
      return output;
    },
    async flush() {
      for (let turn = 0; turn < 40; turn += 1) {
        if (dirty) this.render();
        const pending = [...timers.values()];
        timers.clear();
        pending.forEach((callback) => callback());
        await Promise.resolve();
      }
      if (dirty) this.render();
    },
    unmount() {
      slots.forEach((slot) => slot?.cleanup?.());
    },
  };
}

async function checkTimelinePagination() {
  const runner = createHookRunner();
  const requests = [];
  let releaseRequest;
  let holdRequests = false;
  const supabase = {
    async rpc(_name, input) {
      requests.push(input);
      if (holdRequests)
        await new Promise((resolveRequest) => {
          releaseRequest = resolveRequest;
        });
      return {
        data: Array.from(
          { length: Math.min(24, 72 - input.in_offset) },
          (_, index) => ({
            pin_id: `${input.in_category_ids[0]}-${input.in_offset + index}`,
            total_count: 72,
          }),
        ),
        error: null,
      };
    },
    from() {
      let ids;
      const query = {
        select() {
          return query;
        },
        in(_column, values) {
          ids = values;
          return query;
        },
        order() {
          return query;
        },
        then(resolveResult) {
          resolveResult({ data: ids.map((id) => ({ id })), error: null });
        },
      };
      return query;
    },
  };
  const { useTimelinePins } = loadModule(
    "src/hooks/useTimelinePins.ts",
    {
      react: runner.react,
      "../lib/supabase": { supabase },
    },
    { window: runner.window },
  );
  let version = 0;
  let filters = {
    categoryIds: ["travel"],
    includeFavorites: false,
    dateFrom: "",
    dateTo: "",
    creatorId: "all",
    address: "",
  };
  runner.render(() => useTimelinePins("space-1", filters, version));
  await runner.flush();
  assert.equal(runner.current.pins.length, 24);
  runner.current.loadMore();
  runner.current.loadMore();
  await runner.flush();
  assert.equal(
    runner.current.pins.length,
    48,
    "Load more must append, without duplicate requests.",
  );
  assert.deepEqual(
    requests.map((request) => request.in_offset),
    [0, 24],
  );

  filters = { ...filters, categoryIds: [...filters.categoryIds] };
  runner.render();
  await runner.flush();
  assert.equal(
    requests.length,
    2,
    "Equivalent filters must not reload page one.",
  );

  holdRequests = true;
  version += 1;
  runner.render();
  await runner.flush();
  assert.equal(
    runner.current.pins.length,
    48,
    "Realtime refresh must keep loaded rows visible.",
  );
  assert.equal(
    runner.current.loading,
    false,
    "Background refresh must not unmount the list.",
  );
  holdRequests = false;
  releaseRequest();
  await runner.flush();
  assert.equal(
    runner.current.pins.length,
    48,
    "Refresh must retain the loaded page window.",
  );
  runner.current.loadMore();
  await runner.flush();
  assert.equal(runner.current.pins.length, 72);
  assert.equal(runner.current.hasMore, false);

  holdRequests = true;
  version += 1;
  runner.render();
  await runner.flush();
  const releaseOldQuery = releaseRequest;
  holdRequests = false;
  filters = { ...filters, categoryIds: ["cafe"] };
  runner.render();
  await runner.flush();
  assert.equal(
    runner.current.pins.length,
    24,
    "New filters should reset pagination.",
  );
  releaseOldQuery();
  await runner.flush();
  assert.ok(
    runner.current.pins.every((pin) => pin.id.startsWith("cafe-")),
    "Late responses must not replace a newer filter.",
  );
  runner.unmount();
}

await checkTimelinePagination();
await checkNotificationRecovery();
await checkDeviceBudget();
await checkDurableCreate();
await checkRecoveryClaim();
await checkLocationFallback();
await checkMapTabRestoration();
checkMapSpriteRendering();
console.log("Mobile reliability contracts passed.");

function readFunction(path, name) {
  const source = readFileSync(resolve(root, path), "utf8");
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found;
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      found = node;
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.ok(found, `${name} must exist.`);
  return ts.transpileModule(found.getText(parsed), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function checkMapSpriteRendering() {
  const source = readFunction(
    "src/components/map/MapView.tsx",
    "drawEmojiSprite",
  );
  for (const metrics of [
    {
      actualBoundingBoxLeft: 8,
      actualBoundingBoxRight: 14,
      actualBoundingBoxAscent: 20,
      actualBoundingBoxDescent: 2,
    },
    {
      actualBoundingBoxLeft: 14,
      actualBoundingBoxRight: 7,
      actualBoundingBoxAscent: 15,
      actualBoundingBoxDescent: 5,
    },
  ]) {
    let drawn = false;
    const context = {
      measureText: () => metrics,
      fillText(_emoji, positionX, positionY) {
        drawn = true;
        assert.equal(
          (positionX -
            metrics.actualBoundingBoxLeft +
            positionX +
            metrics.actualBoundingBoxRight) /
            2,
          32,
        );
        assert.equal(
          (positionY -
            metrics.actualBoundingBoxAscent +
            positionY +
            metrics.actualBoundingBoxDescent) /
            2,
          32,
        );
      },
    };
    runInNewContext(
      `${source}\ndrawEmojiSprite(context, "\\u2708\\ufe0f", 32, 32)`,
      { context },
    );
    assert.ok(drawn);
    assert.equal(context.textBaseline, "alphabetic");
  }
  const map = readFileSync(
    resolve(root, "src/components/map/MapView.tsx"),
    "utf8",
  );
  assert.match(
    map,
    /neededSprites\.has\(imageId\)[\s\S]*releaseMemorySprite\(map, imageId\)/,
  );
  assert.match(map, /canvas\.width = 1;\s*canvas\.height = 1;/);
}

async function checkMapTabRestoration() {
  const path = "src/components/map/MapView.tsx";
  const { shouldAutoLocateMap } = loadModule("src/lib/mapDefaults.ts", {});
  let map = {};
  let explicitIntent = false;
  let permissionQueries = 0;
  let locationRequests = 0;
  const mapRef = { current: map };
  const context = {
    lastMapSession: null,
    mapRef,
    pinsRef: { current: [] },
    shouldAutoLocateMap,
    hasExplicitCameraIntent: () => explicitIntent,
    navigator: {
      permissions: {
        query: async () => {
          permissionQueries += 1;
          return { state: "granted" };
        },
      },
    },
  };
  const { getMapSession, autoLocateOnOpen } = runInNewContext(
    `${readFunction(path, "getMapSession")}\n${readFunction(path, "autoLocateOnOpen")}\n({ getMapSession, autoLocateOnOpen })`,
    context,
  );
  const control = {
    trigger: () => {
      locationRequests += 1;
    },
  };
  const session = getMapSession("user-1");
  await autoLocateOnOpen(map, control, session);
  assert.equal(locationRequests, 1, "The first map visit should request GPS.");
  session.hasLocated = true;
  const camera = { center: [12, 48], zoom: 14, pitch: 45, bearing: 30 };
  session.camera = camera;

  map = {};
  mapRef.current = map;
  const returningSession = getMapSession("user-1");
  await autoLocateOnOpen(map, control, returningSession);
  assert.equal(
    locationRequests,
    1,
    "Returning from another tab must not request GPS again.",
  );
  assert.equal(
    permissionQueries,
    1,
    "A located session must also skip redundant permission queries.",
  );
  assert.equal(
    returningSession.camera,
    camera,
    "Camera state must survive a map remount.",
  );

  const nextAccount = getMapSession("user-2");
  assert.equal(nextAccount.hasLocated, false);
  assert.equal(
    nextAccount.camera,
    null,
    "Camera state must not leak to another account.",
  );
  explicitIntent = true;
  await autoLocateOnOpen(map, control, nextAccount);
  assert.equal(
    locationRequests,
    1,
    "Memory navigation must take priority over automatic GPS.",
  );

  explicitIntent = false;
  let finishPermissionQuery;
  context.navigator.permissions.query = () =>
    new Promise((resolveQuery) => {
      finishPermissionQuery = resolveQuery;
    });
  const lateRequest = autoLocateOnOpen(map, control, nextAccount);
  mapRef.current = {};
  finishPermissionQuery({ state: "granted" });
  await lateRequest;
  assert.equal(
    locationRequests,
    1,
    "A destroyed map must not request GPS after a late permission result.",
  );

  const source = readFileSync(resolve(root, path), "utf8");
  assert.match(source, /session\.hasLocated = true;/);
  assert.match(source, /attributionControl: false,\s*\.\.\.restoredCamera,/);
  assert.match(source, /didInitialFitRef\.current = Boolean\(restoredCamera\)/);
  assert.match(
    source,
    /return \(\) => \{\s*rememberCamera\(\);\s*cancelLongPress\(\);/,
  );
  assert.match(source, /restoredCamera && !hasExplicitCameraIntent\(\)/);
}

async function checkDurableCreate() {
  const source = readFunction(
    "src/components/pins/CreatePinForm.tsx",
    "handleSubmit",
  );
  for (const queueAvailable of [true, false]) {
    const events = [];
    let backgroundTask;
    let releaseQueue;
    let releaseUpload;
    const context = {
      submittingRef: { current: false },
      preparingMediaRef: { current: false },
      createdPinIdRef: { current: null },
      markerUploading: false,
      currentSpaceWritable: true,
      title: "A memory",
      activeSpaceId: "space-1",
      spaceId: "space-1",
      setError() {},
      setSaving() {},
      selectedMedia: [{ file: { name: "photo.jpg" } }],
      createPin: async () => {
        events.push("create");
        return { id: "pin-1" };
      },
      note: "",
      selectedCategoryIds: [],
      markerEmoji: null,
      markerImageUrl: null,
      pinCoords: { lat: 10, lng: 106 },
      address: "",
      lang: "en",
      city: null,
      country: null,
      normalizeAddress: (value) => value,
      normalizeCityName: (value) => value,
      savePendingUploads: async () => {
        events.push("queue-start");
        await new Promise((resolveQueue) => {
          releaseQueue = resolveQueue;
        });
        if (!queueAvailable) throw new Error("QuotaExceededError");
        events.push("durable");
        return ["queued-1"];
      },
      uploadPinMediaFiles: async () => {
        events.push("upload");
        await new Promise((resolveUpload) => {
          releaseUpload = resolveUpload;
        });
        return [{ url: "photo" }];
      },
      supabase: {
        from: () => ({
          insert: async () => {
            events.push("attach");
            return { error: null };
          },
        }),
      },
      toPinImageRows: () => [],
      removePendingUploads: async () => {
        events.push("remove-queue");
      },
      fetchPinImages: async () => [],
      bumpPinsVersion() {},
      setUploadProgress() {},
      clearUploadProgress() {},
      t: (key) => key,
      showToast() {},
      onCreated: () => events.push("close"),
      startAfterNextPaint: (task) => {
        backgroundTask = task;
      },
      console: { warn() {} },
      formatErrorMessage: () => "failed",
      localizedMemoryError: () => "failed",
      releasePendingUploads() {},
    };
    const submit = runInNewContext(`${source}\nhandleSubmit`, context);
    const first = submit({ preventDefault() {} });
    await Promise.resolve();
    await submit({ preventDefault() {} });
    assert.equal(events.filter((event) => event === "create").length, 1);
    assert.ok(
      !events.includes("close"),
      "Form must stay open until queue persistence completes.",
    );
    releaseQueue();
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    if (queueAvailable) {
      await first;
      assert.ok(events.indexOf("durable") < events.indexOf("close"));
      assert.ok(backgroundTask);
      backgroundTask();
    } else {
      assert.ok(
        !events.includes("close"),
        "Queue failure must await foreground upload.",
      );
      assert.equal(backgroundTask, undefined);
    }
    releaseUpload();
    for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
    await first;
    assert.ok(events.includes("attach"));
    assert.ok(events.indexOf("attach") < events.indexOf("remove-queue"));
    assert.ok(events.includes("close"));
  }
}

async function checkLocationFallback() {
  const runner = createHookRunner();
  let now = 100_000;
  let onPosition;
  let onError;
  let cleared = 0;
  const geolocation = {
    getCurrentPosition(success, failure) {
      onPosition = success;
      onError = failure;
    },
    watchPosition() {
      return 1;
    },
    clearWatch() {
      cleared += 1;
    },
  };
  const { useLocation } = loadModule(
    "src/hooks/useLocation.ts",
    {
      react: runner.react,
      "./I18nContext": { translate: (_lang, key) => key },
    },
    {
      navigator: { geolocation },
      window: runner.window,
      Date: { now: () => now },
    },
  );
  runner.render(() => useLocation("en"));
  const initial = runner.current.getCurrentPosition();
  onPosition({ coords: { latitude: 10, longitude: 106, accuracy: 10 } });
  assert.equal((await initial).lat, 10);
  assert.equal(cleared, 1, "Successful fixes should release GPS watches.");
  now += 61_000;
  const failure = runner.current
    .getCurrentPosition()
    .catch((error) => error.message);
  onError({ code: 1, PERMISSION_DENIED: 1 });
  assert.equal(
    await failure,
    "location.permissionDenied",
    "Revoked permission must not silently reuse stale GPS.",
  );
  const fallback = runner.current.getCurrentPosition();
  onPosition({ coords: { latitude: 11, longitude: 107, accuracy: 200 } });
  await runner.flush();
  assert.equal(
    (await fallback).lat,
    11,
    "A new coarse fix is preferable to an old precise location.",
  );
  runner.unmount();
}

async function checkRecoveryClaim() {
  const claimed = new Set();
  const context = {
    claimedPendingUploadIds: claimed,
    getPendingUpload: async (id) => {
      claimed.add(id);
      return { file: { name: "photo.jpg" } };
    },
    releasePendingUploads: (ids) => ids.forEach((id) => claimed.delete(id)),
    uploadPinMediaFiles: () =>
      assert.fail("A direct uploader already owns this file."),
  };
  const recover = runInNewContext(
    `${readFunction("src/lib/pendingUploads.ts", "recoverPendingUpload")}\nrecoverPendingUpload`,
    context,
  );
  await recover({ id: "queued-1" }, () => true);
  assert.ok(
    claimed.has("queued-1"),
    "A skipped recovery must not release another uploader's claim.",
  );
}

async function checkNotificationRecovery() {
  const runner = createHookRunner();
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  const serviceWorker = new EventTarget();
  const bindEvents = (target) => ({
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  });
  let insert;
  let subscribed;
  let serverRows = [
    { id: "first", created_at: "2026-09-21T10:00:00Z", read: false },
  ];
  let hold = false;
  let release;
  let fetches = 0;
  const supabase = {
    async rpc() {
      fetches += 1;
      const data = {
        notifications: [...serverRows],
        unreadCount: serverRows.filter((row) => !row.read).length,
      };
      if (hold)
        await new Promise((resolveRequest) => {
          release = resolveRequest;
        });
      return { data, error: null };
    },
    channel() {
      const channel = {
        on(_event, _filter, callback) {
          insert = callback;
          return channel;
        },
        subscribe(callback) {
          subscribed = callback;
          return channel;
        },
        unsubscribe() {},
      };
      return channel;
    },
  };
  const { useNotificationFeed } = loadModule(
    "src/hooks/useNotificationFeed.ts",
    {
      react: runner.react,
      "../lib/supabase": { supabase },
    },
    {
      window: { ...runner.window, ...bindEvents(windowEvents) },
      document: { visibilityState: "visible", ...bindEvents(documentEvents) },
      navigator: { serviceWorker },
    },
  );
  runner.render(() => useNotificationFeed("user-1", "space-1"));
  await runner.flush();
  assert.equal(runner.current.notifications.length, 1);

  serverRows.unshift({
    id: "push",
    created_at: "2026-09-21T11:00:00Z",
    read: false,
  });
  const push = new Event("message");
  push.data = { type: "NOTIFICATION_RECEIVED" };
  serviceWorker.dispatchEvent(push);
  await runner.flush();
  assert.equal(
    runner.current.notifications.length,
    2,
    "Push should refresh an already-open inbox.",
  );

  hold = true;
  runner.current.refresh();
  await runner.flush();
  const fresh = {
    id: "realtime",
    created_at: "2026-09-21T12:00:00Z",
    read: false,
  };
  serverRows.unshift(fresh);
  insert({ new: fresh });
  hold = false;
  release();
  await runner.flush();
  assert.equal(
    runner.current.notifications.length,
    3,
    "A late fetch must not erase a realtime notification.",
  );
  assert.equal(runner.current.unreadCount, 3);
  const countBeforeResume = fetches;
  documentEvents.dispatchEvent(new Event("visibilitychange"));
  await runner.flush();
  subscribed("SUBSCRIBED");
  await runner.flush();
  assert.equal(
    fetches,
    countBeforeResume + 2,
    "Resume and realtime reconnect should recover missed notifications.",
  );
  runner.unmount();
  const countAfterUnmount = fetches;
  serviceWorker.dispatchEvent(push);
  windowEvents.dispatchEvent(new Event("focus"));
  await runner.flush();
  assert.equal(
    fetches,
    countAfterUnmount,
    "Unmount must release foreground listeners.",
  );
}

async function checkDeviceBudget() {
  const { getDeviceBudget } = loadModule("src/lib/deviceBudget.ts", {});
  const iphone = getDeviceBudget(
    { userAgent: "iPhone", hardwareConcurrency: 6 },
    3,
  );
  assert.equal(
    iphone.constrained,
    true,
    "iOS needs a conservative budget when RAM is undisclosed.",
  );
  assert.equal(iphone.mapPixelRatio, 1.5);
  assert.equal(
    getDeviceBudget({ platform: "MacIntel", maxTouchPoints: 5 }, 2).constrained,
    true,
  );
  assert.equal(getDeviceBudget({ deviceMemory: 2 }, 3).constrained, true);
  assert.equal(
    getDeviceBudget({ hardwareConcurrency: 2 }, 2).constrained,
    true,
  );
  assert.equal(
    getDeviceBudget({ deviceMemory: 8, hardwareConcurrency: 8 }, 3)
      .mapPixelRatio,
    2,
  );

  let active = 0;
  let peak = 0;
  const optionsSeen = [];
  const { compressImage } = loadModule("src/lib/imageCompress.ts", {
    "./deviceBudget": { getDeviceBudget: () => iphone },
    "browser-image-compression": {
      __esModule: true,
      default: async (file, options) => {
        active += 1;
        peak = Math.max(peak, active);
        optionsSeen.push(options);
        await Promise.resolve();
        active -= 1;
        return { ...file, compressed: true };
      },
    },
  });
  const compressed = await Promise.all([
    compressImage({ name: "one" }),
    compressImage({ name: "two" }),
  ]);
  assert.equal(
    peak,
    1,
    "Large photos must be decoded one at a time across uploads.",
  );
  assert.ok(
    optionsSeen.every(
      (options) => !options.useWebWorker && options.maxWidthOrHeight === 1024,
    ),
  );
  await compressImage(compressed[0]);
  assert.equal(
    optionsSeen.length,
    2,
    "Prepared photos should not be decoded a second time.",
  );
  const map = readFileSync(
    resolve(root, "src/components/map/MapView.tsx"),
    "utf8",
  );
  assert.match(map, /pixelRatio: budget\.mapPixelRatio/);
  assert.match(map, /maxTileCacheSize: budget\.mapTileCacheSize/);
  assert.doesNotMatch(map, /preserveDrawingBuffer: true/);
  const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");
  const worker = readFileSync(resolve(root, "src/sw-push.ts"), "utf8");
  assert.match(
    config,
    /registerType: "prompt"/,
    "Updates must wait for user consent, not reload an active save.",
  );
  assert.doesNotMatch(worker, /^self\.skipWaiting\(\);/m);
  assert.match(
    worker,
    /event\.data\?\.type === "SKIP_WAITING"[\s\S]*event\.waitUntil\(self\.skipWaiting\(\)\)/,
  );
  const createForm = readFileSync(
    resolve(root, "src/components/pins/CreatePinForm.tsx"),
    "utf8",
  );
  assert.match(
    createForm,
    /for \(const file of incoming\.slice\(0, remaining\)\)[\s\S]*await compressImageForUpload\(file\)[\s\S]*createSelectedMediaFile\(prepared\)/,
    "Selected photos should be downscaled sequentially before creating decoded previews.",
  );
  assert.match(
    createForm,
    /disabled=\{saving \|\| preparingMedia \|\| markerUploading\}/,
    "Saving must wait until image preparation and marker uploads finish.",
  );
}
