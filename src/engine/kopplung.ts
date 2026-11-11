// Einmal eingeben (M-14, E-60) und Folgeangaben (M-24, E-60). Die Regeln stehen im Katalog (`katalog.regeln`, Daten in
// `src/data/kopplung.ts`); hier steht nur, wie sie wirken.
//
// Übertragen wird nur, was der Arzt selbst geantwortet hat, nie ein Vorschlag der Vorlage, und nur an Stellen, an denen
// er noch nichts gewählt hat: Eine bewusste Abweichung an einer Stelle bleibt. Nichts wird in den Fall geschrieben; die
// Antwort erscheint beim Zeichnen und wird erst mit „Übernehmen“ zum Wert der Stelle.

import type { AbschnittId, Baustein, Fall, Katalogregeln, Koppelglied, Kopplung } from "../model/types.ts";
import type { KatalogIndex } from "./render.ts";

export interface Uebertragung {
  /** Wert, wie ihn die Stelle speichert: Index der Möglichkeit (als Text) oder Wortlaut */
  wert: string;
  /** Wo die Antwort herkommt (Titel des Bausteins) */
  quelle: string;
  /** Abschnitt, in dem die Antwort steht */
  abschnitt: AbschnittId;
  /** gleicher Bezug: die Antwort gilt als Aussage des Arztes, sonst als Vorschlag */
  aussage: boolean;
}

interface Stelle {
  key: string;
  bezug: string;
  ordnung: number;
  baustein: Baustein;
  abschnitt: AbschnittId;
  /** Möglichkeiten einer Auswahl; null bei freiem Text */
  optionen: readonly string[] | null;
  art: "angabe" | "auswahl" | "feld";
}

function index(roh: unknown, anzahl: number): number | undefined {
  const n = typeof roh === "number" ? roh : typeof roh === "string" && /^\d+$/.test(roh) ? Number(roh) : NaN;
  return Number.isInteger(n) && n >= 0 && n < anzahl ? n : undefined;
}

function stelleVon(katalog: KatalogIndex, glied: Koppelglied, ordnung: number, abschnitt: AbschnittId = "diagnose"): Stelle | null {
  const [bausteinId, id, angabe] = glied.key.split("/");
  const b = katalog.bausteine.get(bausteinId);
  if (!b || !id) return null;
  const basis = { key: glied.key, bezug: glied.bezug, ordnung, baustein: b, abschnitt };
  if (angabe) {
    const seg = b.segmente.find((s) => s.art === "option" && s.id === id);
    const slot = seg?.art === "option" ? seg.slots?.find((x) => x.id === angabe) : undefined;
    if (slot?.art === "auswahl") return { ...basis, optionen: slot.optionen, art: "angabe" };
    if (slot?.art === "detail") return { ...basis, optionen: null, art: "angabe" };
    return null;
  }
  const seg = b.segmente.find((s) => s.art === "auswahl" && s.id === id);
  if (seg?.art === "auswahl") return { ...basis, optionen: seg.optionen, art: "auswahl" };
  const def = b.platzhalter.find((p) => p.id === id);
  if (def && (def.typ === "freitext" || def.typ === "begriff")) return { ...basis, optionen: null, art: "feld" };
  return null;
}

/** Was der Arzt an dieser Stelle selbst geantwortet hat (Wortlaut, ohne Rand); undefined, wenn nichts. */
function antwort(fall: Fall, st: Stelle): string | undefined {
  if (st.art === "angabe") {
    const [b, s] = st.key.split("/");
    // Ein Satz, den der Arzt entfernt hat oder nie eingeschaltet hat, sagt nichts.
    if (fall.optionen[`${b}/${s}`] !== true) return undefined;
    const roh = fall.slots[st.key];
    if (st.optionen) {
      const i = index(roh, st.optionen.length);
      return i === undefined ? undefined : st.optionen[i].trim() || undefined;
    }
    return roh?.trim() || undefined;
  }
  if (st.art === "auswahl") {
    if ((fall.eigen[st.key] ?? "").trim()) return undefined;
    const i = index(fall.auswahl[st.key], st.optionen!.length);
    return i === undefined ? undefined : st.optionen![i].trim() || undefined;
  }
  if (fall.spaeter[st.key]) return undefined;
  const w = (fall.werte[st.key] ?? "").trim();
  // Eine Lücke im Wortlaut (‹…›) ist noch keine Antwort.
  return w && !w.includes("‹") ? w : undefined;
}

