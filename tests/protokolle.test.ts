// Standardprotokolle der Nachbehandlung (E-49, E-52): Baustein aus den Daten, Übernehmen, Entfernen, Wechsel der Variante,
// ersetzte Sätze, Felder, eigener Wortlaut, eigene Vorlage. Erst gegen einen kleinen Testkatalog, dann gegen jedes
// Protokoll des echten Katalogs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIEFTYPEN, KATALOG } from "../src/data/katalog.ts";
import { ergaenzt, mitEigenemText, mitOption, mitPerson, mitSeite, mitSlot, mitVorlage, neuerFall, sicherZuruecknehmen, uebernehmen } from "../src/engine/fall.ts";
import { indexiere, renderBrief } from "../src/engine/render.ts";
import type { AbschnittAnsicht, KatalogIndex } from "../src/engine/render.ts";
import {
  PROTOKOLL_PRAEFIX,
  ersetzteStellen,
  ersteProtokollLuecke,
  mitProtokoll,
  mitZusatzzeile,
  offeneFelder,
  ohneProtokoll,
  protokollBaustein,
  protokollFehler,
  protokollImFall,
  protokolleFuer,
  titelOhnePraefix,
  verdraengteStellen,
  vorschauZeile,
  zeilenName,
} from "../src/engine/protokoll.ts";
import type { Baustein, Fall, Protokoll, Seite, Vorlage } from "../src/model/types.ts";

// --- Testkatalog ----------------------------------------------------------------

const BELASTUNG: Baustein = {
  id: "t-belastung",
  titel: "Belastung",
  typ: "procedere",
  platzhalter: [],
  segmente: [
    { art: "punkt" },
    { art: "option", id: "bein", label: "Belastung Bein", an: true, text: "{stufe} des Beins {seite}.", slots: [{ art: "auswahl", id: "stufe", label: "Belastung", required: true, optionen: ["", "Vollbelastung", "Teilbelastung mit 20 kg"] }] },
    { art: "punkt" },
    { art: "text", text: "Kniegelenk " },
    { art: "seite" },
    { art: "text", text: ": " },
    { art: "auswahl", id: "schema", label: "Nachbehandlung", pflicht: true, optionen: ["nach Maßgabe des Operateurs.", "nach den folgenden Punkten."] },
    { art: "punkt" },
    { art: "option", id: "kuehlen", label: "Kühlen", an: true, text: "Kühlen und hochlagern." },
    { art: "punkt" },
    { art: "option", id: "sport", label: "Sport", text: "Sportpause." },
  ],
};
const WARNZEICHEN: Baustein = { id: "t-warn", titel: "Warnzeichen", typ: "procedere", platzhalter: [], segmente: [{ art: "punkt" }, { art: "option", id: "netz", label: "Warnzeichen", an: true, text: "Sofortige Wiedervorstellung bei Fieber." }] };

const P1: Protokoll = {
  id: "proc-st-protokoll-test-1",
  nr: 1,
  vorlage: "station-test",
  variante: "Teilbelastung",
  titel: "Standardprotokoll: Testoperation: Teilbelastung 20 kg für 6 Wochen",
  zeilen: [
    "1. bis 6. Woche nach der Operation: Teilbelastung des Beins {seite} mit 20 kg {gehhilfe}.",
    "Klinische Kontrolle des Kniegelenks {seite} 6 Wochen nach der Operation {wo}.",
    "Abweichungen nach Maßgabe des Operateurs.",
  ],
  zusatz: ["Sport frühestens ab dem 4. Monat nach der Operation.", "Voraussichtliche Arbeitsfähigkeit: leichte Tätigkeit 6 Wochen nach der Operation."],
  felder: {
    wo: { label: "Ort der Kontrolle", optionen: ["in der unfallchirurgischen oder orthopädischen Praxis", "in unserer Sprechstunde nach Terminvereinbarung"], vorwahl: "in der unfallchirurgischen oder orthopädischen Praxis" },
    gehhilfe: { label: "Gehhilfe", optionen: ["an Unterarmgehstützen", "am Rollator", "am Gehwagen"], pflicht: true },
  },
  ersetzt: ["t-belastung/bein", "t-belastung/schema"],
  ohneLeitlinie: false,
  vermerk: null,
  pruefstatus: "freigegeben",
  quelle: "nach deutschem Fachwissen, Stand 2026, ärztlich freigegeben 08.11.2026",
};
const P2: Protokoll = {
  ...P1,
  id: "proc-st-protokoll-test-2",
  nr: 2,
  variante: "Vollbelastung",
  titel: "Standardprotokoll: Testoperation (ohne Leitlinie, Hausschema empfohlen): Vollbelastung",
  zeilen: ["Vollbelastung des Beins {seite} {gehhilfe}.", "Röntgenkontrolle 6 Wochen nach der Operation {wo}."],
  zusatz: ["Sport frühestens ab dem 4. Monat nach der Operation."],
  ersetzt: ["t-belastung/bein", "t-belastung/kuehlen"],
  ohneLeitlinie: true,
  vermerk: "ohne Leitlinie, Hausschema empfohlen",
};
const VORLAGE: Vorlage = { id: "station-test", titel: "Test", region: "t", setting: "station", abschnitte: { procedere: ["t-belastung", "t-warn"] }, status: "entwurf" };

