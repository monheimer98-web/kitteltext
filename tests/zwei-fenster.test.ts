// Zwei und mehr Fenster am selben PC (E-50, E-67, CR-R6-02, CR-R6-05): je Fenster eine eigene Store-Instanz mit eigenem
// Sitzungsspeicher und eigenen Hörern über einem gemeinsamen lokalen Speicher. Das Ereignis `storage` erreicht wie im
// Browser nur die anderen Fenster, und erst, wenn der Test es zustellt (`zustellen`); so lässt sich auch ein verpasstes
// Ereignis prüfen (Ruhezustand, Seitenspeicher des Browsers). tests/behalten-ablauf.test.ts prüft ein Fenster gegen
// einen von Hand geänderten Speicher, tests/e2e/behalten.spec.ts zwei echte Fenster im Browser. Dieselbe Vorrichtung
// lädt auch eine vorgegebene Sitzung (Formatstand, CR-R6-04).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Fall } from "../src/model/types.ts";

type Store = typeof import("../src/store.ts");
type Hoerer = (e: unknown) => void;

interface Speicher {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  inhalt(): Map<string, string>;
}

function speicherAttrappe(beimSchreiben?: (key: string, newValue: string | null) => void, vorab?: Map<string, string>): Speicher {
  const m = new Map(vorab);
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem(k, v) {
      if (m.get(k) === String(v)) return; // Gleicher Wert: Der Browser meldet nichts.
      m.set(k, String(v));
      beimSchreiben?.(k, String(v));
    },
    removeItem(k) {
      if (!m.has(k)) return;
      m.delete(k);
      beimSchreiben?.(k, null);
    },
    inhalt: () => m,
  };
}

interface Fenster {
  name: string;
  sitzung: Speicher;
  hoerer: Record<string, Hoerer[]>;
  /** Ereignisse `storage`, die das Fenster noch nicht bekommen hat */
  post: { key: string; newValue: string | null }[];
  store: Store;
}

const offen: Fenster[] = [];
let aktiv: Fenster | null = null;
const lokal = speicherAttrappe((key, newValue) => {
  for (const f of offen) if (f !== aktiv) f.post.push({ key, newValue });
});
const win: Record<string, unknown> = {
  localStorage: lokal,
  sessionStorage: null,
  isSecureContext: true,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  getSelection: () => null,
  addEventListener: (art: string, fn: Hoerer) => (aktiv!.hoerer[art] ??= []).push(fn),
};
Object.assign(globalThis, {
  window: win,
  document: { documentElement: { setAttribute() {}, removeAttribute() {} }, querySelector: () => null, querySelectorAll: () => [], activeElement: null },
  CSS: { escape: (s: string) => s },
});

const pause = () => new Promise((fertig) => setTimeout(fertig, 0));
let laufend = 0;

/**
 * Öffnet ein Fenster: lädt den Store neu, mit leerem Sitzungsspeicher oder, als Neuladen und Duplizieren, mit einer Kopie
 * des Sitzungsspeichers eines anderen Fensters, oder mit einem vorgegebenen Inhalt.
 */
async function oeffne(name: string, sitzungVon?: Fenster | Map<string, string>): Promise<Fenster> {
  const vorab = sitzungVon instanceof Map ? sitzungVon : sitzungVon?.sitzung.inhalt();
  const f = { name, sitzung: speicherAttrappe(undefined, vorab), hoerer: {}, post: [] } as unknown as Fenster;
  offen.push(f);
  aktiv = f;
  win.sessionStorage = f.sitzung;
  f.store = (await import(`../src/store.ts?${name}-${++laufend}`)) as Store;
  await pause();
  aktiv = null;
  return f;
}

/** Führt `fn` im Fenster aus, einschließlich der Mikroaufgaben danach (Schließen nach dem Zeichnen). */
async function inFenster<T>(f: Fenster, fn: (s: Store) => T): Promise<T> {
  aktiv = f;
  win.sessionStorage = f.sitzung;
  try {
    const r = fn(f.store);
    await pause();
    return r;
  } finally {
    aktiv = null;
  }
}

