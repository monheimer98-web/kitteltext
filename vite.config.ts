import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// base: "./" -> relative Pfade, damit derselbe Build spaeter auch als
// Single-File-HTML vom Netzlaufwerk (file://) am Klinik-PC laufen kann.
export default defineConfig({
  base: "./",
  plugins: [preact()],
  build: {
    target: "es2020",
  },
});
