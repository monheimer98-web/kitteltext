// Spielt einen Fall ohne Oberfläche durch, für Nutzertests und zum Gegenlesen.
//
//   node tools/fall-spielen.mjs --felder <vorlagen-id>
//     listet jede veränderliche Stelle der Vorlage mit Schlüssel, Art, Zustand und Optionen.
//
//   node tools/fall-spielen.mjs <fall.json>
//     erzeugt den Brief aus einer Fallbeschreibung und nennt, was noch offen oder nur vorgeschlagen ist.
//
// Fallbeschreibung (alles außer "vorlage" freiwillig):
//   {
//     "vorlage": "zna-osg-distorsion", "seite": "links", "person": "w", "alter": "34",
//     "entfernen": ["ana-st-unfall"],                   Bausteine der Vorlage herausnehmen (wie „⋯ → entfernen")
//     "bausteine": { "therapie": ["th-zna"] },          zusätzliche Bausteine je Abschnitt
//     "werte":    { "ana-trauma/hergang": "…" },        Felder (Platzhalter) und Messwerte
//     "spaeter":  ["ana-trauma/zeitpunkt"],             Felder, die als [PLATZHALTER] fürs KIS stehen bleiben
//     "auswahl":  { "dgn-roentgen/befund": 0 },         Index der gewählten Formulierung
//     "befund":   { "osg-untersuchung/osg_schwellung": "abw" },   "ok" | "abw" | "weg"
//     "slots":    { "osg-untersuchung/osg_schwellung/ort": 0 },   Index (Auswahl) oder Text/Zahl
//     "optionen": { "th-zna/ruhigstellung": true },     Sätze zu- oder abwählen
//     "eigen":    { "th-zna/ruhigstellung": "…" },      eigener Wortlaut für einen Satz oder Befund
//     "zusatz":   { "procedere": "…" },                 freie Ergänzung je Abschnitt
//     "leer":     ["wahl/diagnostik/0"],                Entweder-oder-Stelle bewusst leer lassen („nichts davon")
//     "sammeln":  true,                                 jeden Knopf „Eintragen: keine Vorerkrankungen, …" drücken, den die
//                                                       Oberfläche nach den Angaben oben anbietet (Sammelangabe, wie ein Klick)
//     "uebernehmen": true                               alle verbliebenen Vorschläge übernehmen (wie „Übernehmen ✓")
//   }
// Reihenfolge: entfernen, bausteine, leer, optionen, befund, werte, spaeter, auswahl, slots, eigen, zusatz, dann „sammeln",
// zuletzt „uebernehmen". Eine Angabe in einem Satz (slots) übernimmt den Satz, wie in der Oberfläche.
// Die Ausgabe nennt in einer Zeile, welche Sammelangaben angeboten und ob sie ausgelöst wurden.

import { readFileSync } from "node:fs";
import { KATALOG } from "../src/data/katalog.ts";
import { briefText, indexiere, renderBrief } from "../src/engine/render.ts";
import { schnellwerteVon, stelleVor } from "../src/engine/vorlage.ts";
import { findeAbgleichhinweise } from "../src/engine/abgleich.ts";
import { mitSammelangabe, sammelAussagen, sammelSchritte } from "../src/engine/sammel.ts";
import { ABGLEICHREGELN } from "../src/data/abgleich.ts";
import {
  mitAngabe,
  mitAuswahl,
  mitBaustein,
  mitBefund,
  mitEigenemText,
  mitOption,
  mitPerson,
  mitSeite,
  mitSlot,
  mitSpaeter,
  mitVorlage,
  mitWahl,
  mitWert,
  mitZusatz,
  neuerFall,
  ohneBaustein,
  uebernehmen,
} from "../src/engine/fall.ts";

const index = indexiere(KATALOG);
const args = process.argv.slice(2);

function vorlageVon(id) {
  const v = index.vorlagen.get(id);
  if (!v) {
    console.error(`Vorlage "${id}" nicht gefunden. Vorhanden:\n` + KATALOG.vorlagen.map((x) => `  ${x.id}  (${x.titel})`).join("\n"));
    process.exit(1);
  }
  return v;
}

