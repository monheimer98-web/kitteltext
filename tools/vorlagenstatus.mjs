// Erzeugt docs/03-inhalt/02-vorlagenstatus.md aus dem Katalog.
import { writeFileSync } from "node:fs";
import { KATALOG } from "../src/data/katalog.ts";
import { indexiere, renderBrief } from "../src/engine/render.ts";
import { mitPerson, mitSeite, mitVorlage, neuerFall } from "../src/engine/fall.ts";

const index = indexiere(KATALOG);
const STATUS = { hausstandard: "Standardtext", geprueft: "ärztlich geprüft", entwurf: "Entwurf", eigen: "eigen" };
const region = (id) => KATALOG.regionen.find((r) => r.id === id)?.name ?? id;

const zeilen = [
  "# Vorlagenstatus",
  "",
  "Erzeugt von `tools/vorlagenstatus.mjs` aus dem Katalog; nicht von Hand ändern (`npm run status`).",
  "",
  "Bedeutung: **Standardtext** = Wortlaut aus den „Standardtexten ZNA 04/2026“, die der Nutzer selbst verfasst hat; keine Unterlage der Klinik und nicht durch die App ärztlich geprüft. **Entwurf** = von der Redaktion geschrieben, von keinem Arzt freigegeben. **Ärztlich geprüft** vergibt nur ein Arzt. Die Spalte „Bausteine“ zählt, wie viele Bausteine der Vorlage Hausstandard und wie viele Entwurf sind; „Vorschläge“ nennt die Zahl der Sätze und Befunde, die grau vorgeschlagen und vom Arzt zu übernehmen sind, „zu entscheiden“ die Befunde ohne Vorschlag, „Pflichtangaben“ die offenen Stellen eines frischen Briefs.",
  "",
];
const alle = KATALOG.vorlagen;
const bausteine = KATALOG.regionen.flatMap((r) => r.bausteine);
zeilen.push(
  `Katalog Version ${KATALOG.version}: ${alle.length} Vorlagen (${alle.filter((v) => v.setting === "zna").length} Notaufnahme, ${alle.filter((v) => v.setting === "station").length} Station), ${bausteine.length} Bausteine (${bausteine.filter((b) => b.status === "hausstandard").length} Hausstandard, ${bausteine.filter((b) => b.status === "entwurf").length} Entwurf, ${bausteine.filter((b) => b.status === "geprueft").length} ärztlich geprüft).`,
  "",
);

for (const [setting, titel] of [["zna", "Notaufnahme"], ["station", "Station"]]) {
  zeilen.push(`## ${titel}`, "", "| Vorlage | Region | Status | Bausteine (Haus/Entwurf) | Vorschläge | zu entscheiden | Pflichtangaben |", "|---|---|---|---|---|---|---|");
  for (const v of alle.filter((x) => x.setting === setting).sort((a, b) => region(a.region).localeCompare(region(b.region), "de") || a.titel.localeCompare(b.titel, "de"))) {
    const ids = Object.values(v.abschnitte).flat();
    const bs = ids.map((id) => index.bausteine.get(id)).filter(Boolean);
    let fall = mitVorlage(neuerFall(v.setting, index), v, index);
    fall = mitPerson(mitSeite(fall, "rechts"), "w", "50");
    const brief = renderBrief(fall, index);
    zeilen.push(
      `| ${v.titel} | ${region(v.region)} | ${STATUS[v.status]} | ${bs.filter((b) => b.status === "hausstandard").length}/${bs.filter((b) => b.status === "entwurf").length} | ${brief.vorschlag} | ${(v.entscheiden ?? []).length} | ${brief.offen} |`,
    );
  }
  zeilen.push("");
}
writeFileSync(new URL("../docs/03-inhalt/02-vorlagenstatus.md", import.meta.url), zeilen.join("\n"));
console.log(`${alle.length} Vorlagen, ${bausteine.length} Bausteine`);
