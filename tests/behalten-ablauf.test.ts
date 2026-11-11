// Behaltene Stationsfälle im Store (E-50, E-67): Einstellung, Kurzbezeichnung, Schreiben auf den PC, Neuladen, zweites
// Fenster, Ablauf nach drei Tagen, Räumen, Ausschalten, gesperrter Speicher, neueres Format. Fenster und Speicher sind
// Attrappen; ein „Neuladen“ lädt den Store ein zweites Mal gegen denselben Speicher. Die Klicktests dazu stehen in
// tests/e2e/behalten.spec.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mitWert } from "../src/engine/fall.ts";
import { loeschzeit } from "../src/engine/behalten.ts";
import { standText } from "../src/engine/stand.ts";
import type { Fall } from "../src/model/types.ts";

function speicherAttrappe() {
  const m = new Map<string, string>();
  return {
    gesperrt: false,
    /** Nur das Schreiben scheitert (Speicher voll, Richtlinie nur für das Schreiben); Lesen geht (CR-R6-01). */
    schreibenGesperrt: false,
    /** Entfernen schlägt still fehl (Richtlinie, Fehler im Browser): Der Eintrag bleibt. */
    entferntNicht: false,
    getItem(k: string) {
      if (this.gesperrt) throw new Error("gesperrt");
      return m.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      if (this.gesperrt || (this.schreibenGesperrt && k === "kitteltext3.behalten")) throw new Error("gesperrt");
      m.set(k, String(v));
    },
    removeItem(k: string) {
      if (this.gesperrt) throw new Error("gesperrt");
      if (!this.entferntNicht) m.delete(k);
    },
  };
}
const lokal = speicherAttrappe();
const sitzung = speicherAttrappe();
const hoerer: Record<string, ((e: unknown) => void)[]> = {};

Object.assign(globalThis, {
  window: {
    localStorage: lokal,
    sessionStorage: sitzung,
    isSecureContext: true,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    getSelection: () => null,
    addEventListener: (art: string, fn: (e: unknown) => void) => (hoerer[art] ??= []).push(fn),
  },
  document: {
    documentElement: { setAttribute() {}, removeAttribute() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    activeElement: null,
  },
  CSS: { escape: (s: string) => s },
});

const store = await import("../src/store.ts");
const STATION = store.INDEX.vorlagen.get("station-frei")!;
const ZNA = store.INDEX.vorlagen.get("zna-frei")!;
const SCHLUESSEL = "kitteltext3.behalten";
const STUNDE = 3600_000;
// Wörtlich aus E-50, nicht aus der Konstante: Ändert jemand die Frist, wird dieser Test rot.
const DREI_TAGE = 72 * STUNDE;

interface Gespeichert {
  format: number;
  faelle: { id: string; kurz: string; erstellt: number; loeschenAb: number; stand: number; fenster: string | null; fall: Fall }[];
}
function gespeichert(): Gespeichert | null {
  const roh = lokal.getItem(SCHLUESSEL);
  return roh ? (JSON.parse(roh) as Gespeichert) : null;
}
function eintrag(id: string) {
  return gespeichert()?.faelle.find((e) => e.id === id);
}
/** Was ein anderes Fenster täte: den gespeicherten Eintrag ändern. */
function fremdesFenster(id: string, aenderung: (e: Gespeichert["faelle"][number]) => Gespeichert["faelle"][number] | null) {
  const g = gespeichert()!;
  g.faelle = g.faelle.map((e) => (e.id === id ? aenderung(e) : e)).filter((e): e is Gespeichert["faelle"][number] => e !== null);
  lokal.setItem(SCHLUESSEL, JSON.stringify(g));
}
const pause = () => new Promise((fertig) => setTimeout(fertig, 0));

function frisch() {
  store.allesLoeschen();
  store.behaltenMeldung.value = null;
  store.stehendeMeldung.value = null;
  store.kurzFrage.value = null;
  store.setzeEinstellung("stationBehalten", false);
}

/** Neuer Stationsfall, behalten unter `kurz`. */
function behaltenerFall(kurz = "Zi 12 Fenster"): Fall {
  store.setzeEinstellung("stationBehalten", true);
  store.fallNeu(STATION);
  const f = store.aktiverFall.value!;
  assert.equal(store.fallBehalten(f.id, kurz), "ok");
  return store.aktiverFall.value!;
}

test("Ab Werk aus: kein Fall wird behalten, kein Stationsfall fragt nach einer Kurzbezeichnung", () => {
  frisch();
  assert.equal(store.einstellungen.value.stationBehalten, false);
  store.fallNeu(STATION);
  assert.equal(store.kurzFrage.value, null);
  assert.equal(store.fallBehalten(store.aktiverFall.value!.id, "Zi 12"), "aus");
  assert.equal(gespeichert(), null);
});

test("Eingeschaltet: neuer Stationsfall fragt, Notaufnahmefall nie; ohne Kurzbezeichnung kein Behalten", () => {
  frisch();
  store.setzeEinstellung("stationBehalten", true);
  store.fallNeu(ZNA);
  assert.equal(store.kurzFrage.value, null);
  assert.equal(store.fallBehalten(store.aktiverFall.value!.id, "Kabine 3"), "station");
  store.fallNeu(STATION);
  const f = store.aktiverFall.value!;
  assert.deepEqual(store.kurzFrage.value, { fallId: f.id, anlass: "neu" });
  assert.equal(store.fallBehalten(f.id, "   "), "leer");
  assert.equal(gespeichert(), null);
});

test("Behalten: Eintrag mit bereinigter Kurzbezeichnung und Löschzeit drei Tage nach Beginn; Inhalt nicht im Sitzungsspeicher", () => {
  frisch();
  store.setzeEinstellung("stationBehalten", true);
  store.fallNeu(STATION);
  const f = store.aktiverFall.value!;
  store.aendere((x) => ({ ...x, zusatz: { anamnese: "Sturz beim Wandern" } }));
  assert.equal(store.fallBehalten(f.id, "  Zi 12 \t Fenster  "), "ok");
  const e = eintrag(f.id)!;
  assert.equal(e.kurz, "Zi 12 Fenster");
  assert.equal(e.erstellt, f.erstellt);
  assert.equal(e.loeschenAb, f.erstellt + DREI_TAGE);
  assert.equal(e.fenster, store.FENSTER);
  assert.equal(e.fall.zusatz.anamnese, "Sturz beim Wandern");
  assert.equal(gespeichert()!.format, 1);
  assert.ok(store.istBehalten(f.id));
  assert.equal(store.merkerVon(store.aktiverFall.value!), "Zi 12 Fenster");
  const s = JSON.parse(sitzung.getItem("kitteltext3.sitzung")!);
  assert.equal(s.format, 3);
  assert.deepEqual(s.behalten, [f.id]);
  assert.deepEqual(s.faelle, []);
  assert.ok(!sitzung.getItem("kitteltext3.sitzung")!.includes("Sturz beim Wandern"));
});

test("Zwei behaltene Fälle mit derselben Kurzbezeichnung gibt es nicht, auch nicht durch Ändern", () => {
  frisch();
  const a = behaltenerFall("Zi 12 Fenster");
  store.fallNeu(STATION);
  const b = store.aktiverFall.value!;
  assert.equal(store.fallBehalten(b.id, "zi 12 fenster"), "doppelt");
  assert.ok(!store.istBehalten(b.id));
  assert.equal(store.fallBehalten(b.id, "Zi 12 Tür"), "ok");
  assert.equal(store.fallBehalten(b.id, "Zi 12 Fenster"), "doppelt", "Ändern auf die Bezeichnung des anderen");
  assert.equal(eintrag(b.id)!.kurz, "Zi 12 Tür");
  assert.equal(store.fallBehalten(a.id, "ZI 12 FENSTER"), "ok", "die eigene Bezeichnung anders geschrieben");
  assert.equal(eintrag(a.id)!.kurz, "ZI 12 FENSTER");
  assert.equal(gespeichert()!.faelle.length, 2);
});

test("Jede Änderung geht sofort auf den PC, mit neuem Stand; Kurzbezeichnung ändern", () => {
  frisch();
  const f = behaltenerFall();
  const stand = eintrag(f.id)!.stand;
  store.aendere((x) => mitWert(x, "irgendwo/feld", "x"));
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "Tag 2: mobil an Unterarmgehstützen" } }));
  assert.equal(eintrag(f.id)!.fall.zusatz.verlauf, "Tag 2: mobil an Unterarmgehstützen");
  assert.ok(eintrag(f.id)!.stand > stand);
  assert.equal(store.fallBehalten(f.id, "Zi 12 Tür"), "ok");
  assert.equal(eintrag(f.id)!.kurz, "Zi 12 Tür");
});

