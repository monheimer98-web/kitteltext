// Behaltene Stationsfälle, reine Logik (E-50, E-67): Format, Ablauf nach drei Tagen, Kurzbezeichnung, Zeitangaben.
// Die Abläufe mit Speicher, Neuladen und zweitem Fenster stehen in behalten-ablauf.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BEHALTEN_FORMAT,
  BEHALTEN_MS,
  KURZ_MAX,
  VORWARNUNG_MS,
  ablaufGrund,
  abgelaufen,
  alsSpeicher,
  alterKurz,
  begonnenText,
  behaltenAnzeige,
  kurzBereinigt,
  kurzHinweise,
  kurzSchluessel,
  kurzVergeben,
  liesBestand,
  loeschText,
  loeschzeit,
  tagText,
  tageBis,
  umZeitpunkt,
  ungespeichertText,
  zeitpunkt,
} from "../src/engine/behalten.ts";

// Ortszeit wie am Klinik-PC: Montag, 09.11.2026, 14:10.
const MO_1410 = new Date(2026, 10, 9, 14, 10).getTime();
const STUNDE = 3600_000;

function eintrag(id: string, erstellt = MO_1410, mehr: Record<string, unknown> = {}) {
  return { id, kurz: `Zi ${id}`, erstellt, loeschenAb: loeschzeit(erstellt), stand: 1, fenster: null, fall: { id }, ...mehr };
}

test("Ablauf: genau drei Tage ab Beginn des Falls, nicht ab der letzten Änderung", () => {
  assert.equal(BEHALTEN_MS, 72 * STUNDE);
  const e = eintrag("a");
  assert.equal(abgelaufen(e, MO_1410 + 72 * STUNDE - 1), false);
  assert.equal(abgelaufen(e, MO_1410 + 72 * STUNDE), true);
  // Unmögliche Zeiten löschen statt zu behalten: Löschzeit nach mehr als drei Tagen ab Beginn oder ab jetzt (verstellte Uhr).
  assert.equal(abgelaufen({ erstellt: MO_1410, loeschenAb: MO_1410 + 73 * STUNDE }, MO_1410), true);
  assert.equal(abgelaufen({ erstellt: MO_1410, loeschenAb: loeschzeit(MO_1410) }, MO_1410 - 2 * STUNDE), true);
});

test("Ablaufgrund: Frist, unplausible Löschzeit, Uhr vor dem Beginn ohne Toleranz (RD-R6-8)", () => {
  const e = eintrag("a");
  assert.equal(ablaufGrund(e, MO_1410), null, "genau zum Beginn");
  assert.equal(ablaufGrund(e, MO_1410 + 72 * STUNDE - 1), null);
  assert.equal(ablaufGrund(e, MO_1410 + 72 * STUNDE), "frist");
  assert.equal(ablaufGrund({ erstellt: MO_1410, loeschenAb: MO_1410 + 73 * STUNDE }, MO_1410 + STUNDE), "frist");
  assert.equal(ablaufGrund(e, MO_1410 - 1), "uhr", "eine Millisekunde vor dem Beginn");
  // Auch mit kürzerer Löschzeit: Die Uhr vor dem Beginn reicht (früher erst ab mehr als drei Tagen bis zur Löschzeit).
  assert.equal(ablaufGrund({ erstellt: MO_1410, loeschenAb: MO_1410 + STUNDE }, MO_1410 - 1), "uhr");
  const g = liesBestand({ format: 1, faelle: [eintrag("b", MO_1410 + STUNDE), eintrag("c", MO_1410 - 80 * STUNDE), eintrag("d")] }, MO_1410);
  assert.deepEqual(g.abgelaufen, ["Zi b", "Zi c"]);
  assert.deepEqual(g.uhr, ["Zi b"]);
  assert.deepEqual(g.entfallen, [
    { id: "b", kurz: "Zi b", grund: "uhr" },
    { id: "c", kurz: "Zi c", grund: "frist" },
  ]);
  assert.deepEqual(g.bestand.eintraege.map((x) => x.id), ["d"]);
});