function testIndex(protokolle: Protokoll[] = [P1, P2], vorlagen: Vorlage[] = [VORLAGE]): KatalogIndex {
  return indexiere({ version: 1, regionen: [{ id: "t", name: "T", kuerzel: "t", bausteine: [BELASTUNG, WARNZEICHEN] }], vorlagen, brieftypen: BRIEFTYPEN, protokolle });
}

function fallMit(index: KatalogIndex, seite: Seite | null = "rechts", v: Vorlage = VORLAGE): Fall {
  const f = mitVorlage(neuerFall("station", index), v, index);
  return seite ? mitSeite(f, seite) : f;
}

function procedere(f: Fall, index: KatalogIndex): AbschnittAnsicht {
  const a = renderBrief(f, index).abschnitte.find((x) => x.id === "procedere");
  assert.ok(a);
  return a;
}

const idx = testIndex();

// --- Baustein aus den Daten ---------------------------------------------------------

test("Protokoll als Baustein: je Zeile ein Satz, an; je Zusatzzeile ein Satz, aus; Felder als Auswahl im Satz", () => {
  const b = protokollBaustein(P1);
  assert.equal(b.id, P1.id);
  assert.equal(b.status, "geprueft");
  assert.equal(b.abschnitt, "procedere");
  const saetze = b.segmente.filter((s) => s.art === "option");
  assert.deepEqual(
    saetze.map((s) => [s.id, s.an]),
    [
      ["z1", true],
      ["z2", true],
      ["z3", true],
      ["x1", false],
      ["x2", false],
    ],
  );
  assert.equal(b.segmente.filter((s) => s.art === "punkt").length, 5);
  const z1 = saetze[0];
  // Ohne Vorwahl: leere Option vorn, Pflicht. Mit Vorwahl: der Index der Vorwahl, keine leere Option.
  assert.deepEqual(z1.slots, [{ art: "auswahl", id: "gehhilfe", label: "Gehhilfe", optionen: ["", "an Unterarmgehstützen", "am Rollator", "am Gehwagen"], required: true }]);
  assert.deepEqual(saetze[1].slots, [{ art: "auswahl", id: "wo", label: "Ort der Kontrolle", optionen: P1.felder.wo.optionen, default: 0, required: true }]);
  assert.equal(saetze[2].slots, undefined);
  assert.equal(z1.label, "Protokoll: 1. bis 6. Woche nach der Operation");
  assert.equal(saetze[4].label, "Protokoll: Voraussichtliche Arbeitsfähigkeit");
  assert.equal(protokollBaustein({ ...P1, pruefstatus: "entwurf" }).status, "entwurf");
});

test("Kurzname, Titel ohne Präfix, offene Felder", () => {
  assert.equal(zeilenName("Klinische Kontrolle des Kniegelenks {seite} 6 Wochen nach der Operation {wo}."), "Klinische Kontrolle des Kniegelenks 6 …");
  assert.equal(zeilenName("Keine Beckenorthese."), "Keine Beckenorthese");
  assert.equal(titelOhnePraefix(P1), "Testoperation: Teilbelastung 20 kg für 6 Wochen");
  assert.deepEqual(offeneFelder(P1), ["Gehhilfe"]);
});

test("Protokollbausteine stehen im Index, aber in keiner Region (nicht unter „+ Baustein“)", () => {
  assert.ok(idx.bausteine.has(P1.id));
  assert.equal(idx.protokolle.get(P1.id), P1);
  assert.ok(!idx.katalog.regionen.some((r) => r.bausteine.some((b) => b.id === P1.id)));
});

// --- Übernehmen ---------------------------------------------------------------------