/**
 * Hat die Stelle schon einen eigenen Wert? Dann bleibt sie, wie der Arzt sie hat. Ein leeres Textfeld ist keiner: Wer
 * ein Zeichen tippt und wieder löscht, sieht den Vorschlag wieder, statt einer offenen Stelle ohne ihn (PS-R6F-2).
 */
function belegt(fall: Fall, st: Stelle): boolean {
  if (st.art === "angabe") return fall.slots[st.key] !== undefined;
  if (st.art === "auswahl") return fall.auswahl[st.key] !== undefined || fall.eigen[st.key] !== undefined;
  return !!(fall.werte[st.key] ?? "").trim() || !!fall.spaeter[st.key];
}

/** Begriff einer Antwort: mit Begriffen der eindeutig passende, sonst der Wortlaut selbst. */
function begriff(text: string, begriffe: Record<string, RegExp> | undefined): string | null {
  if (!begriffe) return text;
  const treffer = Object.entries(begriffe).filter(([, re]) => re.test(text));
  return treffer.length === 1 ? treffer[0][0] : null;
}

/** Wert für die Zielstelle, der denselben Begriff trägt; null, wenn keine oder mehrere Möglichkeiten passen. */
function wertFuer(ziel: Stelle, b: string, begriffe: Record<string, RegExp> | undefined, text: string): string | null {
  if (!ziel.optionen) return begriffe ? null : text;
  const passend = ziel.optionen.map((o, i) => (o.trim() && begriff(o.trim(), begriffe) === b ? i : -1)).filter((i) => i >= 0);
  return passend.length === 1 ? String(passend[0]) : null;
}

interface Quelle {
  st: Stelle;
  text: string;
  /** Begriff der Antwort (mit Begriffen der passende, sonst der Wortlaut) */
  b: string;
}

/**
 * Stellen jeder Kopplung, die im Brief stehen, und die Antworten des Arztes darunter. Nur Stellen, die im Brief stehen,
 * geben oder bekommen etwas: nicht in einem ausgeblendeten oder von Hand geschriebenen Abschnitt und nicht in
 * `nichtImBrief` (weggelassen oder durch ein Standardprotokoll ersetzt, Schlüssel des Satzes oder der Auswahl). Sonst
 * käme eine Antwort aus einem Satz, den der Arzt im Brief nicht mehr sieht.
 */
function gekoppelt(
  fall: Fall,
  katalog: KatalogIndex,
  regeln: Katalogregeln | undefined,
  nichtImBrief: ReadonlySet<string>,
): { k: Kopplung; stellen: Stelle[]; quellen: Quelle[] }[] {
  const zaehlt = (a: string) => !fall.ausgeblendet[a as AbschnittId] && fall.manuell[a as AbschnittId] === undefined;
  const abschnittVon = new Map<string, AbschnittId>();
  for (const [a, l] of Object.entries(fall.bausteine)) if (zaehlt(a)) for (const b of l ?? []) abschnittVon.set(b, a as AbschnittId);
  const sichtbar = (key: string) => {
    const [b, seg] = key.split("/");
    return abschnittVon.has(b) && !nichtImBrief.has(key) && !nichtImBrief.has(`${b}/${seg}`);
  };
  return (regeln?.kopplungen ?? []).map((k) => {
    const bezuege = [...new Set(k.glieder.map((g) => g.bezug))];
    const stellen = k.glieder
      .filter((g) => sichtbar(g.key))
      .map((g) => stelleVon(katalog, g, bezuege.indexOf(g.bezug), abschnittVon.get(g.key.split("/")[0])))
      .filter((s): s is Stelle => s !== null);
    const quellen = stellen.flatMap((st) => {
      const text = antwort(fall, st);
      const b = text === undefined ? null : begriff(text, k.begriffe);
      return text !== undefined && b !== null ? [{ st, text, b }] : [];
    });
    return { k, stellen, quellen };
  });
}

/**
 * Antworten, die eine Stelle ohne eigene Antwort von einer anderen Stelle desselben Falls bekommt. Schlüssel ist der
 * Schlüssel der Zielstelle. Unter mehreren Antworten zählt die des nächstgelegenen Bezugs; widersprechen sich gleich
 * nahe, bekommt die Stelle nichts. Welche Stellen zählen, regelt `gekoppelt`.
 */