test("Bestand lesen: abgelaufene und ungültige Einträge fallen weg, doppelte gelten einmal", () => {
  const roh = {
    format: 1,
    faelle: [
      eintrag("a"),
      eintrag("alt", MO_1410 - 73 * STUNDE),
      eintrag("a"),
      { ...eintrag("b"), kurz: "  " },
      { ...eintrag("c"), fall: { id: "anderer" } },
      { ...eintrag("d"), stand: -1 },
      { ...eintrag("e"), fenster: 3 },
      "kein Eintrag",
      eintrag("f", MO_1410, { fenster: "fenster-1" }),
    ],
  };
  const g = liesBestand(roh, MO_1410 + STUNDE);
  assert.deepEqual(
    g.bestand.eintraege.map((e) => e.id),
    ["a", "f"],
  );
  assert.deepEqual(g.abgelaufen, ["Zi alt"]);
  assert.equal(g.verworfen, 6);
  assert.equal(g.bestand.neuer, false);
  assert.equal(g.bestand.eintraege[1].fenster, "fenster-1");
});

test("Bestand lesen: nichts, Unsinn und Format ohne Nummer ergeben einen leeren Bestand", () => {
  for (const roh of [null, undefined, 3, "x", [], { faelle: [eintrag("a")] }, { format: 0, faelle: [] }, { format: 1.5, faelle: [] }]) {
    const g = liesBestand(roh, MO_1410);
    assert.deepEqual(g.bestand.eintraege, []);
    assert.equal(g.bestand.format, BEHALTEN_FORMAT);
  }
  assert.equal(liesBestand({ faelle: [eintrag("a"), eintrag("b")] }, MO_1410).verworfen, 2);
});

test("Neueres Format: anzeigen, ablaufen lassen und unverändert zurückschreiben, nie lesen", () => {
  const fremd = { ...eintrag("a"), neuesFeld: { x: 1 }, fall: "anders aufgebaut" };
  const g = liesBestand({ format: BEHALTEN_FORMAT + 1, faelle: [fremd, eintrag("alt", MO_1410 - 80 * STUNDE)] }, MO_1410);
  assert.equal(g.bestand.neuer, true);
  assert.deepEqual(
    g.bestand.eintraege.map((e) => [e.id, e.kurz, e.fall]),
    [["a", "Zi a", null]],
  );
  assert.deepEqual(g.abgelaufen, ["Zi alt"]);
  const zurueck = alsSpeicher(g.bestand);
  assert.equal(zurueck.format, BEHALTEN_FORMAT + 1);
  assert.deepEqual(zurueck.faelle, [fremd]);
});

test("Speicherform: eigene Einträge ohne Hilfsfelder, wieder lesbar", () => {
  const g = liesBestand({ format: 1, faelle: [eintrag("a", MO_1410, { stand: 4, fenster: "w1" })] }, MO_1410);
  const s = alsSpeicher(g.bestand);
  assert.deepEqual(s, { format: 1, faelle: [{ id: "a", kurz: "Zi a", erstellt: MO_1410, loeschenAb: loeschzeit(MO_1410), stand: 4, fenster: "w1", fall: { id: "a" }, fallFormat: 3 }] });
  assert.deepEqual(liesBestand(JSON.parse(JSON.stringify(s)), MO_1410).bestand.eintraege.map((e) => e.stand), [4]);
});

test("CR-R6-03: Formatstand des Falls je Eintrag: ohne Angabe 3, jede ganze Zahl ab 1 bleibt, Unsinn wird verworfen, geschrieben wird er mit", () => {
  const g = liesBestand(
    {
      format: 1,
      faelle: [eintrag("a"), eintrag("b", MO_1410, { fallFormat: 2 }), eintrag("c", MO_1410, { fallFormat: 9 }), ...[0, -1, 2.5, "3", null].map((x, i) => eintrag(`x${i}`, MO_1410, { fallFormat: x }))],
    },
    MO_1410,
  );
  assert.deepEqual(
    g.bestand.eintraege.map((e) => [e.id, e.fallFormat]),
    [
      ["a", 3],
      ["b", 2],
      ["c", 9],
    ],
  );
  assert.equal(g.verworfen, 5);
  assert.deepEqual(
    alsSpeicher(g.bestand).faelle.map((e) => (e as { fallFormat: number }).fallFormat),
    [3, 2, 9],
  );
});