test("Übernehmen: Zeilen schwarz zuoberst im Procedere, Vorwahl gesetzt, Gehhilfe als Lücke, ersetzte Stellen treten zurück", () => {
  const vorher = fallMit(idx);
  const f = mitProtokoll(vorher, P1.id, idx);
  assert.deepEqual(f.bausteine.procedere, [P1.id, "t-belastung", "t-warn"]);
  const a = procedere(f, idx);
  assert.equal(
    a.text,
    [
      "- 1. bis 6. Woche nach der Operation: Teilbelastung des Beins rechts mit 20 kg ‹Protokoll: 1. bis 6. Woche nach der Operation: Gehhilfe›.",
      "- Klinische Kontrolle des Kniegelenks rechts 6 Wochen nach der Operation in der unfallchirurgischen oder orthopädischen Praxis.",
      "- Abweichungen nach Maßgabe des Operateurs.",
      "- Kühlen und hochlagern.",
      "- Sofortige Wiedervorstellung bei Fieber.",
    ].join("\n"),
  );
  const zeilen = a.tokens.filter((t) => t.bausteinId === P1.id && t.key);
  assert.deepEqual(
    zeilen.map((t) => t.zustand),
    ["offen", "gesetzt", "gesetzt"],
  );
  assert.equal(f.slots[`${P1.id}/z2/wo`], "0");
  assert.equal(f.slots[`${P1.id}/z1/gehhilfe`], undefined);
  // Ersetzt: weder im Brief noch unter „+ …“; der Listenpunkt mit der Auswahl tritt ganz zurück, samt Kopf und Seite.
  assert.ok(!a.tokens.some((t) => t.key === "t-belastung/bein" || t.key === "t-belastung/schema"));
  assert.ok(!a.aus.some((e) => e.key === "t-belastung/bein"));
  assert.ok(!a.text.includes("Kniegelenk rechts:"));
  // Zusatzzeilen sind zuwählbar.
  assert.deepEqual(
    a.aus.filter((e) => e.bausteinId === P1.id).map((e) => e.key),
    [`${P1.id}/x1`, `${P1.id}/x2`],
  );
  // Gehhilfe gewählt: nichts mehr offen im Protokoll, der Abschnitt ist fertig (Kühlen und Warnzeichen grau übernommen).
  const fertig = uebernehmen(mitSlot(f, `${P1.id}/z1/gehhilfe`, "2"), ["t-belastung/kuehlen", "t-warn/netz"], idx);
  const b = procedere(fertig, idx);
  assert.ok(b.text.startsWith("- 1. bis 6. Woche nach der Operation: Teilbelastung des Beins rechts mit 20 kg am Rollator."));
  assert.equal(b.offen, 0);
  assert.equal(b.vorschlag, 0);
  assert.ok(b.fertig);
});

test("Übernehmen mit Zusatzzeilen; Zusatzzeile einzeln zu- und abwählen", () => {
  const f = mitProtokoll(fallMit(idx), P1.id, idx, [1]);
  assert.equal(f.optionen[`${P1.id}/x2`], true);
  assert.equal(f.optionen[`${P1.id}/x1`], undefined);
  assert.ok(procedere(f, idx).text.includes("- Voraussichtliche Arbeitsfähigkeit: leichte Tätigkeit 6 Wochen nach der Operation."));
  const g = mitZusatzzeile(f, P1.id, 0, true);
  assert.ok(procedere(g, idx).text.includes("- Sport frühestens ab dem 4. Monat nach der Operation."));
  const h = mitZusatzzeile(g, P1.id, 0, false);
  assert.ok(!procedere(h, idx).text.includes("Sport frühestens"));
  // Ohne Protokoll im Fall ändert eine Zusatzzeile nichts.
  const ohne = fallMit(idx);
  assert.equal(mitZusatzzeile(ohne, P1.id, 0, true), ohne);
});

test("Seite: links, beidseits, ohne Seite und fehlende Seite", () => {
  const text = (s: Seite | null) => procedere(mitProtokoll(fallMit(idx, s), P1.id, idx), idx).text;
  assert.ok(text("links").includes("Teilbelastung des Beins links mit 20 kg"));
  assert.ok(text("links").includes("Kniegelenks links 6 Wochen"));
  assert.ok(text("beidseits").includes("des Beins beidseits mit"));
  assert.ok(text("ohne").includes("Teilbelastung des Beins mit 20 kg"));
  assert.ok(!/ {2}| \./.test(text("ohne")));
  const ohneSeite = mitProtokoll(fallMit(idx, null), P1.id, idx);
  const brief = renderBrief(ohneSeite, idx);
  assert.ok(brief.seiteFehlt && brief.brauchtSeite);
  // Die Seite eines einzelnen Bausteins gilt auch für das Protokoll.
  const abweichend = mitSeite(mitProtokoll(fallMit(idx), P1.id, idx), "links", P1.id);
  assert.ok(procedere(abweichend, idx).text.includes("des Beins links mit 20 kg"));
});

