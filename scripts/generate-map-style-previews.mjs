import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "public/map-style-previews");
const styleSourcePath = resolve(root, "src/hooks/useMapStyle.ts");
const maplibreDir = resolve(root, "node_modules/maplibre-gl/dist");
const previewSize = { width: 360, height: 240 };
const camera = { lng: 106.6297, lat: 10.8231, zoom: 11.5 };
const minRenderedPreviewBytes = 10_000;

function parseStyles(source) {
  return [...source.matchAll(/\{\s*id:\s*"([^"]+)"[\s\S]*?url:\s*"([^"]+)"/g)]
    .map((match) => ({ id: match[1], url: match[2] }));
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

async function loadStylePayload(style) {
  if (!style.url.startsWith("/")) return style.url;
  const filePath = resolve(root, "public", style.url.slice(1));
  return JSON.parse(await readFile(filePath, "utf8"));
}

function htmlForStyle(styleJson) {
  const styleLiteral = JSON.stringify(styleJson).replaceAll("</", "<\\/");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/maplibre-gl.css" />
    <style>
      html, body, #map {
        width: ${previewSize.width}px;
        height: ${previewSize.height}px;
        margin: 0;
        overflow: hidden;
        background: #f8fafc;
      }
      .maplibregl-control-container {
        display: none;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="/maplibre-gl.js"></script>
    <script>
      window.__previewReady = false;
      window.__previewError = null;
      window.__previewMap = null;

      const finish = () => {
        window.__previewReady = true;
      };

      try {
        const map = new maplibregl.Map({
          container: "map",
          style: ${styleLiteral},
          center: [${camera.lng}, ${camera.lat}],
          zoom: ${camera.zoom},
          interactive: false,
          attributionControl: false,
          preserveDrawingBuffer: true,
        });
        window.__previewMap = map;

        let loaded = false;
        map.once("load", () => {
          loaded = true;
          map.resize();
          map.on("idle", () => {
            if (map.areTilesLoaded()) finish();
          });
          setTimeout(() => {
            if (map.areTilesLoaded()) finish();
          }, 2600);
        });
        map.on("error", (event) => {
          if (!loaded) {
            window.__previewError = event?.error?.message || "Map style failed to load";
          }
        });
        setTimeout(finish, 6500);
      } catch (error) {
        window.__previewError = error?.message || String(error);
        finish();
      }
    </script>
  </body>
</html>`;
}

function contentType(pathname) {
  if (pathname.endsWith(".css")) return "text/css";
  if (pathname.endsWith(".js")) return "text/javascript";
  return "text/html";
}

async function startPreviewServer(stylePayloads) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/maplibre-gl.css" || url.pathname === "/maplibre-gl.js") {
        const file = resolve(maplibreDir, url.pathname.slice(1));
        response.writeHead(200, { "content-type": contentType(url.pathname) });
        response.end(await readFile(file));
        return;
      }

      if (url.pathname === "/preview") {
        const id = url.searchParams.get("style") ?? "";
        const styleJson = stylePayloads.get(id);
        if (!styleJson) {
          response.writeHead(404);
          response.end("Unknown style");
          return;
        }
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(htmlForStyle(styleJson));
        return;
      }

      response.writeHead(404);
      response.end("Not found");
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not bind preview server");
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function waitForDevTools(processHandle) {
  return await new Promise((resolveWs, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(new Error(`Chrome did not expose DevTools websocket. Output: ${output}`));
    }, 15_000);

    function onData(chunk) {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timer);
      resolveWs(match[1]);
    }

    processHandle.stderr.on("data", onData);
    processHandle.stdout.on("data", onData);
    processHandle.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited before DevTools was ready: ${code}. Output: ${output}`));
    });
  });
}

function createCdpClient(browserWsUrl) {
  const socket = new WebSocket(browserWsUrl);
  const pending = new Map();
  let id = 0;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const callbacks = pending.get(message.id);
    if (!callbacks) return;
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(message.error.message));
    else callbacks.resolve(message.result);
  });

  return {
    ready: new Promise((resolveReady, rejectReady) => {
      socket.addEventListener("open", resolveReady, { once: true });
      socket.addEventListener("error", rejectReady, { once: true });
    }),
    send(method, params = {}, sessionId) {
      const messageId = ++id;
      const message = { id: messageId, method, params };
      if (sessionId) message.sessionId = sessionId;
      socket.send(JSON.stringify(message));
      return new Promise((resolveSend, rejectSend) => {
        pending.set(messageId, { resolve: resolveSend, reject: rejectSend });
      });
    },
    close() {
      socket.close();
    },
  };
}

