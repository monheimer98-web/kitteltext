// Tests für formatiertes Kopieren (E-61), strukturierte Medikation (E-62) und Unterpunkte (E-63). Eigene kleine
// Bausteine, damit die Tests nicht vom Wortlaut des Katalogs abhängen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIEFTYPEN } from "../src/data/katalog.ts";
import { briefText, indexiere, renderBrief } from "../src/engine/render.ts";
import type { KatalogIndex } from "../src/engine/render.ts";
import { ergaenzt, mitAuswahl, mitOption, mitSeite, mitSlot, mitVorlage, mitWert, neuerFall, uebernehmen } from "../src/engine/fall.ts";
import { fuerZwischenablage, unsichereZeichen } from "../src/engine/text.ts";
import type { KopierFormat } from "../src/engine/text.ts";
import { abschnittBloecke, abschnittHtml, auswahlHtml, briefHtml, gliedere, zeilenAusText } from "../src/engine/kopierformat.ts";
import { fehlendes, leereZeile, leseMedikation, medText, medZellen, schemaAusText, schemaWert, schreibeMedikation, zellenAusText } from "../src/engine/medikation.ts";
import type { MedEintrag, MedZeile } from "../src/engine/medikation.ts";
import type { AbschnittId, Baustein, Fall, Platzhalter, Segment, Vorlage } from "../src/model/types.ts";

function testIndex(bausteine: Baustein[], vorlagen: Vorlage[] = []): KatalogIndex {
  return indexiere({ version: 1, regionen: [{ id: "t", name: "T", kuerzel: "t", bausteine }], vorlagen, brieftypen: BRIEFTYPEN });
}
function baustein(id: string, abschnitt: AbschnittId, segmente: Segment[], platzhalter: Platzhalter[] = [], mehr: Partial<Baustein> = {}): Baustein {
  return { id, titel: id, typ: "diagnose", abschnitt, platzhalter, segmente, ...mehr };
}
function vorlage(id: string, abschnitte: Partial<Record<AbschnittId, string[]>>, setting: "zna" | "station" = "station"): Vorlage {
  return { id, titel: id, region: "t", setting, abschnitte, status: "entwurf" };
}

const DIAGNOSE = baustein("t-dx", "diagnose", [
  { art: "text", text: "Distale Radiusfraktur " },
  { art: "seite" },
  { art: "auswahl", id: "verschiebung", label: "Verschiebung", pflicht: true, optionen: [", nach dorsal verschoben", ", nicht verschoben"] },
  { art: "unterpunkt" },
  { art: "option", id: "ulna", label: "Abriss Processus styloideus ulnae", text: ", mit Abriss des Processus styloideus ulnae" },
  { art: "unterpunkt" },
  { art: "option", id: "ao", label: "AO-Klassifikation", text: " (AO {klasse})", slots: [{ art: "detail", id: "klasse", label: "AO", maxLen: 12, required: true }] },
  { art: "unterpunkt" },
  { art: "auswahl", id: "ereignis", label: "Ereignis", default: 0, optionen: ["", ", Sturz auf die ausgestreckte Hand"] },
]);
const NEBEN = baustein(
  "t-neben",
  "diagnose",
  [
    { art: "unterpunkt" },
    { art: "option", id: "osteoporose", label: "Osteoporose", text: "{was}", slots: [{ art: "auswahl", id: "was", label: "Osteoporose", required: true, optionen: ["", "Osteoporose, vorbekannt"] }] },
    { art: "unterpunkt" },
    { art: "platzhalter", ref: "neben" },
  ],
  [{ id: "neben", typ: "freitext", label: "Nebendiagnosen (eine je Zeile)" }],
  { ueberschrift: "Nebendiagnosen:" },
);
const MED = baustein(
  "t-med",
  "medikation",
  [
    { art: "option", id: "legende", label: "Legende", an: true, text: "Schema: morgens-mittags-abends-nachts. " },
    { art: "punkt" },
    { art: "option", id: "zeile", label: "Zeile Schmerzmittel", text: "{zeile} ", slots: [{ art: "detail", id: "zeile", label: "Schmerzmittel", maxLen: 240, required: true }] },
    { art: "punkt" },
    { art: "platzhalter", ref: "liste" },
    { art: "absatz" },
    { art: "text", text: "Arzneimittelunverträglichkeiten: keine bekannt." },
  ],
  [{ id: "liste", typ: "medikation", label: "Arzneimittel", required: true }],
);
const PROC = baustein(
  "t-proc",
  "procedere",
  [
    { art: "punkt" },
    { art: "text", text: "Kontrolle in der Hausarztpraxis." },
    { art: "punkt" },
    { art: "platzhalter", ref: "frei" },
  ],
  [{ id: "frei", typ: "freitext", label: "Weiteres" }],
);
const ANA = baustein("t-ana", "anamnese", [{ art: "platzhalter", ref: "text" }], [{ id: "text", typ: "freitext", label: "Anamnese", required: true }]);
const V = vorlage("t-v", { diagnose: ["t-dx", "t-neben"], anamnese: ["t-ana"], procedere: ["t-proc"], medikation: ["t-med"] });
const index = testIndex([DIAGNOSE, NEBEN, MED, PROC, ANA], [V]);
const neu = (): Fall => mitSeite(mitVorlage(neuerFall("station", index), V, index), "rechts");
const ab = (f: Fall, id: AbschnittId, listen: "striche" | "fliesstext" = "striche") => {
  const a = renderBrief(f, index, { listen }).abschnitte.find((x) => x.id === id);
  assert.ok(a);
  return a;
};
const KIS: KopierFormat = { zeilenende: "crlf", zeichen: "einfach" };
const ORIGINAL: KopierFormat = { zeilenende: "lf", zeichen: "original" };

