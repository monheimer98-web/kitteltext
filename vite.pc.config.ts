import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Baut NUR den PC-Zwilling (pc.html) als EINE eigenständige HTML-Datei mit
// allem inline (JS/CSS/Daten). Ziel: auf ein Netzlaufwerk legen und im
// Klinik-Browser per Lesezeichen/file:// öffnen – kein Server, keine Installation.
export default defineConfig({
  base: "./",
  plugins: [preact(), viteSingleFile()],
  build: {
    target: "es2020",
    outDir: "dist-pc",
    emptyOutDir: true,
    rollupOptions: {
      input: "pc.html",
    },
  },
});