test("Neuladen: der behaltene Fall ist wieder offen, mit Inhalt, Reihenfolge und aktivem Reiter", async () => {
  frisch();
  store.setzeEinstellung("stationBehalten", true);
  store.fallNeu(ZNA);
  const zna = store.aktiverFall.value!;
  const f = behaltenerFall();
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "vor dem Neuladen" } }));
  store.fallWaehlen(zna.id);
  // Neuladen: Das Fenster gibt beim Verlassen frei, dann lädt die Seite neu.
  for (const fn of hoerer.pagehide ?? []) fn({});
  assert.equal(eintrag(f.id)!.fenster, null);
  const neu = await import("../src/store.ts?neuladen=1");
  assert.equal(neu.FENSTER, store.FENSTER);
  assert.deepEqual(
    neu.faelle.value.map((x: Fall) => x.id),
    [zna.id, f.id],
  );
  assert.equal(neu.aktivId.value, zna.id);
  assert.ok(neu.istBehalten(f.id));
  assert.equal(neu.faelle.value[1].zusatz.verlauf, "vor dem Neuladen");
  assert.equal(eintrag(f.id)!.fenster, store.FENSTER);
  // Ohne Freigabe (Absturz) nimmt dasselbe Fenster seinen Fall ebenso wieder.
  const nochmal = await import("../src/store.ts?neuladen=2");
  assert.ok(nochmal.istBehalten(f.id));
});

test("Zweites Fenster holt den Fall: dieses schließt ihn mit Meldung und schreibt nichts mehr", async () => {
  frisch();
  const f = behaltenerFall("Bett 3");
  fremdesFenster(f.id, (e) => ({ ...e, fenster: "anderes-fenster", stand: e.stand + 1 }));
  for (const fn of hoerer.storage ?? []) fn({ key: "kitteltext3.einstellungen" });
  assert.ok(store.istBehalten(f.id), "Ein anderer Schlüssel ist kein Grund");
  store.fuerTests.behaltenNeuGelesen();
  assert.equal(store.faelle.value.some((x) => x.id === f.id), false);
  assert.equal(store.aktivId.value, null);
  assert.equal(store.stehendeMeldung.value!.text, "„Bett 3“ ist jetzt in einem anderen Fenster geöffnet und hier geschlossen.");
  assert.equal(eintrag(f.id)!.fenster, "anderes-fenster");
  await pause();
});

test("Schreiben gegen einen fremden Stand: nichts überschrieben, Fall geschlossen, Meldung nennt die verlorene Eingabe mit Stelle (MT-R6-07)", async () => {
  frisch();
  const f = behaltenerFall("Bett 4");
  fremdesFenster(f.id, (e) => ({ ...e, stand: e.stand + 1, fall: { ...e.fall, zusatz: { verlauf: "aus dem anderen Fenster" } } }));
  store.aendere((x) => ({ ...x, seite: "links" }));
  await pause();
  assert.equal(eintrag(f.id)!.fall.zusatz.verlauf, "aus dem anderen Fenster");
  assert.equal(store.faelle.value.some((x) => x.id === f.id), false);
  assert.equal(
    store.stehendeMeldung.value!.text,
    "„Bett 4“ ist jetzt in einem anderen Fenster geöffnet und hier geschlossen. Deine letzte Eingabe (Seite) fehlt dort: dort prüfen und neu setzen.",
  );
});

test("Gelöscht in einem anderen Fenster: hier geschlossen", () => {
  frisch();
  const f = behaltenerFall("Bett 5");
  fremdesFenster(f.id, () => null);
  store.fuerTests.behaltenNeuGelesen();
  assert.equal(store.faelle.value.length, 0);
  assert.equal(store.stehendeMeldung.value!.text, "„Bett 5“ wurde in einem anderen Fenster gelöscht und ist hier geschlossen.");
});

// --- PS-R6-1: Geht der offene Fall ohne Zutun zu, wird kein anderer aktiv --------------------------------------

/** Zwei behaltene Fälle derselben Vorlage in einem Fenster, der erste ist offen (Szenario PS-R6-1). */
function zweiGleiche(a = "Zi 12", b = "Zi 14") {
  const erster = behaltenerFall(a);
  const zweiter = behaltenerFall(b);
  store.fallWaehlen(erster.id);
  return { erster, zweiter };
}