function zeile(teil: Partial<MedZeile>): MedZeile {
  return { ...leereZeile(), ...teil };
}

// --- M-06: mehrzeiliger Freitext in einem Listenpunkt ------------------------------

test("M-06: jede Zeile eines mehrzeiligen Freitexts in einem Listenpunkt bekommt einen Spiegelstrich", () => {
  const f = mitWert(neu(), "t-proc/frei", "Sportpause 6 Wochen.\n\n  Physiotherapie verordnet.\nKrankengymnastik.");
  assert.equal(ab(f, "procedere").text, "- Kontrolle in der Hausarztpraxis.\n- Sportpause 6 Wochen.\n- Physiotherapie verordnet.\n- Krankengymnastik.");
});

test("M-06: als Fließtext bleiben die Zeilen, wie getippt; außerhalb einer Liste ebenso", () => {
  const f = mitWert(mitWert(neu(), "t-proc/frei", "Sportpause.\nPhysiotherapie."), "t-ana/text", "Sturz beim Gehen.\nKein Kopfanprall.");
  assert.equal(ab(f, "procedere", "fliesstext").text, "Kontrolle in der Hausarztpraxis. Sportpause.\nPhysiotherapie.");
  assert.equal(ab(f, "anamnese").text, "Sturz beim Gehen.\nKein Kopfanprall.");
});

// --- E-63: Unterpunkte und Überschrift ----------------------------------------------

function diagnoseFertig(): Fall {
  let f = neu();
  f = mitAuswahl(f, "t-dx/verschiebung", 0);
  f = mitOption(f, "t-dx/ulna", true);
  f = mitOption(f, "t-dx/ao", true);
  f = mitSlot(f, "t-dx/ao/klasse", "2R3A2");
  f = mitAuswahl(f, "t-dx/ereignis", 1);
  return f;
}

test("Unterpunkte: eingerückt mit Leerzeichen, ohne führendes Komma und ohne Klammern um den ganzen Punkt", () => {
  const a = ab(diagnoseFertig(), "diagnose");
  assert.equal(a.text, "Distale Radiusfraktur rechts, nach dorsal verschoben\n  - mit Abriss des Processus styloideus ulnae\n  - AO 2R3A2\n  - Sturz auf die ausgestreckte Hand");
  assert.ok(!a.text.includes("\t"), "kein Tabulator");
  // Die Stellen bleiben anklickbar.
  assert.ok(a.tokens.some((t) => t.key === "t-dx/ulna" && t.t === "mit Abriss des Processus styloideus ulnae"));
});

test("Unterpunkte: ein leerer Punkt hinterlässt nichts, auch bei „Fließtext“ bleiben Unterpunkte Zeilen", () => {
  let f = neu();
  f = mitAuswahl(f, "t-dx/verschiebung", 1);
  f = mitAuswahl(f, "t-dx/ereignis", 0);
  assert.equal(ab(f, "diagnose").text, "Distale Radiusfraktur rechts, nicht verschoben");
  f = mitOption(f, "t-dx/ulna", true);
  assert.equal(ab(f, "diagnose", "fliesstext").text, "Distale Radiusfraktur rechts, nicht verschoben\n  - mit Abriss des Processus styloideus ulnae");
});

