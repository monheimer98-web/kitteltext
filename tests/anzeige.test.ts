// Kurze Anzeigetexte des Design-Feinschliffs (Design-Review 10.11.2026, Nr. 1 und 4; Entscheidung Lead (a)).
import { test } from "node:test";
import assert from "node:assert/strict";
import { KURZE_STELLE, istKurzeStelle, kopfKurz, offeneAnzeige, offeneMarke, personKurz, reiterVersatz } from "../src/engine/anzeige.ts";
import { loeschzeit } from "../src/engine/behalten.ts";

test("offeneAnzeige: einzelne Lücke zeigt ihre Bezeichnung, auch mit Satzzeichen dahinter", () => {
  assert.equal(offeneAnzeige("‹Unfallhergang›", "Unfallhergang"), "Unfallhergang");
  assert.equal(offeneAnzeige("‹Unfallhergang›.", "Unfallhergang"), "Unfallhergang");
  assert.equal(offeneAnzeige("‹Allergien›,", undefined), "Allergien");
});

test("offeneAnzeige: kein vierter Punkt nach den Auslassungspunkten (M-28 S5)", () => {
  assert.equal(offeneAnzeige("Arbeitsunfall: ‹ja/nein›.", "Arbeitsunfall"), "Arbeitsunfall: …");
  assert.equal(offeneAnzeige("Kontrolle in ‹x› Tagen. Danach ‹y›.", "Kontrolle"), "Kontrolle in … Tagen. Danach …");
  // Komma und Doppelpunkt bleiben stehen; nur der Punkt geht im Auslassungszeichen auf.
  assert.equal(offeneAnzeige("Belastung ‹a›, dann ‹b›: ab Woche 6.", "Belastung"), "Belastung …, dann …: ab Woche 6.");
});

test("offeneAnzeige: mehrere Lücken in Folge werden ein Auslassungszeichen, Satzanfang mit Lücke nennt die Bezeichnung", () => {
  assert.equal(offeneAnzeige("‹a› ‹b› kräftig tastbar.", "Pulse"), "Pulse: … kräftig tastbar.");
  assert.equal(offeneAnzeige("‹a› ‹b› kräftig tastbar.", undefined), "… kräftig tastbar.");
});

test("offeneMarke: der Punkt hängt mit geschütztem Leerzeichen am ersten Wort", () => {
  const m = offeneMarke("‹Unfallhergang›", "Unfallhergang");
  assert.equal(m, "●\u00a0Unfallhergang");
  assert.ok(!m.includes(" "), "kein gewöhnliches Leerzeichen hinter dem Punkt");
});

test("istKurzeStelle: bis 30 Zeichen beisammen, längere dürfen umbrechen", () => {
  assert.equal(KURZE_STELLE, 30);
  assert.equal(istKurzeStelle(offeneMarke("‹Unfallhergang›", "Unfallhergang")), true);
  assert.equal(istKurzeStelle("●\u00a0" + "x".repeat(28)), true);
  assert.equal(istKurzeStelle("●\u00a0" + "x".repeat(29)), false);
  assert.equal(istKurzeStelle(offeneMarke("Bandstabilität (Talusvorschub, Aufklappbarkeit): ‹x›.", "Bandstabilität")), false);
});

test("personKurz: Zahl allein gilt als Jahre, anderes Alter steht wie eingetragen", () => {
  assert.equal(personKurz("w", "34"), "Patientin, 34 J.");
  assert.equal(personKurz("m", " 7 "), "Patient, 7 J.");
  assert.equal(personKurz("k", "8 Monate"), "Kind, 8 Monate");
  assert.equal(personKurz("n", ""), "neutral");
  assert.equal(personKurz("w", "   "), "Patientin");
});

