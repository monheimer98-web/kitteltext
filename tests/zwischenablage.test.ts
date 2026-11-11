// Abläufe des formatierten Kopierens (E-61) gegen Attrappen: welcher Weg in die Zwischenablage genommen wird, welche
// Fassungen dort landen, Rückfall ohne ClipboardItem und das Kopierereignis einer Markierung. Eigener Prozess, damit
// die Attrappen für ClipboardItem und execCommand die übrigen Ablauftests nicht berühren.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { BriefAnsicht } from "../src/engine/render.ts";
import type { AbschnittId, Baustein, Platzhalter, Segment, Vorlage } from "../src/model/types.ts";

function speicherAttrappe() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}

interface Ablage {
  /** was zuletzt hineinging, je Format */
  inhalt: Record<string, string>;
  /** benutzte Wege in Reihenfolge */
  wege: string[];
  writeGeht: boolean;
  writeTextGeht: boolean;
  execGeht: boolean;
}
const ablage: Ablage = { inhalt: {}, wege: [], writeGeht: true, writeTextGeht: true, execGeht: true };
const kopierHoerer = new Set<(e: unknown) => void>();

class ClipboardItemAttrappe {
  items: Record<string, Blob>;
  constructor(items: Record<string, Blob>) {
    this.items = items;
  }
}

Object.assign(globalThis, {
  window: {
    localStorage: speicherAttrappe(),
    sessionStorage: speicherAttrappe(),
    isSecureContext: true,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    getSelection: () => null,
    addEventListener: () => {},
  },
  document: {
    documentElement: { setAttribute() {}, removeAttribute() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    activeElement: null,
    body: { appendChild() {} },
    createElement: () => ({ style: {}, value: "", setAttribute() {}, focus() {}, select() {}, setSelectionRange() {}, remove() {} }),
    addEventListener: (art: string, fn: (e: unknown) => void) => art === "copy" && kopierHoerer.add(fn),
    removeEventListener: (art: string, fn: (e: unknown) => void) => art === "copy" && kopierHoerer.delete(fn),
    execCommand: (befehl: string) => {
      if (befehl !== "copy" || !ablage.execGeht) return false;
      ablage.wege.push("execCommand");
      const gesetzt: Record<string, string> = {};
      let verhindert = false;
      const e = { clipboardData: { setData: (t: string, v: string) => (gesetzt[t] = v) }, preventDefault: () => (verhindert = true) };
      for (const fn of kopierHoerer) fn(e);
      ablage.inhalt = verhindert ? gesetzt : { "text/plain": "(Markierung des Textfelds)" };
      return true;
    },
  },
  CSS: { escape: (s: string) => s },
  ClipboardItem: ClipboardItemAttrappe,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    clipboard: {
      write: async (items: ClipboardItemAttrappe[]) => {
        if (!ablage.writeGeht) throw new Error("NotAllowedError");
        ablage.wege.push("write");
        const inhalt: Record<string, string> = {};
        for (const [typ, blob] of Object.entries(items[0].items)) inhalt[typ] = await blob.text();
        ablage.inhalt = inhalt;
      },
      writeText: async (t: string) => {
        if (!ablage.writeTextGeht) throw new Error("NotAllowedError");
        ablage.wege.push("writeText");
        ablage.inhalt = { "text/plain": t };
      },
    },
  },
});

const store = await import("../src/store.ts");
const aktionen = await import("../src/ui/aktionen.ts");
const { inZwischenablage } = await import("../src/ui/kopieren.ts");

function baustein(id: string, abschnitt: AbschnittId, segmente: Segment[], platzhalter: Platzhalter[] = []): Baustein {
  return { id, titel: id, typ: "diagnose", abschnitt, platzhalter, segmente };
}
const DX = baustein("z-dx", "diagnose", [
  { art: "text", text: "Distale Radiusfraktur " },
  { art: "seite" },
  { art: "unterpunkt" },
  { art: "option", id: "ao", label: "AO", an: true, text: " (AO 23-A2)" },
]);
const PROC = baustein("z-proc", "procedere", [
  { art: "punkt" },
  { art: "option", id: "a", label: "Kontrolle", an: true, text: "Kontrolle in der Hausarztpraxis." },
  { art: "punkt" },
  { art: "option", id: "b", label: "Kühlen", an: true, text: "Kühlen ≥ 3-mal täglich." },
]);
const MED = baustein(
  "z-med",
  "medikation",
  [{ art: "punkt" }, { art: "platzhalter", ref: "liste" }],
  [{ id: "liste", typ: "medikation", label: "Arzneimittel", required: true }],
);
for (const b of [DX, PROC, MED]) store.INDEX.bausteine.set(b.id, b);
const V: Vorlage = { id: "z-v", titel: "z-v", region: "t", setting: "zna", status: "entwurf", abschnitte: { diagnose: ["z-dx"], procedere: ["z-proc"], medikation: ["z-med"] } };
store.INDEX.vorlagen.set(V.id, V);