test("Unterpunkte: Klammern nur weg, wenn sie den ganzen Punkt umschließen", () => {
  const B = baustein("t-k", "diagnose", [{ art: "text", text: "Fraktur" }, { art: "unterpunkt" }, { art: "text", text: " (Typ A) und (Typ B)" }]);
  const i = testIndex([B], [vorlage("t-vk", { diagnose: ["t-k"] })]);
  const f = mitVorlage(neuerFall("station", i), i.vorlagen.get("t-vk")!, i);
  assert.equal(renderBrief(f, i).abschnitte.find((a) => a.id === "diagnose")!.text, "Fraktur\n  - (Typ A) und (Typ B)");
});

test("Überschrift eines Bausteins: nur mit Text; Nebendiagnosen als eingerückte Liste, je Zeile ein Punkt", () => {
  let f = diagnoseFertig();
  assert.ok(!ab(f, "diagnose").text.includes("Nebendiagnosen"));
  f = mitWert(f, "t-neben/neben", "Arterielle Hypertonie\nDiabetes mellitus Typ 2");
  f = mitOption(f, "t-neben/osteoporose", true);
  f = mitSlot(f, "t-neben/osteoporose/was", 1);
  const a = ab(f, "diagnose");
  assert.equal(
    a.text,
    "Distale Radiusfraktur rechts, nach dorsal verschoben\n  - mit Abriss des Processus styloideus ulnae\n  - AO 2R3A2\n  - Sturz auf die ausgestreckte Hand\nNebendiagnosen:\n  - Osteoporose, vorbekannt\n  - Arterielle Hypertonie\n  - Diabetes mellitus Typ 2",
  );
  assert.ok(a.tokens.some((t) => t.art === "titel" && t.t === "Nebendiagnosen:"));
  // Reiner Text fürs KIS: Windows-Zeilenenden, Einzug bleibt.
  assert.match(fuerZwischenablage(a.text, KIS), /\r\n {2}- Osteoporose, vorbekannt\r\n {2}- Arterielle Hypertonie/);
});

// --- E-62: Medikation ---------------------------------------------------------------

test("Medikation: speichern und lesen ergibt dieselben Einträge; Tabulatoren und Umbrüche aus Eingaben entfallen", () => {
  const e: MedEintrag[] = [
    zeile({ wirkstoff: "Ibuprofen", staerke: "600 mg Tablette", schema: ["1", "0", "1", "0"], hinweis: "für 7 Tage", status: "NEU" }),
    { art: "frei", text: "Vorbestehende Dauermedikation unverändert, siehe Medikationsplan." },
    zeile({ wirkstoff: "Pan\ttoprazol", staerke: "20 mg\nTablette" }),
  ];
  const wert = schreibeMedikation(e);
  const zurueck = leseMedikation(wert);
  assert.equal(zurueck.length, 3);
  assert.deepEqual(zurueck[0], e[0]);
  assert.deepEqual(zurueck[1], e[1]);
  assert.equal((zurueck[2] as MedZeile).wirkstoff, "Pan toprazol");
  assert.equal((zurueck[2] as MedZeile).staerke, "20 mg Tablette");
  // Getippter Freitext aus älteren Fällen: jede Zeile ein freier Eintrag.
  assert.deepEqual(leseMedikation("Ramipril 5 mg, 1-0-0-0.\nKeine weiteren."), [
    { art: "frei", text: "Ramipril 5 mg, 1-0-0-0." },
    { art: "frei", text: "Keine weiteren." },
  ]);
});

test("Medikation: Zeile im Wortlaut der Stilrichtlinie; ½ aus 1/2; leeres Schema entfällt", () => {
  assert.deepEqual(medText(zeile({ wirkstoff: "Ibuprofen", staerke: "600 mg Tablette", schema: ["1", "0", "1", "0"], hinweis: "für 7 Tage", status: "NEU" })), {
    text: "Ibuprofen 600 mg Tablette, 1-0-1-0, für 7 Tage. NEU.",
    offen: false,
  });
  assert.equal(medText(zeile({ wirkstoff: "Ramipril", staerke: "5 mg", schema: ["1/2", "0", "1 1/2", "0"], status: "UNVERÄNDERT" })).text, "Ramipril 5 mg, ½-0-1½-0. UNVERÄNDERT.");
  assert.equal(medText(zeile({ wirkstoff: "Metamizol", staerke: "500 mg Tablette", hinweis: "bei Bedarf, höchstens 4-mal täglich." })).text, "Metamizol 500 mg Tablette, bei Bedarf, höchstens 4-mal täglich.");
  assert.equal(schemaWert(" 3/4 "), "¾");
  assert.equal(schemaWert("0,5"), "0,5");
});

