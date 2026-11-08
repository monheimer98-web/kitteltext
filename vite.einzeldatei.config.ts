import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Baut die ganze App als eine einzige HTML-Datei ohne weitere Dateien. Sie
// läuft per Doppelklick von einem Laufwerk, ohne Server und ohne Netz.
export default defineConfig({
  base: "./",
  plugins: [preact(), viteSingleFile()],
  build: {
    target: "es2020",
    // Der Vorlade-Ersatz von Vite enthielte einen Netzwerkaufruf, den die App nie braucht.
    modulePreload: { polyfill: false },
    outDir: "dist-einzeldatei",
    emptyOutDir: true,
  },
});
