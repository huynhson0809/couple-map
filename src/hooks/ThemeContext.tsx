import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface Ctx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeCtx = createContext<Ctx | null>(null);
const KEY = "pinly.theme";
const LIGHT_THEME_COLOR = "#fff8fa";
const DARK_THEME_COLOR = "#0f1015";

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "dark" || stored === "light" ? stored : "light";
  } catch {
    return "light";
  }
}

function updateThemeColor(theme: Theme) {
  if (typeof document === "undefined" || !document.head) return;

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }

  meta.setAttribute("content", theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined" || !document.documentElement) return;

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  updateThemeColor(theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);

    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Ignore storage failures in private or constrained browser modes.
    }
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  const toggle = () => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme must be inside ThemeProvider");
  return v;
}
