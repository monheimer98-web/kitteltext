// Prüft, welche Vorlage die Suche zu einem Wort findet. Aufruf: node tools/werkstatt/suchprobe.mjs zna "becken" "gicht" …
import { KATALOG } from "../../src/data/katalog.ts";
import { sucheVorlagen } from "../../src/engine/suche.ts";
const [setting, ...woerter] = process.argv.slice(2);
for (const q of woerter) {
  const t = sucheVorlagen(KATALOG.vorlagen.filter((v) => v.setting === setting), q, setting);
  console.log(q.padEnd(26), "→", t.slice(0, 3).map((x) => (x.vorlage ?? x).titel).join(" | ") || "(nichts)");
}