test("Medikation: ohne Wirkstoff oder mit teilweise leerem Schema ist die Zeile eine Lücke, nichts wird mit 0 aufgefüllt", () => {
  const teil = zeile({ wirkstoff: "Ibuprofen", schema: ["1", "", "1", ""] });
  assert.deepEqual(medText(teil), { text: "Ibuprofen, 1-‹?›-1-‹?›.", offen: true });
  assert.deepEqual(fehlendes(teil), ["Schema mittags, nachts"]);
  assert.deepEqual(medText(zeile({ staerke: "40 mg" })), { text: "‹Wirkstoff› 40 mg.", offen: true });
  assert.deepEqual(medZellen(teil), ["Ibuprofen", "", "1-‹?›-1-‹?›", ""]);
});

test("Medikation im Brief: jeder Eintrag ein Punkt mit Spiegelstrich, strukturierte tragen Zellen; Lücken sperren", () => {
  let f = neu();
  assert.equal(ab(f, "medikation").offen > 0, true, "leeres Pflichtfeld ist eine Lücke");
  f = mitWert(
    f,
    "t-med/liste",
    schreibeMedikation([
      zeile({ wirkstoff: "Ibuprofen", staerke: "600 mg Tablette", schema: ["1", "0", "1", "0"], hinweis: "für 7 Tage", status: "NEU" }),
      leereZeile(),
      { art: "frei", text: "Ramipril 5 mg Tablette, 1-0-0-0. UNVERÄNDERT." },
    ]),
  );
  f = uebernehmen(f, ["t-med/legende"], index);
  const a = ab(f, "medikation");
  assert.equal(a.text, "Schema: morgens-mittags-abends-nachts.\n- Ibuprofen 600 mg Tablette, 1-0-1-0, für 7 Tage. NEU.\n- Ramipril 5 mg Tablette, 1-0-0-0. UNVERÄNDERT.\n\nArzneimittelunverträglichkeiten: keine bekannt.");
  assert.equal(a.fertig, true);
  const ibu = a.tokens.find((t) => t.t.startsWith("Ibuprofen"));
  assert.deepEqual(ibu?.zellen, ["Ibuprofen", "600 mg Tablette", "1-0-1-0", "für 7 Tage. NEU"]);
  assert.equal(ibu?.key, "t-med/liste");
  // Unvollständige Zeile: Abschnitt nicht fertig.
  const halb = mitWert(f, "t-med/liste", schreibeMedikation([zeile({ wirkstoff: "Ibuprofen", schema: ["1", "", "", ""] })]));
  assert.equal(ab(halb, "medikation").fertig, false);
  assert.equal(ab(halb, "medikation").offen, 1);
  // Nur leere Zeilen: wie ein leeres Feld.
  assert.equal(ab(mitWert(f, "t-med/liste", schreibeMedikation([leereZeile()])), "medikation").offen, 1);
});

test("Medikation: Text vor dem vierstelligen Schema wird für die Tabelle geteilt, sonst bleibt die Zeile ganz", () => {
  assert.deepEqual(zellenAusText("Enoxaparin 40 mg Fertigspritze, subkutan, 1-0-0-0, Dauer siehe Procedere. NEU: Thromboseprophylaxe."), {
    wirkstoff: "Enoxaparin",
    staerke: "40 mg Fertigspritze, subkutan",
    schema: ["1", "0", "0", "0"],
    hinweis: "Dauer siehe Procedere. NEU: Thromboseprophylaxe.",
  });
  assert.equal(zellenAusText("Vitamin D3 1000 IE Tablette, 1-0-0-0.")?.wirkstoff, "Vitamin D3");
  assert.deepEqual(zellenAusText("Enoxaparin Fertigspritze, ½-0-½-0")?.staerke, null);
  assert.equal(zellenAusText("Novaminsulfon 20 Tropfen bei Bedarf"), null);
  assert.equal(zellenAusText("Schema 1-0-1"), null, "drei Stellen sind kein Schema");
  assert.equal(zellenAusText("Gabe 1-0-1-0-1"), null, "fünf Stellen auch nicht");
  assert.equal(zellenAusText("1-0-1-0"), null, "ohne Wirkstoff davor nichts zu teilen");
});