test("PS-R6-1 Ablauf des offenen Falls: kein anderer Fall wird aktiv, die Meldung bleibt stehen und nennt Kurzbezeichnung und Grund", () => {
  frisch();
  const { erster, zweiter } = zweiGleiche();
  fremdesFenster(erster.id, (e) => ({ ...e, erstellt: e.erstellt - DREI_TAGE, loeschenAb: e.loeschenAb - DREI_TAGE }));
  store.verwerfeAbgelaufene(Date.now());
  assert.equal(store.faelle.value.some((x) => x.id === erster.id), false);
  assert.ok(store.istBehalten(zweiter.id), "der andere Fall bleibt offen");
  assert.equal(store.aktivId.value, null, "kein Wechsel auf den Fall eines anderen Patienten");
  assert.equal(store.aktiverFall.value, null);
  assert.equal(store.stehendeMeldung.value!.text, "Behaltener Fall „Zi 12“ nach 3 Tagen gelöscht.");
  assert.equal(store.behaltenMeldung.value, null, "nicht zusätzlich in der Meldungszeile");
});

test("PS-R6-1 Holen und Löschen durch ein anderes Fenster und Räumen dort: kein anderer Fall wird aktiv", async () => {
  for (const [art, aenderung] of [
    ["geholt", (e: Gespeichert["faelle"][number]) => ({ ...e, fenster: "anderes-fenster", stand: e.stand + 1 })],
    ["gelöscht", () => null],
  ] as const) {
    frisch();
    const { erster, zweiter } = zweiGleiche();
    fremdesFenster(erster.id, aenderung);
    store.fuerTests.behaltenNeuGelesen();
    assert.equal(store.aktivId.value, null, art);
    assert.ok(store.istBehalten(zweiter.id), art);
  }
  // Räumen in einem anderen Fenster: der ganze Schlüssel ist weg.
  frisch();
  zweiGleiche();
  lokal.removeItem(SCHLUESSEL);
  store.fuerTests.behaltenNeuGelesen();
  assert.equal(store.aktivId.value, null);
  assert.equal(store.faelle.value.length, 0);
  assert.equal(store.stehendeMeldung.value!.text, "„Zi 12“, „Zi 14“ wurden in einem anderen Fenster gelöscht und sind hier geschlossen.");
  // Beim Schreiben bemerkt: ebenso.
  frisch();
  const { erster } = zweiGleiche();
  fremdesFenster(erster.id, (e) => ({ ...e, fenster: "anderes-fenster", stand: e.stand + 1 }));
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "von hier" } }));
  await pause();
  assert.equal(store.aktivId.value, null);
});

test("PS-R6-1 Geht ein anderer als der offene Fall zu, bleibt der offene aktiv; die Meldung steht nur in der Meldungszeile", () => {
  frisch();
  const { erster, zweiter } = zweiGleiche();
  fremdesFenster(zweiter.id, () => null);
  store.fuerTests.behaltenNeuGelesen();
  assert.equal(store.aktivId.value, erster.id);
  assert.equal(store.stehendeMeldung.value, null);
  assert.equal(store.behaltenMeldung.value!.text, "„Zi 14“ wurde in einem anderen Fenster gelöscht und ist hier geschlossen.");
});

test("PS-R6-1 Verfällt der offene Fall nach langer Ruhe, wird ebenfalls kein anderer aktiv", () => {
  frisch();
  store.fallNeu(ZNA);
  const zna = store.aktiverFall.value!;
  store.fallNeu(STATION);
  const station = store.aktiverFall.value!;
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "später geändert" } }));
  store.fallWaehlen(zna.id);
  const jetzt = zna.geaendert + 4 * STUNDE + 1;
  assert.ok(jetzt - store.faelle.value.find((x) => x.id === station.id)!.geaendert < 12 * STUNDE);
  assert.equal(store.verwerfeAbgelaufene(jetzt), 1);
  assert.equal(store.aktivId.value, null);
  assert.equal(store.stehendeMeldung.value!.text, "1 Fall wurde nach langer Ruhe verworfen (Notaufnahme 4 Std., Station 12 Std.).");
});

test("Eine zweite stehende Meldung kommt zur ersten hinzu", () => {
  frisch();
  const { erster, zweiter } = zweiGleiche();
  fremdesFenster(erster.id, () => null);
  store.fuerTests.behaltenNeuGelesen();
  store.fallWaehlen(zweiter.id);
  fremdesFenster(zweiter.id, (e) => ({ ...e, fenster: "anderes-fenster", stand: e.stand + 1 }));
  store.fuerTests.behaltenNeuGelesen();
  assert.equal(
    store.stehendeMeldung.value!.text,
    "„Zi 12“ wurde in einem anderen Fenster gelöscht und ist hier geschlossen. „Zi 14“ ist jetzt in einem anderen Fenster geöffnet und hier geschlossen.",
  );
});

test("CR-R6-07 Ablauf, den ein anderes Fenster vollzogen hat, heißt hier Ablauf, nicht „in einem anderen Fenster gelöscht“", async () => {
  frisch();
  const f = behaltenerFall("Zi 24");
  // Das andere Fenster hat den abgelaufenen Eintrag schon entfernt; dieses kannte ihn noch.
  fremdesFenster(f.id, () => null);
  const echt = Date.now;
  Date.now = () => f.erstellt + DREI_TAGE;
  try {
    store.fuerTests.behaltenNeuGelesen();
  } finally {
    Date.now = echt;
  }
  assert.equal(store.stehendeMeldung.value!.text, "Behaltener Fall „Zi 24“ nach 3 Tagen gelöscht.");
  // Ebenso, wenn erst das Schreiben einer Eingabe es bemerkt.
  frisch();
  const g = behaltenerFall("Zi 25");
  fremdesFenster(g.id, () => null);
  Date.now = () => g.erstellt + DREI_TAGE + 1;
  try {
    store.aendere((x) => ({ ...x, zusatz: { verlauf: "nach Ablauf" } }));
  } finally {
    Date.now = echt;
  }
  await pause();
  assert.equal(store.stehendeMeldung.value!.text, "Behaltener Fall „Zi 25“ nach 3 Tagen gelöscht.");
});

test("RD-R6-8, CR-R6-08 Steht die Uhr vor dem Beginn des Falls, wird er gelöscht, mit diesem Grund statt „nach 3 Tagen“", async () => {
  frisch();
  const f = behaltenerFall("Zi 29");
  store.verwerfeAbgelaufene(f.erstellt);
  assert.ok(store.istBehalten(f.id), "genau zum Beginn bleibt er");
  store.verwerfeAbgelaufene(f.erstellt - 1);
  assert.equal(eintrag(f.id), undefined);
  assert.equal(store.aktivId.value, null);
  assert.equal(store.stehendeMeldung.value!.text, "„Zi 29“ gelöscht: Die Uhr dieses PCs steht vor dem Beginn des Falls.");
  // Beim Start ebenso.
  frisch();
  const g = behaltenerFall("Zi 30");
  fremdesFenster(g.id, (e) => ({ ...e, erstellt: e.erstellt + STUNDE, loeschenAb: e.loeschenAb + STUNDE }));
  const neu = await import("../src/store.ts?start=uhr");
  assert.equal(neu.behaltenMeldung.value?.text, "„Zi 30“ gelöscht: Die Uhr dieses PCs steht vor dem Beginn des Falls.");
  assert.equal(eintrag(g.id), undefined);
});