test("Entfernen: Protokoll und seine Eingaben gehen, die ersetzten Sätze stehen wieder genau wie vorher da, auch eigene Wahl", () => {
  // Vorher hat der Arzt den Belastungssatz selbst ausgefüllt.
  const vorher = mitSlot(mitOption(fallMit(idx), "t-belastung/bein", true), "t-belastung/bein/stufe", "1");
  const textVorher = procedere(vorher, idx).text;
  assert.ok(textVorher.startsWith("- Vollbelastung des Beins rechts."));
  const mit = mitEigenemText(mitSlot(mitProtokoll(vorher, P1.id, idx), `${P1.id}/z1/gehhilfe`, "1"), `${P1.id}/z3`, "Abweichungen nach Rücksprache.");
  assert.ok(!procedere(mit, idx).text.includes("Vollbelastung des Beins"));
  const danach = ohneProtokoll(mit, P1.id);
  assert.equal(procedere(danach, idx).text, textVorher);
  assert.deepEqual(danach.slots, vorher.slots);
  assert.deepEqual(danach.optionen, vorher.optionen);
  assert.deepEqual(danach.eigen, {});
  assert.ok(!Object.values(danach.bausteine).flat().includes(P1.id));
  // Nichts zu entfernen: derselbe Fall.
  assert.equal(ohneProtokoll(vorher, P1.id), vorher);
  // Zweimal dasselbe übernehmen ändert nichts.
  const einmal = mitProtokoll(vorher, P1.id, idx);
  assert.equal(mitProtokoll(einmal, P1.id, idx), einmal);
});

test("Wechsel der Variante in einem Schritt: ein Protokoll im Fall, gewählte Felder und gleichlautende Zusatzzeilen gehen mit", () => {
  let f = mitProtokoll(fallMit(idx), P1.id, idx, [0, 1]);
  f = mitSlot(f, `${P1.id}/z1/gehhilfe`, "3");
  f = mitSlot(f, `${P1.id}/z2/wo`, "1");
  const g = mitProtokoll(f, P2.id, idx);
  assert.deepEqual(g.bausteine.procedere, [P2.id, "t-belastung", "t-warn"]);
  assert.equal(protokollImFall(g, idx)?.id, P2.id);
  assert.ok(!Object.keys(g.optionen).some((k) => k.startsWith(`${P1.id}/`)));
  assert.ok(!Object.keys(g.slots).some((k) => k.startsWith(`${P1.id}/`)));
  const a = procedere(g, idx);
  assert.ok(a.text.startsWith("- Vollbelastung des Beins rechts am Gehwagen.\n- Röntgenkontrolle 6 Wochen nach der Operation in unserer Sprechstunde nach Terminvereinbarung."));
  assert.ok(a.text.includes("- Sport frühestens ab dem 4. Monat nach der Operation."));
  // P2 ersetzt andere Stellen: Kühlen geht, das Schema von P1 kommt wieder.
  assert.deepEqual([...ersetzteStellen(g, idx)].sort(), ["t-belastung/bein", "t-belastung/kuehlen"]);
  assert.ok(a.text.includes("Kniegelenk rechts: ‹Nachbehandlung›"));
  assert.ok(!a.text.includes("Kühlen und hochlagern."));
});

test("Eigener Wortlaut einer Protokollzeile bleibt Aussage des Arztes; Satz entfernen und wieder aufnehmen", () => {
  const f = mitEigenemText(mitProtokoll(fallMit(idx), P1.id, idx), `${P1.id}/z1`, "Teilbelastung rechts mit 15 kg an Unterarmgehstützen.");
  const t = procedere(f, idx).tokens.find((x) => x.key === `${P1.id}/z1`);
  assert.equal(t?.t, "Teilbelastung rechts mit 15 kg an Unterarmgehstützen.");
  assert.equal(t?.zustand, "gesetzt");
  assert.equal(t?.frei, true);
  const ohneZeile = mitOption(f, `${P1.id}/z3`, false);
  const a = procedere(ohneZeile, idx);
  assert.ok(!a.text.includes("Abweichungen nach Maßgabe"));
  assert.ok(a.aus.some((e) => e.key === `${P1.id}/z3`));
});

test("Rücknahme eines blinden Tipp-Zugs (E-48): Übernehmen geht ganz zurück, kein Satz bleibt als „im Brief geblieben“", () => {
  const vorher = fallMit(idx);
  const nachher = mitProtokoll(vorher, P1.id, idx, [0]);
  const r = sicherZuruecknehmen(nachher, [{ vorher, nachher }], (f) => renderBrief(f, idx));
  assert.deepEqual(r.behalten, []);
  assert.equal(procedere(r.fall, idx).text, procedere(vorher, idx).text);
  assert.ok(!Object.keys(r.fall.optionen).some((k) => k.startsWith(`${P1.id}/`)));
  // Wechsel der Variante zurückgenommen: das alte Protokoll steht wieder da, seine Zeilen aber grau, nicht als Aussage.
  const alt = mitSlot(mitProtokoll(vorher, P1.id, idx), `${P1.id}/z1/gehhilfe`, "1");
  const neu = mitProtokoll(alt, P2.id, idx);
  const w = sicherZuruecknehmen(neu, [{ vorher: alt, nachher: neu }], (f) => renderBrief(f, idx));
  assert.deepEqual(w.behalten, []);
  assert.equal(protokollImFall(w.fall, idx)?.id, P1.id);
  const zustaende = procedere(w.fall, idx).tokens.filter((t) => t.bausteinId === P1.id && t.key).map((t) => t.zustand);
  assert.ok(zustaende.length > 0 && zustaende.every((z) => z === "offen" || z === "vorschlag"), zustaende.join());
});

