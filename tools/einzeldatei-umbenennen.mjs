// Die Einzeldatei bekommt einen sprechenden Namen; der Dienstarbeiter und das
// Manifest gehören nicht dazu, weil sie bei lokal geöffneten Dateien nicht arbeiten.
// Der Verweis auf das Symbol entfällt: Die Datei soll auf nichts neben sich zeigen.
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const ordner = new URL("../dist-einzeldatei/", import.meta.url);
const html = readFileSync(new URL("index.html", ordner), "utf8");
const ohneSymbol = html.replace(/\s*<link rel="icon"[^>]*>/, "");
if (ohneSymbol === html) throw new Error("Symbolverweis in der Einzeldatei nicht gefunden: tools/einzeldatei-umbenennen.mjs anpassen.");
if (/(src|href)="\.?\/?(assets|icon)/.test(ohneSymbol)) throw new Error("Die Einzeldatei verweist noch auf eine Nachbardatei.");
writeFileSync(new URL("kitteltext.html", ordner), ohneSymbol);
for (const datei of readdirSync(ordner)) {
  if (datei !== "kitteltext.html") rmSync(new URL(datei, ordner), { recursive: true });
}