/** Stellt dem Fenster die Ereignisse `storage` zu, die es seit dem letzten Mal verpasst hat. */
async function zustellen(f: Fenster) {
  const post = f.post.splice(0);
  await inFenster(f, () => {
    for (const e of post) for (const h of f.hoerer.storage ?? []) h(e);
  });
}

/** Schließt das Fenster (`pagehide`); danach bekommt es keine Ereignisse mehr. */
async function schliesse(f: Fenster) {
  await inFenster(f, () => {
    for (const h of f.hoerer.pagehide ?? []) h({});
  });
  offen.splice(offen.indexOf(f), 1);
}

const gespeicherteEinstellungen = () => JSON.parse(lokal.getItem("kitteltext3.einstellungen") ?? "null") as Record<string, unknown> | null;
interface Eintrag {
  id: string;
  kurz: string;
  stand: number;
  fenster: string | null;
  fall: Fall;
}
const gespeichert = () => (JSON.parse(lokal.getItem("kitteltext3.behalten") ?? "null") as { faelle: Eintrag[] } | null)?.faelle ?? [];
const eintrag = (id: string) => gespeichert().find((e) => e.id === id);

/** Alle Fenster zu und der lokale Speicher leer, wie ein frisch gestarteter PC. */
async function neuerPc() {
  for (const f of [...offen]) await schliesse(f);
  for (const k of [...lokal.inhalt().keys()]) lokal.inhalt().delete(k);
}

async function behaltenerFall(f: Fenster, kurz: string): Promise<string> {
  return inFenster(f, (s) => {
    s.setzeEinstellung("stationBehalten", true);
    s.fallNeu(s.INDEX.vorlagen.get("station-frei")!);
    const id = s.aktiverFall.value!.id;
    assert.equal(s.fallBehalten(id, kurz), "ok");
    return id;
  });
}

// --- Einstellungen über Fenster (CR-R6-02) ---------------------------------------------------------------------------

test("CR-R6-02: Ausschalten in einem Fenster gilt in den anderen, sobald das Ereignis ankommt; dort schaltet kein Einstellungswechsel es wieder ein", async () => {
  await neuerPc();
  const a = await oeffne("A");
  const b = await oeffne("B");
  await inFenster(a, (s) => s.setzeEinstellung("stationBehalten", true));
  await zustellen(b);
  assert.equal(b.store.einstellungen.value.stationBehalten, true, "eingeschaltet in A gilt in B");

  await inFenster(a, (s) => s.behaltenAusschalten(true));
  await zustellen(b);
  assert.equal(b.store.einstellungen.value.stationBehalten, false, "ausgeschaltet in A gilt in B");
  await inFenster(b, (s) => {
    s.fallNeu(s.INDEX.vorlagen.get("station-frei")!);
    assert.equal(s.kurzFrage.value, null, "B fragt nicht mehr nach einer Kurzbezeichnung");
    assert.equal(s.fallBehalten(s.aktiverFall.value!.id, "Zi 30"), "aus");
    s.setzeEinstellung("farbmodus", "dunkel");
  });
  assert.deepEqual([gespeicherteEinstellungen()?.stationBehalten, gespeicherteEinstellungen()?.farbmodus], [false, "dunkel"]);
  assert.equal(gespeichert().length, 0);
  await zustellen(a);
  assert.equal(a.store.einstellungen.value.farbmodus, "dunkel", "und umgekehrt");
});