function felder(id) {
  const v = vorlageVon(id);
  console.log(`# ${v.titel} · ${v.setting} · ${v.status}`);
  console.log(`entscheiden: ${(v.entscheiden ?? []).join(", ") || "–"}`);
  if (v.vorgaben) console.log(`vorgaben: ${JSON.stringify(v.vorgaben)}`);
  for (const [satz, ersatz] of Object.entries(v.weglassen ?? {})) {
    console.log(`weglassen ${satz}: nicht angeboten, solange eine Ersatzstelle im Fall steht oder zur Wahl ist (${ersatz.join(", ")}), außer der Fall hat dort eine ausdrückliche Angabe`);
  }
  const weg = new Set(Object.keys(v.weglassen ?? {}));
  // Schnellwerte, wie die Vorlage sie anbietet; „(Vorlage)“, wenn sie die des Katalogs ersetzt.
  const schnell = (key, katalog) => {
    const liste = schnellwerteVon(v, key, katalog ?? []);
    return liste.length || v.schnellwerte?.[key] ? ` Schnellwerte${v.schnellwerte?.[key] ? " (Vorlage)" : ""}=${JSON.stringify(liste)}` : "";
  };
  for (const w of v.wahl ?? []) {
    // Wie die Engine: Ein `vor`, das nicht auf einen festen Baustein des Abschnitts zeigt, gilt nicht (CR-T1-07).
    const fest = v.abschnitte[w.abschnitt] ?? [];
    const platz = stelleVor(v, w, fest) !== undefined ? `steht vor ${w.vor}` : w.vor !== undefined ? `„vor: ${w.vor}“ gilt nicht (Katalogtest), steht am Ende des Abschnitts` : "steht am Ende des Abschnitts";
    console.log(`entweder-oder in ${w.abschnitt}: „${w.label}“ ${w.bausteine.join(" | ")}, ${platz}  (im Fall über "bausteine": { "${w.abschnitt}": ["…"] } wählen)`);
  }
  const stellen = [...Object.entries(v.abschnitte), ...(v.wahl ?? []).map((w) => [`${w.abschnitt} (zur Wahl)`, w.bausteine])];
  for (const [abschnitt, ids] of stellen) {
    for (const bid of ids) {
      const b = index.bausteine.get(bid);
      if (!b) {
        console.log(`\n## ${abschnitt} · ${bid} FEHLT IM KATALOG`);
        continue;
      }
      console.log(`\n## ${abschnitt} · ${bid} (${b.titel}) · ${b.status}`);
      for (const p of b.platzhalter ?? []) {
        console.log(`  feld     ${bid}/${p.id}  „${p.label}“ ${p.typ}${p.required ? " Pflicht" : ""}${p.default ? ` Hausstandard=${p.default}` : ""}${schnell(`${bid}/${p.id}`, p.vorschlaege)}`);
      }
      for (const s of b.segmente) {
        if (s.art === "auswahl") console.log(`  auswahl  ${bid}/${s.id}  „${s.label}“ ${s.pflicht ? "Pflicht" : s.variante ? "Variante" : `Vorschlag=${s.default ?? 0}`} ${JSON.stringify(s.optionen)}`);
        const wl = s.art === "option" && weg.has(`${bid}/${s.id}`) ? " WEGGELASSEN" : "";
        if (s.art === "befund") console.log(`  befund   ${bid}/${s.id}  „${s.chip}“ [${s.gruppe ?? "ohne Gruppe"}]${s.selten ? " selten" : ""}\n             normal: ${JSON.stringify(s.normal)}\n             auffällig: ${JSON.stringify(s.abweichung)}`);
        if (s.art === "messwert") console.log(`  messwert ${bid}/${s.id}  „${s.label}“ [${s.gruppe ?? ""}] ${JSON.stringify(s.vorlage)} Norm=${s.normal ?? "–"}`);
        if (s.art === "option") console.log(`  satz     ${bid}/${s.id}  „${s.label}“ ${wl ? "WEGGELASSEN (bedingt, s. o.)" : s.an ? "vorgeschlagen" : "zuwählbar"}: ${JSON.stringify(s.text)}`);
        for (const sl of s.slots ?? []) {
          console.log(`    angabe ${bid}/${s.id}/${sl.id}  „${sl.label}“ ${sl.art}${sl.required ? " Pflicht" : ""}${sl.default != null ? ` Hausstandard=${sl.default}` : ""}${sl.optionen ? " " + JSON.stringify(sl.optionen) : ""}${sl.art === "detail" ? schnell(`${bid}/${s.id}/${sl.id}`, sl.vorschlaege) : ""}`);
        }
      }
    }
  }
}