test("Öffnen aus der Liste: neue Fallnummer dieses Fensters, Eintrag gehört jetzt hierher", () => {
  frisch();
  const f = behaltenerFall("Zi 7");
  store.fallSchliessen(f.id);
  assert.equal(eintrag(f.id)!.fenster, null, "geschlossen heißt: frei, aber behalten");
  assert.equal(store.faelle.value.length, 0);
  store.fallNeu(ZNA);
  const nr = store.aktiverFall.value!.nr;
  assert.equal(store.behaltenOeffnen(f.id), "ok");
  assert.equal(store.aktivId.value, f.id);
  assert.equal(store.aktiverFall.value!.nr, nr + 1);
  assert.equal(eintrag(f.id)!.fenster, store.FENSTER);
  assert.equal(store.behaltenOeffnen("gibt-es-nicht"), "fehlt");
});

test("Schließen und Rückgängig; nach „Alles kopiert“ löschen und Rückgängig", () => {
  frisch();
  const f = behaltenerFall("Zi 8");
  store.fallSchliessen(f.id);
  store.fallWiederherstellen();
  assert.ok(store.istBehalten(f.id));
  store.fallSchliessen(f.id, true);
  assert.equal(eintrag(f.id), undefined);
  store.fallWiederherstellen();
  assert.ok(store.istBehalten(f.id));
  assert.equal(eintrag(f.id)!.kurz, "Zi 8");
  assert.equal(eintrag(f.id)!.loeschenAb, loeschzeit(f.erstellt));
});

test("Ablauf: drei Tage nach Beginn gelöscht, auch offen und auch in keinem Fenster; die 12 Stunden gelten nur ungespeicherten", () => {
  frisch();
  const offen = behaltenerFall("Zi 9");
  const zu = behaltenerFall("Zi 10");
  store.fallSchliessen(zu.id);
  store.setzeEinstellung("stationBehalten", false);
  store.fallNeu(STATION);
  const ungespeichert = store.aktiverFall.value!;
  const t0 = Math.max(offen.erstellt, zu.erstellt, ungespeichert.erstellt);
  // Nach 13 Stunden ohne Änderung geht nur der ungespeicherte Stationsfall.
  assert.equal(store.verwerfeAbgelaufene(t0 + 13 * STUNDE), 1);
  assert.ok(store.istBehalten(offen.id));
  assert.equal(store.behaltenMeldung.value, null);
  // Eine Millisekunde vor drei Tagen ist noch alles da.
  store.verwerfeAbgelaufene(Math.min(offen.erstellt, zu.erstellt) + DREI_TAGE - 1);
  assert.equal(gespeichert()!.faelle.length, 2);
  store.verwerfeAbgelaufene(Math.max(offen.erstellt, zu.erstellt) + DREI_TAGE);
  assert.equal(gespeichert(), null);
  assert.equal(store.faelle.value.length, 0);
  assert.match(store.behaltenMeldung.value!.text, /2 behaltene Fälle nach 3 Tagen gelöscht: „Zi (9|10)“, „Zi (9|10)“\./);
});

test("Ablauf beim Start: abgelaufene Einträge sind nach dem Laden gelöscht und gemeldet", async () => {
  frisch();
  const f = behaltenerFall("Zi 11");
  fremdesFenster(f.id, (e) => ({ ...e, erstellt: e.erstellt - DREI_TAGE, loeschenAb: e.loeschenAb - DREI_TAGE }));
  const neu = await import("../src/store.ts?start=abgelaufen");
  assert.equal(gespeichert(), null);
  assert.equal(neu.faelle.value.length, 0);
  assert.equal(neu.behaltenMeldung.value?.text, "Behaltener Fall „Zi 11“ nach 3 Tagen gelöscht.");
});

test("Alles löschen: auch die behaltenen Fälle, offen oder nicht, gezählt mit denen anderer Fenster", () => {
  frisch();
  const a = behaltenerFall("Zi 1");
  behaltenerFall("Zi 2");
  store.fallSchliessen(a.id);
  store.setzeEinstellung("stationBehalten", false);
  store.fallNeu(STATION);
  store.fallNeu(ZNA);
  // Ein drittes, nur in einem anderen Fenster offen.
  const g = gespeichert()!;
  g.faelle.push({ ...g.faelle[0], id: "anderswo", kurz: "Zi 3", fenster: "anderes-fenster", fall: { ...g.faelle[0].fall, id: "anderswo" } });
  lokal.setItem(SCHLUESSEL, JSON.stringify(g));
  assert.deepEqual(store.allesLoeschen(), { fenster: 2, behalten: { anzahl: 3, geloescht: true } });
  assert.equal(gespeichert(), null);
  assert.equal(store.faelle.value.length, 0);
  assert.equal(store.bestand.value.eintraege.length, 0);
});

test("Alles löschen, das Entfernen schlägt fehl: nicht als gelöscht gemeldet, die behaltenen bleiben hier offen (E-81)", () => {
  frisch();
  const f = behaltenerFall("Zi 1");
  store.setzeEinstellung("stationBehalten", false);
  store.fallNeu(ZNA);
  lokal.entferntNicht = true;
  try {
    assert.deepEqual(store.allesLoeschen(), { fenster: 1, behalten: { anzahl: 1, geloescht: false } });
    assert.ok(store.istBehalten(f.id));
    assert.equal(store.faelle.value.length, 1);
    assert.equal(store.bestand.value.eintraege.length, 1);
    assert.deepEqual(store.behaltenAusschalten(true), { anzahl: 1, geloescht: false });
    assert.ok(store.istBehalten(f.id));
  } finally {
    lokal.entferntNicht = false;
  }
});

test("Räumen, behaltene Fälle bleiben: Fälle dieses Fensters weg, behaltene hier geschlossen und frei, auf dem PC unverändert (E-81)", () => {
  frisch();
  const a = behaltenerFall("Zi 1");
  const b = behaltenerFall("Zi 2");
  store.fallSchliessen(b.id);
  store.setzeEinstellung("stationBehalten", false);
  store.fallNeu(STATION);
  store.fallNeu(ZNA);
  assert.deepEqual(store.fensterRaeumen(), { fenster: 2, behalten: 2 });
  assert.equal(store.faelle.value.length, 0);
  assert.equal(store.aktivId.value, null);
  assert.equal(store.istBehalten(a.id), false);
  assert.equal(eintrag(a.id)!.fenster, null, "für andere Fenster frei");
  assert.equal(gespeichert()!.faelle.length, 2);
  assert.equal(sitzung.getItem("kitteltext3.sitzung"), null);
  // Danach lässt er sich wieder öffnen, mit Inhalt.
  assert.equal(store.behaltenOeffnen(a.id), "ok");
});