// --- E-61: formatierte Fassung --------------------------------------------------------

test("Gliederung: Absätze, Listen mit Unterpunkten, eingerückte Liste ohne Oberpunkt, Leerzeilen", () => {
  const b = gliedere(zeilenAusText("Absatz eins.\n\n- Punkt A\n  - Unterpunkt A1\n- Punkt B\nNebendiagnosen:\n  - Hypertonie\n\n\n"));
  assert.deepEqual(b, [
    { art: "zeile", text: "Absatz eins." },
    { art: "leer" },
    { art: "liste", tiefe: 1, punkte: [{ text: "Punkt A", unter: ["Unterpunkt A1"] }, { text: "Punkt B", unter: [] }] },
    { art: "zeile", text: "Nebendiagnosen:" },
    { art: "liste", tiefe: 2, punkte: [{ text: "Hypertonie", unter: [] }] },
  ]);
});

test("HTML: Diagnosen mit Unterpunkten und Nebendiagnosen, Fließtext im Blocksatz, ohne Schrift und Farbe", () => {
  let f = diagnoseFertig();
  f = mitWert(f, "t-neben/neben", "Arterielle Hypertonie");
  f = mitWert(f, "t-ana/text", "Die Patientin sei auf die rechte Hand gestürzt.");
  const html = abschnittHtml(ab(f, "diagnose"), ORIGINAL);
  assert.equal(
    html,
    '<meta charset="utf-8">' +
      '<p style="margin:0;text-align:justify">Distale Radiusfraktur rechts, nach dorsal verschoben</p>' +
      '<ul style="margin:0;padding-left:2em"><li style="margin:0">mit Abriss des Processus styloideus ulnae</li><li style="margin:0">AO 2R3A2</li><li style="margin:0">Sturz auf die ausgestreckte Hand</li></ul>' +
      '<p style="margin:0"><b>Nebendiagnosen:</b></p>' +
      '<ul style="margin:0;padding-left:2em"><li style="margin:0">Arterielle Hypertonie</li></ul>',
  );
  assert.match(abschnittHtml(ab(f, "anamnese"), ORIGINAL), /<p style="margin:0;text-align:justify">Die Patientin sei auf die rechte Hand gestürzt\.<\/p>/);
  assert.doesNotMatch(html, /font|color|<img|<a |<script|class=/i);
});

test("HTML: Procedere als echte Liste, Medikation als Tabelle mit vier Spalten, Schema in einer Zelle (CR-R5-02)", () => {
  let f = neu();
  f = mitWert(f, "t-proc/frei", "Sportpause 6 Wochen.");
  f = mitOption(f, "t-med/zeile", true);
  f = mitSlot(f, "t-med/zeile/zeile", "Metamizol 500 mg Tablette, 1-1-1-1, für 5 Tage. NEU.");
  f = mitWert(
    f,
    "t-med/liste",
    schreibeMedikation([zeile({ wirkstoff: "Ibuprofen", staerke: "600 mg Tablette", schema: ["1", "0", "½", "0"], hinweis: "für 7 Tage", status: "NEU" }), { art: "frei", text: "Keine weiteren Arzneimittel." }]),
  );
  f = uebernehmen(f, ["t-med/legende"], index);
  assert.equal(
    abschnittHtml(ab(f, "procedere"), ORIGINAL),
    '<meta charset="utf-8"><ul style="margin:0;padding-left:2em"><li style="margin:0">Kontrolle in der Hausarztpraxis.</li><li style="margin:0">Sportpause 6 Wochen.</li></ul>',
  );
  const med = abschnittBloecke(ab(f, "medikation"));
  assert.deepEqual(
    med.map((b) => b.art),
    ["zeile", "tabelle", "leer", "zeile"],
  );
  const tab = med[1];
  assert.ok(tab.art === "tabelle");
  assert.deepEqual(tab.kopf, ["Wirkstoff", "Stärke/Form", "Schema", "Hinweis"]);
  assert.deepEqual(
    tab.zeilen.map((r) => r.map((z) => z.text)),
    [
      ["Metamizol", "500 mg Tablette", "1-1-1-1", "für 5 Tage. NEU."],
      ["Ibuprofen", "600 mg Tablette", "1-0-½-0", "für 7 Tage. NEU"],
      ["Keine weiteren Arzneimittel."],
    ],
  );
  assert.equal(tab.zeilen[2][0].spalten, 4);
  // CR-R5-02: Das Schema steht in einer Zelle wie im Text; eingeebnet zerfällt es nicht in „1 0 ½ 0“.
  assert.deepEqual(tab.zeilen.slice(0, 2).map((r) => r.map((z) => !!z.mitte)), [[false, false, true, false], [false, false, true, false]]);
  const html = abschnittHtml(ab(f, "medikation"), KIS);
  assert.match(html, /<table style="border-collapse:collapse;margin:0"><thead><tr><th style="[^"]*font-weight:bold">Wirkstoff<\/th>/);
  assert.match(html, /<td style="border:1px solid;padding:1px 6px;text-align:center;vertical-align:top">1-0-½-0<\/td>/);
  assert.match(html, /<td colspan="4" [^>]*>Keine weiteren Arzneimittel\.<\/td>/);
  assert.equal((html.match(/<th /g) ?? []).length, 4);
});

