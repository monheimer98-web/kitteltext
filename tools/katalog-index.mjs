// Erzeugt src/data/dateien.ts: die Liste aller Katalogdateien als feste Importe.
// So genügt es, eine JSON-Datei in corpus/ oder vorlagen/ zu legen.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const basis = new URL("../src/data/", import.meta.url);
const liste = (ordner) =>
  readdirSync(new URL(ordner + "/", basis))
    .filter((f) => f.endsWith(".json"))
    .sort();

const korpus = liste("corpus");
const vorlagen = liste("vorlagen");
const name = (art, i) => `${art}${i}`;

// Prüfsumme über alle Katalogdateien (FNV-1a, 32 Bit). Sie ist die Version des Katalogs: Ändert sich irgendein
// Zeichen, setzen offene Fälle ihre Auswahlen zurück. Niemand muss daran denken, eine Nummer zu erhöhen.
let stand = 0x811c9dc5;
// Die Standardprotokolle zählen mit: Gewählte Felder darin zeigen per Index auf Wortlaut.
for (const [ordner, dateien] of [["corpus", korpus], ["vorlagen", vorlagen], [".", ["protokolle.json"]]]) {
  for (const f of dateien) {
    for (const zeichen of f + "\n" + readFileSync(new URL(`${ordner}/${f}`, basis), "utf8")) {
      stand ^= zeichen.codePointAt(0);
      stand = Math.imul(stand, 0x01000193) >>> 0;
    }
  }
}

const zeilen = [
  "// Erzeugt von tools/katalog-index.mjs. Nicht von Hand ändern: `npm run index`.",
  ...korpus.map((f, i) => `import ${name("k", i)} from "./corpus/${f}" with { type: "json" };`),
  ...vorlagen.map((f, i) => `import ${name("v", i)} from "./vorlagen/${f}" with { type: "json" };`),
  "",
  `export const KORPUS_DATEIEN: unknown[] = [${korpus.map((_, i) => name("k", i)).join(", ")}];`,
  `export const VORLAGEN_DATEIEN: unknown[] = [${vorlagen.map((_, i) => name("v", i)).join(", ")}];`,
  "",
  "/** Prüfsumme über alle Katalogdateien; dient als Version des Katalogs. */",
  `export const KATALOG_STAND = ${stand};`,
  "",
];
writeFileSync(new URL("dateien.ts", basis), zeilen.join("\n"));
console.log(`${korpus.length} Baustein-Dateien, ${vorlagen.length} Vorlagen-Dateien`);
