// ============================================================================
// Kitteltext – Theme (System / Hell / Dunkel)
// ----------------------------------------------------------------------------
// Standard: dem Systemwunsch folgen (Dark im Nachtdienst, Light am Tag).
// Manuell überschreibbar. Setzt data-theme am <html>, das CSS liefert die Werte.
// ============================================================================

import { signal, effect } from "@preact/signals";

export type ThemeWahl = "system" | "hell" | "dunkel";

const KEY = "kitteltext.theme.v1";

function laden(): ThemeWahl {
  const v = localStorage.getItem(KEY);
  return v === "hell" || v === "dunkel" ? v : "system";
}

export const themeWahl = signal<ThemeWahl>(laden());

function anwenden(w: ThemeWahl) {
  const root = document.documentElement;
  if (w === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", w === "hell" ? "light" : "dark");
  // theme-color-Meta für die iOS-Statusleiste nachziehen
  const hell =
    w === "hell" ||
    (w === "system" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", hell ? "#f3f5f9" : "#0f1420");
}

effect(() => {
  anwenden(themeWahl.value);
  try {
    localStorage.setItem(KEY, themeWahl.value);
  } catch {
    /* ignore */
  }
});

// bei System-Wechsel live nachziehen
window
  .matchMedia("(prefers-color-scheme: light)")
  .addEventListener("change", () => {
    if (themeWahl.value === "system") anwenden("system");
  });

export function setTheme(w: ThemeWahl) {
  themeWahl.value = w;
}
