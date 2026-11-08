// Belegtests des Code-Reviews (Nachprüfung 07./08.10.2026), Bereich Durchlauf und Kopieren (ui/aktionen.ts).
// Rot = der Befund besteht. Grün mit Vorsilbe „widerlegt“ = Verdacht trifft nicht zu.
// Start: node --test "tests/belege/review-*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import { aktionen, ansicht, baustein, brief, fallOps, frisch, letzter, stand, store, vorlage, zwischenablage } from "./review-geschirr.ts";

const { mitAuswahl, mitBefund, mitWert, mitZusatz } = fallOps;

baustein("d-a", "anamnese", [{ art: "text", text: "Hergang: " }, { art: "platzhalter", ref: "hergang" }, { art: "text", text: "." }], [{ id: "hergang", typ: "freitext", label: "Unfallhergang", required: true }]);
baustein("d-x", "diagnostik", [
  { art: "text", text: "Röntgen: " },
  { art: "auswahl", id: "roe", label: "Röntgenbefund", pflicht: true, optionen: ["Kein Frakturnachweis.", ""] },
]);
baustein("d-c", "therapie", [{ art: "text", text: "Maßnahme: " }, { art: "platzhalter", ref: "was" }, { art: "text", text: "." }], [{ id: "was", typ: "begriff", label: "Maßnahme", required: true }]);
baustein("d-d", "procedere", [{ art: "text", text: "Kontrolle: " }, { art: "platzhalter", ref: "wann" }, { art: "text", text: "." }], [{ id: "wann", typ: "begriff", label: "Kontrolle", required: true }]);
baustein("d-b", "befund", [
  { art: "text", text: "Schulter: " },
  { art: "befund", id: "bew", chip: "Beweglichkeit", gruppe: "Funktion", normal: "Schulter {seite} frei beweglich. ", abweichung: "Bewegung {seite} eingeschränkt. " },
  { art: "befund", id: "ds", chip: "Druckschmerz", gruppe: "Palpation", normal: "Kein Druckschmerz.", abweichung: "Druckschmerz." },
]);
const V_LAUF = vorlage("d-v-lauf", { anamnese: ["d-a"], diagnostik: ["d-x"], therapie: ["d-c"], procedere: ["d-d"] });
const V_BEF = vorlage("d-v-bef", { befund: ["d-b"] });
const V_WEG = vorlage("d-v-weg", { anamnese: ["d-a"], befund: ["gibt-es-nicht"] });

test("NL-10 Durchlauf: verschwindet die eben bearbeitete Stelle aus dem Text, geht Enter dahinter weiter, nicht zurück an den Anfang", () => {
  frisch();
  store.fallNeu(V_LAUF);
  aktionen.naechsteStelle();
  assert.equal(stand(), "d-a/hergang");
  // Unfallhergang bleibt vorerst offen; F2 geht zur Röntgenauswahl.
  aktionen.naechsteStelle();
  assert.equal(stand(), "d-x/roe");
  // Wie AuswahlEditor.waehle: Option „— weglassen —“ wählen, dann weiter.
  store.aendere((f) => mitAuswahl(f, "d-x/roe", 1));
  aktionen.weiter();
  assert.equal(stand(), "d-c/was", "nach der Diagnostik kommt die Therapie");
});

test("NL-11 Durchlauf: eine mit der Maus bearbeitete Stelle setzt ihn dort fort, auch wenn der letzte F2-Halt noch offen ist", () => {
  frisch();
  store.fallNeu(V_LAUF);
  aktionen.naechsteStelle();
  assert.equal(stand(), "d-a/hergang");
  aktionen.schliesseFeld(false);
  // Mit der Maus: Maßnahme in der Therapie öffnen, ausfüllen, Fenster mit Esc schließen.
  aktionen.oeffneFeld({ key: "d-c/was", art: "feld", abschnitt: "therapie" });
  store.aendere((f) => mitWert(f, "d-c/was", "Verband"));
  aktionen.schliesseFeld(false);
  aktionen.naechsteStelle();
  assert.equal(stand(), "d-d/wann", "hinter der Therapie kommt das Procedere");
});

