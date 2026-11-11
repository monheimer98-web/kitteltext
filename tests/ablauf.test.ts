// Tests für Zustand und Abläufe: Kopieren, Fallwechsel, Rückgängig, eigene
// Inhalte. Sie laufen ohne Browser gegen Store und Aktionen; Fenster,
// Speicher und Zwischenablage sind Attrappen. Das Geschirr stammt aus dem
// Code-Review vom 07.10.2026, die Tests belegen dessen Befunde und die der
// Sicherheitsprüfung als behoben.

import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIEFTYPEN } from "../src/data/katalog.ts";
import { mitAngabe, mitAuswahl, mitBefund, mitPerson, mitSeite, mitSlot, mitWahl, mitWert, mitZusatz, ohneBaustein, uebernehmen } from "../src/engine/fall.ts";
import type { BriefAnsicht } from "../src/engine/render.ts";
import { bausteinStand } from "../src/engine/sammel.ts";
import type { AbschnittId, Baustein, Fall, Platzhalter, Segment, Vorlage } from "../src/model/types.ts";

function speicherAttrappe() {
  const m = new Map<string, string>();
  return {
    gesperrt: false,
    getItem(k: string) {
      if (this.gesperrt) throw new Error("gesperrt");
      return m.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      if (this.gesperrt) throw new Error("gesperrt");
      m.set(k, String(v));
    },
    removeItem(k: string) {
      if (this.gesperrt) throw new Error("gesperrt");
      m.delete(k);
    },
  };
}
const lokalerSpeicher = speicherAttrappe();
const sitzungsSpeicher = speicherAttrappe();
const zwischenablage: { texte: string[]; warte: Promise<void> | null; gesperrt: boolean } = { texte: [], warte: null, gesperrt: false };
const fenster: { blur?: () => void } = {};

Object.assign(globalThis, {
  window: {
    localStorage: lokalerSpeicher,
    sessionStorage: sitzungsSpeicher,
    isSecureContext: true,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    getSelection: () => null,
    addEventListener: (art: string, fn: () => void) => {
      if (art === "blur") fenster.blur = fn;
    },
  },
  document: {
    documentElement: { setAttribute() {}, removeAttribute() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    activeElement: null,
  },
  CSS: { escape: (s: string) => s },
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    clipboard: {
      writeText: async (t: string) => {
        if (zwischenablage.gesperrt) throw new Error("gesperrt");
        if (zwischenablage.warte) await zwischenablage.warte;
        zwischenablage.texte.push(t);
      },
    },
  },
});

const store = await import("../src/store.ts");
const aktionen = await import("../src/ui/aktionen.ts");
const speicher = await import("../src/speicher.ts");
const kopieren = await import("../src/ui/kopieren.ts");

function baustein(id: string, abschnitt: AbschnittId, segmente: Segment[], platzhalter: Platzhalter[] = []): Baustein {
  return { id, titel: id, typ: "untersuchung", abschnitt, platzhalter, segmente };
}
function vorlage(id: string, abschnitte: Partial<Record<AbschnittId, string[]>>, mehr: Partial<Vorlage> = {}): Vorlage {
  return { id, titel: id, region: "t", setting: "zna", abschnitte, status: "entwurf", ...mehr };
}

const T_FELDER = baustein(
  "t-felder",
  "anamnese",
  [
    { art: "platzhalter", ref: "f1" },
    { art: "text", text: ". " },
    { art: "platzhalter", ref: "f2" },
    { art: "text", text: "." },
  ],
  [
    { id: "f1", typ: "freitext", label: "Unfallhergang", required: true },
    { id: "f2", typ: "begriff", label: "Unfallzeitpunkt", required: true },
  ],
);
const T_BEFUND = baustein("t-befund", "befund", [
  { art: "text", text: "Sprunggelenk " },
  { art: "seite" },
  { art: "text", text: ": " },
  { art: "befund", id: "n1", chip: "Druckschmerz", gruppe: "Palpation", normal: "Kein Druckschmerz. ", abweichung: "Druckschmerz. " },
  { art: "befund", id: "n2", chip: "Schwellung", gruppe: "Inspektion", normal: "Keine Schwellung.", abweichung: "Schwellung." },
]);
const T_PFLICHT = baustein("t-pflicht", "diagnostik", [
  { art: "option", id: "antiko", label: "Gerinnungshemmung", an: true, text: "Gerinnungshemmende Medikamente: {was}. ", slots: [{ art: "auswahl", id: "was", label: "Gerinnungshemmung", required: true, optionen: ["", "keine", "Phenprocoumon"] }] },
  { art: "text", text: "Röntgen: " },
  { art: "auswahl", id: "roe", label: "Röntgenbefund", pflicht: true, optionen: ["Kein Frakturnachweis.", "Fraktur."] },
  { art: "option", id: "kontrolle", label: "Kontrolle", text: " Kontrolle nach 7 Tagen." },
]);
const T_FEST = baustein("t-fest", "procedere", [{ art: "punkt" }, { art: "option", id: "kontrolle", label: "Kontrolle", an: true, text: "Kontrolle in der Hausarztpraxis." }]);
const T_KNIE = baustein("t-knie", "befund", [
  { art: "befund", id: "schwellung", chip: "Schwellung", gruppe: "Inspektion", normal: "Keine Schwellung. ", abweichung: "Schwellung. " },
  {
    art: "befund",
    id: "baender",
    chip: "Seitenbänder",
    gruppe: "Stabilität",
    normal: "",
    abweichung: "{befund}. ",
    slots: [{ art: "auswahl", id: "befund", label: "Befund", required: true, optionen: ["", "Seitenbänder stabil", "Mediale Aufklappbarkeit"] }],
  },
  { art: "messwert", id: "rom", label: "Extension/Flexion", vorlage: "Extension/Flexion {w}°. ", gruppe: "Beweglichkeit" },
]);
const T_ROE = baustein("t-roe", "diagnostik", [
  { art: "text", text: "Röntgen: " },
  { art: "auswahl", id: "erg", label: "Röntgenbefund", pflicht: true, optionen: ["Kein Frakturnachweis.", "Fraktur."] },
]);
const T_VERZICHT = baustein("t-verzicht", "diagnostik", [{ art: "option", id: "satz", label: "Verzicht", an: true, text: "Auf ein Röntgen haben wir verzichtet." }]);
// Leere Vorgeschichte: drei Angaben, die ein Knopf in einem Schritt auf „keine“ setzt (Sammelangabe); die Gerinnungshemmung bleibt eine eigene Frage.
const T_VG: Baustein = {
  ...baustein(
    "t-vg",
    "anamnese",
    [
      { art: "text", text: "Vorerkrankungen: " },
      { art: "platzhalter", ref: "vorerkrankungen" },
      { art: "text", text: ". Dauermedikation: " },
      { art: "platzhalter", ref: "medikation" },
      { art: "text", text: ". " },
      { art: "option", id: "antiko", label: "Gerinnungshemmung", an: true, text: "Gerinnungshemmende Medikamente: {was}. ", slots: [{ art: "auswahl", id: "was", label: "Gerinnungshemmung", required: true, optionen: ["", "keine", "Apixaban"] }] },
      { art: "text", text: "Allergien: " },
      { art: "platzhalter", ref: "allergien" },
      { art: "text", text: ". " },
    ],
    [
      { id: "vorerkrankungen", typ: "freitext", label: "Vorerkrankungen", required: true, vorschlaege: ["keine bekannt"] },
      { id: "medikation", typ: "freitext", label: "Dauermedikation", required: true, vorschlaege: ["keine"] },
      { id: "allergien", typ: "freitext", label: "Allergien", required: true, vorschlaege: ["keine bekannt"] },
    ],
  ),
  sammelangabe: {
    angaben: [
      { ref: "vorerkrankungen", wert: "keine bekannt", aussage: "keine Vorerkrankungen" },
      { ref: "medikation", wert: "keine", aussage: "keine Dauermedikation" },
      { ref: "allergien", wert: "keine bekannt", aussage: "keine Allergien" },
    ],
  },
};
for (const b of [T_FELDER, T_BEFUND, T_PFLICHT, T_FEST, T_KNIE, T_ROE, T_VERZICHT, T_VG]) store.INDEX.bausteine.set(b.id, b);
const V_WAHL = vorlage(
  "t-v-wahl",
  { befund: ["t-knie"] },
  { entscheiden: ["t-knie/baender", "t-knie/rom"], wahl: [{ abschnitt: "diagnostik", label: "Röntgen oder Verzicht?", bausteine: ["t-roe", "t-verzicht"] }] },
);
store.INDEX.vorlagen.set(V_WAHL.id, V_WAHL);
const V_FELDER = vorlage("t-v-felder", { anamnese: ["t-felder"] });
const V_BEFUND = vorlage("t-v-befund", { befund: ["t-befund"], procedere: ["t-fest"] });
const V_PFLICHT = vorlage("t-v-pflicht", { diagnostik: ["t-pflicht"] });
const V_ALLES = vorlage("t-v-alles", { anamnese: ["t-felder"], befund: ["t-befund"], diagnostik: ["t-pflicht"], procedere: ["t-fest"] });
const V_VG = vorlage("t-v-vg", { anamnese: ["t-vg"], befund: ["t-befund"] });
for (const v of [V_FELDER, V_BEFUND, V_PFLICHT, V_ALLES, V_VG]) store.INDEX.vorlagen.set(v.id, v);
void BRIEFTYPEN;

/** Räumt alles ab, was ein vorheriger Test hinterlassen hat. */
function frisch() {
  lokalerSpeicher.gesperrt = false;
  sitzungsSpeicher.gesperrt = false;
  void aktionen.raeumeArbeitsplatz(true);
  store.eigenesErsetzen({ bausteine: [], vorlagen: [] });
  zwischenablage.texte = [];
  zwischenablage.warte = null;
  zwischenablage.gesperrt = false;
  fenster.blur?.();
}
const aktiv = (): Fall => {
  const f = store.aktiverFall.value;
  assert.ok(f, "kein aktiver Fall");
  return f;
};
const fall = (id: string): Fall => {
  const f = store.faelle.value.find((x) => x.id === id);
  assert.ok(f, "Fall fehlt");
  return f;
};
const ansicht = (id: AbschnittId) => {
  const a = (store.brief.value as BriefAnsicht).abschnitte.find((x) => x.id === id);
  assert.ok(a);
  return a;
};
const letzter = () => zwischenablage.texte[zwischenablage.texte.length - 1];
const grau = (id: AbschnittId) => ansicht(id).tokens.filter((t) => t.zustand === "vorschlag" && t.key).map((t) => t.key!);

// --- Kopieren ----------------------------------------------------------------

test("Kopieren: ein Abschnitt mit Vorschlägen wird nicht kopiert, auch nicht beim zweiten Druck", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("befund")), false);
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("befund")), false);
  assert.equal(ansicht("befund").kopiert, false);
  assert.ok(!zwischenablage.texte.some((t) => t.includes("Sprunggelenk")));
  // Nichts gilt dadurch als bestätigt.
  assert.deepEqual(aktiv().befund, {});
});

test("Kopieren: nach der Übernahme geht der Abschnitt mit genau dem angezeigten Text in die Zwischenablage", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  aktionen.uebernimm(grau("befund"));
  const a = ansicht("befund");
  assert.equal(a.fertig, true);
  assert.equal(await aktionen.kopiereAbschnitt(a), true);
  assert.equal(letzter(), "Sprunggelenk rechts: Kein Druckschmerz. Keine Schwellung.");
  assert.equal(ansicht("befund").kopiert, true);
  assert.equal(aktionen.letzteKopie.value?.zeichen, letzter().length);
});