test("HTML: Eingaben werden maskiert, nie zu Tags", () => {
  let f = neu();
  f = mitWert(f, "t-ana/text", `<script>alert(1)</script> & "Zitat" <b>fett</b>`);
  const html = abschnittHtml(ab(f, "anamnese"), ORIGINAL);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<b>fett"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;Zitat&quot; &lt;b&gt;fett&lt;\/b&gt;/);
  assert.equal(auswahlHtml("<img src=x onerror=alert(1)>", ORIGINAL), '<meta charset="utf-8"><p style="margin:0;text-align:justify">&lt;img src=x onerror=alert(1)&gt;</p>');
});

test("KIS-sicher: Sonderzeichen außerhalb ISO 8859-1 werden in Text und HTML gleich umgeschrieben", () => {
  let f = neu();
  f = mitWert(f, "t-ana/text", "Schmerz ≥ 6/10 – „stechend“ → Ruhe; Wert ≈ 3 μg … ✓");
  const a = ab(f, "anamnese");
  const text = fuerZwischenablage(a.text, KIS);
  assert.equal(text, 'Schmerz >= 6/10 - "stechend" -> Ruhe; Wert ca. 3 µg ... ✓');
  const html = abschnittHtml(a, KIS);
  assert.match(html, /Schmerz &gt;= 6\/10 - &quot;stechend&quot; -&gt; Ruhe; Wert ca\. 3 µg \.\.\. ✓/);
  // Was auch nach der Umschrift unsicher bleibt, nennt die Kopiermeldung.
  assert.deepEqual(unsichereZeichen(a.text), ["✓"]);
  // Original lässt die Zeichen stehen.
  assert.match(abschnittHtml(a, ORIGINAL), /≥ 6\/10 – „stechend“ → Ruhe/);
});

test("Ganzer Brief: fette Überschriften und Leerzeilen wie im reinen Text, ohne Überschriften auch ohne Titel", () => {
  let f = diagnoseFertig();
  f = mitWert(f, "t-ana/text", "Sturz beim Gehen.");
  const b = renderBrief(f, index);
  const teile = b.abschnitte.filter((a) => a.id === "diagnose" || a.id === "anamnese");
  const html = briefHtml(teile, ORIGINAL, true);
  assert.match(html, /^<meta charset="utf-8"><p style="margin:0"><b>Diagnosen:<\/b><\/p><p style="margin:0;text-align:justify">Distale Radiusfraktur/);
  assert.match(html, /<\/ul><p style="margin:0"><br><\/p><p style="margin:0"><b>Anamnese:<\/b><\/p><p style="margin:0;text-align:justify">Sturz beim Gehen\.<\/p>$/);
  assert.doesNotMatch(briefHtml(teile, ORIGINAL, false), /<b>/);
  // Der reine Text des Briefs bleibt, wie er war.
  assert.match(briefText({ ...b, abschnitte: teile }), /^Diagnosen:\nDistale Radiusfraktur rechts, nach dorsal verschoben\n {2}- mit Abriss/);
});

