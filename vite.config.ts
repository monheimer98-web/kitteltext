import { defineConfig } from "vite";
import type { Plugin } from "vite";
import preact from "@preact/preset-vite";

// Der ausgelieferte Web-Build lädt Skript und Stil nur aus eigenen Dateien. Eingebetteten
// Code brauchen nur die Einzeldatei und der Entwicklungsserver; dort bleibt die Richtlinie
// aus index.html stehen.
function strengeRichtlinie(): Plugin {
  const locker = "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";
  return {
    name: "kitteltext-strenge-richtlinie",
    apply: "build",
    transformIndexHtml(html) {
      if (!html.includes(locker)) throw new Error("Content-Security-Policy in index.html hat sich geändert: vite.config.ts anpassen.");
      return html.replace(locker, "script-src 'self'; style-src 'self'");
    },
  };
}

// Relative Pfade, damit der Build unter jeder Adresse und in einem Unterordner läuft.
export default defineConfig({
  base: "./",
  plugins: [preact(), strengeRichtlinie()],
  build: { target: "es2020", modulePreload: { polyfill: false } },
});