test("Kopieren: Strg+Enter auf einem unfertigen Abschnitt kopiert nichts und entwertet die Zwischenablage", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  aktionen.uebernimm(grau("procedere"));
  await aktionen.kopiereAbschnitt(ansicht("procedere"));
  assert.match(letzter(), /Kontrolle in der Hausarztpraxis/);
  fenster.blur?.();
  // Nächster in der Reihe ist der Befund mit grauen Normalbefunden.
  await aktionen.kopiereNaechsten();
  assert.match(letzter(), /nichts kopiert/);
  assert.equal(ansicht("befund").kopiert, false);
});

test("Kopieren: der ganze Brief geht erst hinaus, wenn alle Abschnitte fertig sind", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "links");
  assert.equal(await aktionen.kopiereAlles(), false);
  assert.match(letzter(), /nichts kopiert/);
  aktionen.uebernimm([...grau("befund"), ...grau("procedere")]);
  assert.equal(await aktionen.kopiereAlles(), true);
  assert.equal(letzter(), "Befund:\r\nSprunggelenk links: Kein Druckschmerz. Keine Schwellung.\r\n\r\nProcedere:\r\n- Kontrolle in der Hausarztpraxis.");
});

test("Kopieren: Vorschläge eines Falls gelten im nächsten Fall nicht als geklärt", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  await aktionen.kopiereAbschnitt(ansicht("befund"));
  store.fallNeu(V_BEFUND, "links");
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("befund")), false);
  await aktionen.kopiereNaechsten();
  assert.ok(!zwischenablage.texte.some((t) => t.includes("Sprunggelenk")));
});

test("Kopieren: zweimal Strg+Enter ohne Wechsel ins KIS kopiert denselben Abschnitt erneut, nicht den nächsten", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  aktionen.uebernimm([...grau("befund"), ...grau("procedere")]);
  await aktionen.kopiereNaechsten();
  assert.match(letzter(), /^Sprunggelenk rechts/);
  await aktionen.kopiereNaechsten();
  assert.match(letzter(), /^Sprunggelenk rechts/);
  assert.equal(ansicht("procedere").kopiert, false);
  fenster.blur?.();
  await aktionen.kopiereNaechsten();
  assert.match(letzter(), /Kontrolle in der Hausarztpraxis/);
});

test("Kopieren und Fallwechsel: der Vermerk landet in dem Fall, aus dem kopiert wurde", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  const a = aktiv().id;
  aktionen.uebernimm(grau("befund"));
  let fertig!: () => void;
  zwischenablage.warte = new Promise<void>((r) => (fertig = r));
  const laeuft = aktionen.kopiereAbschnitt(ansicht("befund"));
  store.fallNeu(V_BEFUND, "links");
  const b = aktiv().id;
  fertig();
  await laeuft;
  assert.ok(fall(a).kopiert.befund, "Fall A trägt den Kopiervermerk");
  assert.equal(fall(b).kopiert.befund, undefined);
  assert.deepEqual(fall(b).befund, {});
  assert.match(aktionen.letzteKopie.value?.fall ?? "", /rechts|re\./);
});

test("Kopieren: hinter der Vorlagensuche wirkt kein Kopierbefehl", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  aktionen.uebernimm([...grau("befund"), ...grau("procedere")]);
  store.sucheOffen.value = "neu";
  await aktionen.kopiereNaechsten();
  assert.equal(await aktionen.kopiereAlles(), false);
  assert.ok(!zwischenablage.texte.some((t) => t.includes("Sprunggelenk") || t.includes("Kontrolle")));
});

test("Kopieren: gesperrte Zwischenablage zeigt den genauen Text zum Kopieren von Hand und setzt keinen Vermerk", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  aktionen.uebernimm(grau("procedere"));
  zwischenablage.gesperrt = true;
  Object.assign(document, { createElement: () => ({ style: {}, setAttribute() {}, focus() {}, select() {}, setSelectionRange() {}, remove() {} }), body: { appendChild() {} }, execCommand: () => false });
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("procedere")), false);
  assert.equal(aktionen.handkopie.value?.text, "- Kontrolle in der Hausarztpraxis.");
  assert.equal(ansicht("procedere").kopiert, false);
});

test("Kopiervermerke überstehen Rückgängig", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  aktionen.uebernimm(grau("procedere"));
  await aktionen.kopiereAbschnitt(ansicht("procedere"));
  store.zurueck();
  // Die Übernahme ist zurückgenommen, der Abschnitt wieder grau; kopiert wurde er trotzdem.
  assert.equal(ansicht("procedere").fertig, false);
  assert.equal(ansicht("procedere").kopiert, true);
});

test("Arbeitsplatz räumen: Fälle, „Zuletzt kopiert“ und Zwischenablage sind leer", async () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  aktionen.uebernimm(grau("procedere"));
  await aktionen.kopiereAbschnitt(ansicht("procedere"));
  void aktionen.raeumeArbeitsplatz(true);
  assert.equal(store.faelle.value.length, 0);
  assert.equal(aktionen.letzteKopie.value, null);
  assert.equal(letzter().trim(), "");
});

// --- Fallwechsel -------------------------------------------------------------

test("Fallwechsel: Fenster an einer Textstelle und Befundliste schließen sich", () => {
  frisch();
  store.fallNeu(V_FELDER);
  const eins = aktiv().id;
  store.fallNeu(V_FELDER);
  aktionen.oeffneFeld({ key: "t-felder/f1", art: "feld", abschnitt: "anamnese" });
  assert.ok(aktionen.offenesFeld.value);
  store.fallWaehlen(eins);
  assert.equal(aktionen.offenesFeld.value, null);
  aktionen.offeneListe.value = { bausteinId: "t-befund" };
  store.fallNeu(V_BEFUND);
  assert.equal(aktionen.offeneListe.value, null);
});

test("Fallnummern bleiben fest, auch wenn ein früherer Fall geschlossen wird", () => {
  frisch();
  store.fallNeu(V_FELDER);
  const eins = aktiv();
  store.fallNeu(V_FELDER);
  store.fallNeu(V_FELDER);
  const drei = aktiv();
  assert.equal(drei.nr, eins.nr + 2);
  store.fallSchliessen(eins.id);
  assert.equal(fall(drei.id).nr, eins.nr + 2);
  store.fallNeu(V_FELDER);
  assert.equal(aktiv().nr, eins.nr + 3);
  assert.match(aktionen.fallKennung(aktiv()), new RegExp(`^Fall ${eins.nr + 3} · `));
});

test("F2 beginnt in jedem Fall vorn", () => {
  frisch();
  store.fallNeu(V_FELDER);
  aktionen.naechsteStelle();
  aktionen.naechsteStelle();
  assert.equal(aktionen.offenesFeld.value?.key, "t-felder/f2");
  store.fallNeu(V_FELDER);
  aktionen.naechsteStelle();
  assert.equal(aktionen.offenesFeld.value?.key, "t-felder/f1");
});

test("F2 hält an Lücken, an Befundblöcken und an Blöcken mit Vorschlägen; danach ist nichts mehr zu klären", () => {
  frisch();
  store.fallNeu(V_BEFUND);
  // Erst die fehlende Seite (im Fallkopf), dann der Befundblock, dann der Vorschlag im Procedere.
  assert.equal(aktionen.naechsteStelle(), true);
  assert.equal(aktionen.offeneListe.value, null);
  store.aendere((f) => mitSeite(f, "rechts"));
  assert.equal(aktionen.naechsteStelle(), true);
  assert.equal(aktionen.offeneListe.value?.bausteinId, "t-befund");
  aktionen.uebernimm(grau("befund"));
  aktionen.schliesseListe(false);
  assert.equal(aktionen.naechsteStelle(), true);
  assert.equal(aktionen.offeneListe.value, null);
  aktionen.uebernimm(grau("procedere"));
  assert.equal(aktionen.naechsteStelle(), false);
});

test("Durchlauf: Enter führt in Lesereihenfolge durch den Brief, nicht an Befund und Vorschlägen vorbei", () => {
  frisch();
  store.fallNeu(V_ALLES);
  store.aendere((f) => mitSeite(f, "rechts"));
  aktionen.naechsteStelle();
  assert.equal(aktionen.offenesFeld.value?.key, "t-felder/f1");
  store.aendere((f) => mitWert(f, "t-felder/f1", "Sturz"));
  aktionen.weiter();
  assert.equal(aktionen.offenesFeld.value?.key, "t-felder/f2");
  store.aendere((f) => mitWert(f, "t-felder/f2", "heute"));
  aktionen.weiter();
  // Nach der Anamnese kommt der Befund, nicht die nächste Lücke weiter unten.
  assert.equal(aktionen.offenesFeld.value, null);
  assert.equal(aktionen.offeneListe.value?.bausteinId, "t-befund");
  aktionen.uebernimm(grau("befund"));
  aktionen.schliesseListe(false);
  // Der Befundblock ist erledigt: Es geht dahinter weiter, nicht wieder von vorn.
  aktionen.naechsteStelle();
  assert.equal(aktionen.offenesFeld.value?.key, "t-pflicht/antiko");
  store.aendere((f) => mitAngabe(f, "t-pflicht/antiko", "t-pflicht/antiko/was", "1"));
  aktionen.weiter();
  assert.equal(aktionen.offenesFeld.value?.key, "t-pflicht/roe");
  store.aendere((f) => mitAuswahl(f, "t-pflicht/roe", 0));
  aktionen.weiter();
  // Letzter Halt ist der Vorschlag im Procedere; er hat kein Fenster.
  assert.equal(aktionen.offenesFeld.value, null);
  assert.equal(ansicht("diagnostik").fertig, true);
  aktionen.uebernimm(grau("procedere"));
  assert.equal(aktionen.naechsteStelle(), false);
});

test("Durchlauf: verlangte Wahlbefunde und Messwerte halten in der Befundliste; die Entweder-oder-Stelle ist ein eigener Halt und sperrt das Kopieren", async () => {
  frisch();
  store.fallNeu(V_WAHL);
  assert.equal(aktionen.naechsteStelle(), true);
  assert.equal(aktionen.offeneListe.value?.bausteinId, "t-knie");
  // Die Sammelübernahme der grauen Normalbefunde schließt die verlangten Angaben nicht.
  aktionen.uebernimm(grau("befund"));
  assert.equal(ansicht("befund").offen, 2);
  assert.equal(ansicht("befund").fertig, false);
  store.aendere((f) => mitWert(mitSlot(mitBefund(f, "t-knie/baender", "abw"), "t-knie/baender/befund", "1"), "t-knie/rom", "0/0/130"));
  assert.equal(ansicht("befund").fertig, true);
  aktionen.schliesseListe(false);

  // Diagnostik: Die Vorlage behauptet weder Röntgen noch Verzicht.
  assert.match(ansicht("diagnostik").text, /^‹Röntgen oder Verzicht\?›$/);
  await aktionen.kopiereAlles();
  assert.equal(zwischenablage.texte.some((t) => t.includes("Seitenbänder")), false);
  assert.equal(aktionen.naechsteStelle(), true);
  assert.equal(aktionen.offenesFeld.value?.art, "wahl");
  assert.equal(aktionen.offenesFeld.value?.key, "wahl/diagnostik/0");
  store.aendere((f) => mitWahl(f, "wahl/diagnostik/0", "t-verzicht", store.INDEX));
  aktionen.weiter();
  // Der gewählte Baustein bringt seinen eigenen Vorschlag mit; erst nach dessen Übernahme ist nichts mehr zu klären.
  assert.equal(ansicht("diagnostik").vorschlag, 1);
  aktionen.uebernimm(grau("diagnostik"));
  assert.equal(aktionen.naechsteStelle(), false);
  assert.equal(ansicht("diagnostik").text, "Auf ein Röntgen haben wir verzichtet.");
});