test("Ausschalten: mit Löschen sofort weg; ohne bleiben die vorhandenen bis zum Ablauf, neue gibt es nicht", () => {
  frisch();
  const f = behaltenerFall("Zi 3");
  assert.deepEqual(store.behaltenAusschalten(false), { anzahl: 1, geloescht: false });
  assert.equal(store.einstellungen.value.stationBehalten, false);
  assert.ok(store.istBehalten(f.id));
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "nach dem Ausschalten" } }));
  assert.equal(eintrag(f.id)!.fall.zusatz.verlauf, "nach dem Ausschalten");
  store.fallNeu(STATION);
  assert.equal(store.kurzFrage.value, null);
  assert.equal(store.fallBehalten(store.aktiverFall.value!.id, "Zi 4"), "aus");
  assert.deepEqual(store.behaltenAusschalten(true), { anzahl: 1, geloescht: true });
  assert.equal(gespeichert(), null);
  assert.equal(store.istBehalten(f.id), false);
  assert.equal(store.faelle.value.some((x) => x.id === f.id), false);
});

test("Gesperrter Speicher: Behalten nicht verfügbar, nichts geschrieben", () => {
  frisch();
  store.setzeEinstellung("stationBehalten", true);
  store.fallNeu(STATION);
  const id = store.aktiverFall.value!.id;
  lokal.gesperrt = true;
  try {
    assert.equal(store.behaltenVerfuegbar(), "gesperrt");
    assert.equal(store.fallBehalten(id, "Zi 5"), "gesperrt");
    assert.equal(store.istBehalten(id), false);
  } finally {
    lokal.gesperrt = false;
  }
  assert.equal(store.behaltenVerfuegbar(), "ja");
});

test("Neueres Format: nicht öffnen, nicht neu behalten, aber ablaufen lassen und unverändert zurückschreiben", () => {
  frisch();
  const jetzt = Date.now();
  const fremd = { id: "x1", kurz: "Zi 6", erstellt: jetzt - STUNDE, loeschenAb: loeschzeit(jetzt - STUNDE), unbekannt: [1, 2] };
  const alt = { id: "x2", kurz: "Zi alt", erstellt: jetzt - DREI_TAGE - STUNDE, loeschenAb: jetzt - STUNDE };
  lokal.setItem(SCHLUESSEL, JSON.stringify({ format: 2, faelle: [fremd, alt] }));
  store.verwerfeAbgelaufene(jetzt);
  assert.deepEqual(gespeichert(), { format: 2, faelle: [fremd] } as unknown);
  assert.equal(store.behaltenVerfuegbar(), "neuer");
  assert.equal(store.behaltenOeffnen("x1"), "neuer");
  store.setzeEinstellung("stationBehalten", true);
  store.fallNeu(STATION);
  assert.equal(store.kurzFrage.value, null);
  assert.equal(store.fallBehalten(store.aktiverFall.value!.id, "Zi 7"), "neuer");
  assert.ok(store.behaltenLoeschen("x1"));
  assert.equal(gespeichert(), null);
});

test("Wird ein behaltener Fall zum Notaufnahmefall, bleibt er offen, aber nicht mehr behalten", async () => {
  frisch();
  const f = behaltenerFall("Zi 13");
  store.vorlageAnwenden(ZNA);
  await pause();
  assert.equal(store.aktiverFall.value!.id, f.id);
  assert.equal(store.istBehalten(f.id), false);
  assert.equal(eintrag(f.id), undefined);
  assert.match(store.behaltenMeldung.value!.text, /„Zi 13“ ist jetzt ein Notaufnahmefall/);
});

test("PS-R6-7: Wird ein behaltener Fall zum Notaufnahmefall, bleibt die Kurzbezeichnung als Merker, lange gekürzt mit Meldung", async () => {
  frisch();
  const f = behaltenerFall("Zi 13");
  store.vorlageAnwenden(ZNA);
  await pause();
  assert.equal(store.aktiverFall.value!.etikett, "Zi 13");
  assert.equal(store.merkerVon(store.aktiverFall.value!), "Zi 13");
  assert.equal(store.behaltenMeldung.value!.text, "„Zi 13“ ist jetzt ein Notaufnahmefall und wird nicht mehr behalten, nur noch in diesem Fenster. Die Kurzbezeichnung bleibt als Merker.");
  // Länger als das Merkerfeld (14 Zeichen): gekürzt, und die Meldung sagt es.
  const g = behaltenerFall("Zi 12 Fenster links");
  store.vorlageAnwenden(ZNA);
  await pause();
  assert.equal(store.aktiverFall.value!.id, g.id);
  assert.equal(store.aktiverFall.value!.etikett, "Zi 12 Fenster");
  assert.equal(
    store.behaltenMeldung.value!.text,
    "„Zi 12 Fenster links“ ist jetzt ein Notaufnahmefall und wird nicht mehr behalten, nur noch in diesem Fenster. Die Kurzbezeichnung bleibt als Merker, gekürzt: „Zi 12 Fenster“.",
  );
  // Der erste Fall behält seinen Merker.
  assert.equal(store.faelle.value.find((x) => x.id === f.id)!.etikett, "Zi 13");
});

test("Eigene Vorlage, die ein behaltener Fall verwendet, lässt sich nicht löschen, auch wenn er hier nicht offen ist", () => {
  frisch();
  store.setzeEinstellung("stationBehalten", true);
  store.fallNeu(STATION);
  assert.ok(store.eigeneVorlageSpeichern("Meine Station"));
  const eigene = store.eigenes.value.vorlagen[0];
  store.fallNeu(store.INDEX.vorlagen.get(eigene.id)!);
  const f = store.aktiverFall.value!;
  assert.equal(store.fallBehalten(f.id, "Zi 14"), "ok");
  store.fallSchliessen(f.id);
  assert.equal(store.eigeneVorlageLoeschen(eigene.id), false);
  store.behaltenLoeschen(f.id);
  assert.equal(store.eigeneVorlageLoeschen(eigene.id), true);
});