async function captureStyle(client, origin, styleId) {
  const { targetId } = await client.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  await client.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: previewSize.width,
      height: previewSize.height,
      deviceScaleFactor: 2,
      mobile: false,
    },
    sessionId,
  );
  await client.send("Page.navigate", {
    url: `${origin}/preview?style=${encodeURIComponent(styleId)}`,
  }, sessionId);

  let previewStatus = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    previewStatus = await getPreviewStatus(client, sessionId);
    if (previewStatus.ready) break;
    if (previewStatus.error) break;
    await delay(125);
  }

  if (previewStatus?.error) {
    await client.send("Target.closeTarget", { targetId });
    throw new Error(`Map preview "${styleId}" failed to load: ${previewStatus.error}`);
  }

  let image = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await delay(250);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      clip: {
        x: 0,
        y: 0,
        width: previewSize.width,
        height: previewSize.height,
        scale: 1,
      },
      captureBeyondViewport: false,
    }, sessionId);
    image = Buffer.from(screenshot.data, "base64");
    if (image.byteLength >= minRenderedPreviewBytes) break;
    previewStatus = await getPreviewStatus(client, sessionId);
  }

  await client.send("Target.closeTarget", { targetId });
  if (!image || image.byteLength < minRenderedPreviewBytes) {
    throw new Error(
      `Map preview "${styleId}" rendered blank (${image?.byteLength ?? 0} bytes): ${JSON.stringify(previewStatus)}`,
    );
  }
  return image;
}

async function getPreviewStatus(client, sessionId) {
  const result = await client.send("Runtime.evaluate", {
    expression: `(() => {
      try {
        const map = window.__previewMap;
        let diagnosticError = null;
        const safeMapCall = (read) => {
          try {
            return read();
          } catch (error) {
            diagnosticError = diagnosticError || error?.message || String(error);
            return false;
          }
        };
        let sourceIds = [];
        let sourceLoaded = false;
        try {
          sourceIds = map ? Object.keys(map.getStyle?.()?.sources || {}) : [];
          sourceLoaded = sourceIds.length
            ? sourceIds.every((sourceId) => {
                try {
                  return map.isSourceLoaded(sourceId);
                } catch {
                  return false;
                }
              })
            : false;
        } catch (error) {
          diagnosticError = error?.message || String(error);
        }
        return JSON.stringify({
          pageReady: typeof window.__previewReady !== "undefined",
          ready: window.__previewReady === true,
          error: window.__previewError || null,
          diagnosticError,
          documentReady: document.readyState,
          href: location.href,
          maplibreReady: Boolean(window.maplibregl),
          mapLoaded: map ? Boolean(safeMapCall(() => map.loaded())) : false,
          tilesLoaded: map ? Boolean(safeMapCall(() => map.areTilesLoaded())) : false,
          sourceLoaded,
          sourceIds,
          canvasCount: document.querySelectorAll("canvas").length,
          resourceCount: performance.getEntriesByType("resource").length,
          bodyText: document.body?.innerText?.slice(0, 140) || "",
        });
      } catch (error) {
        return JSON.stringify({
          pageReady: false,
          ready: false,
          error: null,
          diagnosticError: error?.message || String(error),
        });
      }
    })()`,
    returnByValue: true,
  }, sessionId);
  const statusJson = result.result?.value;
  if (typeof statusJson !== "string") {
    return {
      pageReady: false,
      ready: false,
      error: result.exceptionDetails?.text || "Could not read preview status",
    };
  }
  return JSON.parse(statusJson);
}

async function removeChromeDataDir(path) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch {
      await delay(250);
    }
  }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error("Chrome was not found. Set CHROME_PATH to a Chrome/Chromium executable.");
  }

  const styles = parseStyles(await readFile(styleSourcePath, "utf8"));
  if (!styles.length) throw new Error("No map styles found in src/hooks/useMapStyle.ts");

  const stylePayloads = new Map();
  for (const style of styles) {
    stylePayloads.set(style.id, await loadStylePayload(style));
  }

  await mkdir(outDir, { recursive: true });
  const { server, origin } = await startPreviewServer(stylePayloads);
  const chromeDataDir = resolve(tmpdir(), `pinly-map-previews-${Date.now()}`);
  const chromeProcess = spawn(chrome, [
    "--headless=new",
    "--enable-webgl",
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${chromeDataDir}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let client;
  try {
    const browserWsUrl = await waitForDevTools(chromeProcess);
    client = createCdpClient(browserWsUrl);
    await client.ready;

    for (const style of styles) {
      const image = await captureStyle(client, origin, style.id);
      const outputPath = resolve(outDir, `${style.id}.png`);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, image);
      console.log(`Generated public/map-style-previews/${style.id}.png`);
    }
  } finally {
    client?.close();
    chromeProcess.kill("SIGTERM");
    await new Promise((resolveClose) => server.close(resolveClose));
    await removeChromeDataDir(chromeDataDir);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