test("Meldung nach dem Übernehmen nennt, was zurücktritt (G-103); Fokus geht an die erste Lücke, die im Fenster zu füllen ist", () => {
  const vorher = fallMit(idx);
  const tokens = procedere(vorher, idx).tokens;
  const nachher = mitProtokoll(vorher, P1.id, idx);
  assert.deepEqual(verdraengteStellen(tokens, vorher, nachher, idx), ["Belastung Bein", "Nachbehandlung"]);
  // Wechsel: Nur was jetzt neu zurücktritt; die Belastung war schon ersetzt.
  const danach = mitProtokoll(nachher, P2.id, idx);
  assert.deepEqual(verdraengteStellen(procedere(nachher, idx).tokens, nachher, danach, idx), ["Kühlen"]);
  assert.deepEqual(verdraengteStellen(tokens, vorher, vorher, idx), []);
  assert.equal(ersteProtokollLuecke(procedere(nachher, idx).tokens, P1.id), `${P1.id}/z1`);
  const gewaehlt = mitSlot(nachher, `${P1.id}/z1/gehhilfe`, "1");
  assert.equal(ersteProtokollLuecke(procedere(gewaehlt, idx).tokens, P1.id), undefined);
  // Fehlt nur die Seite, ist das keine Lücke für das Fenster.
  const ohneSeite = mitSlot(mitProtokoll(fallMit(idx, null), P1.id, idx), `${P1.id}/z1/gehhilfe`, "1");
  assert.equal(ersteProtokollLuecke(procedere(ohneSeite, idx).tokens, P1.id), undefined);
  assert.equal(ersteProtokollLuecke(procedere(mitProtokoll(fallMit(idx, null), P1.id, idx), idx).tokens, P1.id), `${P1.id}/z1`);
});

test("Übernehmen eines Blocks setzt keine ersetzten Sätze, auch wenn der Aufrufer sie nennt", () => {
  const f = mitProtokoll(fallMit(idx), P1.id, idx);
  const g = uebernehmen(f, ["t-belastung/bein", "t-belastung/schema", "t-belastung/kuehlen"], idx);
  assert.equal(g.optionen["t-belastung/bein"], undefined);
  assert.equal(g.auswahl["t-belastung/schema"], undefined);
  assert.equal(g.optionen["t-belastung/kuehlen"], true);
});

test("Ausgeblendeter oder von Hand überschriebener Procedere: Das Protokoll ersetzt dort nichts", () => {
  const f = mitProtokoll(fallMit(idx), P1.id, idx);
  assert.equal(ersetzteStellen({ ...f, ausgeblendet: { procedere: true } }, idx).size, 0);
  assert.equal(ersetzteStellen({ ...f, manuell: { procedere: "frei" } }, idx).size, 0);
  assert.equal(ersetzteStellen(f, idx).size, 2);
});

test("Eigene Vorlage mit vorbelegtem Protokoll: Zeilen grau mit Vorwahl, Übernehmen macht sie schwarz", () => {
  const eigene: Vorlage = { id: "eigen-x", titel: "Meine Testoperation", region: "eigen", setting: "station", abschnitte: { procedere: [P1.id, "t-belastung", "t-warn"] }, vorgaben: { an: [`${P1.id}/x1`] }, status: "eigen" };
  const i2 = testIndex([P1, P2], [VORLAGE, eigene]);
  const f = fallMit(i2, "links", eigene);
  const a = procedere(f, i2);
  const zeilen = a.tokens.filter((t) => t.bausteinId === P1.id && t.key);
  assert.deepEqual(
    zeilen.map((t) => t.zustand),
    ["offen", "vorschlag", "vorschlag", "vorschlag"],
  );
  assert.ok(a.text.includes("Kniegelenks links 6 Wochen nach der Operation in der unfallchirurgischen oder orthopädischen Praxis."));
  // Der Kasten bietet die Protokolle der Ausgangsvorlage an.
  assert.deepEqual(
    protokolleFuer(f, i2).map((p) => p.id),
    [P1.id, P2.id],
  );
  const g = uebernehmen(
    f,
    zeilen.filter((t) => t.zustand === "vorschlag").map((t) => t.key!),
    i2,
  );
  assert.equal(g.slots[`${P1.id}/z2/wo`], "0");
  assert.deepEqual(
    procedere(g, i2)
      .tokens.filter((t) => t.bausteinId === P1.id && t.key)
      .map((t) => t.zustand),
    ["offen", "gesetzt", "gesetzt", "gesetzt"],
  );
});

