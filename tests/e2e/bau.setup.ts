// Vorbedingung für den Lauf „einzeldatei“ (CR-K10): Getestet wird die gebaute Datei. Fehlt sie oder ist sie älter als
// der Quelltext, sagte ein grüner oder roter Lauf nichts über die Änderung; dann bricht dieser Schritt ab, und der Lauf
// „einzeldatei“ entfällt mit Fehler statt mit einer überlesbaren Warnung. `npm run test:e2e` baut vorher.
import { test } from "@playwright/test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = fileURLToPath(new URL("../../", import.meta.url));
// Erzeugt bei jedem Start von Test, Bau und Entwicklungsserver; sein Alter sagt nichts.
const ERZEUGT = new Set([join(WURZEL, "src/data/dateien.ts")]);

function juengste(pfad: string): { pfad: string; zeit: number } {
  const st = statSync(pfad);
  if (!st.isDirectory()) return { pfad, zeit: ERZEUGT.has(pfad) ? 0 : st.mtimeMs };
  let best = { pfad, zeit: 0 };
  for (const name of readdirSync(pfad)) {
    const k = juengste(join(pfad, name));
    if (k.zeit > best.zeit) best = k;
  }
  return best;
}

test("Einzeldatei ist gebaut und jünger als der Quelltext", () => {
  const datei = join(WURZEL, "dist-einzeldatei/kitteltext.html");
  if (!existsSync(datei)) throw new Error("dist-einzeldatei/kitteltext.html fehlt. Erst `npm run build` (oder `npm run test:e2e`, das vorher baut).");
  const gebaut = statSync(datei).mtimeMs;
  const quellen = ["src", "index.html", "vite.config.ts", "vite.einzeldatei.config.ts"].map((p) => juengste(join(WURZEL, p)));
  const neuer = quellen.filter((q) => q.zeit > gebaut);
  if (neuer.length > 0) throw new Error(`Die Einzeldatei ist älter als ${neuer.map((q) => q.pfad.slice(WURZEL.length)).join(", ")}. Erst \`npm run build\`.`);
});