const ansicht = (id: AbschnittId) => {
  const a = (store.brief.value as BriefAnsicht).abschnitte.find((x) => x.id === id);
  assert.ok(a);
  return a;
};
const grau = (id: AbschnittId) => ansicht(id).tokens.filter((t) => t.zustand === "vorschlag" && t.key).map((t) => t.key!);

async function frisch(wege: Partial<Ablage> = {}) {
  Object.assign(ablage, { writeGeht: true, writeTextGeht: true, execGeht: true });
  await aktionen.raeumeArbeitsplatz(true);
  // Das Überschreiben beim Räumen läuft asynchron; erst danach zählen die Wege des Tests.
  await new Promise((fertig) => setImmediate(fertig));
  Object.assign(ablage, { inhalt: {}, wege: [] }, wege);
  store.setzeEinstellung("formatiert", true);
  store.fallNeu(V, "rechts");
  aktionen.uebernimm([...grau("diagnose"), ...grau("procedere")]);
}

test("Formatiert an: ein Abschnitt geht als reiner Text (KIS-sicher, Windows-Zeilenenden) und als HTML hinaus", async () => {
  await frisch();
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("procedere")), true);
  assert.deepEqual(ablage.wege, ["write"]);
  assert.equal(ablage.inhalt["text/plain"], "- Kontrolle in der Hausarztpraxis.\r\n- Kühlen >= 3-mal täglich.");
  assert.equal(
    ablage.inhalt["text/html"],
    '<meta charset="utf-8"><ul style="margin:0;padding-left:2em"><li style="margin:0">Kontrolle in der Hausarztpraxis.</li><li style="margin:0">Kühlen &gt;= 3-mal täglich.</li></ul>',
  );
  assert.equal(aktionen.letzteKopie.value?.fassung, "formatiert");
});

test("Ganzer Brief: Überschriften fett in der HTML-Fassung, im Text wie bisher", async () => {
  await frisch();
  // Die Medikation ist leer und damit nicht fertig: Sie aus dem Brief nehmen, wie es der Arzt mit „Abschnitt nicht in den Brief“ täte.
  store.aendere((f) => ({ ...f, ausgeblendet: { ...f.ausgeblendet, medikation: true } }));
  assert.equal(await aktionen.kopiereAlles(), true);
  assert.equal(ablage.inhalt["text/plain"], "Diagnose:\r\nDistale Radiusfraktur rechts\r\n  - AO 23-A2\r\n\r\nProcedere:\r\n- Kontrolle in der Hausarztpraxis.\r\n- Kühlen >= 3-mal täglich.");
  assert.match(ablage.inhalt["text/html"], /^<meta charset="utf-8"><p style="margin:0"><b>Diagnose:<\/b><\/p><p style="margin:0;text-align:justify">Distale Radiusfraktur rechts<\/p><ul [^>]*><li [^>]*>AO 23-A2<\/li><\/ul><p style="margin:0"><br><\/p><p style="margin:0"><b>Procedere:<\/b><\/p><ul/);
});

test("Rückfall: verweigert der Browser die formatierte Fassung, geht der reine Text über writeText hinaus", async () => {
  await frisch({ writeGeht: false });
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("procedere")), true);
  assert.deepEqual(ablage.wege, ["writeText"]);
  assert.deepEqual(Object.keys(ablage.inhalt), ["text/plain"]);
  assert.equal(aktionen.letzteKopie.value?.fassung, "text");
});