// Entweder-oder-Stelle mitten im Abschnitt (`vor`, E-42). „t-erst“ und „t-ct“ beginnen mit einer Lücke: Ihre erste Stelle hat
// nach der Entscheidung denselben Rang wie vorher die Lücke der Stelle.
const T_LABOR = baustein("t-labor", "diagnostik", [
  { art: "text", text: "Labor: " },
  { art: "auswahl", id: "lab", label: "Labor", pflicht: true, optionen: ["unauffällig.", "auffällig."] },
]);
const T_ERST = baustein("t-erst", "diagnostik", [{ art: "auswahl", id: "erg", label: "Sonografie", pflicht: true, optionen: ["Sonografie unauffällig.", "Erguss."] }]);
const T_CT = baustein("t-ct", "diagnostik", [{ art: "auswahl", id: "ct", label: "CT", pflicht: true, optionen: ["CT unauffällig.", "CT mit Fraktur."] }]);
for (const b of [T_LABOR, T_ERST, T_CT]) store.INDEX.bausteine.set(b.id, b);
const V_MITTE = vorlage("t-v-mitte", { diagnostik: ["t-labor", "t-ct"], procedere: ["t-fest"] }, { wahl: [{ abschnitt: "diagnostik", label: "Sonografie oder Verzicht?", bausteine: ["t-erst", "t-verzicht"], vor: "t-ct" }] });
store.INDEX.vorlagen.set(V_MITTE.id, V_MITTE);

test("Durchlauf: Stelle in der Mitte des Abschnitts; Enter geht in Lesereihenfolge, nach der Wahl in den gewählten Baustein, danach weiter", async () => {
  frisch();
  store.fallNeu(V_MITTE);
  assert.equal(ansicht("diagnostik").text, "Labor: ‹Labor›\n‹Sonografie oder Verzicht?›\n‹CT›");
  aktionen.naechsteStelle();
  assert.equal(aktionen.offenesFeld.value?.key, "t-labor/lab");
  store.aendere((f) => mitAuswahl(f, "t-labor/lab", 0));
  aktionen.weiter();
  assert.equal(aktionen.offenesFeld.value?.key, "wahl/diagnostik/0");
  store.aendere((f) => mitWahl(f, "wahl/diagnostik/0", "t-erst", store.INDEX));
  aktionen.weiter();
  // Die erste Lücke des gewählten Bausteins steht dort, wo die Stelle stand, und ist der nächste Halt.
  assert.equal(ansicht("diagnostik").text, "Labor: unauffällig.\n‹Sonografie›\n‹CT›");
  assert.equal(aktionen.offenesFeld.value?.key, "t-erst/erg");
  store.aendere((f) => mitAuswahl(f, "t-erst/erg", 1));
  aktionen.weiter();
  assert.equal(aktionen.offenesFeld.value?.key, "t-ct/ct");
  store.aendere((f) => mitAuswahl(f, "t-ct/ct", 0));
  aktionen.weiter();
  // Kopiert wird in derselben Reihenfolge.
  const a = ansicht("diagnostik");
  assert.equal(a.fertig, true);
  assert.equal(await aktionen.kopiereAbschnitt(a), true);
  assert.equal(letzter(), "Labor: unauffällig.\r\nErguss.\r\nCT unauffällig.");
});

test("Durchlauf: nach „nichts davon“ an einer Stelle in der Mitte geht es mit der Lücke dahinter weiter", () => {
  frisch();
  store.fallNeu(V_MITTE);
  store.aendere((f) => mitAuswahl(f, "t-labor/lab", 0));
  aktionen.naechsteStelle();
  assert.equal(aktionen.offenesFeld.value?.key, "wahl/diagnostik/0");
  store.aendere((f) => mitWahl(f, "wahl/diagnostik/0", null, store.INDEX));
  aktionen.weiter();
  assert.equal(ansicht("diagnostik").text, "Labor: unauffällig.\n‹CT›");
  assert.equal(aktionen.offenesFeld.value?.key, "t-ct/ct");
  // Mit der Maus geöffnet und „nichts davon“: ebenso (CR-T1-05: vorher prüfte dieser Teil die Wahl eines Bausteins).
  frisch();
  store.fallNeu(V_MITTE);
  aktionen.oeffneFeld({ key: "wahl/diagnostik/0", art: "wahl", abschnitt: "diagnostik" });
  store.aendere((f) => mitWahl(f, "wahl/diagnostik/0", null, store.INDEX));
  aktionen.weiter();
  assert.equal(aktionen.offenesFeld.value?.key, "t-ct/ct");
  // Mit der Maus geöffnet und ein Baustein gewählt: weiter in dessen erste Lücke.
  frisch();
  store.fallNeu(V_MITTE);
  aktionen.oeffneFeld({ key: "wahl/diagnostik/0", art: "wahl", abschnitt: "diagnostik" });
  store.aendere((f) => mitWahl(f, "wahl/diagnostik/0", "t-erst", store.INDEX));
  aktionen.weiter();
  assert.equal(aktionen.offenesFeld.value?.key, "t-erst/erg");
});

// Durchlauf über Abschnittsgrenzen (CR-T1-01, CR-T1-02) und Gleichstand von Angabe und Befundliste im selben Block (QA-02).
const T_PROC = baustein("t-proc", "procedere", [{ art: "auswahl", id: "wie", label: "Weiterbehandlung", pflicht: true, optionen: ["Kontrolle morgen.", "Keine Kontrolle."] }]);
const T_FINGER = baustein("t-finger", "befund", [
  { art: "text", text: "Finger " },
  { art: "auswahl", id: "welcher", label: "betroffener Finger", pflicht: true, optionen: ["D2", "D3"] },
  { art: "text", text: ": " },
  { art: "befund", id: "wunde", chip: "Wunde", gruppe: "Inspektion", normal: "Keine Wunde. ", abweichung: "Wunde. " },
  { art: "befund", id: "schwellung", chip: "Schwellung", gruppe: "Inspektion", normal: "Keine Schwellung.", abweichung: "Schwellung." },
]);
for (const b of [T_PROC, T_FINGER]) store.INDEX.bausteine.set(b.id, b);
const WAHL_DG = { abschnitt: "diagnostik" as const, label: "Sonografie oder Verzicht?", bausteine: ["t-erst", "t-verzicht"] };

test("Durchlauf (CR-T1-01): „nichts davon“ an der letzten Stelle eines Abschnitts führt zum ersten Halt des nächsten", () => {
  for (const [name, abschnitte] of [
    ["Stelle hinter einem Baustein", { diagnostik: ["t-labor"], procedere: ["t-proc"] }],
    ["Abschnitt nur aus der Stelle", { procedere: ["t-proc"] }],
  ] as const) {
    frisch();
    const v = vorlage(`t-v-${name}`, abschnitte, { wahl: [WAHL_DG] });
    store.INDEX.vorlagen.set(v.id, v);
    store.fallNeu(v);
    if ("diagnostik" in abschnitte) store.aendere((f) => mitAuswahl(f, "t-labor/lab", 0));
    aktionen.naechsteStelle();
    assert.equal(aktionen.offenesFeld.value?.key, "wahl/diagnostik/0", name);
    store.aendere((f) => mitWahl(f, "wahl/diagnostik/0", null, store.INDEX));
    aktionen.weiter();
    assert.equal(aktionen.offenesFeld.value?.key, "t-proc/wie", name);
    store.INDEX.vorlagen.delete(v.id);
  }
});

test("Durchlauf (CR-T1-02): Stelle am Abschnittsanfang springt nach der Wahl nicht zurück zur freien Lücke im Abschnitt davor", () => {
  frisch();
  const v = vorlage("t-v-anfang-luecke", { diagnostik: ["t-ct"] }, { wahl: [{ ...WAHL_DG, vor: "t-ct" }] });
  store.INDEX.vorlagen.set(v.id, v);
  store.fallNeu(v);
  // Freie Ergänzung mit Lückenzeichen im Abschnitt davor: ein Halt ohne eigene Textstelle, der das Kopieren sperrt
  // (Szenario des Code-Reviews mit „Zusätzlich ‹noch eintragen›.“). Sein Rang liegt knapp unter dem der Stelle.
  store.aendere((f) => mitZusatz(f, "befund", "Zusätzlich ‹noch eintragen›."));
  aktionen.oeffneFeld({ key: "wahl/diagnostik/0", art: "wahl", abschnitt: "diagnostik" });
  store.aendere((f) => mitWahl(f, "wahl/diagnostik/0", "t-erst", store.INDEX));
  aktionen.weiter();
  assert.equal(aktionen.offenesFeld.value?.key, "t-erst/erg");
  store.INDEX.vorlagen.delete(v.id);
});

test("Durchlauf (QA-02): nach der Angabe am Anfang eines Befundblocks kommt dessen Befundliste, nicht der nächste Abschnitt", () => {
  frisch();
  const v = vorlage("t-v-finger", { befund: ["t-finger"], procedere: ["t-proc"] }, { entscheiden: ["t-finger/wunde", "t-finger/schwellung"] });
  store.INDEX.vorlagen.set(v.id, v);
  store.fallNeu(v);
  aktionen.naechsteStelle();
  assert.equal(aktionen.offenesFeld.value?.key, "t-finger/welcher");
  store.aendere((f) => mitAuswahl(f, "t-finger/welcher", 1));
  aktionen.weiter();
  assert.equal(aktionen.offeneListe.value?.bausteinId, "t-finger");
  assert.equal(aktionen.offenesFeld.value, null);
  store.INDEX.vorlagen.delete(v.id);
});

test("Durchlauf (QA-06): nach der letzten Stelle hat „… kopieren“ den Fokus, im selben Ereignis; liegt dahinter nichts, aber davor noch etwas, geht es dorthin", async () => {
  frisch();
  store.fallNeu(V_PFLICHT);
  store.aendere((f) => uebernehmen(mitSlot(f, "t-pflicht/antiko/was", "1"), ["t-pflicht/antiko"], store.INDEX));
  aktionen.oeffneFeld({ key: "t-pflicht/roe", art: "auswahl", abschnitt: "diagnostik" });
  store.aendere((f) => mitAuswahl(f, "t-pflicht/roe", 0));
  const fokus = await mitFokus(() => aktionen.weiter());
  assert.equal(aktionen.offenesFeld.value, null);
  assert.deepEqual(fokus, ["[data-naechste-kopie]"]);
  // Eine übersprungene Stelle davor: weiter geht es dort, nicht ins Leere.
  frisch();
  store.fallNeu(V_PFLICHT);
  aktionen.oeffneFeld({ key: "t-pflicht/roe", art: "auswahl", abschnitt: "diagnostik" });
  store.aendere((f) => mitAuswahl(f, "t-pflicht/roe", 0));
  aktionen.weiter();
  assert.equal(aktionen.offenesFeld.value?.key, "t-pflicht/antiko");
});

test("Durchlauf: auch eine Stelle am Ende geht nach der Wahl in den gewählten Baustein, wenn er mit einer Lücke beginnt", () => {
  // Vor E-42 sprang Enter hier über die erste Lücke des gewählten Bausteins: Sie hatte denselben Rang wie vorher die Stelle.
  frisch();
  const ende = vorlage("t-v-ende", { diagnostik: ["t-labor"], procedere: ["t-fest"] }, { wahl: [{ abschnitt: "diagnostik", label: "Sonografie oder Verzicht?", bausteine: ["t-erst", "t-verzicht"] }] });
  store.INDEX.vorlagen.set(ende.id, ende);
  store.fallNeu(ende);
  store.aendere((f) => mitAuswahl(f, "t-labor/lab", 0));
  aktionen.naechsteStelle();
  assert.equal(aktionen.offenesFeld.value?.key, "wahl/diagnostik/0");
  store.aendere((f) => mitWahl(f, "wahl/diagnostik/0", "t-erst", store.INDEX));
  aktionen.weiter();
  assert.equal(aktionen.offenesFeld.value?.key, "t-erst/erg");
  store.INDEX.vorlagen.delete(ende.id);
});