test("CR-R6-02: Kam das Ereignis nicht an, liest jedes Fenster vor dem Fragen, vor dem Behalten und vor jedem Ändern frisch", async () => {
  await neuerPc();
  const a = await oeffne("A");
  await inFenster(a, (s) => s.setzeEinstellung("stationBehalten", true));
  // Drei Fenster, die das Ausschalten verschlafen (Ruhezustand): Jedes prüft einen Weg für sich.
  const [b, c, d] = [await oeffne("B"), await oeffne("C"), await oeffne("D")];
  const offenInC = await inFenster(c, (s) => {
    s.fallNeu(s.INDEX.vorlagen.get("station-frei")!);
    return s.aktiverFall.value!.id;
  });
  await inFenster(a, (s) => {
    s.behaltenAusschalten(false);
    s.setzeEinstellung("listen", "fliesstext");
  });
  for (const f of [b, c, d]) assert.equal(f.store.einstellungen.value.stationBehalten, true, `${f.name} zeigt noch den alten Stand`);

  await inFenster(b, (s) => {
    s.fallNeu(s.INDEX.vorlagen.get("station-frei")!);
    assert.equal(s.kurzFrage.value, null, "B fragt nicht nach einer Kurzbezeichnung");
  });
  await inFenster(c, (s) => assert.equal(s.fallBehalten(offenInC, "Zi 31"), "aus", "C behält nicht"));
  assert.equal(gespeichert().length, 0);
  await inFenster(d, (s) => s.setzeEinstellung("zeilenende", "lf"));
  assert.deepEqual(
    [gespeicherteEinstellungen()?.stationBehalten, gespeicherteEinstellungen()?.listen, gespeicherteEinstellungen()?.zeilenende],
    [false, "fliesstext", "lf"],
    "D schreibt den Stand des PCs fort, nicht seinen alten",
  );
});

// --- Formatstand der Sitzung (CR-R6-04, CR-R5-03) --------------------------------------------------------------------

function medikationsfeld(s: Store): string {
  const b = [...s.INDEX.bausteine.values()].find((x) => x.platzhalter.some((p) => p.typ === "medikation"))!;
  return `${b.id}/${b.platzhalter.find((p) => p.typ === "medikation")!.id}`;
}

test("CR-R6-04: Sitzung ohne Format (1) lädt die Medikation ohne Tabulator, ab Format 2 bleibt er; nach dem ersten Schreiben wandelt das Neuladen nicht noch einmal", async () => {
  await neuerPc();
  const a = await oeffne("A");
  const feld = medikationsfeld(a.store);
  const fall = await inFenster(a, (s) => {
    s.fallNeu(s.INDEX.vorlagen.get("station-frei")!);
    return s.aktiverFall.value!;
  });
  const roh = { ...fall, werte: { [feld]: "Ramipril\t5 mg" } };
  const faelle: [number | undefined, string][] = [
    [undefined, "Ramipril 5 mg"],
    [1, "Ramipril 5 mg"],
    [2, "Ramipril\t5 mg"],
    [3, "Ramipril\t5 mg"],
  ];
  for (const [format, erwartet] of faelle) {
    const sitzung = { faelle: [roh], aktivId: roh.id, zaehler: 1, ...(format ? { format } : {}) };
    const w = await oeffne(`F${format}`, new Map([["kitteltext3.sitzung", JSON.stringify(sitzung)]]));
    assert.equal(w.store.faelle.value[0]?.werte[feld], erwartet, `Format ${format ?? "ohne"}`);
    assert.equal(JSON.parse(w.sitzung.getItem("kitteltext3.sitzung")!).format, 3, "geschrieben im heutigen Stand");
    const neu = await oeffne(`F${format}-neu`, w);
    assert.equal(neu.store.faelle.value[0]?.werte[feld], erwartet, `Format ${format ?? "ohne"}, neu geladen`);
  }
});

// --- Formatstand behaltener Fälle (CR-R6-03) -------------------------------------------------------------------------

/** Schreibt den gespeicherten Eintrag um, wie es eine andere Fassung getan hätte. */
function umschreiben(id: string, fn: (e: Record<string, unknown>) => Record<string, unknown>) {
  const roh = JSON.parse(lokal.getItem("kitteltext3.behalten")!) as { format: number; faelle: Record<string, unknown>[] };
  roh.faelle = roh.faelle.map((e) => (e.id === id ? fn(e) : e));
  lokal.setItem("kitteltext3.behalten", JSON.stringify(roh));
}

