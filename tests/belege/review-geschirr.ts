// Geschirr der Belegtests des Code-Reviews (Nachprüfung 07./08.10.2026).
// Store und Aktionen laufen unverändert; ersetzt sind Fenster, Speicher, Zwischenablage und Zeitgeber.
// Zeitgeber werden gesammelt und mit `zeitgeber.laufe()` von Hand ausgelöst. `document.querySelector`
// liefert zu jedem Selektor ein Element, das festhält, dass es den Fokus bekam.

import assert from "node:assert/strict";
import type { AbschnittAnsicht, BriefAnsicht } from "../../src/engine/render.ts";
import type { AbschnittId, Baustein, Fall, Platzhalter, Segment, Vorlage } from "../../src/model/types.ts";

function speicherAttrappe() {
  const m = new Map<string, string>();
  return {
    gesperrt: false,
    inhalt: m,
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
export const lokal = speicherAttrappe();
export const sitzung = speicherAttrappe();
export const zwischenablage: { texte: string[]; gesperrt: boolean } = { texte: [], gesperrt: false };
export const fenster: { blur?: () => void } = {};
export const fokus: string[] = [];
export const zeitgeber = {
  wartend: [] as (() => void)[],
  laufe() {
    const jetzt = this.wartend;
    this.wartend = [];
    for (const fn of jetzt) fn();
  },
};

Object.assign(globalThis, {
  window: {
    localStorage: lokal,
    sessionStorage: sitzung,
    isSecureContext: true,
    setTimeout: (fn: () => void) => zeitgeber.wartend.push(fn),
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
    querySelector: (sel: string) => ({
      focus: () => void fokus.push(sel),
      closest: () => null,
      scrollIntoView() {},
      classList: { contains: () => false },
    }),
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
        zwischenablage.texte.push(t);
      },
    },
  },
});

export const store = await import("../../src/store.ts");
export const aktionen = await import("../../src/ui/aktionen.ts");
export const speicher = await import("../../src/speicher.ts");
export const fallOps = await import("../../src/engine/fall.ts");
export const INDEX = store.INDEX;

export function baustein(id: string, abschnitt: AbschnittId, segmente: Segment[], platzhalter: Platzhalter[] = []): Baustein {
  const b: Baustein = { id, titel: id, typ: "untersuchung", abschnitt, platzhalter, segmente };
  INDEX.bausteine.set(id, b);
  return b;
}
export function vorlage(id: string, abschnitte: Partial<Record<AbschnittId, string[]>>, mehr: Partial<Vorlage> = {}): Vorlage {
  const v: Vorlage = { id, titel: id, region: "t", setting: "zna", abschnitte, status: "entwurf", ...mehr };
  INDEX.vorlagen.set(id, v);
  return v;
}

/** Räumt ab, was ein vorheriger Test hinterlassen hat. */
export function frisch() {
  lokal.gesperrt = false;
  sitzung.gesperrt = false;
  zwischenablage.gesperrt = false;
  void aktionen.raeumeArbeitsplatz(true);
  zwischenablage.texte = [];
  zeitgeber.wartend = [];
  fokus.length = 0;
  fenster.blur?.();
}
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
/** Wo der Durchlauf gerade steht: offenes Fenster, offene Befundliste oder das zuletzt fokussierte Element. */
export const stand = (): string => aktionen.offenesFeld.value?.key ?? (aktionen.offeneListe.value ? `liste:${aktionen.offeneListe.value.bausteinId}` : `fokus:${fokus[fokus.length - 1] ?? "-"}`);
export const letzter = (): string => zwischenablage.texte[zwischenablage.texte.length - 1] ?? "";