test("Durchlauf: eine mit der Maus geöffnete Stelle setzt ihn dort fort; rückwärts geht es zur Stelle davor", () => {
  frisch();
  store.fallNeu(V_ALLES);
  store.aendere((f) => mitSeite(f, "rechts"));
  aktionen.oeffneFeld({ key: "t-pflicht/roe", art: "auswahl", abschnitt: "diagnostik" });
  store.aendere((f) => mitAuswahl(f, "t-pflicht/roe", 0));
  aktionen.schliesseFeld(false);
  aktionen.naechsteStelle(true);
  assert.equal(aktionen.offenesFeld.value?.key, "t-pflicht/antiko");
});

test("Rückgängig: die erste Eingabe im neuen Fall ist ein eigener Schritt; Schließen eines Falls verändert den anderen nicht", () => {
  frisch();
  store.fallNeu(V_FELDER);
  const eins = aktiv().id;
  store.aendere((f) => mitWert(f, "t-felder/f1", "A"), "wert:t-felder/f1");
  store.fallNeu(V_FELDER);
  store.aendere((f) => mitWert(f, "t-felder/f1", "B"), "wert:t-felder/f1");
  assert.equal(store.zurueck(), true);
  assert.equal(aktiv().werte["t-felder/f1"], undefined);
  store.fallSchliessen(aktiv().id);
  assert.equal(aktiv().id, eins);
  assert.equal(aktiv().werte["t-felder/f1"], "A");
});

test("Rückgängig nennt die Stelle und ihren neuen Stand und hebt sie hervor", () => {
  frisch();
  store.fallNeu(V_BEFUND);
  store.aendere((f) => mitSeite(f, "rechts"));
  store.aendere((f) => mitBefund(f, "t-befund/n1", "ok"));
  store.aendere((f) => mitBefund(f, "t-befund/n1", "abw"));
  let fallVor = aktiv();
  let briefVor = store.brief.value;
  assert.equal(store.zurueck(), true);
  // Der Befund kippt von auffällig auf unauffällig: Das darf nicht unbemerkt geschehen.
  assert.equal(aktionen.unterschied(fallVor, briefVor), "„Druckschmerz“ (jetzt: unauffällig)");
  assert.deepEqual([...aktionen.frischeStellen.value], ["t-befund/n1"]);
  store.zurueck();
  fallVor = aktiv();
  briefVor = store.brief.value;
  assert.equal(store.zurueck(), true);
  assert.equal(aktionen.unterschied(fallVor, briefVor), "Seite (jetzt: nicht gewählt)");
});

// --- Leere Vorgeschichte in einem Schritt ----------------------------------------

const VG_LUECKEN = ["t-vg/vorerkrankungen", "t-vg/medikation", "t-vg/antiko", "t-vg/allergien"];
const offeneVg = () => ansicht("anamnese").tokens.filter((t) => t.zustand === "offen" && VG_LUECKEN.includes(t.key ?? "")).map((t) => t.key);

/** Fenster und Fokus für einen Test: Rückrufe ohne Verzögerung laufen sofort, jedes gefundene Element merkt sich, ob es den Fokus bekam. */
/**
 * Führt `lauf` aus und gibt zurück, welchen Elementen danach der Fokus gegeben wurde. Gewartet wird nur auf
 * Mikroaufgaben (`nachDemZeichnen`), nicht auf Zeitgeber: Ein Fokus, der erst per `setTimeout` käme, fehlte hier, und
 * eine vorausgetippte Taste träfe im Browser noch das alte Ziel (E-43, Grundsatz 3).
 */
async function mitFokus(lauf: () => void): Promise<string[]> {
  // Was frühere Schritte noch vorhaben, läuft vorher: Im Browser wäre es längst geschehen.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const dok = document as unknown as { querySelector: (s: string) => unknown };
  const alt = dok.querySelector;
  const fokus: string[] = [];
  dok.querySelector = (s) => ({ focus: () => fokus.push(s), scrollIntoView() {}, closest: () => null, isConnected: true });
  try {
    lauf();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  } finally {
    dok.querySelector = alt;
  }
  return fokus;
}

test("Leere Vorgeschichte: ein Klick setzt die drei Angaben in einem Schritt, die Meldung nennt jede und den Fall, der Platz des Knopfs bleibt belegt", async () => {
  frisch();
  store.fallNeu(V_VG, "rechts");
  const nr = aktiv().nr;
  // Vorher mit der Maus im Befund gewesen: Der Durchlauf geht trotzdem hinter der Vorgeschichte weiter.
  aktionen.oeffneFeld({ key: "t-befund/n1", art: "befund", abschnitt: "befund" });
  assert.deepEqual(offeneVg(), VG_LUECKEN);
  const fokus = await mitFokus(() => assert.equal(aktionen.sammelangabeSetzen("t-vg").length, 3));
  // Der Fokus bleibt an der Stelle des Knopfs, auf der Zeile, die nichts auslöst. Kein Fenster öffnet sich.
  assert.deepEqual(fokus, ['[data-sammel-erledigt="t-vg"]']);
  assert.equal(aktionen.offenesFeld.value, null);
  assert.equal(aktionen.offeneListe.value, null);
  assert.deepEqual(offeneVg(), ["t-vg/antiko"]);
  assert.equal(ansicht("anamnese").text, "Vorerkrankungen: keine bekannt. Dauermedikation: keine. Gerinnungshemmende Medikamente: ‹Gerinnungshemmung›. Allergien: keine bekannt.");
  const m = kopieren.meldung.value;
  assert.equal(m?.text, `Eingefügt in Fall ${nr}: Vorerkrankungen: keine bekannt · Dauermedikation: keine · Allergien: keine bekannt`);
  assert.equal(m?.aktion?.label, "Rückgängig");
  // Die Bestätigung gilt, solange der Block unverändert ist.
  const erledigt = aktionen.sammelErledigt.value;
  assert.equal(erledigt?.aussagen, "keine Vorerkrankungen, keine Dauermedikation, keine Allergien");
  assert.equal(erledigt?.stand, bausteinStand(aktiv(), "t-vg"));
  // F2 führt zur Gerinnungshemmung, der eigenen Frage im selben Block.
  aktionen.naechsteStelle();
  assert.equal(aktionen.offenesFeld.value?.key, "t-vg/antiko");
  store.aendere((f) => mitAngabe(f, "t-vg/antiko", "t-vg/antiko/was", "1"));
  assert.notEqual(bausteinStand(aktiv(), "t-vg"), erledigt?.stand);
  // Ein Schritt im Verlauf: Strg+Z nimmt die Gerinnungshemmung, dann alle drei zurück.
  assert.equal(store.zurueck(), true);
  assert.equal(store.zurueck(), true);
  assert.deepEqual(offeneVg(), VG_LUECKEN);
  assert.equal(store.vor(), true);
  assert.deepEqual(offeneVg(), ["t-vg/antiko"]);
  // Ein zweiter Klick ändert nichts und meldet nichts.
  kopieren.meldung.value = null;
  assert.equal(aktionen.sammelangabeSetzen("t-vg").length, 0);
  assert.equal(kopieren.meldung.value, null);
});

test("Leere Vorgeschichte: kein Knopf und kein Auffüllen, sobald eine der Angaben eingetragen ist", () => {
  frisch();
  store.fallNeu(V_VG, "rechts");
  store.aendere((f) => mitWert(f, "t-vg/medikation", "Apixaban 5 mg 1-0-1"));
  const vorher = aktiv();
  assert.equal(aktionen.sammelangabeSetzen("t-vg").length, 0);
  assert.equal(aktiv(), vorher);
  assert.equal(kopieren.meldung.value, null);
  assert.equal(aktionen.sammelErledigt.value, null);
  assert.deepEqual(offeneVg(), ["t-vg/vorerkrankungen", "t-vg/antiko", "t-vg/allergien"]);
});

test("Leere Vorgeschichte: „Rückgängig“ legt den Fokus auf die erste Angabe, nicht auf den Knopf, und F2 öffnet sie", async () => {
  frisch();
  store.fallNeu(V_VG, "rechts");
  const nr = aktiv().nr;
  aktionen.sammelangabeSetzen("t-vg");
  const m = kopieren.meldung.value!;
  store.aendere((f) => mitBefund(f, "t-befund/n1", "abw"));
  const fokus = await mitFokus(() => m.aktion!.ausfuehren());
  // Ein Enter auf diesem Element öffnet das Feld; den Knopf erreicht es nicht.
  assert.deepEqual(fokus, ['[data-key="t-vg/vorerkrankungen"]']);
  assert.equal(kopieren.meldung.value?.text, `Zurückgenommen in Fall ${nr}: Vorerkrankungen, Dauermedikation, Allergien`);
  assert.deepEqual(offeneVg(), VG_LUECKEN);
  // Was danach anderswo geändert wurde, bleibt.
  assert.equal(aktiv().befund["t-befund/n1"], "abw");
  assert.deepEqual(aktiv().werte, {});
  aktionen.naechsteStelle();
  assert.equal(aktionen.offenesFeld.value?.key, "t-vg/vorerkrankungen");
});

test("Leere Vorgeschichte: wirkungsloses „Rückgängig“ meldet „Nichts zurückzunehmen“ und gibt den Fokus an den Knopf zum Weitermachen", async () => {
  frisch();
  store.fallNeu(V_VG, "rechts");
  const nr = aktiv().nr;
  aktionen.sammelangabeSetzen("t-vg");
  const m = kopieren.meldung.value!;
  store.aendere((f) => mitWert(mitWert(mitWert(f, "t-vg/vorerkrankungen", "Diabetes mellitus Typ 2"), "t-vg/medikation", "Metformin"), "t-vg/allergien", "Penicillin"));
  const vorher = aktiv();
  const fokus = await mitFokus(() => m.aktion!.ausfuehren());
  assert.deepEqual(fokus, [".f2:not([disabled]), [data-naechste-kopie]:not([disabled])"]);
  assert.equal(kopieren.meldung.value?.text, `Nichts zurückzunehmen: Die Angaben in Fall ${nr} sind inzwischen geändert.`);
  assert.equal(aktiv(), vorher);
  // Geschlossener Fall: ebenso.
  store.fallSchliessen(vorher.id);
  m.aktion!.ausfuehren();
  assert.equal(kopieren.meldung.value?.text, "Nichts zurückzunehmen: Der Fall ist geschlossen.");
});

test("Leere Vorgeschichte: „Rückgängig“ nach Fallwechsel nimmt im ursprünglichen Fall zurück und sagt, in welchem", async () => {
  frisch();
  store.fallNeu(V_VG, "rechts");
  const eins = aktiv();
  aktionen.sammelangabeSetzen("t-vg");
  const m = kopieren.meldung.value!;
  store.fallNeu(V_VG, "links");
  // Die Bestätigung gehört zum Fall, in dem geklickt wurde.
  assert.equal(aktionen.sammelErledigt.value, null);
  store.aendere((f) => mitWert(f, "t-vg/allergien", "Penicillin"));
  await mitFokus(() => m.aktion!.ausfuehren());
  assert.equal(kopieren.meldung.value?.text, `Zurückgenommen in Fall ${eins.nr}: Vorerkrankungen, Dauermedikation, Allergien`);
  assert.deepEqual(fall(eins.id).werte, {});
  assert.equal(aktiv().werte["t-vg/allergien"], "Penicillin");
  frisch();
});