test("Kurzbezeichnung: ohne Steuerzeichen, Leerraum zusammengezogen, höchstens 20 Zeichen", () => {
  assert.equal(kurzBereinigt("  Zi 12\t\tFenster \n"), "Zi 12 Fenster");
  assert.equal(kurzBereinigt("x".repeat(30)).length, KURZ_MAX);
  assert.equal(kurzBereinigt("   "), "");
  assert.equal(kurzBereinigt("Zi 12 Fenster rechts hinten").length <= KURZ_MAX, true);
});

test("Kurzbezeichnung: Hinweis bei Datum, Jahr, Nummer, Anrede, Geburtsangabe, Name und Initialen; nicht bei Zimmer und Bett", () => {
  for (const gut of ["Zi 12 Fenster", "OSG li Bett 3", "Zi 4 Tür", "Hüft-TEP 2", "B12", "Zi 101 hinten"]) assert.deepEqual(kurzHinweise(gut), [], gut);
  const fall = (text: string, muster: RegExp) => assert.ok(kurzHinweise(text).some((h) => muster.test(h)), `${text}: ${kurzHinweise(text).join(" | ")}`);
  fall("12.03.1950", /Datum/);
  fall("Zi 3 12.3.50", /Datum/);
  fall("Bett 2 3.11.", /Datum/);
  fall("*1950 Zi 2", /Datum/);
  fall("Zi 2 1950", /Jahreszahl/);
  fall("Bett 2 1234567", /Nummer/);
  fall("Zi 1 123 456", /Nummer/);
  fall("Herr Meier", /Anrede/);
  fall("Fr. Müller Zi 3", /Anrede/);
  fall("Zi 3 geb. 50", /Geburtsangabe/);
  fall("Müller, Hans", /Name, Vorname/);
  fall("Schulze-Ost, Eva", /Name, Vorname/);
  fall("H.M. Zi 4", /Initialen/);
  assert.equal(kurzHinweise("").length, 0);
});

test("Kurzbezeichnung doppelt: gleich ohne Groß- und Kleinschreibung und Leerraum, der eigene Eintrag zählt nicht", () => {
  const liste = liesBestand({ format: 1, faelle: [eintrag("a", MO_1410, { kurz: "Zi 12 Fenster" }), eintrag("b")] }, MO_1410).bestand.eintraege;
  assert.equal(liste.length, 2);
  assert.equal(kurzVergeben("zi 12  fenster ", liste)?.id, "a");
  assert.equal(kurzVergeben("ZI 12 FENSTER", liste, "b")?.id, "a");
  assert.equal(kurzVergeben("Zi 12 Fenster", liste, "a"), undefined);
  assert.equal(kurzVergeben("Zi 12 Tür", liste), undefined);
  assert.equal(kurzVergeben("Zi 12", liste), undefined);
  assert.equal(kurzVergeben("   ", liste), undefined);
});

test("Kurzbezeichnung nur einmal, auch in anderer Schreibweise: Leerraum, Satzzeichen, „Zimmer“ wie „Zi“ (PS-R6-4, E-83)", () => {
  const liste = liesBestand({ format: 1, faelle: [eintrag("a", MO_1410, { kurz: "Zi 12" }), eintrag("b", MO_1410, { kurz: "Bett 3" })] }, MO_1410).bestand.eintraege;
  for (const neu of ["Zi12", "Zi. 12", "zi.12", "Zimmer 12", "ZIMMER12", "Zi-12", " zi 12 "]) assert.equal(kurzVergeben(neu, liste)?.id, "a", neu);
  assert.equal(kurzVergeben("Bett3", liste)?.id, "b");
  assert.equal(kurzVergeben("Bett-3.", liste)?.id, "b");
  // Andere Nummer oder Zusatz bleibt ein anderer Fall.
  for (const neu of ["Zi 13", "Zi 12 Fenster", "Zi 1 2b", "Bett 33"]) assert.equal(kurzVergeben(neu, liste), undefined, neu);
  assert.equal(kurzSchluessel("Zimmer 12, Fenster"), "zi12fenster");
  // Nur Satzzeichen ergibt keinen Schlüssel und trifft nichts.
  assert.equal(kurzVergeben("…", liste), undefined);
});