export function uebertragungen(
  fall: Fall,
  katalog: KatalogIndex,
  regeln: Katalogregeln | undefined = katalog.katalog.regeln,
  nichtImBrief: ReadonlySet<string> = new Set(),
): Map<string, Uebertragung> {
  const aus = new Map<string, Uebertragung>();
  for (const { k, stellen, quellen } of gekoppelt(fall, katalog, regeln, nichtImBrief)) {
    if (stellen.length < 2 || quellen.length === 0) continue;
    for (const ziel of stellen) {
      if (belegt(fall, ziel)) continue;
      const kandidaten = quellen
        .filter((q) => q.st.key !== ziel.key)
        .map((q) => ({ q, abstand: Math.abs(q.st.ordnung - ziel.ordnung), wert: wertFuer(ziel, q.b, k.begriffe, q.text) }))
        .filter((c): c is typeof c & { wert: string } => c.wert !== null);
      if (kandidaten.length === 0) continue;
      const naechster = Math.min(...kandidaten.map((c) => c.abstand));
      const nah = kandidaten.filter((c) => c.abstand === naechster);
      if (new Set(nah.map((c) => c.wert)).size !== 1) continue;
      aus.set(ziel.key, {
        wert: nah[0].wert,
        quelle: nah[0].q.st.baustein.titel,
        abschnitt: nah[0].q.st.abschnitt,
        aussage: nah.every((c) => c.q.st.bezug === ziel.bezug),
      });
    }
  }
  return aus;
}

/** Zwei gekoppelte Stellen, an denen der Arzt Verschiedenes geantwortet hat (CR-R6F-01, E-92). */
export interface Widerspruch {
  /** Name der Kopplung („Gehhilfe“) */
  kopplung: string;
  /** In der Reihenfolge des Aufenthalts */
  stellen: [WiderspruchStelle, WiderspruchStelle];
}

export interface WiderspruchStelle {
  key: string;
  abschnitt: AbschnittId;
  /** Begriff der Antwort („Rollator“) */
  begriff: string;
}

/**
 * Widersprüche zwischen gekoppelten Stellen, sobald beide eine eigene Antwort haben, auch wenn ein Satz noch Lücken hat:
 * Die Kopplung kennt beide Werte, der Abgleich über den Text des Abschnitts erst den fertigen Satz. Verglichen werden je
 * Kopplung die beantworteten Stellen in der Reihenfolge des Aufenthalts, jede mit der nächsten. Nur Kopplungen mit
 * Begriffen oder ausschließlich mit Auswahlen: Freier Text ist verschieden formuliert, ohne zu widersprechen
 * („Penicillin“, „Penicillin (Exanthem)“), und Allergien und Unverträglichkeiten haben ohnehin einen anderen Bezug
 * (dafür die Regeln „Allergien“ in `data/abgleich.ts`).
 */
export function widersprueche(
  fall: Fall,
  katalog: KatalogIndex,
  regeln: Katalogregeln | undefined = katalog.katalog.regeln,
  nichtImBrief: ReadonlySet<string> = new Set(),
): Widerspruch[] {
  const aus: Widerspruch[] = [];
  for (const { k, stellen, quellen } of gekoppelt(fall, katalog, regeln, nichtImBrief)) {
    if (!k.begriffe && stellen.some((st) => st.optionen === null)) continue;
    const reihe = [...quellen].sort((x, y) => x.st.ordnung - y.st.ordnung);
    for (let i = 1; i < reihe.length; i++) {
      const [x, y] = [reihe[i - 1], reihe[i]];
      if (x.b === y.b) continue;
      aus.push({
        kopplung: k.name,
        stellen: [
          { key: x.st.key, abschnitt: x.st.abschnitt, begriff: x.b },
          { key: y.st.key, abschnitt: y.st.abschnitt, begriff: y.b },
        ],
      });
    }
  }
  return aus;
}

/** Was ein Feldfenster an einer Knopfreihe oder Liste als gewählt zeigt (QA-38). */
export interface FensterWahl {
  /** Möglichkeit, die gewählt erscheint; undefined: Die Angabe ist offen. */
  index: number | undefined;
  /** Die Wahl ist die Antwort einer anderen Stelle (E-60), nicht die des Arztes an dieser Stelle. */
  uebertragen?: Uebertragung;
}

/**
 * Wahl einer Angabe im Feldfenster, in derselben Rangfolge wie im Brief (`fuelleSlots` in `render.ts`): die eigene
 * Antwort, sonst die übertragene, sonst die Vorgabe der Vorlage, sonst die des Bausteins. Sonst zeigte das Fenster eine
 * offene Angabe, während der Brief die übertragene nennt, und die erste Ziffer setzte gegen sie (QA-38). An einem
 * auffälligen Befund gilt keine Übertragung und keine Vorgabe mit Text: Art und Ort wählt der Arzt.
 */