test("CR-R6-03: Ein behaltener Fall wird mit dem Formatstand gelesen, mit dem er geschrieben ist, beim Öffnen und beim Neuladen", async () => {
  await neuerPc();
  const a = await oeffne("A");
  const id = await behaltenerFall(a, "Zi 40");
  const feld = medikationsfeld(a.store);
  await inFenster(a, (s) => s.fallSchliessen(id));
  // So hätte eine Fassung mit Fallformat 1 geschrieben: Tabulator ohne Bedeutung, getippt (CR-R5-03).
  const alt = (e: Record<string, unknown>) => ({ ...e, fallFormat: 1, fall: { ...(e.fall as Fall), werte: { [feld]: "Ramipril\t5 mg" } } });
  umschreiben(id, alt);
  await inFenster(a, (s) => assert.equal(s.behaltenOeffnen(id), "ok"));
  assert.equal(a.store.aktiverFall.value!.werte[feld], "Ramipril 5 mg", "beim Öffnen umgewandelt");
  assert.deepEqual([eintrag(id)!.fall.werte[feld], (eintrag(id) as unknown as { fallFormat: number }).fallFormat], ["Ramipril 5 mg", 3], "und im heutigen Stand zurückgeschrieben");

  // Neuladen: Das Fenster gibt frei; inzwischen hat die alte Fassung den Eintrag noch einmal geschrieben.
  await schliesse(a);
  umschreiben(id, alt);
  const a2 = await oeffne("A2", a);
  assert.equal(a2.store.faelle.value.find((f) => f.id === id)?.werte[feld], "Ramipril 5 mg", "beim Neuladen umgewandelt");
});

test("CR-R6-03: Ein Fall mit höherem Fallformat wird gelistet und lässt sich löschen, aber diese Fassung öffnet und überschreibt ihn nie", async () => {
  await neuerPc();
  const a = await oeffne("A");
  const eigen = await behaltenerFall(a, "Zi 41");
  const fremd = await behaltenerFall(a, "Zi 42");
  await inFenster(a, (s) => s.fallSchliessen(fremd));
  const { SITZUNG_FORMAT } = await import("../src/speicher.ts");
  umschreiben(fremd, (e) => ({ ...e, fallFormat: SITZUNG_FORMAT + 1, fall: { ...(e.fall as Fall), ganzAnders: [1, 2] } }));
  const vorher = JSON.stringify(eintrag(fremd));
  await zustellen(a);
  await inFenster(a, (s) => {
    const e = s.bestand.value.eintraege.find((x) => x.id === fremd)!;
    assert.equal(s.ausNeuererFassung(e), true);
    assert.equal(s.fallAusEintrag(e), null);
    assert.equal(s.behaltenOeffnen(fremd), "neuer");
    assert.deepEqual(s.verwendetIn("vorlage", "station-frei").map((f) => f.id), [eigen]);
    s.aendere((f) => ({ ...f, zusatz: { verlauf: "nur im eigenen Fall" } }));
  });
  assert.equal(JSON.stringify(eintrag(fremd)), vorher, "der fremde Eintrag bleibt Zeichen für Zeichen");
  assert.equal(eintrag(eigen)!.fall.zusatz.verlauf, "nur im eigenen Fall");

  // Hatte dieses Fenster ihn mit der neueren Fassung offen (Datei getauscht, neu geladen), öffnet es ihn trotzdem nicht.
  const sitzung = JSON.parse(a.sitzung.getItem("kitteltext3.sitzung")!) as { behalten: string[] };
  a.sitzung.setItem("kitteltext3.sitzung", JSON.stringify({ ...sitzung, behalten: [...sitzung.behalten, fremd] }));
  await schliesse(a);
  const a2 = await oeffne("A2", a);
  assert.deepEqual(a2.store.faelle.value.map((f) => f.id), [eigen]);
  await inFenster(a2, (s) => assert.equal(s.behaltenLoeschen(fremd), true));
  assert.equal(eintrag(fremd), undefined);
});

// --- Ein Fall, ein Fenster (E-67, CR-R6-05) --------------------------------------------------------------------------
// Je Regel ein Test. Drei Lagen: (1) B holt den Fall aus A, A verpasst das Ereignis (Stand und Fenster ändern sich);
// (2) Wettlauf: A schreibt, B liest den Stand davor und holt; danach stimmt der Stand, den A kennt, nur das Fenster nicht;
// (3) Duplikat: ein dupliziertes Fenster erbt die Kennung von A; danach stimmt das Fenster, nur der Stand nicht.