test("Zeitangaben: Tag in Worten, ab drei Tagen Wochentag und Datum", () => {
  const di = (h: number, m = 0) => new Date(2026, 10, 10, h, m).getTime();
  assert.equal(tageBis(MO_1410, di(9)), -1);
  assert.equal(begonnenText(MO_1410, di(9)), "begonnen gestern 14:10");
  assert.equal(begonnenText(di(8, 5), di(9)), "begonnen heute 08:05");
  assert.equal(begonnenText(MO_1410, new Date(2026, 10, 11, 9, 0).getTime()), "begonnen vorgestern 14:10");
  assert.equal(begonnenText(MO_1410, new Date(2026, 10, 12, 9, 0).getTime()), "begonnen Mo 09.11. 14:10");
  assert.equal(zeitpunkt(MO_1410, MO_1410 + STUNDE), "14:10");
  assert.equal(zeitpunkt(MO_1410, di(9)), "gestern 14:10");
  // Gelöscht wird Donnerstag 14:10.
  const ab = loeschzeit(MO_1410);
  assert.equal(loeschText(ab, di(9)), "wird am Do 12.11. um 14:10 gelöscht");
  assert.equal(loeschText(ab, new Date(2026, 10, 11, 9, 0).getTime()), "wird morgen um 14:10 gelöscht");
  assert.equal(loeschText(ab, new Date(2026, 10, 12, 9, 0).getTime()), "wird heute um 14:10 gelöscht");
  // Über den Monatswechsel und die Zeitumstellung zählen Kalendertage, nicht 24-Stunden-Blöcke.
  assert.equal(tageBis(new Date(2026, 9, 25, 0, 30).getTime(), new Date(2026, 9, 24, 23, 30).getTime()), 1);
  assert.equal(tagText(new Date(2026, 11, 1, 8, 0).getTime(), new Date(2026, 10, 28, 8, 0).getTime()), "Di 01.12.");
});

test("Reiter: Alter ab zwei Stunden, an einem früheren Tag nur der Tag, auch kurz nach Mitternacht (MT-R6-08, DS-R6-6)", () => {
  assert.equal(alterKurz(MO_1410, MO_1410 + 119 * 60_000), "");
  assert.equal(alterKurz(MO_1410, MO_1410 + 2 * STUNDE), "vor 2 Std.");
  assert.equal(alterKurz(MO_1410, MO_1410 + 26 * STUNDE), "gestern");
  assert.equal(alterKurz(MO_1410, MO_1410 + 72 * STUNDE), "Mo 09.11.");
  // Begonnen 23:30, jetzt 00:20: weniger als zwei Stunden, aber von gestern. Vorher stand hier nichts.
  const spaet = new Date(2026, 10, 9, 23, 30).getTime();
  assert.equal(alterKurz(spaet, spaet + 50 * 60_000), "gestern");
});