test("Medikation: eingefügtes Schema wird in Einnahmezeiten geteilt, anderer Text nicht", () => {
  assert.deepEqual(schemaAusText("1-0-1-0"), ["1", "0", "1", "0"]);
  assert.deepEqual(schemaAusText(" ½ - 0 - ½ "), ["½", "0", "½"]);
  assert.deepEqual(schemaAusText("1 1/2-0-0-0"), ["1 1/2", "0", "0", "0"]);
  assert.deepEqual(schemaAusText("0,5-0-0,5-0"), ["0,5", "0", "0,5", "0"]);
  for (const t of ["1", "1-0-1-0-1", "Ibuprofen 600 mg, 1-0-1-0", "bei Bedarf", "1--0", ""]) assert.equal(schemaAusText(t), null, t);
});

test("PS-R5-2: Wirkstoff ohne Schema und ohne Hinweis ist eine Lücke „‹Schema oder Hinweis›“; Bedarf, abgesetzt und pausiert nicht", () => {
  const nur = zeile({ wirkstoff: "Ibuprofen", staerke: "600 mg" });
  assert.deepEqual(medText(nur), { text: "Ibuprofen 600 mg, ‹Schema oder Hinweis›.", offen: true });
  assert.deepEqual(fehlendes(nur), ["Schema oder Hinweis"]);
  assert.deepEqual(medZellen(nur), ["Ibuprofen", "600 mg", "‹Schema oder Hinweis›", ""]);
  assert.deepEqual(medZellen(zeile({ wirkstoff: "Ibuprofen", status: "NEU" })), ["Ibuprofen", "", "‹Schema oder Hinweis›", "NEU"]);
  assert.equal(medText(zeile({ wirkstoff: "Ibuprofen", staerke: "600 mg", hinweis: "bei Bedarf" })).offen, false);
  assert.equal(medText(zeile({ wirkstoff: "Ibuprofen", staerke: "600 mg", schema: ["1", "0", "1", "0"] })).offen, false);
  assert.deepEqual(medText(zeile({ wirkstoff: "Diclofenac", staerke: "75 mg", status: "ABGESETZT" })), { text: "Diclofenac 75 mg. ABGESETZT.", offen: false });
  assert.equal(medText(zeile({ wirkstoff: "Apixaban", staerke: "5 mg", status: "PAUSIERT" })).offen, false);
  // Im Brief: Die Zeile hält das Kopieren auf.
  let f = mitWert(neu(), "t-med/liste", schreibeMedikation([nur]));
  f = uebernehmen(f, ["t-med/legende"], index);
  const a = ab(f, "medikation");
  assert.equal(a.fertig, false);
  assert.match(a.text, /- Ibuprofen 600 mg, ‹Schema oder Hinweis›\./);
});

test("CR-R5-03: Aus Format 1 werden Tabulatoren in der Medikation Leerzeichen; die alte Zeile bleibt frei, wie getippt", () => {
  const ALT = "Ramipril\tDelix\t5 mg\tTbl\t1\t0\t1\t0\tStk\tmorgens nüchtern\nIbuprofen 400 mg bei Bedarf";
  let f = mitWert(neu(), "t-med/liste", ALT);
  f = mitWert(f, "t-proc/frei", "Sport\tpause");
  f = uebernehmen(f, ["t-med/legende"], index);
  const roh = () => JSON.parse(JSON.stringify(f));
  const alt = ergaenzt(roh(), index, 1)!;
  assert.equal(alt.werte["t-med/liste"], "Ramipril Delix 5 mg Tbl 1 0 1 0 Stk morgens nüchtern\nIbuprofen 400 mg bei Bedarf");
  assert.equal(alt.werte["t-proc/frei"], "Sport\tpause", "nur Werte vom Typ medikation");
  assert.deepEqual(leseMedikation(alt.werte["t-med/liste"]).map((e) => e.art), ["frei", "frei"]);
  assert.match(ab(alt, "medikation").text, /\n- Ramipril Delix 5 mg Tbl 1 0 1 0 Stk morgens nüchtern\n- Ibuprofen 400 mg bei Bedarf\n/);
  // Ab Format 2 ist der Tabulator die Feldgrenze der strukturierten Zeile und bleibt.
  assert.equal(ergaenzt(roh(), index, 2)!.werte["t-med/liste"], ALT);
  assert.equal(ergaenzt(roh(), index)!.werte["t-med/liste"], ALT);
  // Vorher: still verschobene Felder, schwarz („Ramipril Delix, 5 mg-Tbl-1-0, 1. 0.“).
  assert.equal(leseMedikation(ALT)[0].art, "zeile");
});