const KEY = "kitteltext3.behalten";
const verlaufVon = (id: string) => eintrag(id)?.fall.zusatz?.verlauf;

/** Lage 1: B holt „Zi 50“ aus A; A erfährt nichts. */
async function geholt() {
  await neuerPc();
  const a = await oeffne("A");
  const id = await behaltenerFall(a, "Zi 50");
  await inFenster(a, (s) => s.aendere((f) => ({ ...f, zusatz: { verlauf: "aus A" } })));
  const b = await oeffne("B");
  await inFenster(b, (s) => assert.equal(s.behaltenOeffnen(id), "ok"));
  await inFenster(b, (s) => s.aendere((f) => ({ ...f, zusatz: { verlauf: "aus B" } })));
  a.post.length = 0;
  return { a, b, id };
}

/** Lage 2: A schreibt; B hat den Stand davor gelesen und holt. Stand gleich dem, den A kennt, Fenster B. */
async function wettlauf() {
  await neuerPc();
  const a = await oeffne("A");
  const id = await behaltenerFall(a, "Zi 51");
  const b = await oeffne("B");
  const vorher = lokal.getItem(KEY)!;
  assert.equal(eintrag(id)!.stand, 1);
  // A schreibt zweimal (Stand 3). B hat Stand 1 gelesen, holt (2) und schreibt den geholten Fall gleich danach (3).
  await inFenster(a, (s) => s.aendere((f) => ({ ...f, zusatz: { verlauf: "aus A" } })));
  await inFenster(a, (s) => s.aendere((f) => ({ ...f, zusatz: { verlauf: "noch einmal aus A" } })));
  assert.equal(eintrag(id)!.stand, 3);
  lokal.setItem(KEY, vorher);
  b.post.length = 0;
  await inFenster(b, (s) => assert.equal(s.behaltenOeffnen(id), "ok"));
  a.post.length = 0;
  assert.deepEqual([eintrag(id)!.stand, eintrag(id)!.fenster], [3, b.store.FENSTER], "Stand wie in A, Fenster B");
  return { a, b, id };
}

/** Lage 3: Duplikat von A (gleiche Kennung) übernimmt den Fall beim Start; A kennt einen älteren Stand. */
async function duplikat() {
  await neuerPc();
  const a = await oeffne("A");
  const id = await behaltenerFall(a, "Zi 52");
  await inFenster(a, (s) => s.aendere((f) => ({ ...f, zusatz: { verlauf: "aus A" } })));
  const kopie = await oeffne("A-Kopie", a);
  assert.equal(kopie.store.FENSTER, a.store.FENSTER);
  assert.ok(kopie.store.istBehalten(id));
  await inFenster(kopie, (s) => s.aendere((f) => ({ ...f, zusatz: { verlauf: "aus der Kopie" } })));
  a.post.length = 0;
  return { a, b: kopie, id };
}

const LAGEN = [
  ["geholt", geholt],
  ["Wettlauf", wettlauf],
  ["Duplikat", duplikat],
] as const;

test("CR-R6-05 Schreiben: Ein Fenster schreibt nie auf einen Eintrag, den ein anderes geholt hat, auch bei gleichem Stand oder gleicher Kennung", async () => {
  for (const [lage, aufbau] of LAGEN) {
    const { a, b, id } = await aufbau();
    const vorher = JSON.stringify(eintrag(id));
    await inFenster(a, (s) => s.aendere((f) => ({ ...f, zusatz: { verlauf: "später in A" } })));
    assert.equal(JSON.stringify(eintrag(id)), vorher, `${lage}: nichts überschrieben`);
    assert.equal(a.store.istBehalten(id), false, `${lage}: A hat den Fall geschlossen`);
    assert.ok(b.store.istBehalten(id), `${lage}: B behält ihn`);
  }
});