test("Der Kasten bietet nur Protokolle der Vorlage des Falls an", () => {
  assert.deepEqual(
    protokolleFuer(fallMit(idx), idx).map((p) => p.id),
    [P1.id, P2.id],
  );
  assert.deepEqual(protokolleFuer({ ...fallMit(idx), vorlageId: null }, idx), []);
  assert.deepEqual(protokolleFuer({ ...fallMit(idx), vorlageId: "andere" }, idx), []);
});

test("Der Fall merkt sich die Protokollwahl über das Speichern hinweg", () => {
  const f = mitSlot(mitProtokoll(fallMit(idx), P1.id, idx, [0]), `${P1.id}/z1/gehhilfe`, "1");
  const wieder = ergaenzt(JSON.parse(JSON.stringify(f)), idx);
  assert.ok(wieder);
  assert.equal(procedere(wieder, idx).text, procedere(f, idx).text);
  assert.equal(protokollImFall(wieder, idx)?.id, P1.id);
});

test("Vorschau im Kasten: Seite des Falls, Vorwahl, Lücke für Felder ohne Vorwahl", () => {
  const f = fallMit(idx, "links");
  assert.equal(vorschauZeile(P1, P1.zeilen[0], f), "1. bis 6. Woche nach der Operation: Teilbelastung des Beins links mit 20 kg ‹Gehhilfe›.");
  assert.equal(vorschauZeile(P1, P1.zeilen[1], f), "Klinische Kontrolle des Kniegelenks links 6 Wochen nach der Operation in der unfallchirurgischen oder orthopädischen Praxis.");
  assert.equal(vorschauZeile(P1, P1.zeilen[0], fallMit(idx, null)), "1. bis 6. Woche nach der Operation: Teilbelastung des Beins ‹Seite› mit 20 kg ‹Gehhilfe›.");
  assert.equal(vorschauZeile(P1, P1.zeilen[1], fallMit(idx, "ohne")), "Klinische Kontrolle des Kniegelenks 6 Wochen nach der Operation in der unfallchirurgischen oder orthopädischen Praxis.");
});

test("Formatprüfung erkennt Fehler in den Protokolldaten", () => {
  const kaputt: Protokoll = {
    ...P1,
    id: "proc-st-protokoll-test-9",
    vorlage: "gibt-es-nicht",
    titel: "Testoperation",
    zeilen: ["Kontrolle {wann}", "Ohne Punkt"],
    felder: { wo: { label: "Ort", optionen: ["a", "a"], vorwahl: "b", pflicht: true } },
    ersetzt: ["t-belastung/gibtsnicht", "t-belastung/bein", "t-belastung/bein"],
    ohneLeitlinie: true,
  };
  const fehler = protokollFehler(testIndex([kaputt]));
  for (const teil of ["Vorlage „gibt-es-nicht“", "Titel beginnt nicht", "Feld {wann} ist nicht definiert", "ohne Schlusspunkt", "kommt in keiner Zeile vor", "doppelte Optionen", "genau eines von", "keine der Optionen", "ersetzt nennt eine Stelle doppelt", "„t-belastung/gibtsnicht“ gibt es nicht", "ohneLeitlinie und Vermerk"]) {
    assert.ok(
      fehler.some((x) => x.includes(teil)),
      `erwartet: ${teil}\n${fehler.join("\n")}`,
    );
  }
  // Eine ersetzte Auswahl, die ihren Listenpunkt mit einem anderen Satz teilt, könnte nicht allein zurücktreten.
  const geteilt: Baustein = { ...BELASTUNG, id: "t-geteilt", segmente: [{ art: "punkt" }, { art: "auswahl", id: "a", label: "A", pflicht: true, optionen: ["x."] }, { art: "option", id: "o", label: "O", text: "y." }] };
  const v2: Vorlage = { ...VORLAGE, abschnitte: { procedere: ["t-geteilt"] } };
  const i3 = indexiere({ version: 1, regionen: [{ id: "t", name: "T", kuerzel: "t", bausteine: [geteilt] }], vorlagen: [v2], brieftypen: BRIEFTYPEN, protokolle: [{ ...P1, ersetzt: ["t-geteilt/a"] }] });
  assert.ok(protokollFehler(i3).some((x) => x.includes("teilt ihren Listenpunkt")));
  assert.deepEqual(protokollFehler(idx), []);
});