test("Verfall: alte Fälle werden auch bei offenem Fenster verworfen", () => {
  frisch();
  store.fallNeu(V_FELDER);
  const jetzt = Date.now();
  assert.equal(store.verwerfeAbgelaufene(jetzt + 3 * 3600_000), 0);
  assert.equal(store.verwerfeAbgelaufene(jetzt + 5 * 3600_000), 1);
  assert.equal(store.faelle.value.length, 0);
});

// --- Eigene Inhalte ----------------------------------------------------------

test("Eigene Vorlage: Antworten des Patienten werden nicht zur Vorgabe für den nächsten", () => {
  frisch();
  store.fallNeu(V_PFLICHT);
  store.aendere((f) => uebernehmen({ ...f, slots: { "t-pflicht/antiko/was": "1" }, auswahl: { "t-pflicht/roe": 0 }, optionen: { "t-pflicht/kontrolle": true } }, ["t-pflicht/antiko"], store.INDEX));
  assert.equal(ansicht("diagnostik").text, "Gerinnungshemmende Medikamente: keine. Röntgen: Kein Frakturnachweis. Kontrolle nach 7 Tagen.");
  assert.equal(store.eigeneVorlageSpeichern("Meine"), true);
  const v = store.eigenes.value.vorlagen[0];
  assert.deepEqual(Object.keys(v.vorgaben ?? {}).sort(), ["an", "aus"]);
  store.fallNeu(store.INDEX.vorlagen.get(v.id));
  const a = ansicht("diagnostik");
  // Der Aufbau ist da (der zugewählte Satz wird vorgeschlagen), die Antworten nicht.
  assert.match(a.text, /Gerinnungshemmende Medikamente: ‹Gerinnungshemmung›/);
  assert.match(a.text, /‹Röntgenbefund›/);
  assert.match(a.text, /Kontrolle nach 7 Tagen\./);
  assert.ok(grau("diagnostik").includes("t-pflicht/kontrolle"));
  assert.equal(a.fertig, false);
});

test("Eigene Vorlage: behält, was die Ausgangsvorlage weglässt, samt Ersatzstellen, auch wenn der Arzt den Satz im Fall an- oder abgewählt hat; ihre Schnellwerte gehen mit", () => {
  frisch();
  const basis = vorlage(
    "t-v-weglassen",
    { befund: ["t-befund"], diagnostik: ["t-pflicht", "t-roe"] },
    { weglassen: { "t-pflicht/kontrolle": ["t-roe/erg"], "t-fest/kontrolle": ["t-roe/erg"] }, schnellwerte: { "t-pflicht/kontrolle/frist": ["7 Tage"], "t-felder/f1": ["Sturz."] } },
  );
  store.INDEX.vorlagen.set(basis.id, basis);
  const speichern = (titel: string, aendern?: (f: Fall) => Fall) => {
    store.fallNeu(basis);
    if (aendern) store.aendere(aendern);
    assert.equal(store.eigeneVorlageSpeichern(titel), true);
    return store.eigenes.value.vorlagen[0];
  };
  store.fallNeu(basis);
  assert.ok(!ansicht("diagnostik").aus.some((e) => e.key === "t-pflicht/kontrolle"));
  let v = speichern("Ohne Kontrolle");
  // Nur Schlüssel zu Bausteinen des Falls; `t-fest` und `t-felder` sind nicht dabei.
  assert.deepEqual(v.weglassen, { "t-pflicht/kontrolle": ["t-roe/erg"] });
  assert.deepEqual(speicher.pruefeEigenes(store.eigenes.value, store.INDEX)?.vorlagen[0].weglassen, { "t-pflicht/kontrolle": ["t-roe/erg"] });
  // Schnellwerte je Vorlage sind Aufbau wie die Liste oben und gehen ebenso mit.
  assert.deepEqual(v.schnellwerte, { "t-pflicht/kontrolle/frist": ["7 Tage"] });
  assert.deepEqual(speicher.pruefeEigenes(store.eigenes.value, store.INDEX)?.vorlagen[0].schnellwerte, { "t-pflicht/kontrolle/frist": ["7 Tage"] });
  store.fallNeu(store.INDEX.vorlagen.get(v.id));
  assert.ok(!ansicht("diagnostik").aus.some((e) => e.key === "t-pflicht/kontrolle"));
  // Eingeschaltet oder abgewählt: Die Wahl gilt diesem Patienten. Die eigene Vorlage schlägt den Satz weder vor noch nimmt sie ihn
  // aus `weglassen` (PS-01, CR-05).
  for (const wert of [true, false]) {
    v = speichern(`Kontrolle ${wert}`, (f) => ({ ...f, optionen: { ...f.optionen, "t-pflicht/kontrolle": wert } }));
    assert.deepEqual(v.weglassen, { "t-pflicht/kontrolle": ["t-roe/erg"] });
    assert.ok(!v.vorgaben?.an?.includes("t-pflicht/kontrolle") && !v.vorgaben?.aus?.includes("t-pflicht/kontrolle"));
    store.fallNeu(store.INDEX.vorlagen.get(v.id));
    assert.ok(!ansicht("diagnostik").text.includes("Kontrolle nach 7 Tagen"));
    assert.ok(!ansicht("diagnostik").aus.some((e) => e.key === "t-pflicht/kontrolle"));
  }
  // Ohne den Baustein mit der Ersatzstelle hat der Satz in der eigenen Vorlage keinen Ersatz und bleibt zuwählbar.
  v = speichern("Ohne Röntgen", (f) => ohneBaustein(f, "t-roe"));
  assert.deepEqual(v.weglassen, {});
  store.fallNeu(store.INDEX.vorlagen.get(v.id));
  assert.ok(ansicht("diagnostik").aus.some((e) => e.key === "t-pflicht/kontrolle"));
  store.INDEX.vorlagen.delete(basis.id);
});

test("Eigene Vorlage: Entweder-oder-Stellen bleiben; offen bleibt offen, entschieden ist wieder offen", () => {
  frisch();
  const basis = vorlage(
    "t-v-wahl-eigen",
    { befund: ["t-knie"] },
    { entscheiden: ["t-knie/baender"], vorgaben: { aus: ["t-verzicht/satz"] }, wahl: [{ abschnitt: "diagnostik", label: "Röntgen oder Verzicht?", bausteine: ["t-roe", "t-verzicht"] }] },
  );
  store.INDEX.vorlagen.set(basis.id, basis);
  const luecke = /‹Röntgen oder Verzicht\?›/;
  const pruefe = (v: Vorlage) => {
    assert.deepEqual(v.wahl, basis.wahl);
    // Fest in der Ausgangsvorlage bleibt fest; was nur über die Stelle kam, steht nicht in `abschnitte`.
    assert.deepEqual(Object.values(v.abschnitte).flat(), ["t-knie"]);
    // Angaben der Vorlage zu Bausteinen der Stelle gehen mit, auch wenn der Baustein im Fall nicht gewählt ist.
    assert.deepEqual(v.vorgaben?.aus, ["t-verzicht/satz"]);
    assert.deepEqual(speicher.pruefeEigenes(store.eigenes.value, store.INDEX)?.vorlagen.find((x) => x.id === v.id)?.wahl, basis.wahl);
    store.fallNeu(store.INDEX.vorlagen.get(v.id));
    const a = ansicht("diagnostik");
    assert.match(a.text, luecke);
    assert.ok(!a.text.includes("Röntgen:"), "die Wahl des früheren Falls steht im Brief");
    assert.equal(a.fertig, false);
  };
  // Stelle im Fall noch offen.
  store.fallNeu(basis);
  assert.match(ansicht("diagnostik").text, luecke);
  assert.equal(store.eigeneVorlageSpeichern("Offen"), true);
  pruefe(store.eigenes.value.vorlagen[0]);
  // Stelle im Fall entschieden: Röntgen gewählt.
  store.fallNeu(basis);
  store.aendere((f) => mitWahl(f, "wahl/diagnostik/0", "t-roe", store.INDEX));
  assert.match(ansicht("diagnostik").text, /Röntgen: ‹Röntgenbefund›/);
  assert.equal(store.eigeneVorlageSpeichern("Röntgen gewählt"), true);
  pruefe(store.eigenes.value.vorlagen[0]);
  // Stelle bewusst leer gelassen.
  store.fallNeu(basis);
  store.aendere((f) => mitWahl(f, "wahl/diagnostik/0", null, store.INDEX));
  assert.ok(!luecke.test(ansicht("diagnostik").text));
  assert.equal(store.eigeneVorlageSpeichern("Nichts davon"), true);
  pruefe(store.eigenes.value.vorlagen[0]);
  store.INDEX.vorlagen.delete(basis.id);
});

test("Eigene Vorlage: die Stelle behält ihren Platz; fehlt ihr Baustein im Fall, rückt sie vor den nächsten oder ans Ende", () => {
  frisch();
  const anfang = vorlage("t-v-anfang", { diagnostik: ["t-labor", "t-ct"] }, { wahl: [{ abschnitt: "diagnostik", label: "Sonografie oder Verzicht?", bausteine: ["t-erst", "t-verzicht"], vor: "t-labor" }] });
  store.INDEX.vorlagen.set(anfang.id, anfang);
  const speichern = (titel: string) => {
    assert.equal(store.eigeneVorlageSpeichern(titel), true);
    const v = store.eigenes.value.vorlagen[0];
    // Was gespeichert ist, nimmt auch die Prüfung beim Einfügen so an.
    assert.deepEqual(speicher.pruefeEigenes(store.eigenes.value, store.INDEX)?.vorlagen.find((x) => x.id === v.id)?.wahl, v.wahl);
    store.fallNeu(store.INDEX.vorlagen.get(v.id));
    return { v, text: ansicht("diagnostik").text };
  };
  // Offen, gewählt, bewusst leer: Die eigene Vorlage fragt an derselben Stelle.
  for (const entscheide of [(f: Fall) => f, (f: Fall) => mitWahl(f, "wahl/diagnostik/0", "t-erst", store.INDEX), (f: Fall) => mitWahl(f, "wahl/diagnostik/0", null, store.INDEX)]) {
    store.fallNeu(V_MITTE);
    store.aendere(entscheide);
    const { v, text } = speichern("Mitte");
    assert.equal(v.wahl?.[0].vor, "t-ct");
    assert.equal(text, "Labor: ‹Labor›\n‹Sonografie oder Verzicht?›\n‹CT›");
  }
  // Der Baustein aus `vor` ist entfernt: vor den nächsten der Ausgangsvorlage.
  store.fallNeu(anfang);
  store.aendere((f) => ohneBaustein(f, "t-labor"));
  assert.equal(ansicht("diagnostik").text, "‹Sonografie oder Verzicht?›\n‹CT›");
  let gespeichert = speichern("Ohne Labor");
  assert.equal(gespeichert.v.wahl?.[0].vor, "t-ct");
  assert.equal(gespeichert.text, "‹Sonografie oder Verzicht?›\n‹CT›");
  // Kein Nachfolger mehr im Fall: am Ende, wie im Fall.
  store.fallNeu(V_MITTE);
  store.aendere((f) => ohneBaustein(f, "t-ct"));
  gespeichert = speichern("Ohne CT");
  assert.equal(gespeichert.v.wahl?.[0].vor, undefined);
  assert.equal(gespeichert.text, "Labor: ‹Labor›\n‹Sonografie oder Verzicht?›");
  store.INDEX.vorlagen.delete(anfang.id);
});