test("CR-R6-05 Ereignis und Kopieren: Erfährt A vom Holen, schließt es den Fall; vor dem Kopieren prüft es selbst", async () => {
  for (const [lage, aufbau] of LAGEN) {
    const { a, id } = await aufbau();
    await inFenster(a, (s) => assert.equal(s.behaltenNochHier(id), false, `${lage}: vor dem Kopieren erkannt`));
    assert.equal(a.store.istBehalten(id), false);
  }
  for (const [lage, aufbau] of LAGEN) {
    const { a, b, id } = await aufbau();
    // Ein beliebiges Schreiben im anderen Fenster (hier Kurzbezeichnung) löst das Ereignis aus.
    await inFenster(b, (s) => assert.equal(s.fallBehalten(id, "Zi 59"), "ok"));
    await zustellen(a);
    assert.equal(a.store.istBehalten(id), false, `${lage}: Ereignis erkannt`);
    assert.equal(a.store.aktivId.value, null, `${lage}: kein anderer Fall aktiv (PS-R6-1)`);
    assert.match(a.store.stehendeMeldung.value?.text ?? "", /„Zi 5\d“/);
  }
});

test("CR-R6-05 Freigeben beim Schließen des Fensters: nur, was dieses Fenster mit dem bekannten Stand offen hat", async () => {
  for (const [lage, aufbau] of LAGEN) {
    const { a, b, id } = await aufbau();
    await schliesse(a);
    assert.equal(eintrag(id)!.fenster, b.store.FENSTER, `${lage}: weiter bei B`);
  }
  // Gegenstück: Das eigene Fenster gibt frei.
  const { b, id } = await geholt();
  await schliesse(b);
  assert.equal(eintrag(id)!.fenster, null);
});

test("CR-R6-05 Fall schließen: Schließen und Löschen in A lassen einen Eintrag unberührt, den A nicht mehr hat", async () => {
  for (const loeschen of [false, true]) {
    for (const [lage, aufbau] of LAGEN) {
      const { a, b, id } = await aufbau();
      const vorher = JSON.stringify(eintrag(id));
      await inFenster(a, (s) => s.fallSchliessen(id, loeschen));
      assert.equal(JSON.stringify(eintrag(id)), vorher, `${lage}, ${loeschen ? "löschen" : "schließen"}: unverändert`);
      assert.equal(a.store.geschlossen.value, null, `${lage}: kein Rückgängig, das ihn ein zweites Mal öffnete`);
      assert.ok(b.store.istBehalten(id));
    }
  }
});

test("CR-R6-05 Holen: neuer Stand und neues Fenster, damit das alte Fenster es bemerkt", async () => {
  await neuerPc();
  const a = await oeffne("A");
  const id = await behaltenerFall(a, "Zi 53");
  const vorher = eintrag(id)!;
  const b = await oeffne("B");
  await inFenster(b, (s) => assert.equal(s.behaltenOeffnen(id), "ok"));
  const nachher = eintrag(id)!;
  assert.ok(nachher.stand > vorher.stand);
  assert.equal(nachher.fenster, b.store.FENSTER);
  await zustellen(a);
  assert.equal(a.store.istBehalten(id), false, "A hat den Fall geschlossen");
});