test("PS-R6-5: vor dem Kopieren gilt ein behaltener Fall nur mit eigenem Stand, eigenem oder keinem Fenster und vor dem Ablauf", () => {
  frisch();
  const f = behaltenerFall("Zi 12");
  assert.equal(store.behaltenNochHier(f.id), true);
  // Freigegeben (Fenster verlassen) und von niemandem genommen: gilt.
  store.fuerTests.gibFrei();
  assert.equal(eintrag(f.id)!.fenster, null);
  assert.equal(store.behaltenNochHier(f.id), true);
  // Ein Fall, der nicht behalten ist, gilt immer.
  store.fallNeu(ZNA);
  const zna = store.aktiverFall.value!;
  assert.equal(store.behaltenNochHier(zna.id), true);
  store.fallWaehlen(f.id);
  // Abgelaufen, ohne dass die Minutenprüfung lief (Ruhezustand): nicht, mit Meldung.
  fremdesFenster(f.id, (e) => ({ ...e, erstellt: e.erstellt - DREI_TAGE, loeschenAb: e.loeschenAb - DREI_TAGE }));
  assert.equal(store.behaltenNochHier(f.id), false);
  assert.equal(store.aktiverFall.value, null);
  assert.equal(store.stehendeMeldung.value!.text, "Behaltener Fall „Zi 12“ nach 3 Tagen gelöscht. Nichts kopiert.");
});

test("PS-R6-5: vor dem Kopieren, von einem anderen Fenster geholt oder geändert, ohne Ereignis: nicht, Fall geschlossen", () => {
  for (const aenderung of [
    (e: Gespeichert["faelle"][number]) => ({ ...e, fenster: "anderes-fenster", stand: e.stand + 1 }),
    (e: Gespeichert["faelle"][number]) => ({ ...e, stand: e.stand + 1 }),
    (e: Gespeichert["faelle"][number]) => ({ ...e, fenster: "anderes-fenster" }),
  ]) {
    frisch();
    const f = behaltenerFall("Zi 12");
    fremdesFenster(f.id, aenderung);
    assert.equal(store.behaltenNochHier(f.id), false);
    assert.equal(store.aktiverFall.value, null);
    assert.equal(store.stehendeMeldung.value!.text, "„Zi 12“ ist jetzt in einem anderen Fenster geöffnet und hier geschlossen. Nichts kopiert.");
  }
});

test("CR-R6-11: die Minutenprüfung schließt einen geholten oder fremd geänderten Fall auch ohne Ereignis `storage`", () => {
  frisch();
  const f = behaltenerFall("Zi 12");
  fremdesFenster(f.id, (e) => ({ ...e, fenster: "anderes-fenster", stand: e.stand + 1 }));
  store.verwerfeAbgelaufene(Date.now());
  assert.equal(store.faelle.value.some((x) => x.id === f.id), false);
  assert.equal(store.stehendeMeldung.value!.text, "„Zi 12“ ist jetzt in einem anderen Fenster geöffnet und hier geschlossen.");
  // Der eigene Stand bleibt offen.
  frisch();
  const g = behaltenerFall("Zi 14");
  store.verwerfeAbgelaufene(Date.now());
  assert.equal(store.aktiverFall.value!.id, g.id);
});

test("CR-R6-11: zurück aus dem Seitenspeicher nimmt das Fenster seine freigegebenen Fälle zurück, nicht die eines anderen", () => {
  frisch();
  const f = behaltenerFall("Zi 12");
  store.fuerTests.gibFrei();
  assert.equal(eintrag(f.id)!.fenster, null);
  const stand = eintrag(f.id)!.stand;
  store.nimmFreigegebeneZurueck();
  assert.equal(eintrag(f.id)!.fenster, store.FENSTER);
  assert.equal(eintrag(f.id)!.stand, stand, "der Stand bleibt; nur das Fenster ist wieder eingetragen");
  // Inzwischen in einem anderen Fenster geöffnet: bleibt dort, und die Prüfung danach schließt ihn hier.
  store.fuerTests.gibFrei();
  fremdesFenster(f.id, (e) => ({ ...e, fenster: "anderes-fenster" }));
  store.nimmFreigegebeneZurueck();
  assert.equal(eintrag(f.id)!.fenster, "anderes-fenster");
  store.verwerfeAbgelaufene(Date.now());
  assert.equal(store.faelle.value.some((x) => x.id === f.id), false);
});

test("PS-R6-3: jede Eingabe setzt den Stand der Abschnitte, deren Text sie ändert; Zurücknehmen bringt den alten, Neuladen behält ihn", async () => {
  frisch();
  const f = behaltenerFall("Zi 12");
  const echt = Date.now;
  const morgen = new Date(f.erstellt + 24 * STUNDE).setHours(9, 0, 0, 0);
  try {
    Date.now = () => morgen;
    store.aendere((x) => ({ ...x, zusatz: { verlauf: "Tag 2: mobil am Rollator" } }));
    const g = store.aktiverFall.value!;
    assert.deepEqual(g.abschnittStand, { verlauf: morgen });
    assert.equal(eintrag(f.id)!.fall.abschnittStand.verlauf, morgen, "auf dem PC mit gespeichert");
    assert.equal(standText(g, ["verlauf"], morgen), "");
    assert.equal(standText(g, ["anamnese"], morgen), "Stand gestern");
    // Ein Kopiervermerk ist keine Eingabe und ändert den Text nicht.
    store.vermerke(f.id, (x) => ({ ...x, kopiert: { ...x.kopiert, anamnese: "x" } }));
    assert.equal(store.aktiverFall.value!.abschnittStand, g.abschnittStand);
    // Auch ein Fall, der gerade nicht vorn ist, bekommt seinen Stand.
    store.fallNeu(STATION);
    store.aendere((x) => ({ ...x, zusatz: { befund: "nur im anderen Fall" } }));
    store.aendereFall(f.id, (x) => ({ ...x, zusatz: { ...x.zusatz, anamnese: "Sturz beim Wandern" } }));
    assert.deepEqual(store.faelle.value.find((x) => x.id === f.id)!.abschnittStand, { verlauf: morgen, anamnese: morgen });
    store.fallWaehlen(f.id);
    assert.ok(store.zurueck());
    assert.deepEqual(store.aktiverFall.value!.abschnittStand, { verlauf: morgen }, "mit dem alten Text der alte Stand");
    for (const fn of hoerer.pagehide ?? []) fn({});
    const neu = await import("../src/store.ts?neuladen=stand");
    assert.deepEqual(neu.faelle.value.find((x: Fall) => x.id === f.id)!.abschnittStand, { verlauf: morgen });
  } finally {
    Date.now = echt;
  }
});