test("Rückfall ohne ClipboardItem (Firefox ESR 115): reiner Text über writeText", async () => {
  const alt = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  try {
    await frisch();
    assert.equal(await inZwischenablage("Text", "<p>Text</p>"), "text");
    assert.deepEqual(ablage.wege, ["writeText"]);
    assert.deepEqual(ablage.inhalt, { "text/plain": "Text" });
  } finally {
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = alt;
  }
});

test("Rückfall über das Textfeld: das Kopierereignis setzt beide Fassungen; ohne HTML nur den Text", async () => {
  await frisch({ writeGeht: false, writeTextGeht: false });
  assert.equal(await inZwischenablage("Zeile", "<p>Zeile</p>"), "formatiert");
  assert.deepEqual(ablage.inhalt, { "text/plain": "Zeile", "text/html": "<p>Zeile</p>" });
  assert.equal(kopierHoerer.size, 0, "der Hörer ist wieder abgemeldet");
  assert.equal(await inZwischenablage("Nur Text"), "text");
  assert.deepEqual(ablage.inhalt, { "text/plain": "(Markierung des Textfelds)" });
  ablage.execGeht = false;
  assert.equal(await inZwischenablage("Nichts"), false);
});

test("Formatiert aus: nur reiner Text, auch wenn der Browser beides könnte", async () => {
  await frisch();
  store.setzeEinstellung("formatiert", false);
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("procedere")), true);
  assert.deepEqual(ablage.wege, ["writeText"]);
  assert.deepEqual(Object.keys(ablage.inhalt), ["text/plain"]);
  assert.equal(aktionen.letzteKopie.value?.fassung, null);
});

test("Nicht fertig: Die Zwischenablage wird mit reinem Text entwertet, keine alte formatierte Fassung bleibt", async () => {
  await frisch();
  await aktionen.kopiereAbschnitt(ansicht("procedere"));
  assert.ok(ablage.inhalt["text/html"]);
  // Die Medikation ist leer: Der ganze Brief geht nicht hinaus, die Zwischenablage wird ganz überschrieben.
  assert.equal(await aktionen.kopiereAlles(), false);
  assert.equal(ablage.inhalt["text/plain"], "[Kitteltext: nichts kopiert, der Abschnitt ist noch nicht fertig]");
  assert.equal(ablage.inhalt["text/html"], undefined);
});

test("Medikation: Tabelle in der HTML-Fassung, je Zeile ein Spiegelstrich im Text", async () => {
  await frisch();
  const { schreibeMedikation, leereZeile } = await import("../src/engine/medikation.ts");
  store.aendere((f) => ({
    ...f,
    werte: {
      ...f.werte,
      "z-med/liste": schreibeMedikation([
        { ...leereZeile(), wirkstoff: "Ibuprofen", staerke: "600 mg Tablette", schema: ["1", "0", "1", "0"], hinweis: "für 7 Tage", status: "NEU" },
        { ...leereZeile(), wirkstoff: "Pantoprazol", staerke: "20 mg Tablette", schema: ["1", "0", "0", "0"], hinweis: "solange Ibuprofen", status: "NEU" },
      ]),
    },
  }));
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("medikation")), true);
  assert.equal(ablage.inhalt["text/plain"], "- Ibuprofen 600 mg Tablette, 1-0-1-0, für 7 Tage. NEU.\r\n- Pantoprazol 20 mg Tablette, 1-0-0-0, solange Ibuprofen. NEU.");
  const html = ablage.inhalt["text/html"];
  assert.match(html, /<table/);
  assert.equal((html.match(/<tr>/g) ?? []).length, 3, "Kopf und zwei Zeilen");
  assert.match(html, /<td [^>]*>Pantoprazol<\/td><td [^>]*>20 mg Tablette<\/td><td [^>]*>1-0-0-0<\/td><td [^>]*>solange Ibuprofen\. NEU<\/td>/);
});

