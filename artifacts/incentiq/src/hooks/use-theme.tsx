import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./use-auth";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
});

function storageKey(userId: string) {
  return `incentiq_theme_${userId}`;
}

function readStored(userId: string): Theme | null {
  try {
    const v = localStorage.getItem(storageKey(userId));
    if (v === "dark" || v === "light") return v;
  } catch {}
  return null;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    applyTheme("dark");
  }, []);

  useEffect(() => {
    if (isLoading || !user?.id) return;
    const stored = readStored(user.id);
    const resolved: Theme = stored ?? "dark";
    setTheme(resolved);
    applyTheme(resolved);
  }, [user?.id, isLoading]);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    if (user?.id) {
      try {
        localStorage.setItem(storageKey(user.id), next);
      } catch {}
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