test("Eigene Inhalte einfügen: ein Platz, der ins Leere zeigt, entfällt; der Formatstand nennt das neue Feld", () => {
  frisch();
  const stelle = (vor: unknown) => ({ abschnitt: "diagnostik", label: "Sonografie oder Verzicht?", bausteine: ["t-erst", "t-verzicht"], vor });
  const mit = (vor: unknown) =>
    speicher.pruefeEigenes({ bausteine: [], vorlagen: [{ id: "eigen-platz", titel: "Platz", setting: "zna", region: "eigen", status: "eigen", abschnitte: { diagnostik: ["t-labor", "t-ct"], procedere: ["t-fest"] }, wahl: [stelle(vor)] }] }, store.INDEX)?.vorlagen[0].wahl?.[0];
  assert.equal(mit("t-ct")?.vor, "t-ct");
  for (const falsch of ["t-fest", "t-erst", "gibt-es-nicht", 3, null, ""]) {
    const w = mit(falsch);
    assert.ok(w, `Vorlage verworfen bei vor=${String(falsch)}`);
    assert.equal("vor" in w, false, `vor=${String(falsch)} übernommen`);
  }
});

test("Eigener Baustein: wird nicht gelöscht, solange ein offener Fall ihn verwendet", () => {
  frisch();
  store.eigenenBausteinSpeichern("Mein Text", "procedere", "Schonung für 2 Wochen.");
  const id = store.eigenes.value.bausteine[0].id;
  store.fallNeu(V_FELDER);
  store.aendere((f) => ({ ...f, bausteine: { ...f.bausteine, procedere: [store.eigeneBausteinId(id)] } }));
  assert.equal(ansicht("procedere").text, "Schonung für 2 Wochen.");
  assert.equal(ansicht("procedere").fertig, false, "eigener Text ist zuerst ein Vorschlag");
  assert.equal(store.eigenenBausteinLoeschen(id), false);
  assert.equal(ansicht("procedere").text, "Schonung für 2 Wochen.");
  store.fallSchliessen(aktiv().id);
  assert.equal(store.eigenenBausteinLoeschen(id), true);
});

test("Eigene Inhalte einfügen: nur vollständig gültige, nichts Mitgeliefertes wird verdrängt", () => {
  assert.equal(speicher.pruefeEigenes({ bausteine: [], vorlagen: [{ id: "zna-osg-distorsion", titel: "x", setting: "zna", abschnitte: {} }] }, store.INDEX), null);
  assert.equal(speicher.pruefeEigenes({ bausteine: [], vorlagen: [{ id: "eigen-abc", titel: "x", setting: "zna", abschnitte: "kaputt" }] }, store.INDEX), null);
  assert.equal(speicher.pruefeEigenes({ bausteine: [{ id: "a1", titel: "T", abschnitt: "procedere", text: "Mit ‹Lücke›" }], vorlagen: [] }, store.INDEX), null);
  const ok = speicher.pruefeEigenes({ bausteine: [{ id: "a1", titel: "T", abschnitt: "procedere", text: "Text." }], vorlagen: [{ id: "eigen-abc", titel: "x", setting: "zna", abschnitte: { procedere: ["t-fest"] }, vorgaben: { an: ["t-fest/kontrolle"], slots: { "t-pflicht/antiko/was": 1 } } }] }, store.INDEX);
  assert.ok(ok);
  // Antworten in den Vorgaben einer eingefügten Vorlage werden verworfen.
  assert.deepEqual(ok.vorlagen[0].vorgaben, { an: ["t-fest/kontrolle"], aus: [] });
  // Ältere Texte ohne Stellen, `weglassen` und Schnellwerte gelten als Vorlage ohne sie.
  assert.deepEqual([ok.vorlagen[0].wahl, ok.vorlagen[0].weglassen, ok.vorlagen[0].schnellwerte], [[], {}, {}]);
});

test("Eigene Inhalte als Text: mit Formatstand; Text aus einer neueren Fassung wird abgewiesen, älterer ohne Nummer bleibt einfügbar", () => {
  // Ein älterer Stand ließe unbekannte Felder still fallen, etwa die Entweder-oder-Stellen (PS-05, G-58).
  frisch();
  store.fallNeu(V_WAHL);
  assert.equal(store.eigeneVorlageSpeichern("Mit Stelle"), true);
  const roh = JSON.parse(speicher.eigenesAlsText(store.eigenes.value));
  // Ohne `vor` genügt Formatstand 2; so liest auch ein älterer Stand den Text (CR-T1-06).
  assert.equal(roh.format, 2);
  assert.deepEqual(speicher.pruefeEigenes(roh, store.INDEX), store.eigenes.value);
  const neuer = { ...roh, format: speicher.EIGENES_FORMAT + 1 };
  assert.equal(speicher.ausNeuererFassung(neuer), true);
  assert.equal(speicher.pruefeEigenes(neuer, store.INDEX), null);
  const { format: _, ...ohneNummer } = roh;
  assert.equal(speicher.ausNeuererFassung(ohneNummer), false);
  assert.deepEqual(speicher.pruefeEigenes(ohneNummer, store.INDEX), store.eigenes.value);
  assert.ok(speicher.pruefeEigenes({ ...roh, format: 1 }, store.INDEX));
  assert.equal(speicher.pruefeEigenes({ ...roh, format: "2" }, store.INDEX), null);
  assert.equal(speicher.ausNeuererFassung(null), false);
});

test("Eigene Inhalte einfügen: fehlerhafte Entweder-oder-Stellen verwerfen den Text; `null` gilt wie fehlend", () => {
  const mit = (v: Record<string, unknown>) => speicher.pruefeEigenes({ bausteine: [], vorlagen: [{ id: "eigen-abc", titel: "x", setting: "zna", abschnitte: { diagnostik: ["t-pflicht"] }, ...v }] }, store.INDEX);
  const stelle = (bausteine: string[]) => ({ abschnitt: "diagnostik", label: "Röntgen oder Verzicht?", bausteine });
  assert.equal(mit({ wahl: [stelle([])] }), null, "Stelle ohne Bausteine");
  assert.equal(mit({ wahl: [stelle(["t-roe"]), stelle(["t-roe", "t-verzicht"])] }), null, "Baustein an zwei Stellen");
  assert.equal(mit({ wahl: [stelle(["t-pflicht", "t-roe"])] }), null, "Baustein zugleich fest und an einer Stelle");
  assert.equal(mit({ wahl: [{ abschnitt: "diagnostik", label: " ", bausteine: ["t-roe"] }] }), null, "Stelle ohne Frage");
  assert.equal(mit({ wahl: "kaputt" }), null);
  for (const leer of [{ wahl: null }, { weglassen: null }, { schnellwerte: null }, { vorgaben: null }, { weglassen: ["t-pflicht/kontrolle"] }]) {
    const e = mit(leer);
    assert.ok(e, JSON.stringify(leer));
    assert.deepEqual([e.vorlagen[0].wahl, e.vorlagen[0].weglassen, e.vorlagen[0].schnellwerte], [[], {}, {}]);
  }
});

test("Eigene Inhalte einfügen: `weglassen` nur mit gültigen Sätzen und Ersatzstellen dieser Vorlage, Schnellwerte gefiltert wie die eigenen", () => {
  const e = speicher.pruefeEigenes(
    {
      bausteine: [],
      vorlagen: [
        {
          id: "eigen-abc",
          titel: "x",
          setting: "zna",
          abschnitte: { befund: ["t-befund"], diagnostik: ["t-pflicht", "t-roe"] },
          weglassen: {
            "t-pflicht/kontrolle": ["t-roe/erg", "t-felder/f1", "t-pflicht/roe"],
            "t-pflicht/antiko": ["t-roe/erg"],
            "t-befund/n1": ["t-roe/erg"],
            "t-fest/kontrolle": ["t-roe/erg"],
            "t-pflicht/roe": "kaputt",
          },
          schnellwerte: {
            "t-pflicht/kontrolle/frist": ["", "  7 Tage ", "mit ‹Lücke›", 7, "7 Tage"],
            "t-pflicht/leer": [],
            "t-pflicht/kaputt": ["", "‹›"],
            "t-felder/f1": ["Sturz."],
            "t-pflicht/nichts": null,
          },
        },
      ],
    },
    store.INDEX,
  );
  assert.ok(e);
  // Ein vorgeschlagener Satz, ein Befund, ein Satz außerhalb der Vorlage und eine Ersatzstelle im eigenen Baustein gelten nicht (PS-03, PS-04).
  assert.deepEqual(e.vorlagen[0].weglassen, { "t-pflicht/kontrolle": ["t-roe/erg"] });
  // Eine leere Liste heißt „keine“; eine, von der nichts Brauchbares bleibt, gilt nicht (CR-04, PS-06).
  assert.deepEqual(e.vorlagen[0].schnellwerte, { "t-pflicht/kontrolle/frist": ["7 Tage"], "t-pflicht/leer": [] });
});

test("Eigene Vorlage: eine Frage, die Baustein oder Ausgangsvorlage stellt, bleibt gestellt, auch wenn der Arzt den Satz im Fall entfernt hat (B-1)", () => {
  frisch();
  const frage = /Gerinnungshemmende Medikamente: ‹Gerinnungshemmung›/;
  store.fallNeu(V_PFLICHT);
  assert.match(ansicht("diagnostik").text, frage);
  store.aendere((f) => ({ ...f, optionen: { ...f.optionen, "t-pflicht/antiko": false } }));
  assert.ok(!ansicht("diagnostik").text.includes("Gerinnungshemmende"));
  assert.equal(store.eigeneVorlageSpeichern("Ohne Frage"), true);
  const v = store.eigenes.value.vorlagen[0];
  assert.ok(!v.vorgaben?.aus?.includes("t-pflicht/antiko"), "die entfernte Frage wurde zur Vorgabe");
  store.fallNeu(store.INDEX.vorlagen.get(v.id));
  assert.match(ansicht("diagnostik").text, frage);
  // Ein Satz ohne Pflichtangabe ist keine Frage: Entfernt bleibt er in der eigenen Vorlage aus.
  store.fallNeu(V_BEFUND);
  store.aendere((f) => ({ ...f, optionen: { ...f.optionen, "t-fest/kontrolle": false } }));
  assert.equal(store.eigeneVorlageSpeichern("Ohne Kontrolle"), true);
  assert.ok(store.eigenes.value.vorlagen[0].vorgaben?.aus?.includes("t-fest/kontrolle"));
  // Schaltet die Ausgangsvorlage die Frage ab, erbt die eigene Vorlage das, auch über Laden und Einfügen.
  const basis = vorlage("t-v-ohne-frage", { diagnostik: ["t-pflicht"] }, { vorgaben: { aus: ["t-pflicht/antiko"] } });
  store.INDEX.vorlagen.set(basis.id, basis);
  store.fallNeu(basis);
  assert.equal(store.eigeneVorlageSpeichern("Geerbt"), true);
  assert.ok(store.eigenes.value.vorlagen[0].vorgaben?.aus?.includes("t-pflicht/antiko"));
  assert.ok(speicher.pruefeEigenes(store.eigenes.value, store.INDEX)?.vorlagen[0].vorgaben?.aus?.includes("t-pflicht/antiko"));
  store.INDEX.vorlagen.delete(basis.id);
  // Ein eingefügter Text, der die Frage abschaltet, obwohl keine mitgelieferte Vorlage das tut, verliert diesen Eintrag.
  const e = speicher.pruefeEigenes(
    { bausteine: [], vorlagen: [{ id: "eigen-abc", titel: "x", setting: "zna", abschnitte: { diagnostik: ["t-pflicht"], procedere: ["t-fest"] }, vorgaben: { aus: ["t-pflicht/antiko", "t-fest/kontrolle"] } }] },
    store.INDEX,
  );
  assert.deepEqual(e?.vorlagen[0].vorgaben?.aus, ["t-fest/kontrolle"]);
});