test("Markierung mit Strg+C: beide Fassungen; mit offener Stelle nur der Hinweistext", async () => {
  await frisch();
  const gesetzt: Record<string, string> = {};
  const ereignis = (beruehrt: boolean) => ({
    clipboardData: { setData: (t: string, v: string) => (gesetzt[t] = v) },
    preventDefault() {},
    currentTarget: { querySelectorAll: () => (beruehrt ? [{}] : []) },
  });
  Object.assign(globalThis.window, { getSelection: () => ({ toString: () => "Procedere\n- Kontrolle.\n- Kühlen.", containsNode: () => true }) });
  aktionen.beiKopieAusBrief(ereignis(false) as unknown as ClipboardEvent);
  assert.equal(gesetzt["text/plain"], "Procedere\r\n- Kontrolle.\r\n- Kühlen.");
  assert.match(gesetzt["text/html"], /<p style="margin:0;text-align:justify">Procedere<\/p><ul [^>]*><li [^>]*>Kontrolle\.<\/li><li [^>]*>Kühlen\.<\/li><\/ul>$/);
  for (const k of Object.keys(gesetzt)) delete gesetzt[k];
  aktionen.beiKopieAusBrief(ereignis(true) as unknown as ClipboardEvent);
  assert.deepEqual(Object.keys(gesetzt), ["text/plain"]);
  assert.match(gesetzt["text/plain"], /nichts kopiert/);
  Object.assign(globalThis.window, { getSelection: () => null });
});

test("PS-R6-5: Behaltener Fall, den ein anderes Fenster geholt hat, ohne Ereignis: nichts kopiert, Zwischenablage entwertet, Fall geschlossen", async () => {
  await frisch();
  const VS: Vorlage = { ...V, id: "z-vs", setting: "station" };
  store.INDEX.vorlagen.set(VS.id, VS);
  store.setzeEinstellung("stationBehalten", true);
  store.fallNeu(VS, "rechts");
  store.kurzFrage.value = null;
  aktionen.uebernimm(grau("procedere"));
  const f = store.aktiverFall.value!;
  assert.equal(store.fallBehalten(f.id, "Zi 12"), "ok");
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("procedere")), true);
  // Fenster B holt den Fall; das Ereignis `storage` kommt hier nicht an (Seitenspeicher, Ruhezustand).
  const roh = JSON.parse(window.localStorage.getItem("kitteltext3.behalten")!);
  roh.faelle[0] = { ...roh.faelle[0], fenster: "fenster-b", stand: roh.faelle[0].stand + 1 };
  window.localStorage.setItem("kitteltext3.behalten", JSON.stringify(roh));
  Object.assign(ablage, { inhalt: { "text/plain": "Text von vorhin" }, wege: [] });
  store.stehendeMeldung.value = null;
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("procedere")), false);
  await new Promise((fertig) => setImmediate(fertig));
  assert.deepEqual(ablage.inhalt, { "text/plain": "[Kitteltext: nichts kopiert, der Fall ist in diesem Fenster nicht mehr offen]" });
  assert.equal(store.aktiverFall.value, null);
  assert.equal(store.stehendeMeldung.value!.text, "„Zi 12“ ist jetzt in einem anderen Fenster geöffnet und hier geschlossen. Nichts kopiert.");
  store.stehendeMeldung.value = null;
  store.setzeEinstellung("stationBehalten", false);
});

test("PS-R6-3: Kopiermeldung eines behaltenen Falls nennt den Stand von einem früheren Tag, nach einer Änderung heute nicht mehr", async () => {
  await frisch();
  const VS: Vorlage = { ...V, id: "z-vs", setting: "station" };
  store.INDEX.vorlagen.set(VS.id, VS);
  store.setzeEinstellung("stationBehalten", true);
  store.fallNeu(VS, "rechts");
  store.kurzFrage.value = null;
  aktionen.uebernimm(grau("procedere"));
  const f = store.aktiverFall.value!;
  assert.equal(store.fallBehalten(f.id, "Zi 12"), "ok");
  const { meldung } = await import("../src/ui/kopieren.ts");
  const echt = Date.now;
  const morgen = new Date(Math.max(f.erstellt, f.geaendert) + 24 * 3600_000).setHours(9, 0, 0, 0);
  try {
    Date.now = () => morgen;
    assert.equal(await aktionen.kopiereAbschnitt(ansicht("procedere")), true);
    assert.match(meldung.value!.text, /^Procedere kopiert · Stand gestern · Fall \d+ · /);
    store.aendere((x) => ({ ...x, zusatz: { procedere: "Heute ergänzt." } }));
    assert.equal(await aktionen.kopiereAbschnitt(ansicht("procedere")), true);
    assert.match(meldung.value!.text, /^Procedere kopiert · Fall \d+ · /);
  } finally {
    Date.now = echt;
    store.setzeEinstellung("stationBehalten", false);
  }
});
