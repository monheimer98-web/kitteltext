// Prüfgeschirr der Nachprüfung Patientensicherheit (07.10.2026). Lädt Store und
// Aktionen unverändert; ersetzt sind nur Fenster, Speicher und Zwischenablage.
// Die Zwischenablage ist eine Liste: Ihr letzter Eintrag ist, was Strg+V ins KIS schriebe.

import assert from "node:assert/strict";
import type { AbschnittAnsicht, BriefAnsicht } from "../../src/engine/render.ts";
import type { AbschnittId, Fall } from "../../src/model/types.ts";

function speicherAttrappe() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}
export const zwischenablage: { texte: string[] } = { texte: [] };
export const fenster: { blur?: () => void } = {};

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
  value: { clipboard: { writeText: async (t: string) => void zwischenablage.texte.push(t) } },
});

export const store = await import("../../src/store.ts");
export const aktionen = await import("../../src/ui/aktionen.ts");
export const fallOps = await import("../../src/engine/fall.ts");
export const render = await import("../../src/engine/render.ts");
export const INDEX = store.INDEX;

/** Räumt ab, was ein vorheriger Test hinterlassen hat. */
export function frisch() {
  aktionen.raeumeArbeitsplatz();
  store.eigenesErsetzen({ bausteine: [], vorlagen: [] });
  zwischenablage.texte = [];
  fenster.blur?.();
}
export const vorlage = (id: string) => {
  const v = INDEX.vorlagen.get(id);
  assert.ok(v, `Vorlage ${id} fehlt`);
  return v;
};
export const aktiv = (): Fall => {
  const f = store.aktiverFall.value;
  assert.ok(f, "kein aktiver Fall");
  return f;
};
export const brief = (): BriefAnsicht => store.brief.value as BriefAnsicht;
export const ansicht = (id: AbschnittId): AbschnittAnsicht => {
  const a = brief().abschnitte.find((x) => x.id === id);
  assert.ok(a, `Abschnitt ${id} fehlt`);
  return a;
};
export const letzter = (): string => zwischenablage.texte[zwischenablage.texte.length - 1] ?? "";
export const NICHT = /nichts kopiert/;
/** Was je im Test in der Zwischenablage lag, ohne die Hinweistexte „nichts kopiert". */
export const kopiertes = (): string[] => zwischenablage.texte.filter((t) => !NICHT.test(t) && t.trim() !== "");
/** Schlüssel der grauen Textstellen eines Abschnitts (wie sie die Oberfläche an „Übernehmen" gibt). */
export const grau = (id: AbschnittId, nur?: "befund" | "saetze"): string[] =>
  ansicht(id)
    .tokens.filter((t) => t.zustand === "vorschlag" && t.key && (!nur || (nur === "befund") === (t.art === "befund")))
    .map((t) => t.key!);
export const token = (key: string) => {
  for (const a of brief().abschnitte) {
    const t = a.tokens.find((x) => x.key === key);
    if (t) return t;
  }
  return undefined;
};
/** Wie die Oberfläche je Block bzw. je Untersuchungsgruppe: alle grauen Stellen des Briefs übernehmen. */
export function allesUebernehmen() {
  aktionen.uebernimm(brief().abschnitte.flatMap((a) => a.tokens.filter((t) => t.zustand === "vorschlag" && t.key).map((t) => t.key!)));
}

/**
 * Klärt jede offene Stelle des aktiven Falls über dieselben Operationen wie die
 * Oberfläche und übernimmt danach alle Vorschläge. Hängt nicht an einzelnen
 * Schlüsseln des Katalogs, weil die Redaktion während der Prüfung weiterschreibt.
 * `wahl` bestimmt, welche Option einer Auswahl genommen wird (Standard: die erste wählbare).
 */
export function klaereAlles(wahl: (optionen: string[]) => number = (o) => o.findIndex((x) => x !== "")) {
  for (let runde = 0; runde < 6; runde++) {
    const offen = brief().abschnitte.flatMap((a) => a.tokens.filter((t) => t.zustand === "offen" && t.key));
    if (offen.length === 0) break;
    for (const t of offen) {
      const key = t.key!;
      const [bid, sid] = key.split("/");
      const b = INDEX.bausteine.get(bid);
      const seg = b?.segmente.find((s) => "id" in s && s.id === sid);
      if (t.art === "person") store.aendere((f) => fallOps.mitPerson(f, "w", "34"));
      else if (t.art === "seite") store.aendere((f) => fallOps.mitSeite(f, "rechts"));
      else if (t.art === "feld") store.aendere((f) => fallOps.mitWert(f, key, "Angabe"));
      else if (seg?.art === "auswahl") store.aendere((f) => fallOps.mitAuswahl(f, key, wahl(seg.optionen)));
      else if (seg?.art === "befund" && aktiv().befund[key] === undefined) store.aendere((f) => fallOps.mitBefund(f, key, "ok"));
      else if (seg?.art === "option" || seg?.art === "befund") {
        for (const sl of seg.slots ?? []) {
          const k = `${key}/${sl.id}`;
          if (aktiv().slots[k]) continue;
          const wert = sl.art === "auswahl" ? String(wahl(sl.optionen)) : sl.art === "lokaleSeite" ? "rechts" : "1";
          if (sl.art !== "auswahl" && !("required" in sl && sl.required)) continue;
          store.aendere((f) => (seg.art === "option" ? fallOps.mitAngabe(f, key, k, wert) : fallOps.mitSlot(f, k, wert)));
        }
      }
    }
  }
  allesUebernehmen();
}
