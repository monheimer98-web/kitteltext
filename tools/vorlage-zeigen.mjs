// Gibt eine Vorlage als fertigen Brieftext aus, zum Gegenlesen.
// Aufruf: node tools/vorlage-zeigen.mjs <vorlagen-id> [rechts|links|beidseits] [m|w|k|n]
import { KATALOG } from "../src/data/katalog.ts";
import { briefText, indexiere, renderBrief } from "../src/engine/render.ts";
import { mitPerson, mitSeite, mitVorlage, neuerFall } from "../src/engine/fall.ts";

const [id, seite = "rechts", person = "w"] = process.argv.slice(2);
const index = indexiere(KATALOG);
const vorlage = index.vorlagen.get(id);
if (!vorlage) {
  console.error(`Vorlage "${id}" nicht gefunden. Vorhanden:\n` + KATALOG.vorlagen.map((v) => `  ${v.id}  (${v.titel})`).join("\n"));
  process.exit(1);
}
let fall = mitVorlage(neuerFall(vorlage.setting, index), vorlage, index);
fall = mitPerson(mitSeite(fall, seite), person, "47");
const brief = renderBrief(fall, index);
console.log(`# ${vorlage.titel} · ${vorlage.status}\n`);
console.log(briefText(brief));
console.log(`\n--- ${brief.offen} offen · ${brief.vorschlag} Vorschläge der Vorlage (grau, zu übernehmen)`);
for (const a of brief.abschnitte) {
  if (a.aus.length) console.log(`zuwählbar in ${a.titel}: ${a.aus.map((e) => e.label).join(" · ")}`);
}
for (const [satz, ersatz] of Object.entries(vorlage.weglassen ?? {})) console.log(`nicht angeboten (weglassen), solange eine Ersatzstelle im Fall steht oder zur Wahl ist: ${satz} → ${ersatz.join(", ")}`);
for (const [key, liste] of Object.entries(vorlage.schnellwerte ?? {})) console.log(`Schnellwerte dieser Vorlage an ${key}: ${liste.length ? liste.map((w) => `„${w}“`).join(" · ") : "keine"}`);