test("CR-R6-05 Rückgängig nach dem Löschen: nie ein zweiter Eintrag; abgelaufen kommt er nicht wieder, und der Eintrag eines anderen Fensters bleibt unberührt", async () => {
  await neuerPc();
  const a = await oeffne("A");
  let id = await behaltenerFall(a, "Zi 54");
  await inFenster(a, (s) => s.fallSchliessen(id, true));
  assert.equal(eintrag(id), undefined);
  // Ein anderes Fenster schreibt ihn aus einem älteren Lesestand zurück (CR-R6-20) und hat ihn offen: Rückgängig lässt ihn dort.
  const geloescht = a.store.geschlossen.value!;
  lokal.setItem(KEY, JSON.stringify({ format: 1, faelle: [{ ...geloescht.behalten!.eintrag, fenster: "anderes", fall: geloescht.fall }] }));
  const zurueck = lokal.getItem(KEY);
  assert.equal(await inFenster(a, (s) => s.fallWiederherstellen()), "anderswo");
  assert.equal(lokal.getItem(KEY), zurueck, "der Eintrag des anderen Fensters bleibt, wie er ist");
  assert.equal(a.store.faelle.value.some((f) => f.id === id), false);

  // Liegt er wieder frei auf dem PC, öffnet Rückgängig diesen Eintrag, statt ihn ein zweites Mal einzutragen.
  await inFenster(a, (s) => {
    s.geschlossen.value = geloescht;
  });
  lokal.setItem(KEY, JSON.stringify({ format: 1, faelle: [{ ...geloescht.behalten!.eintrag, fall: geloescht.fall }] }));
  assert.equal(await inFenster(a, (s) => s.fallWiederherstellen()), "ok");
  assert.deepEqual(gespeichert().filter((e) => e.id === id).map((e) => e.fenster), [a.store.FENSTER], "ein Eintrag, jetzt dieses Fensters");
  assert.ok(a.store.istBehalten(id));
  await inFenster(a, (s) => s.fallSchliessen(id, true));

  id = await behaltenerFall(a, "Zi 55");
  await inFenster(a, (s) => s.fallSchliessen(id, true));
  const echt = Date.now;
  Date.now = () => echt() + 72 * 3600_000 + 60_000;
  try {
    assert.equal(await inFenster(a, (s) => s.fallWiederherstellen()), "fehlt");
  } finally {
    Date.now = echt;
  }
  assert.equal(eintrag(id), undefined, "abgelaufen: nicht wieder eingetragen");
  assert.equal(a.store.faelle.value.some((f) => f.id === id), false);
});

test("CR-R6-18 Rückgängig nach dem Reiter-×: Hat ein anderes Fenster den Fall inzwischen geöffnet, bleibt er dort (keine Übernahme ohne Rückfrage)", async () => {
  await neuerPc();
  const a = await oeffne("A");
  const id = await behaltenerFall(a, "Zi 56");
  await inFenster(a, (s) => assert.equal(s.fallSchliessen(id), "behalten"));
  const b = await oeffne("B");
  await inFenster(b, (s) => assert.equal(s.behaltenOeffnen(id), "ok"));
  // Mit und ohne das Ereignis `storage`: A liest vor dem Zurückholen selbst.
  for (const mitEreignis of [false, true]) {
    if (mitEreignis) await zustellen(a);
    const vorher = lokal.getItem(KEY);
    await inFenster(a, (s) => {
      if (mitEreignis) s.geschlossen.value = { fall: b.store.faelle.value.find((f) => f.id === id)!, position: 0, behalten: { eintrag: { ...s.bestand.value.eintraege.find((e) => e.id === id)!, fenster: null }, geloescht: false } };
      assert.equal(s.fallWiederherstellen(), "anderswo");
    });
    assert.equal(lokal.getItem(KEY), vorher);
    assert.equal(a.store.istBehalten(id), false);
    await zustellen(b);
    assert.ok(b.store.istBehalten(id), "B behält den Fall");
  }
});

test("CR-R6-18 Rückgängig nach „Fall löschen“: Trägt inzwischen ein Fall eines anderen Fensters die Kurzbezeichnung, gibt es sie nicht zweimal auf dem PC", async () => {
  await neuerPc();
  const a = await oeffne("A");
  const id = await behaltenerFall(a, "Zi 26");
  await inFenster(a, (s) => assert.equal(s.fallSchliessen(id, true), "geloescht"));
  const b = await oeffne("B");
  const anderer = await behaltenerFall(b, "zi 26");
  await inFenster(a, (s) => assert.equal(s.fallWiederherstellen(), "doppelt"));
  assert.deepEqual(gespeichert().map((e) => [e.id, e.kurz]), [[anderer, "zi 26"]]);
  assert.equal(a.store.aktivId.value, id, "der Fall ist in A wieder offen");
  assert.equal(a.store.istBehalten(id), false);
  assert.equal(a.store.aktiverFall.value!.etikett, "Zi 26");
});