test("CR-R6-01: Scheitert das Schreiben, steht der Fall in „nicht gespeichert“ und im Sitzungsspeicher; Neuladen behält die Eingabe, das nächste gelungene Schreiben beendet beides", async () => {
  frisch();
  const f = behaltenerFall("Zi 12");
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "vor dem Fehler" } }));
  const gespeichertUm = store.aktiverFall.value!.geaendert;
  lokal.schreibenGesperrt = true;
  try {
    store.aendere((x) => ({ ...x, zusatz: { verlauf: "nach dem Fehler" } }));
    assert.deepEqual([...store.nichtGespeichert.value], [[f.id, gespeichertUm]]);
    assert.equal(eintrag(f.id)!.fall.zusatz.verlauf, "vor dem Fehler", "auf dem PC der alte Stand");
    assert.equal(store.faelle.value.some((x) => x.id === f.id), true, "der Fall bleibt offen");
    const s = JSON.parse(sitzung.getItem("kitteltext3.sitzung")!);
    assert.equal(s.ungespeichert.length, 1);
    assert.equal(s.ungespeichert[0].fall.zusatz.verlauf, "nach dem Fehler");
    assert.deepEqual(s.faelle, [], "nicht als gewöhnlicher Fall dieses Fensters");
    // Neuladen, während das Schreiben weiter scheitert: Die Eingabe kommt aus dem Sitzungsspeicher zurück.
    for (const fn of hoerer.pagehide ?? []) fn({});
    const neu = await import("../src/store.ts?cr01=1");
    assert.equal(neu.faelle.value.find((x: Fall) => x.id === f.id)!.zusatz.verlauf, "nach dem Fehler");
    assert.ok(neu.istBehalten(f.id));
    assert.equal(neu.nichtGespeichert.value.size, 1);
  } finally {
    lokal.schreibenGesperrt = false;
  }
  // Geht das Schreiben wieder, holt die Minutenprüfung es nach, ohne neue Eingabe; danach ist nichts mehr offen (H-R6-4).
  store.verwerfeAbgelaufene(Date.now());
  assert.equal(eintrag(f.id)!.fall.zusatz.verlauf, "nach dem Fehler");
  assert.equal(store.nichtGespeichert.value.size, 0);
  assert.deepEqual(JSON.parse(sitzung.getItem("kitteltext3.sitzung")!).ungespeichert, []);
});

test("CR-R6-01: Hat ein anderes Fenster inzwischen geschrieben, gilt beim Neuladen dessen Stand, nicht die Kopie", async () => {
  frisch();
  const f = behaltenerFall("Zi 13");
  lokal.schreibenGesperrt = true;
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "nur hier" } }));
  lokal.schreibenGesperrt = false;
  fremdesFenster(f.id, (e) => ({ ...e, stand: e.stand + 1, fenster: null, fall: { ...e.fall, zusatz: { verlauf: "von dort" } } }));
  const neu = await import("../src/store.ts?cr01=2");
  assert.equal(neu.faelle.value.find((x: Fall) => x.id === f.id)!.zusatz.verlauf, "von dort");
});

test("CR-R6-06: Unlesbarer Speicher ist kein leerer: nichts geschlossen, nichts als gelöscht gemeldet, Löschen scheitert ehrlich", () => {
  frisch();
  const f = behaltenerFall("Zi 32");
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "vor der Sperre" } }));
  lokal.gesperrt = true;
  try {
    store.aendere((x) => ({ ...x, zusatz: { verlauf: "während der Sperre" } }));
    assert.equal(store.aktiverFall.value?.id, f.id, "Eingabe: der Fall bleibt offen");
    assert.equal(store.stehendeMeldung.value, null);
    assert.equal(store.behaltenMeldung.value, null);
    assert.ok(store.nichtGespeichert.value.has(f.id));
    assert.equal(store.behaltenLesbar.value, false);
    store.verwerfeAbgelaufene(Date.now());
    assert.equal(store.aktiverFall.value?.id, f.id, "Minutenprüfung: der Fall bleibt offen");
    assert.equal(store.bestand.value.eintraege.length, 1, "die Liste zeigt nicht „keine“");
    assert.equal(store.stehendeMeldung.value, null);
    assert.equal(store.behaltenNochHier(f.id), true);
    assert.equal(store.behaltenLoeschen(f.id), false);
    assert.equal(store.behaltenOeffnen("gibt-es-nicht"), "gesperrt");
    store.fallNeu(STATION);
    assert.equal(store.fallBehalten(store.aktiverFall.value!.id, "Zi 33"), "gesperrt");
    store.fallWaehlen(f.id);
  } finally {
    lokal.gesperrt = false;
  }
  store.verwerfeAbgelaufene(Date.now());
  assert.equal(store.behaltenLesbar.value, true);
  assert.equal(store.nichtGespeichert.value.size, 0);
  assert.equal(eintrag(f.id)!.fall.zusatz.verlauf, "während der Sperre");
});

test("CR-R6-02: Einstellungen frisch lesen bei gesperrtem Speicher setzt nichts auf den Werkszustand zurück", () => {
  frisch();
  store.setzeEinstellung("stationBehalten", true);
  store.setzeEinstellung("listen", "fliesstext");
  lokal.gesperrt = true;
  try {
    store.setzeEinstellung("farbmodus", "dunkel");
    store.fallNeu(STATION);
    assert.deepEqual(
      [store.einstellungen.value.stationBehalten, store.einstellungen.value.listen, store.einstellungen.value.farbmodus],
      [true, "fliesstext", "dunkel"],
    );
  } finally {
    lokal.gesperrt = false;
    store.setzeEinstellung("listen", "striche");
    store.setzeEinstellung("farbmodus", "system");
  }
});

test("CR-R6-10: Behaltener Fall: nach Schließen und nach Löschen mit „Rückgängig“ geht Strg+Z weiter; hat ein anderes Fenster ihn geändert, beginnt der Verlauf neu", () => {
  frisch();
  const f = behaltenerFall("Zi 70");
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "eins" } }));
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "zwei" } }));
  store.fallSchliessen(f.id);
  store.fallWiederherstellen();
  assert.equal(store.kannZurueck.value, true, "nur geschlossen");
  assert.ok(store.zurueck());
  assert.equal(store.aktiverFall.value!.zusatz.verlauf, "eins");

  store.fallSchliessen(f.id, true);
  assert.equal(eintrag(f.id), undefined);
  store.fallWiederherstellen();
  assert.equal(store.kannZurueck.value, true, "gelöscht");
  assert.equal(store.kannVor.value, true);

  store.fallSchliessen(f.id);
  fremdesFenster(f.id, (e) => ({ ...e, stand: e.stand + 1, fall: { ...e.fall, zusatz: { verlauf: "aus dem anderen Fenster" } } }));
  store.fallWiederherstellen();
  assert.equal(store.aktiverFall.value!.zusatz.verlauf, "aus dem anderen Fenster");
  assert.deepEqual([store.kannZurueck.value, store.kannVor.value], [false, false], "Strg+Z führte sonst über die fremde Änderung");
});