// --- Echter Katalog -----------------------------------------------------------------

const index = indexiere(KATALOG);
const alle = KATALOG.protokolle ?? [];

test("Katalog: 42 Protokolle in 23 Stationsvorlagen, ärztlich freigegeben (E-49)", () => {
  assert.equal(alle.length, 42);
  assert.equal(new Set(alle.map((p) => p.vorlage)).size, 23);
  assert.ok(alle.every((p) => p.pruefstatus === "freigegeben" && p.quelle === "nach deutschem Fachwissen, Stand 2026, ärztlich freigegeben 08.11.2026"));
  assert.ok(alle.every((p) => p.titel.startsWith(PROTOKOLL_PRAEFIX)));
  assert.deepEqual(
    alle.filter((p) => p.ohneLeitlinie).map((p) => p.nr),
    [10, 11, 12, 13, 24],
  );
  assert.deepEqual(protokollFehler(index), []);
});

/** Ersetzt die Felder einer Zeile so, wie der Brief sie mit der ersten Option jedes Pflichtfelds zeigt. */
function erwarteteZeile(p: Protokoll, text: string, seite: string): string {
  return text
    .replace(/\{seite\}/g, seite)
    .replace(/\{([a-z]+)\}/g, (_, n: string) => (n === "bein" ? seite : (p.felder[n].vorwahl ?? p.felder[n].optionen[0])))
    .replace(/ {2,}/g, " ")
    .replace(/ \./g, ".");
}

test("Katalog: jedes Protokoll steht nach dem Übernehmen wortgleich zuoberst im Procedere, die ersetzten Stellen fehlen, Entfernen stellt den Brief wieder her", () => {
  const fehler: string[] = [];
  for (const p of alle) {
    const v = index.vorlagen.get(p.vorlage)!;
    for (const seite of ["rechts", "links"] as const) {
      const vorher = mitPerson(mitSeite(mitVorlage(neuerFall("station", index), v, index), seite), "w", "80");
      let f = mitProtokoll(vorher, p.id, index, p.zusatz.map((_, i) => i));
      // Pflichtfelder: erste Option.
      const b = index.bausteine.get(p.id)!;
      for (const seg of b.segmente) {
        if (seg.art !== "option") continue;
        // Seite des verletzten Beins in einer Vorlage ohne Seitenwahl (Nr. 16): dieselbe Seite wie im Durchlauf.
        for (const slot of seg.slots ?? []) if (slot.art === "auswahl" && slot.optionen[0] === "") f = mitSlot(f, `${p.id}/${seg.id}/${slot.id}`, slot.id === "bein" ? String(slot.optionen.indexOf(seite)) : "1");
      }
      const a = procedere(f, index);
      const erwartet = [...p.zeilen, ...p.zusatz].map((z) => `- ${erwarteteZeile(p, z, seite)}`).join("\n");
      if (!a.text.startsWith(erwartet)) fehler.push(`${p.id} ${seite}: Text weicht ab:\n${a.text.slice(0, erwartet.length + 80)}\n--- erwartet ---\n${erwartet}`);
      const protokollTokens = a.tokens.filter((t) => t.bausteinId === p.id && t.key);
      if (protokollTokens.some((t) => t.zustand !== "gesetzt")) fehler.push(`${p.id}: Zeile nicht gesetzt`);
      for (const k of p.ersetzt) if (a.tokens.some((t) => t.key === k) || a.aus.some((e) => e.key === k)) fehler.push(`${p.id}: ersetzte Stelle ${k} noch da`);
      if (/ {2}| [.,:;]/.test(a.text)) fehler.push(`${p.id}: Leerraum im Text`);
      // Kein Seitenwort der anderen Seite aus dem Protokoll.
      const gegen = seite === "rechts" ? /\blinks\b/ : /\brechts\b/;
      if (protokollTokens.some((t) => gegen.test(t.t))) fehler.push(`${p.id}: falsche Seite`);
      const zurueck = ohneProtokoll(f, p.id);
      if (procedere(zurueck, index).text !== procedere(vorher, index).text) fehler.push(`${p.id}: Entfernen stellt den Procedere nicht wieder her`);
    }
  }
  assert.deepEqual(fehler, []);
});

test("Katalog: Felder ohne Vorwahl sind Lücken und halten das Kopieren des Procedere auf, bis gewählt ist", () => {
  for (const p of alle.filter((x) => offeneFelder(x).length > 0)) {
    const v = index.vorlagen.get(p.vorlage)!;
    const f = mitProtokoll(mitSeite(mitVorlage(neuerFall("station", index), v, index), "rechts"), p.id, index);
    const offen = procedere(f, index).tokens.filter((t) => t.bausteinId === p.id && t.zustand === "offen");
    assert.ok(offen.length >= 1, p.id);
    assert.ok(
      offen.every((t) => offeneFelder(p).some((l) => t.t.includes(`: ${l}›`))),
      `${p.id}: ${offen.map((t) => t.t).join(" | ")}`,
    );
  }
});