test("NL-12 Durchlauf: F2 meldet nicht „nichts mehr zu klären“, solange der Brief eine Lücke zählt (fehlender Baustein)", () => {
  frisch();
  store.fallNeu();
  store.aendere((f) => ({ ...f, bausteine: { befund: ["gibt-es-nicht"] } }));
  assert.equal(brief().offen, 1);
  assert.equal(ansicht("befund").fertig, false);
  assert.equal(aktionen.naechsteStelle(), true, "F2 findet keinen Halt, App.tsx meldet dann „Nichts mehr zu klären.“");
  void V_WEG;
});

test("NL-12 Durchlauf: „klären“ führt bei einer Lücke in der freien Ergänzung an eine Stelle", () => {
  frisch();
  store.fallNeu(V_LAUF);
  store.aendere((f) => mitWert(f, "d-a/hergang", "Sturz"));
  store.aendere((f) => mitZusatz(f, "anamnese", "Vorerkrankungen: ‹nachfragen›"));
  const a = ansicht("anamnese");
  assert.equal(a.offen, 1);
  aktionen.klaere(a);
  assert.notEqual(stand(), "fokus:-", "kein Fenster, kein Fokus: der Knopf „● 1 offen · klären“ rollt nur zum Abschnitt");
});

test("NS-2 Markierung kopieren: Text mit Lückenzeichen geht nicht in die Zwischenablage", () => {
  frisch();
  store.fallNeu(V_BEF);
  // Seite nicht gewählt, Normalbefund bestätigt: Der Abschnitt ist gesperrt, die Stelle trägt aber den Zustand „ok“.
  store.aendere((f) => mitBefund(mitBefund(f, "d-b/bew", "ok"), "d-b/ds", "ok"));
  const a = ansicht("befund");
  assert.equal(a.fertig, false);
  assert.match(a.text, /‹Seite›/);
  // Markierung über den ganzen Abschnitt; keine Stelle trägt die Klasse z-offen oder z-vorschlag.
  const klassen = a.tokens.filter((t) => t.key).map((t) => `z-${t.zustand}`);
  const gesperrt = klassen.filter((k) => k === "z-offen" || k === "z-vorschlag");
  let ablage = "";
  let verhindert = false;
  (globalThis as unknown as { window: { getSelection: () => unknown } }).window.getSelection = () => ({ toString: () => a.text, containsNode: () => true });
  aktionen.beiKopieAusBrief({
    currentTarget: { querySelectorAll: () => gesperrt },
    clipboardData: { setData: (_: string, t: string) => (ablage = t) },
    preventDefault: () => (verhindert = true),
  } as unknown as ClipboardEvent);
  (globalThis as unknown as { window: { getSelection: () => unknown } }).window.getSelection = () => null;
  assert.equal(verhindert, true);
  assert.doesNotMatch(ablage, /‹Seite›/, `in der Zwischenablage: ${ablage}`);
});

test("widerlegt: Strg+Enter kopiert keinen Abschnitt mit Lücke, auch nicht nach Fallwechsel oder zweitem Druck", async () => {
  frisch();
  store.fallNeu(V_BEF);
  store.aendere((f) => mitBefund(mitBefund(f, "d-b/bew", "ok"), "d-b/ds", "ok"));
  await aktionen.kopiereNaechsten();
  await aktionen.kopiereNaechsten();
  await aktionen.kopiereAlles();
  assert.equal(zwischenablage.texte.filter((t) => !/nichts kopiert/.test(t)).length, 0, letzter());
  assert.match(letzter(), /nichts kopiert/);
});

test("widerlegt: Kopieren schreibt genau den Text des Abschnitts, mit der eingestellten Umschrift", async () => {
  frisch();
  store.fallNeu(V_LAUF);
  store.aendere((f) => mitWert(f, "d-a/hergang", "Sturz „auf“ die Hand – ≥ 2 m"));
  const a = ansicht("anamnese");
  assert.equal(a.fertig, true);
  await aktionen.kopiereAbschnitt(a);
  assert.equal(letzter(), 'Hergang: Sturz "auf" die Hand - >= 2 m.');
  assert.equal(store.aktiverFall.value?.kopiert.anamnese, a.text);
});
