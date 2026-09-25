import { createContext, useContext, useEffect, useState } from "react";

export type SiteTheme = "light" | "dark";
const KEY = "trellis-site-theme";
const ThemeContext = createContext<{ theme: SiteTheme; toggle(): void }>({ theme: "dark", toggle() {} });

function initial(): SiteTheme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<SiteTheme>(initial);
  const [explicit, setExplicit] = useState(() => !!document.documentElement.dataset.theme);
  useEffect(() => {
    if (explicit) return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const on = () => setTheme(mq.matches ? "light" : "dark");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [explicit]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0a0b0a" : "#f6f6f1");
  }, [theme]);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setExplicit(true);
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  };
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useSiteTheme = () => useContext(ThemeContext);