test("CR-R6-14: Schließen sagt, was geschah, und merkt sich nur etwas für „Rückgängig“, wenn es etwas zurückzuholen gibt", () => {
  frisch();
  store.fallNeu(ZNA);
  assert.equal(store.fallSchliessen(store.aktiverFall.value!.id), "geschlossen");
  assert.ok(store.geschlossen.value);

  let f = behaltenerFall("Zi 80");
  assert.equal(store.fallSchliessen(f.id), "behalten");
  assert.equal(eintrag(f.id)!.fenster, null);
  assert.equal(store.fallWiederherstellen(), "ok");
  assert.equal(store.fallSchliessen(f.id, true), "geloescht");
  assert.equal(eintrag(f.id), undefined);
  assert.equal(store.geschlossen.value!.behalten!.geloescht, true);

  // Der Browser verweigert das Schreiben: nicht gelöscht, und so steht es auch im Ergebnis. (Ein zweiter Eintrag, damit der
  // Speicher beim Löschen nicht leer würde: Einen leeren Bestand entfernt die App, statt ihn zu schreiben.)
  store.fallSchliessen(behaltenerFall("Zi 79").id);
  f = behaltenerFall("Zi 81");
  lokal.schreibenGesperrt = true;
  try {
    assert.equal(store.fallSchliessen(f.id, true), "nicht-geloescht");
  } finally {
    lokal.schreibenGesperrt = false;
  }
  assert.ok(eintrag(f.id), "liegt weiter auf dem PC");
  assert.equal(store.geschlossen.value!.behalten!.geloescht, false, "Rückgängig trägt ihn nicht ein zweites Mal ein");
  assert.equal(store.fallWiederherstellen(), "ok");
  assert.equal(gespeichert()!.faelle.filter((e) => e.id === f.id).length, 1);

  // Der Speicher ist nicht lesbar: Was dort liegt, bleibt; nichts zum Zurückholen.
  lokal.gesperrt = true;
  try {
    assert.equal(store.fallSchliessen(f.id, true), "nicht-geloescht");
  } finally {
    lokal.gesperrt = false;
  }
  assert.ok(eintrag(f.id));
  assert.equal(store.geschlossen.value, null);

  // Ein anderes Fenster hat ihn geholt, ohne dass das Ereignis ankam: hier nur geschlossen, dort unberührt.
  for (const loeschen of [false, true]) {
    frisch();
    f = behaltenerFall("Zi 82");
    fremdesFenster(f.id, (e) => ({ ...e, stand: e.stand + 1, fenster: "anderes" }));
    const vorher = lokal.getItem(SCHLUESSEL);
    assert.equal(store.fallSchliessen(f.id, loeschen), "anderswo");
    assert.equal(lokal.getItem(SCHLUESSEL), vorher);
    assert.equal(store.geschlossen.value, null);
    assert.equal(store.fallWiederherstellen(), "nichts");
  }

  // Dort schon gelöscht.
  frisch();
  f = behaltenerFall("Zi 83");
  fremdesFenster(f.id, () => null);
  assert.equal(store.fallSchliessen(f.id, true), "fehlt");
  assert.equal(store.geschlossen.value, null);
});

test("CR-R6-14, CR-R6-18: „Rückgängig“ sagt, warum der Fall nicht oder anders zurückkommt, und umgeht keine Prüfung der Liste", () => {
  frisch();
  assert.equal(store.fallWiederherstellen(), "nichts");

  // (b) Nach dem Reiter-× hat ein anderes Fenster den Fall geöffnet: nicht ohne Rückfrage hierher holen.
  let f = behaltenerFall("Zi 84");
  store.fallSchliessen(f.id);
  fremdesFenster(f.id, (e) => ({ ...e, stand: e.stand + 1, fenster: "anderes" }));
  let vorher = lokal.getItem(SCHLUESSEL);
  assert.equal(store.fallWiederherstellen(), "anderswo");
  assert.equal(lokal.getItem(SCHLUESSEL), vorher, "der Eintrag bleibt dem anderen Fenster");
  assert.equal(store.faelle.value.some((x) => x.id === f.id), false);
  assert.equal(store.geschlossen.value, null);

  // Nach dem Reiter-× anderswo gelöscht.
  frisch();
  f = behaltenerFall("Zi 85");
  store.fallSchliessen(f.id);
  fremdesFenster(f.id, () => null);
  assert.equal(store.fallWiederherstellen(), "fehlt");
  assert.equal(store.faelle.value.length, 0);

  // (a) Nach „Fall löschen“ trägt ein anderer Fall die Kurzbezeichnung, in anderer Schreibweise: nicht zweimal auf dem PC.
  frisch();
  const anderer = behaltenerFall("Zi 99");
  store.fallSchliessen(anderer.id);
  f = behaltenerFall("Zi 26");
  store.aendere((x) => ({ ...x, zusatz: { verlauf: "eins" } }));
  store.fallSchliessen(f.id, true);
  fremdesFenster(anderer.id, (e) => ({ ...e, kurz: "zi26", stand: e.stand + 1 }));
  vorher = lokal.getItem(SCHLUESSEL);
  assert.equal(store.fallWiederherstellen(), "doppelt");
  assert.equal(lokal.getItem(SCHLUESSEL), vorher, "kein zweiter Eintrag „Zi 26“");
  assert.equal(store.aktivId.value, f.id, "der Fall ist wieder offen");
  assert.equal(store.istBehalten(f.id), false, "aber nur in diesem Fenster");
  assert.equal(store.aktiverFall.value!.etikett, "Zi 26", "die Kurzbezeichnung bleibt als Merker");
  assert.equal(store.aktiverFall.value!.zusatz.verlauf, "eins");
  assert.equal(store.kannZurueck.value, true, "Strg+Z geht weiter: Der Fall ist, wie er hier war");

  // Nach „Fall löschen“ abgelaufen, in einer neueren Fassung überschrieben oder der Speicher verweigert.
  frisch();
  f = behaltenerFall("Zi 86");
  store.fallSchliessen(f.id, true);
  const echt = Date.now;
  Date.now = () => echt() + DREI_TAGE + 60_000;
  try {
    assert.equal(store.fallWiederherstellen(), "fehlt");
  } finally {
    Date.now = echt;
  }
  assert.equal(gespeichert(), null);

  frisch();
  f = behaltenerFall("Zi 87");
  store.fallSchliessen(f.id, true);
  lokal.schreibenGesperrt = true;
  try {
    assert.equal(store.fallWiederherstellen(), "gesperrt");
  } finally {
    lokal.schreibenGesperrt = false;
  }
  assert.equal(store.faelle.value.length, 0);

  frisch();
  f = behaltenerFall("Zi 88");
  store.fallSchliessen(f.id, true);
  lokal.setItem(SCHLUESSEL, JSON.stringify({ format: 2, faelle: [] }));
  assert.equal(store.fallWiederherstellen(), "neuer");
  lokal.removeItem(SCHLUESSEL);
});
