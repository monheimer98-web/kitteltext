// Gestaltung nach Regeln (E-69 (8), DS-R6-1, CR-R6-15): Schriftgrößen nur aus der Skala, in behalten.css auch Radien nur als
// Token. Geprüft wird der Quelltext der Stylesheets, nicht das Bild; das Bild prüfen die Klicktests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (datei: string) => readFileSync(new URL(`../src/ui/${datei}`, import.meta.url), "utf8");

/** Deklarationen `eigenschaft: wert` mit Zeilennummer. */
function werte(css: string, eigenschaft: string): { zeile: number; wert: string }[] {
  const aus: { zeile: number; wert: string }[] = [];
  css.split("\n").forEach((z, i) => {
    const m = z.match(new RegExp(`^\\s*${eigenschaft}:\\s*([^;]+);`));
    if (m) aus.push({ zeile: i + 1, wert: m[1].trim() });
  });
  return aus;
}

test("Schriftgrößen in allen Stylesheets nur aus der Skala (--schrift-…), keine Literalwerte (DS-R6-1)", () => {
  for (const datei of ["styles.css", "behalten.css"]) {
    const literal = werte(lies(datei), "font-size").filter((w) => !/^var\(--schrift-\d+\)$/.test(w.wert) && w.wert !== "inherit");
    assert.deepEqual(literal, [], `${datei}: Schriftgröße ohne Token`);
  }
});

test("behalten.css: Radien nur als Token (--radius-4/6/8), Gewicht höchstens 600 (DS-R6-1, CR-R6-15)", () => {
  const css = lies("behalten.css");
  const radien = werte(css, "border-radius").filter((w) => !w.wert.split(/\s+/).every((t) => t === "0" || /^var\(--radius-(4|6|8)\)$/.test(t)));
  assert.deepEqual(radien, [], "Radius ohne Token");
  assert.deepEqual(
    werte(css, "font-weight").filter((w) => Number(w.wert) > 600),
    [],
    "700 nur für Titel (E-69 (8))",
  );
  const root = lies("styles.css").slice(0, lies("styles.css").indexOf("}"));
  for (const r of ["--radius-4: 4px;", "--radius-6: 6px;", "--radius-8: 8px;", "--radius: var(--radius-8);"]) assert.ok(root.includes(r), `Token fehlt: ${r}`);
});
