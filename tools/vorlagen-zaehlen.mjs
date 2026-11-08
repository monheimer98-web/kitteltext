// Zählt je Vorlage, wie viele Stellen beim Öffnen offen und wie viele nur vorgeschlagen sind.
// Aufruf: node tools/vorlagen-zaehlen.mjs [Teil der Vorlagen-ID]
import { KATALOG } from "../src/data/katalog.ts";
import { briefText, indexiere, renderBrief } from "../src/engine/render.ts";
import { mitPerson, mitSeite, mitVorlage, neuerFall } from "../src/engine/fall.ts";

const filter = process.argv[2] ?? "";
const index = indexiere(KATALOG);
const zeilen = [];
for (const v of KATALOG.vorlagen) {
  let fall = mitVorlage(neuerFall(v.setting, index), v, index);
  const roh = renderBrief(fall, index);
  if (roh.brauchtSeite) fall = mitSeite(fall, "rechts");
  if (roh.brauchtPerson) fall = mitPerson(fall, "w", "50");
  const b = renderBrief(fall, index);
  zeilen.push({ id: v.id, setting: v.setting, offen: b.offen, grau: b.vorschlag, zeichen: briefText(b).length });
}
zeilen.sort((a, b) => a.setting.localeCompare(b.setting) || b.offen - a.offen);
for (const z of zeilen) {
  if (z.id.includes(filter)) console.log(`${z.setting.padEnd(8)} ${String(z.offen).padStart(3)} offen ${String(z.grau).padStart(3)} grau ${String(z.zeichen).padStart(5)} Z.  ${z.id}`);
}
const mitte = (s, f) => {
  const l = zeilen.filter((z) => z.setting === s).map(f).sort((a, b) => a - b);
  return `Median ${l[Math.floor(l.length / 2)]}, Spanne ${l[0]} bis ${l[l.length - 1]}`;
};
for (const [s, name] of [["zna", "Notaufnahme"], ["station", "Station"]]) {
  console.log(`${name} (${zeilen.filter((z) => z.setting === s).length} Vorlagen): offen ${mitte(s, (z) => z.offen)}; grau ${mitte(s, (z) => z.grau)}`);
}