test("Katalog: jede Variante lässt sich gegen jede andere derselben Vorlage tauschen, ohne Reste", () => {
  const jeVorlage = new Map<string, Protokoll[]>();
  for (const p of alle) jeVorlage.set(p.vorlage, [...(jeVorlage.get(p.vorlage) ?? []), p]);
  for (const [vid, liste] of jeVorlage) {
    const v = index.vorlagen.get(vid)!;
    const basis = mitSeite(mitVorlage(neuerFall("station", index), v, index), "rechts");
    for (const a of liste) {
      for (const b of liste) {
        if (a === b) continue;
        const ueber = mitProtokoll(mitProtokoll(basis, a.id, index), b.id, index);
        const direkt = mitProtokoll(basis, b.id, index);
        assert.equal(procedere(ueber, index).text, procedere(direkt, index).text, `${a.id} → ${b.id}`);
        assert.ok(!Object.keys(ueber.optionen).some((k) => k.startsWith(`${a.id}/`)));
      }
    }
  }
});

test("Katalog (Nr. 4, E-71): nach dem Übernehmen steht in keinem der 42 Protokolle eine zweite Physiotherapie-Inhaltszeile; die Frage nach der Verordnung bleibt", () => {
  const fehler: string[] = [];
  let mitPhysio = 0;
  for (const p of alle) {
    const v = index.vorlagen.get(p.vorlage)!;
    let f = mitProtokoll(mitPerson(mitSeite(mitVorlage(neuerFall("station", index), v, index), "rechts"), "w", "80"), p.id, index, p.zusatz.map((_, i) => i));
    for (const seg of index.bausteine.get(p.id)!.segmente) {
      if (seg.art !== "option") continue;
      for (const slot of seg.slots ?? []) if (slot.art === "auswahl" && slot.optionen[0] === "") f = mitSlot(f, `${p.id}/${seg.id}/${slot.id}`, "1");
    }
    const a = procedere(f, index);
    // Inhaltszeile: ein Listenpunkt, der mit „Physiotherapie“ beginnt (Zeile des Protokolls oder Satz der Vorlage).
    const inhalt = a.text.split("\n").filter((z) => /^- Physiotherapie\b/.test(z));
    const eigene = p.zeilen.some((z) => z.startsWith("Physiotherapie"));
    if (eigene) mitPhysio++;
    // Ohne eigene Zeile (Nr. 42) darf der Satz der Vorlage stehen, aber nur einmal.
    if (inhalt.length > 1 || (eigene && inhalt.length !== 1)) fehler.push(`Nr. ${p.nr}: ${inhalt.length} Inhaltszeilen: ${inhalt.join(" | ")}`);
    const vorlageHatPhysio = (v.abschnitte.procedere ?? []).includes("proc-st-physio");
    if (vorlageHatPhysio && !a.tokens.some((t) => t.key === "proc-st-physio/verordnung" && t.t.trim() !== "")) fehler.push(`Nr. ${p.nr}: Frage nach der Verordnung fehlt`);
    if (vorlageHatPhysio && eigene && !a.tokens.some((t) => t.key === "proc-st-physio/verordnung" && t.zustand === "offen")) fehler.push(`Nr. ${p.nr}: Verordnung ist keine Lücke`);
  }
  assert.equal(mitPhysio, 41);
  assert.deepEqual(fehler, []);
});

test("Katalog (QA-36): nach dem Übernehmen steht neben der radiologischen Kontrolle eines Protokolls keine zweite Röntgenanweisung der Vorlage", () => {
  const roentgen = /Röntgen|radiologisch/i;
  const fehler: string[] = [];
  for (const p of alle.filter((x) => x.zeilen.some((z) => roentgen.test(z)))) {
    const v = index.vorlagen.get(p.vorlage)!;
    const f = mitProtokoll(mitPerson(mitSeite(mitVorlage(neuerFall("station", index), v, index), "rechts"), "w", "80"), p.id, index);
    // Nur Routinekontrollen der Vorlage; bedingte Hinweise („bei neuen Schmerzen Röntgen“) gehören neben das Protokoll.
    const fremde = procedere(f, index).tokens.filter((t) => t.bausteinId !== p.id && /kontroll[a-z-]*\/roentgen/.test(t.key ?? ""));
    if (fremde.length > 0) fehler.push(`Nr. ${p.nr}: ${[...new Set(fremde.map((t) => t.key ?? t.bausteinId))].join(", ")}`);
  }
  assert.deepEqual(fehler, []);
});
