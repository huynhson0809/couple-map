import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
const MAPLIBRE_CSS_URL = "/vendor/maplibre-gl.css";

function ensureMapLibreStylesheet() {
  const existing = document.querySelector<HTMLLinkElement>(
    'link[data-pinly-maplibre-css="true"]',
  );
  if (existing) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPLIBRE_CSS_URL;
  link.dataset.pinlyMaplibreCss = "true";
  document.head.prepend(link);
}

const standaloneQuery = window.matchMedia("(display-mode: standalone)");

function syncStandaloneClass() {
  const isStandalone =
    standaloneQuery.matches ||
    Boolean((window.navigator as NavigatorWithStandalone).standalone);

  document.documentElement.classList.toggle("is-standalone", isStandalone);
}

ensureMapLibreStylesheet();
syncStandaloneClass();
standaloneQuery.addEventListener("change", syncStandaloneClass);

createRoot(document.getElementById("root")!).render(<App />);