test("kopfKurz: Seite und Person bleiben im kompakten Fallkopf sichtbar, Fehlendes gelb (Entscheidung Lead (a))", () => {
  const leer = { brauchtSeite: true, seite: null, brauchtPerson: true, geschlecht: null, alter: "" } as const;
  assert.deepEqual(kopfKurz(leer), [
    { text: "● Seite wählen", fehlt: true },
    { text: "● Person wählen", fehlt: true },
  ]);
  // Die gewählte Seite steht schon im Titel; hier nur noch die Person.
  assert.deepEqual(kopfKurz({ ...leer, seite: "rechts", geschlecht: "w", alter: "34" }), [{ text: "Patientin, 34 J.", fehlt: false }]);
  // „ohne Seite“ ist eine Wahl, keine Lücke.
  assert.deepEqual(kopfKurz({ ...leer, seite: "ohne", geschlecht: "m", alter: "" }), [{ text: "Patient", fehlt: false }]);
  assert.deepEqual(kopfKurz({ ...leer, seite: null, geschlecht: "m", alter: "50" }), [
    { text: "● Seite wählen", fehlt: true },
    { text: "Patient, 50 J.", fehlt: false },
  ]);
  // Vorlagen ohne Seite oder Person zeigen dazu nichts.
  assert.deepEqual(kopfKurz({ brauchtSeite: false, seite: null, brauchtPerson: false, geschlecht: null, alter: "" }), []);
});

test("kopfKurz: behaltener Fall mit Kurzbezeichnung vorn, früherem Tag und naher Löschzeit, nichts davon gelb (PS-R6-2, E-82)", () => {
  const p = { brauchtSeite: true, seite: "rechts", brauchtPerson: true, geschlecht: "w", alter: "78" } as const;
  const mo = new Date(2026, 10, 9, 14, 10).getTime();
  const b = { kurz: "Zi 12", erstellt: mo, geaendert: mo, loeschenAb: loeschzeit(mo) };
  assert.deepEqual(kopfKurz(p, b, mo + 3600_000), [
    { text: "„Zi 12“", fehlt: false, art: "kurz" },
    { text: "Patientin, 78 J.", fehlt: false },
  ]);
  assert.deepEqual(kopfKurz(p, b, mo + 26 * 3600_000), [
    { text: "„Zi 12“", fehlt: false, art: "kurz" },
    { text: "Patientin, 78 J.", fehlt: false },
    { text: "begonnen gestern", fehlt: false, art: "warnung" },
  ]);
  assert.deepEqual(kopfKurz({ ...p, seite: null, geschlecht: null }, b, b.loeschenAb - 3600_000), [
    { text: "„Zi 12“", fehlt: false, art: "kurz" },
    { text: "● Seite wählen", fehlt: true },
    { text: "● Person wählen", fehlt: true },
    { text: "begonnen Mo 09.11.", fehlt: false, art: "warnung" },
    { text: "wird heute um 14:10 gelöscht", fehlt: false, art: "warnung" },
  ]);
  // Ohne Seite und Person bleibt die Kurzbezeichnung.
  assert.deepEqual(kopfKurz({ brauchtSeite: false, seite: null, brauchtPerson: false, geschlecht: null, alter: "" }, b, mo), [{ text: "„Zi 12“", fehlt: false, art: "kurz" }]);
});

test("reiterVersatz: offener Reiter ganz links vom angehefteten „+ Neuer Fall“ (QA-44)", () => {
  const sicht = { sichtLinks: 100, sichtRechts: 500 };
  assert.equal(reiterVersatz({ links: 120, rechts: 300, ...sicht }), 0);
  // Rechts abgeschnitten (auch nur sein ×): so weit nach rechts, dass die rechte Kante frei ist.
  assert.equal(reiterVersatz({ links: 450, rechts: 640, ...sicht }), 140);
  // Links abgeschnitten: an den linken Rand.
  assert.equal(reiterVersatz({ links: 40, rechts: 200, ...sicht }), -60);
  // Breiter als der freie Bereich: Der Anfang steht links.
  assert.equal(reiterVersatz({ links: 300, rechts: 800, ...sicht }), 200);
});