test("Eigene Vorlage: was die Prüfung beim Laden verwürfe, wird gar nicht erst gespeichert", () => {
  frisch();
  // Eine Stelle ohne Bausteine ist ein Katalogfehler; gespeichert verlöre der Arbeitsplatz beim nächsten Laden alle eigenen Inhalte (CR-06).
  assert.equal(store.eigeneVorlageSpeichern("Vorher"), false, "ohne Fall wird nichts gespeichert");
  store.fallNeu(V_BEFUND);
  assert.equal(store.eigeneVorlageSpeichern("Gut"), true);
  const vorher = lokalerSpeicher.getItem("kitteltext3.eigenes");
  const kaputt = vorlage("t-v-kaputt", { befund: ["t-befund"] }, { wahl: [{ abschnitt: "diagnostik", label: "Kaputt?", bausteine: [] }] });
  store.INDEX.vorlagen.set(kaputt.id, kaputt);
  store.fallNeu(kaputt);
  assert.equal(store.eigeneVorlageSpeichern("Kaputt"), false);
  assert.equal(store.eigenes.value.vorlagen.length, 1);
  assert.equal(lokalerSpeicher.getItem("kitteltext3.eigenes"), vorher);
  store.INDEX.vorlagen.delete(kaputt.id);
});

test("Eigene Vorlage: Rundreise über alle Katalogvorlagen; was gespeichert wird, kommt beim Laden unverändert zurück", () => {
  const katalog = [...store.INDEX.vorlagen.values()].filter((v) => !v.id.startsWith("t-") && v.status !== "eigen");
  assert.ok(katalog.length > 100);
  const fehler: string[] = [];
  for (const basis of katalog) {
    frisch();
    store.fallNeu(basis);
    // Jede Stelle entschieden: Die eigene Vorlage muss sie trotzdem offen tragen.
    (basis.wahl ?? []).forEach((w, nr) => store.aendere((f) => mitWahl(f, `wahl/${w.abschnitt}/${nr}`, w.bausteine[0], store.INDEX)));
    if (!store.eigeneVorlageSpeichern("Rundreise")) {
      fehler.push(`${basis.id}: nicht gespeichert`);
      continue;
    }
    const v = store.eigenes.value.vorlagen[0];
    const geladen = speicher.pruefeEigenes(JSON.parse(lokalerSpeicher.getItem("kitteltext3.eigenes") ?? "null"), store.INDEX)?.vorlagen[0];
    if (JSON.stringify(geladen) !== JSON.stringify(v)) fehler.push(`${basis.id}: geladen anders als gespeichert`);
    if (JSON.stringify(v.wahl) !== JSON.stringify(basis.wahl ?? [])) fehler.push(`${basis.id}: Entweder-oder-Stellen anders`);
    if (JSON.stringify(v.weglassen) !== JSON.stringify(basis.weglassen ?? {})) fehler.push(`${basis.id}: weglassen anders`);
  }
  frisch();
  assert.deepEqual(fehler, []);
});

// --- Robustheit --------------------------------------------------------------

test("Eigene Schnellwerte: merken, vergessen, Grenzen; unbrauchbare Einträge werden beim Laden ausgelassen", () => {
  frisch();
  assert.equal(store.schnellwertMerken("Schmerzmittel", "  Ibuprofen 600 mg bei Bedarf, höchstens 3-mal täglich  "), true);
  assert.equal(store.schnellwertMerken("Schmerzmittel", "Metamizol 500 mg bei Bedarf, höchstens 4-mal täglich"), true);
  // Zuletzt gemerkt steht vorn; derselbe Text wird nicht doppelt geführt.
  store.schnellwertMerken("Schmerzmittel", "Ibuprofen 600 mg bei Bedarf, höchstens 3-mal täglich");
  assert.deepEqual(store.schnellwerteFuer("Schmerzmittel"), ["Ibuprofen 600 mg bei Bedarf, höchstens 3-mal täglich", "Metamizol 500 mg bei Bedarf, höchstens 4-mal täglich"]);
  // Felder mit anderer Bezeichnung sehen sie nicht (Kindervorlage hat eine eigene Bezeichnung).
  assert.deepEqual(store.schnellwerteFuer("Schmerzmittel beim Kind (nach Körpergewicht)"), []);
  // Lücken und Leeres werden nicht gemerkt.
  assert.equal(store.schnellwertMerken("Schmerzmittel", "Ibuprofen ‹Dosis›"), false);
  assert.equal(store.schnellwertMerken("Schmerzmittel", "   "), false);
  store.schnellwertVergessen("Schmerzmittel", "Metamizol 500 mg bei Bedarf, höchstens 4-mal täglich");
  assert.deepEqual(store.schnellwerteFuer("Schmerzmittel"), ["Ibuprofen 600 mg bei Bedarf, höchstens 3-mal täglich"]);
  // Eigene Bausteine und Vorlagen bleiben daneben erhalten.
  assert.equal(store.eigenenBausteinSpeichern("Mein Satz", "procedere", "Kontrolle in der Praxis."), true);
  assert.deepEqual(store.schnellwerteFuer("Schmerzmittel"), ["Ibuprofen 600 mg bei Bedarf, höchstens 3-mal täglich"]);
  // Eingefügter Bestand: Unbrauchbares fällt heraus, der Rest bleibt.
  const geprueft = speicher.pruefeEigenes({ bausteine: [], vorlagen: [], schnellwerte: { Schmerzmittel: ["gut", "", "mit ‹Lücke›", 7], "": ["x"], Kaputt: "kein Feld" } }, store.INDEX);
  assert.deepEqual(geprueft?.schnellwerte, { Schmerzmittel: ["gut"] });
  frisch();
});

test("Gesperrter Speicher: nichts wirft, die App meldet es", () => {
  frisch();
  lokalerSpeicher.gesperrt = true;
  sitzungsSpeicher.gesperrt = true;
  assert.equal(speicher.liesRoh("irgendwas"), null);
  assert.doesNotThrow(() => store.fallNeu(V_FELDER));
  assert.equal(store.speichernMoeglich.value, false);
  assert.equal(store.eigenenBausteinSpeichern("T", "procedere", "Text."), false);
  lokalerSpeicher.gesperrt = false;
  sitzungsSpeicher.gesperrt = false;
});

test("Befund über den Store: auffällig, dann Fallwechsel, dann zurück: der Zustand gehört zum Fall", () => {
  frisch();
  store.fallNeu(V_BEFUND, "rechts");
  const a = aktiv().id;
  store.aendere((f) => mitBefund(f, "t-befund/n1", "abw"));
  store.fallNeu(V_BEFUND, "links");
  assert.equal(aktiv().befund["t-befund/n1"], undefined);
  store.fallWaehlen(a);
  assert.equal(aktiv().befund["t-befund/n1"], "abw");
});

test("Verwerfen nach langer Ruhe nimmt den Auszug „Zuletzt kopiert“ des verworfenen Falls mit (QA-16)", () => {
  frisch();
  store.fallNeu(V_PFLICHT);
  const id = store.aktivId.value!;
  const kopie = { fallId: id, abschnitt: "diagnostik" as const, was: "Diagnostik", fall: "Fall 1", um: Date.now(), zeichen: 12, anfang: "Röntgen …", platzhalter: 0 };
  aktionen.letzteKopie.value = kopie;
  // Nichts verworfen: Der Auszug bleibt.
  assert.equal(aktionen.verwerfeAlte(Date.now()), 0);
  assert.deepEqual(aktionen.letzteKopie.value, kopie);
  // Länger als jede Ablaufzeit: Fall und Auszug sind weg.
  assert.equal(aktionen.verwerfeAlte(Date.now() + 13 * 3600_000), 1);
  assert.equal(aktionen.letzteKopie.value, null);
});

test("CR-R6-09: „Zuletzt kopiert“ und die Abschrift von Hand gehen mit einem behaltenen Fall, der ohne den Brief vor Augen zugeht; nach dem Reiter-× bleiben sie", () => {
  const SCHLUESSEL = "kitteltext3.behalten";
  const behalten = (kurz: string) => {
    store.setzeEinstellung("stationBehalten", true);
    store.fallNeu(store.INDEX.vorlagen.get("station-frei")!);
    const id = store.aktivId.value!;
    assert.equal(store.fallBehalten(id, kurz), "ok");
    aktionen.letzteKopie.value = { fallId: id, abschnitt: "verlauf", was: "Verlauf", fall: `„${kurz}“`, um: Date.now(), zeichen: 30, anfang: "Brieftext des Patienten", platzhalter: 0, fassung: null };
    aktionen.handkopie.value = { fallId: id, was: "Verlauf", text: "Brieftext des Patienten" };
    return id;
  };
  const weg = () => [aktionen.letzteKopie.value, aktionen.handkopie.value];
  try {
    // Ein anderes Fenster löscht ihn; dieses erfährt es über `storage`.
    frisch();
    let id = behalten("Zi 60");
    lokalerSpeicher.removeItem(SCHLUESSEL);
    store.fuerTests.behaltenNeuGelesen();
    assert.equal(store.istBehalten(id), false);
    assert.deepEqual(weg(), [null, null], "anderes Fenster");

    // Nach drei Tagen in der Minutenprüfung; verworfen wird dabei kein Sitzungsfall (früher blieb der Auszug dann stehen).
    frisch();
    id = behalten("Zi 61");
    assert.equal(aktionen.verwerfeAlte(Date.now() + 72 * 3600_000 + 60_000), 0);
    assert.deepEqual(weg(), [null, null], "Ablauf");

    // Gelöscht aus der Liste „Behaltene Fälle“.
    frisch();
    id = behalten("Zi 62");
    assert.ok(store.behaltenLoeschen(id));
    assert.deepEqual(weg(), [null, null], "aus der Liste gelöscht");

    // Mit dem Reiter geschlossen: Der Hinweis, was in der Zwischenablage liegt, bleibt; läuft der Fall dann ab, geht er.
    frisch();
    id = behalten("Zi 65");
    store.fallSchliessen(id);
    assert.equal(aktionen.letzteKopie.value?.fallId, id);
    aktionen.verwerfeAlte(Date.now() + 72 * 3600_000 + 60_000);
    assert.deepEqual(weg(), [null, null], "hier geschlossen, dann abgelaufen");

    // Ebenso beim Wiederöffnen und nach „Alles kopiert · Fall löschen“.
    frisch();
    id = behalten("Zi 63");
    store.fallSchliessen(id);
    assert.equal(aktionen.letzteKopie.value?.fallId, id);
    assert.equal(store.behaltenOeffnen(id), "ok");
    store.fallSchliessen(id, true);
    assert.equal(aktionen.letzteKopie.value?.fallId, id, "nach „Alles kopiert · Fall löschen“");
  } finally {
    store.setzeEinstellung("stationBehalten", false);
    frisch();
  }
});

test("CR-R6-09: Wer einen Fall aus „Behaltene Fälle“ wieder öffnet, nachdem ein anderes Fenster ihn geholt hatte, verliert den neuen Auszug nicht", () => {
  frisch();
  store.setzeEinstellung("stationBehalten", true);
  try {
    store.fallNeu(store.INDEX.vorlagen.get("station-frei")!);
    const id = store.aktivId.value!;
    assert.equal(store.fallBehalten(id, "Zi 64"), "ok");
    const roh = JSON.parse(lokalerSpeicher.getItem("kitteltext3.behalten")!);
    roh.faelle[0] = { ...roh.faelle[0], stand: roh.faelle[0].stand + 1, fenster: "anderes-fenster" };
    lokalerSpeicher.setItem("kitteltext3.behalten", JSON.stringify(roh));
    store.fuerTests.behaltenNeuGelesen();
    assert.equal(store.istBehalten(id), false);
    assert.ok(store.ohneBriefZu.value.has(id));
    assert.equal(store.behaltenOeffnen(id), "ok");
    assert.equal(store.ohneBriefZu.value.has(id), false);
    aktionen.letzteKopie.value = { fallId: id, abschnitt: "verlauf", was: "Verlauf", fall: "„Zi 64“", um: Date.now(), zeichen: 30, anfang: "neu kopiert", platzhalter: 0, fassung: null };
    store.fallNeu(store.INDEX.vorlagen.get("station-frei")!);
    assert.equal(aktionen.letzteKopie.value?.anfang, "neu kopiert");
  } finally {
    store.setzeEinstellung("stationBehalten", false);
    frisch();
  }
});