export function wahlImFenster(p: {
  optionen: readonly string[];
  pflicht?: boolean;
  /** eigener Wert der Stelle im Fall */
  eigen: unknown;
  /** Vorgabe der Vorlage */
  vorgabe?: unknown;
  /** Vorgabe des Bausteins (Hausstandard) */
  hausstandard?: unknown;
  uebertragung?: Uebertragung;
  auffaellig?: boolean;
}): FensterWahl {
  const n = p.optionen.length;
  const leer = (i: number) => (p.optionen[i] ?? "").trim() === "";
  if (p.eigen === undefined && !p.auffaellig && p.uebertragung) {
    const i = index(p.uebertragung.wert, n);
    if (i !== undefined) return { index: i, uebertragen: p.uebertragung };
  }
  const gewaehlt = index(p.eigen, n);
  // Die leere Möglichkeit einer Pflichtangabe ist keine Antwort.
  if (gewaehlt !== undefined) return { index: p.pflicht && leer(gewaehlt) ? undefined : gewaehlt };
  const start = index(p.vorgabe, n) ?? index(p.hausstandard, n) ?? (p.pflicht ? undefined : 0);
  if (start === undefined || (p.pflicht && leer(start)) || (p.auffaellig && !leer(start))) return { index: undefined };
  return { index: start };
}

/**
 * Übertragungen an einer Stelle des Briefs: an ihr selbst (Feld, Auswahl) und an ihren Angaben (Satz mit
 * `stelle/angabe`).
 */
export function uebertragungenAn(alle: ReadonlyMap<string, Uebertragung> | undefined, stelle: string): Uebertragung[] {
  return [...(alle ?? new Map<string, Uebertragung>())].filter(([k]) => k === stelle || k.startsWith(`${stelle}/`)).map(([, u]) => u);
}

/**
 * Angaben eines Satzes, deren Vorbelegung zur Aussage des Arztes gehört (M-24): nur in einem Satz, den er selbst
 * eingeschaltet hat, und erst, wenn er jede Pflichtangabe darin selbst beantwortet hat.
 */
export function folgeangabenVon(b: Baustein, segId: string, fall: Fall, regeln: Katalogregeln | undefined): Set<string> {
  const aus = new Set<string>();
  const liste = regeln?.folgeangaben ?? [];
  const seg = b.segmente.find((s) => s.art === "option" && s.id === segId);
  if (liste.length === 0 || seg?.art !== "option" || !seg.slots?.length) return aus;
  if (fall.optionen[`${b.id}/${segId}`] !== true) return aus;
  const beantwortet = seg.slots.filter((s) => s.required).every((s) => (fall.slots[`${b.id}/${segId}/${s.id}`] ?? "").trim() !== "");
  if (!beantwortet || !seg.slots.some((s) => s.required)) return aus;
  for (const slot of seg.slots) {
    if (slot.required) continue;
    if (liste.some((f) => f.key === slot.id || f.key === `${b.id}/${segId}/${slot.id}`)) aus.add(slot.id);
  }
  return aus;
}

/** Kennungen der Regeln, die es im Katalog nicht (mehr) gibt; für den Katalogtest. */
export function regelFehler(katalog: KatalogIndex, regeln: Katalogregeln | undefined = katalog.katalog.regeln): string[] {
  const fehler: string[] = [];
  for (const k of regeln?.kopplungen ?? []) {
    for (const g of k.glieder) if (!stelleVon(katalog, g, 0)) fehler.push(`${k.name}: ${g.key} gibt es nicht oder ist keine Auswahl und kein freier Text`);
  }
  for (const f of regeln?.folgeangaben ?? []) {
    if (!f.key.includes("/")) continue;
    const [b, s, a] = f.key.split("/");
    const seg = katalog.bausteine.get(b)?.segmente.find((x) => x.art === "option" && x.id === s);
    const slot = seg?.art === "option" ? seg.slots?.find((x) => x.id === a) : undefined;
    if (!slot) fehler.push(`Folgeangabe ${f.key} gibt es nicht`);
    else if (slot.required) fehler.push(`Folgeangabe ${f.key} ist eine Pflichtangabe`);
  }
  return fehler;
}
