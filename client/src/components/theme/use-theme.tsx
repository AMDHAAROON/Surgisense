import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";

type ThemeCtx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("surgitrack.theme") as Theme | null) ?? null;
    const initial: Theme =
      saved ??
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({
      theme,
      setTheme: (t) => {
        setTheme(t);
        localStorage.setItem("surgitrack.theme", t);
        applyTheme(t);
      },
      toggle: () => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        setTheme(next);
        localStorage.setItem("surgitrack.theme", next);
        applyTheme(next);
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