test("CR-R6-05 Neuladen: Das Fenster übernimmt nur Fälle, die frei oder seine sind, nie die eines anderen", async () => {
  await neuerPc();
  const a = await oeffne("A");
  const id = await behaltenerFall(a, "Zi 56");
  await inFenster(a, (s) => s.aendere((f) => ({ ...f, zusatz: { verlauf: "aus A" } })));
  // A lädt neu: gibt frei; bevor es wieder da ist, holt B den Fall.
  await schliesse(a);
  const b = await oeffne("B");
  await inFenster(b, (s) => assert.equal(s.behaltenOeffnen(id), "ok"));
  const a2 = await oeffne("A", a);
  assert.equal(a2.store.istBehalten(id), false);
  assert.equal(a2.store.faelle.value.some((f) => f.id === id), false);
  // Nicht erst geöffnet und beim ersten Schreiben wieder geschlossen. Er war aber der zuletzt offene Fall: Kein anderer
  // wird aktiv, und die stehende Meldung sagt, wo er ist (PS-R6C-3).
  assert.equal(a2.store.aktivId.value, null);
  assert.match(a2.store.stehendeMeldung.value?.text ?? "", /^„Zi 56“ ist inzwischen in einem anderen Fenster geöffnet\./);
  assert.equal(a2.store.behaltenMeldung.value, null);
  assert.equal(eintrag(id)!.fenster, b.store.FENSTER);
  assert.equal(verlaufVon(id), "aus A");
  // Gegenstück: Ist er frei, nimmt das neu geladene Fenster ihn wieder.
  await schliesse(b);
  await schliesse(a2);
  const a3 = await oeffne("A", a);
  assert.ok(a3.store.istBehalten(id));
});

test("CR-R6-19 Neuladen: Trägt ein behaltener Fall inzwischen eine Nummer, die hier schon vergeben ist, bekommt er die nächste dieses Fensters", async () => {
  await neuerPc();
  const a = await oeffne("A");
  await inFenster(a, (s) => s.fallNeu(s.INDEX.vorlagen.get("zna-frei")!));
  const id = await behaltenerFall(a, "Zi 31");
  await inFenster(a, (s) => s.fallNeu(s.INDEX.vorlagen.get("zna-frei")!));
  assert.deepEqual(a.store.faelle.value.map((f) => f.nr), [1, 2, 3]);
  // A wird vom Browser verworfen (kein `pagehide`); B holt „Zi 31“ als seinen dritten Fall, ändert ihn und gibt ihn frei.
  offen.splice(offen.indexOf(a), 1);
  const b = await oeffne("B");
  await inFenster(b, (s) => {
    s.fallNeu(s.INDEX.vorlagen.get("zna-frei")!);
    s.fallNeu(s.INDEX.vorlagen.get("zna-frei")!);
    assert.equal(s.behaltenOeffnen(id), "ok");
    s.aendere((f) => ({ ...f, zusatz: { verlauf: "aus B" } }));
  });
  await inFenster(b, (s) => assert.equal(s.fallSchliessen(id), "behalten"));
  assert.equal(eintrag(id)!.fall.nr, 3, "auf dem PC trägt er die Nummer aus B");

  const neu = await oeffne("A neu geladen", a);
  const nummern = neu.store.faelle.value.map((f) => f.nr);
  assert.equal(new Set(nummern).size, nummern.length, `keine Nummer doppelt: ${nummern.join(", ")}`);
  assert.deepEqual(nummern, [1, 4, 3], "die Fälle dieses Fensters behalten ihre Nummer, der behaltene bekommt die nächste");
  assert.ok(neu.store.istBehalten(id));
  assert.equal(neu.store.faelle.value.find((f) => f.id === id)!.zusatz.verlauf, "aus B");
  await inFenster(neu, (s) => s.fallNeu(s.INDEX.vorlagen.get("zna-frei")!));
  assert.equal(neu.store.aktiverFall.value!.nr, 5, "der Zähler geht danach weiter");
  assert.equal(eintrag(id)!.fall.nr, 4, "und so steht es auf dem PC");
});