test("CR-R6-14: Die Meldung nach dem Schließen hängt am Ergebnis; „Rückgängig“ steht nur dabei, wenn es etwas zurückzuholen gibt, und sagt, wenn es scheitert", () => {
  const SCHLUESSEL = "kitteltext3.behalten";
  const behalten = (kurz: string): Fall => {
    store.setzeEinstellung("stationBehalten", true);
    store.fallNeu(store.INDEX.vorlagen.get("station-frei")!);
    assert.equal(store.fallBehalten(store.aktivId.value!, kurz), "ok");
    return store.aktiverFall.value!;
  };
  /** Was ein anderes Fenster täte, ohne dass das Ereignis hier ankommt. */
  const fremd = (id: string, fn: (e: Record<string, unknown>) => Record<string, unknown> | null) => {
    const roh = JSON.parse(lokalerSpeicher.getItem(SCHLUESSEL)!) as { faelle: Record<string, unknown>[] };
    roh.faelle = roh.faelle.map((e) => (e.id === id ? fn(e) : e)).filter((e): e is Record<string, unknown> => e !== null);
    lokalerSpeicher.setItem(SCHLUESSEL, JSON.stringify(roh));
  };
  const geholt = (e: Record<string, unknown>) => ({ ...e, stand: (e.stand as number) + 1, fenster: "anderes-fenster" });
  const m = () => kopieren.meldung.value!;
  try {
    // Fall nur dieses Fensters.
    frisch();
    store.fallNeu(store.INDEX.vorlagen.get("zna-frei")!);
    let f = store.aktiverFall.value!;
    aktionen.schliesseFall(f);
    assert.deepEqual([m().text, m().art, m().aktion?.label], [`Fall ${f.nr} geschlossen.`, "ok", "Rückgängig"]);
    m().aktion!.ausfuehren();
    assert.equal(store.aktivId.value, f.id);

    // Behalten: mit dem Reiter geschlossen, dann gelöscht; der Zusatz der Prüfleiste hängt an.
    frisch();
    f = behalten("Zi 90");
    aktionen.schliesseFall(f);
    assert.match(m().text, new RegExp(`^Fall ${f.nr} geschlossen\\. „Zi 90“ bleibt behalten und wird .+ gelöscht; wieder öffnen unter „Behaltene Fälle“ \\(Strg\\+K\\)\\.$`));
    m().aktion!.ausfuehren();
    assert.ok(store.istBehalten(f.id));
    aktionen.schliesseFall(f, true, " Im KIS noch zu ergänzen: [DATUM].", true);
    assert.deepEqual([m().text, m().art, m().aktion?.label], [`Fall ${f.nr} geschlossen und „Zi 90“ vom PC gelöscht. Im KIS noch zu ergänzen: [DATUM].`, "warnung", "Rückgängig"]);

    // Ein anderes Fenster hat ihn geholt: nicht „bleibt behalten“, nicht „gelöscht“, kein „Rückgängig“, das nichts täte.
    for (const loeschen of [false, true]) {
      frisch();
      f = behalten("Zi 91");
      fremd(f.id, geholt);
      aktionen.schliesseFall(f, loeschen);
      const text = loeschen
        ? `Fall ${f.nr} hier geschlossen, nicht gelöscht: „Zi 91“ ist inzwischen in einem anderen Fenster geöffnet oder geändert.`
        : `Fall ${f.nr} hier geschlossen. „Zi 91“ ist inzwischen in einem anderen Fenster geöffnet oder geändert.`;
      assert.deepEqual([m().text, m().art, m().aktion], [text, "warnung", undefined]);
    }

    // Dort schon gelöscht.
    frisch();
    f = behalten("Zi 92");
    fremd(f.id, () => null);
    aktionen.schliesseFall(f, true);
    assert.deepEqual([m().text, m().art, m().aktion], [`Fall ${f.nr} geschlossen. „Zi 92“ war schon vom PC gelöscht (abgelaufen oder in einem anderen Fenster).`, "warnung", undefined]);

    // Der Browser verweigert den Zugriff: Die Meldung sagt nicht „gelöscht“.
    frisch();
    f = behalten("Zi 93");
    lokalerSpeicher.gesperrt = true;
    aktionen.schliesseFall(f, true);
    lokalerSpeicher.gesperrt = false;
    assert.deepEqual(
      [m().text, m().art, m().aktion],
      [`Fall ${f.nr} geschlossen, „Zi 93“ aber nicht vom PC gelöscht: Der Browser hat das Löschen verweigert. Er liegt weiter unter „Behaltene Fälle“ (Strg+K). Bitte melden.`, "fehler", undefined],
    );
    assert.ok(lokalerSpeicher.getItem(SCHLUESSEL)!.includes("Zi 93"));

    // „Rückgängig“, nachdem ein anderes Fenster den Fall geöffnet hat: Meldung statt stillem Nichts oder stillem Holen.
    frisch();
    f = behalten("Zi 94");
    aktionen.schliesseFall(f);
    fremd(f.id, geholt);
    m().aktion!.ausfuehren();
    assert.deepEqual([m().text, m().art], ["„Zi 94“ ist inzwischen in einem anderen Fenster geöffnet. Hierher holen unter „Behaltene Fälle“ (Strg+K).", "fehler"]);
    assert.equal(store.faelle.value.length, 0);

    // „Rückgängig“ nach dem Löschen, inzwischen abgelaufen.
    frisch();
    f = behalten("Zi 95");
    aktionen.schliesseFall(f, true);
    const echt = Date.now;
    Date.now = () => echt() + 72 * 3600_000 + 60_000;
    try {
      m().aktion!.ausfuehren();
    } finally {
      Date.now = echt;
    }
    assert.deepEqual([m().text, m().art], ["Diesen behaltenen Fall gibt es nicht mehr (gelöscht oder abgelaufen).", "fehler"]);

    // „Rückgängig“ nach dem Löschen, die Kurzbezeichnung trägt inzwischen ein anderer Fall.
    frisch();
    const anderer = behalten("Zi 98");
    store.fallSchliessen(anderer.id);
    f = behalten("Zi 96");
    aktionen.schliesseFall(f, true);
    fremd(anderer.id, (e) => ({ ...e, kurz: "Zi. 96", stand: (e.stand as number) + 1 }));
    m().aktion!.ausfuehren();
    assert.deepEqual(
      [m().text, m().art],
      ["„Zi 96“ trägt inzwischen ein anderer behaltener Fall. Der Fall ist wieder offen, aber nur in diesem Fenster; zum Behalten eine andere Kurzbezeichnung wählen.", "warnung"],
    );
    assert.equal(store.aktivId.value, f.id);
    assert.equal(store.istBehalten(f.id), false);
  } finally {
    lokalerSpeicher.gesperrt = false;
    store.setzeEinstellung("stationBehalten", false);
    frisch();
  }
});

test("CR-R6-10: Nach Schließen und „Rückgängig“ geht Strg+Z weiter wie vor dem Schließen", () => {
  frisch();
  store.fallNeu(V_PFLICHT);
  const id = aktiv().id;
  store.aendere((f) => mitZusatz(f, "verlauf", "eins"));
  store.aendere((f) => mitZusatz(f, "verlauf", "zwei"));
  store.fallSchliessen(id);
  store.fallWiederherstellen();
  assert.equal(store.aktivId.value, id);
  assert.equal(store.kannZurueck.value, true);
  assert.ok(store.zurueck());
  assert.equal(aktiv().zusatz.verlauf, "eins");
  assert.equal(store.kannVor.value, true);
});

test("Eigene Vorlage behält `pflicht` an der Stelle, Formatstand 4 (PS-T1-01)", () => {
  frisch();
  const v = vorlage("t-v-pflicht-format", { diagnostik: ["t-ct"] }, { wahl: [{ ...WAHL_DG, vor: "t-ct", pflicht: true }] });
  store.INDEX.vorlagen.set(v.id, v);
  store.fallNeu(v);
  assert.equal(store.eigeneVorlageSpeichern("Mit Pflicht"), true);
  const roh = JSON.parse(speicher.eigenesAlsText(store.eigenes.value));
  assert.equal(roh.vorlagen[0].wahl[0].pflicht, true);
  assert.equal(roh.format, 4);
  // Gelesen bleibt die Pflicht; ein älterer Stand (Format 3) weist den Text ab, statt sie still fallen zu lassen.
  assert.equal(speicher.pruefeEigenes(roh, store.INDEX)?.vorlagen[0].wahl?.[0].pflicht, true);
  store.INDEX.vorlagen.delete(v.id);
});

test("Eigene Inhalte als Text: Formatstand 3 nur, wenn eine Stelle `vor` trägt (CR-T1-06)", () => {
  frisch();
  const v = vorlage("t-v-platz-format", { diagnostik: ["t-ct"] }, { wahl: [{ ...WAHL_DG, vor: "t-ct" }] });
  store.INDEX.vorlagen.set(v.id, v);
  store.fallNeu(v);
  assert.equal(store.eigeneVorlageSpeichern("Mit Platz"), true);
  const roh = JSON.parse(speicher.eigenesAlsText(store.eigenes.value));
  assert.equal(roh.vorlagen[0].wahl[0].vor, "t-ct");
  assert.equal(roh.format, 3);
  // Ein Stand, der nur Format 2 kennt, weist diesen Text deshalb ab, statt `vor` still fallen zu lassen.
  assert.deepEqual(speicher.pruefeEigenes(roh, store.INDEX), store.eigenes.value);
  store.INDEX.vorlagen.delete(v.id);
});

// QA-42: Nach dem Nahtfenster ging der Durchlauf zurück in den Entlassbefund, weil dort durch die Kopplung (E-60) ein
// neuer grauer Block entstand. Ein Block, der beim Öffnen der Stelle ganz davor lag, kommt nicht wieder dran.
test("QA-42: Nach dem Nahtfenster geht es im Procedere weiter, nicht zurück zum neuen grauen Übertrag im Entlassbefund", () => {
  frisch();
  store.fallNeu(store.INDEX.vorlagen.get("station-hueft-tep"));
  store.aendere((f) => mitPerson(mitSeite(f, "rechts"), "w", "70"));
  const naht = "proc-st-wunde/naht";
  aktionen.oeffneFeld({ key: naht, art: "option", abschnitt: "procedere" });
  assert.equal(ansicht("entlassbefund").tokens.find((t) => t.key === "eb-st-wunde/naht")?.zustand, "offen");
  store.aendere((f) => mitAngabe(f, naht, `${naht}/material`, "2"));
  store.aendere((f) => mitAngabe(f, naht, `${naht}/wann`, "1"));
  store.aendere((f) => mitAngabe(f, naht, `${naht}/wer`, "1"));
  // Durch die Kopplung steht im Entlassbefund jetzt grau „Hautklammern noch nicht entfernt.“.
  const eb = ansicht("entlassbefund").tokens.find((t) => t.key === "eb-st-wunde/naht");
  assert.equal(eb?.zustand, "vorschlag");
  assert.equal(aktionen.stellenZustand(naht), "gesetzt");
  aktionen.weiter();
  assert.equal(aktionen.offenesFeld.value?.abschnitt, "procedere", `weiter zu ${JSON.stringify(aktionen.offenesFeld.value)} / Liste ${JSON.stringify(aktionen.offeneListe.value)}`);
});
