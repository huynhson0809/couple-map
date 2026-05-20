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
const KEY = "mapmate.theme";

// Dark mode temporarily disabled — force light until polished.
const DARK_MODE_ENABLED = false;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (!DARK_MODE_ENABLED) return "light";
    const stored = localStorage.getItem(KEY);
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    if (!DARK_MODE_ENABLED) return;
    setThemeState(t);
  };
  const toggle = () => {
    if (!DARK_MODE_ENABLED) return;
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const isDarkModeEnabled = () => DARK_MODE_ENABLED;

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme must be inside ThemeProvider");
  return v;
}