function spiele(datei) {
  const f = JSON.parse(readFileSync(datei, "utf8"));
  const v = vorlageVon(f.vorlage);
  let fall = mitVorlage(neuerFall(v.setting, index), v, index);
  if (f.seite) fall = mitSeite(fall, f.seite);
  if (f.person) fall = mitPerson(fall, f.person, f.alter ?? "");
  for (const id of f.entfernen ?? []) fall = ohneBaustein(fall, id);
  for (const [abschnitt, ids] of Object.entries(f.bausteine ?? {})) for (const id of ids) fall = mitBaustein(fall, id, index, abschnitt);
  // "leer": ["wahl/diagnostik/0"] lässt eine Entweder-oder-Stelle bewusst leer.
  for (const k of f.leer ?? []) fall = mitWahl(fall, k, null, index);
  for (const [k, an] of Object.entries(f.optionen ?? {})) fall = mitOption(fall, k, an);
  for (const [k, st] of Object.entries(f.befund ?? {})) fall = mitBefund(fall, k, st);
  for (const [k, w] of Object.entries(f.werte ?? {})) fall = mitWert(fall, k, String(w));
  for (const k of f.spaeter ?? []) fall = mitSpaeter(fall, k, true);
  for (const [k, i] of Object.entries(f.auswahl ?? {})) fall = mitAuswahl(fall, k, i);
  for (const [k, w] of Object.entries(f.slots ?? {})) {
    const [bid, sid] = k.split("/");
    const seg = index.bausteine.get(bid)?.segmente.find((s) => "id" in s && s.id === sid);
    fall = seg?.art === "option" ? mitAngabe(fall, `${bid}/${sid}`, k, String(w)) : mitSlot(fall, k, String(w));
  }
  for (const [k, t] of Object.entries(f.eigen ?? {})) fall = mitEigenemText(fall, k, t);
  for (const [abschnitt, t] of Object.entries(f.zusatz ?? {})) fall = mitZusatz(fall, abschnitt, t);

  // Den Knopf zeigt die Oberfläche unter einem sichtbaren Block eines Abschnitts, der weder ausgeblendet noch von Hand bearbeitet ist.
  const sammel = [];
  for (const a of renderBrief(fall, index).abschnitte) {
    if (a.ausgeblendet || a.manuell) continue;
    for (const b of a.bausteine) {
      if (!b.sammelangabe || !a.tokens.some((t) => t.bausteinId === b.id)) continue;
      const schritte = sammelSchritte(fall, b.id, index);
      if (schritte.length === 0) continue;
      sammel.push(`${b.id} „Eintragen: ${sammelAussagen(schritte)}“`);
      if (f.sammeln) fall = mitSammelangabe(fall, b.id, index).fall;
    }
  }

  let brief = renderBrief(fall, index);
  const vorher = { offen: brief.offen, vorschlag: brief.vorschlag };
  const grau = brief.abschnitte.flatMap((a) => a.tokens.filter((t) => t.zustand === "vorschlag" && t.key).map((t) => `${a.titel}: ${t.t.trim()}  [${t.key}]`));
  if (f.uebernehmen) {
    fall = uebernehmen(fall, brief.abschnitte.flatMap((a) => a.tokens.filter((t) => t.zustand === "vorschlag" && t.key).map((t) => t.key)), index);
    brief = renderBrief(fall, index);
  }
  console.log(`# ${v.titel} · ${v.status}\n`);
  console.log(briefText(brief));
  console.log(`\n--- vor der Übernahme: ${vorher.offen} offen · ${vorher.vorschlag} Vorschläge${f.uebernehmen ? `; danach: ${brief.offen} offen · ${brief.vorschlag} Vorschläge` : ""}`);
  console.log(`Sammelangabe: ${sammel.length === 0 ? "keine angeboten" : `${f.sammeln ? "ausgelöst" : "angeboten, nicht ausgelöst"}: ${sammel.join(" · ")}`}`);
  for (const a of brief.abschnitte) {
    const offen = a.tokens.filter((t) => t.zustand === "offen" && t.key).map((t) => `${t.t.trim()} [${t.key}]`);
    if (offen.length) console.log(`offen in ${a.titel}: ${offen.join(" · ")}`);
    if (a.seitenkonflikt) console.log(`Seitenwort in freiem Text widerspricht der Seite in ${a.titel}: „${a.seitenkonflikt}“`);
    if (!a.leer && !a.ausgeblendet) console.log(`${a.fertig ? "fertig     " : "nicht fertig"} ${a.titel}`);
  }
  for (const h of findeAbgleichhinweise(brief, ABGLEICHREGELN)) console.log(`Bitte abgleichen: ${h.text}`);
  if (grau.length) console.log(`\nVorschläge der Vorlage${f.uebernehmen ? " (übernommen)" : ""}:\n  ` + grau.join("\n  "));
  for (const a of brief.abschnitte) if (a.aus.length) console.log(`zuwählbar in ${a.titel}: ${a.aus.map((e) => `${e.label} [${e.key}]`).join(" · ")}`);
}

if (args[0] === "--felder" && args[1]) felder(args[1]);
else if (args[0]) spiele(args[0]);
else console.error("Aufruf: node tools/fall-spielen.mjs --felder <vorlagen-id> | <fall.json>");