test("Zeile im Fallkopf: früherer Tag hervorgehoben, Vorwarnung genau zwei Stunden vor dem Löschen (PS-R6-1, PS-R6-2, E-82)", () => {
  const f = { erstellt: MO_1410, geaendert: MO_1410 + 30 * 60_000, loeschenAb: loeschzeit(MO_1410) };
  assert.equal(VORWARNUNG_MS, 2 * STUNDE);
  assert.deepEqual(behaltenAnzeige(f, MO_1410 + STUNDE), {
    alt: false,
    bald: false,
    begonnen: "begonnen heute 14:10",
    geaendert: "zuletzt geändert heute 14:40",
    loeschen: "wird am Do 12.11. um 14:10 gelöscht",
  });
  // Ab Mitternacht ist der Fall von gestern, auch wenn erst zehn Stunden vergangen sind.
  assert.equal(behaltenAnzeige(f, new Date(2026, 10, 10, 0, 0).getTime()).alt, true);
  assert.equal(behaltenAnzeige(f, new Date(2026, 10, 9, 23, 59).getTime()).alt, false);
  const kurzVorher = f.loeschenAb - VORWARNUNG_MS;
  assert.equal(behaltenAnzeige(f, kurzVorher - 1).bald, false);
  assert.equal(behaltenAnzeige(f, kurzVorher).bald, true);
  assert.equal(behaltenAnzeige(f, kurzVorher).loeschen, "wird heute um 14:10 gelöscht");
  // Kurz nach Mitternacht begonnen: Die Vorwarnung beginnt am Vortag und nennt „morgen“.
  const nacht = new Date(2026, 10, 9, 0, 30).getTime();
  const n = { erstellt: nacht, geaendert: nacht, loeschenAb: loeschzeit(nacht) };
  assert.equal(behaltenAnzeige(n, n.loeschenAb - 90 * 60_000).loeschen, "wird morgen um 00:30 gelöscht");
  assert.equal(behaltenAnzeige(n, n.loeschenAb - 90 * 60_000).bald, true);
});

test("CR-R6-13: Kopiervermerk nach „wurde … kopiert“ mit „um“ hinter dem Tag, nie „um gestern“", () => {
  assert.equal(umZeitpunkt(MO_1410, MO_1410 + STUNDE), "um 14:10");
  assert.equal(umZeitpunkt(MO_1410, MO_1410 + 24 * STUNDE), "gestern um 14:10");
  assert.equal(umZeitpunkt(MO_1410, MO_1410 + 72 * STUNDE), "Mo 09.11. um 14:10");
});

test("MT-R6-11: Hinweise zur Kurzbezeichnung in zwei Formen: „Enthält …“ für Gefundenes, „Sieht aus wie …“ für Vermutetes", () => {
  assert.deepEqual(kurzHinweise("12.03.1950"), ["Enthält ein Datum. Kein Geburtsdatum eintragen."]);
  assert.deepEqual(kurzHinweise("Bett 2 1234567"), ["Enthält eine lange Nummer. Keine Fall- oder Patientennummer eintragen."]);
  assert.deepEqual(kurzHinweise("Herr Meier"), ["Enthält eine Anrede. Keinen Namen eintragen."]);
  assert.deepEqual(kurzHinweise("Zi 3 geb. 50"), ["Enthält eine Geburtsangabe. Kein Geburtsdatum eintragen."]);
  const alle = ["12.03.1950", "Zi 2 1950", "Bett 2 1234567", "Herr Meier", "Zi 3 geb. 50", "Müller, Hans", "Zi 3 H.M."].flatMap(kurzHinweise);
  for (const h of alle) assert.match(h, /^(Enthält|Sieht aus wie) [^.]+\. Kein(e|en)? [^.]+ eintragen\.$/, h);
});

test("CR-R6-01, MT-R6-22: Banner bei gescheitertem Schreiben nennt den Stand auf dem PC und was verloren geht", () => {
  assert.equal(ungespeichertText([], MO_1410), "");
  assert.equal(
    ungespeichertText([{ kurz: "Zi 12", um: MO_1410 }], MO_1410 + STUNDE),
    "Der Browser hat das Speichern von „Zi 12“ verweigert (Speicher voll oder gesperrt). Behalten bleibt der Stand von 14:10; was du seitdem einträgst, geht mit dem Schließen dieses Fensters verloren.",
  );
  assert.equal(
    ungespeichertText([{ kurz: "Zi 12", um: MO_1410 }, { kurz: "Zi 14", um: MO_1410 + 2 * STUNDE }], MO_1410 + 24 * STUNDE),
    "Der Browser hat das Speichern von „Zi 12“ (Stand von gestern 14:10) und „Zi 14“ (Stand von gestern 16:10) verweigert (Speicher voll oder gesperrt). Behalten bleibt jeweils dieser Stand; was du seitdem einträgst, geht mit dem Schließen dieses Fensters verloren.",
  );
});
