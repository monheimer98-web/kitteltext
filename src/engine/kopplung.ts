// Einmal eingeben (M-14, E-60) und Folgeangaben (M-24, E-60). Die Regeln stehen im Katalog (`katalog.regeln`, Daten in
// `src/data/kopplung.ts`); hier steht nur, wie sie wirken.
//
// Übertragen wird nur, was der Arzt selbst geantwortet hat, nie ein Vorschlag der Vorlage, und nur an Stellen, an denen
// er noch nichts gewählt hat: Eine bewusste Abweichung an einer Stelle bleibt. Nichts wird in den Fall geschrieben; die
// Antwort erscheint beim Zeichnen und wird erst mit „Übernehmen“ zum Wert der Stelle.

import type { AbschnittId, Baustein, Fall, Katalogregeln, Koppelglied } from "../model/types.ts";
import type { KatalogIndex } from "./render.ts";

export interface Uebertragung {
  /** Wert, wie ihn die Stelle speichert: Index der Möglichkeit (als Text) oder Wortlaut */
  wert: string;
  /** Wo die Antwort herkommt (Titel des Bausteins) */
  quelle: string;
  /** gleicher Bezug: die Antwort gilt als Aussage des Arztes, sonst als Vorschlag */
  aussage: boolean;
}

interface Stelle {
  key: string;
  bezug: string;
  ordnung: number;
  baustein: Baustein;
  /** Möglichkeiten einer Auswahl; null bei freiem Text */
  optionen: readonly string[] | null;
  art: "angabe" | "auswahl" | "feld";
}

function index(roh: unknown, anzahl: number): number | undefined {
  const n = typeof roh === "number" ? roh : typeof roh === "string" && /^\d+$/.test(roh) ? Number(roh) : NaN;
  return Number.isInteger(n) && n >= 0 && n < anzahl ? n : undefined;
}

function stelleVon(katalog: KatalogIndex, glied: Koppelglied, ordnung: number): Stelle | null {
  const [bausteinId, id, angabe] = glied.key.split("/");
  const b = katalog.bausteine.get(bausteinId);
  if (!b || !id) return null;
  const basis = { key: glied.key, bezug: glied.bezug, ordnung, baustein: b };
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

/** Hat die Stelle schon einen eigenen Wert (auch einen leeren)? Dann bleibt sie, wie der Arzt sie hat. */
function belegt(fall: Fall, st: Stelle): boolean {
  if (st.art === "angabe") return fall.slots[st.key] !== undefined;
  if (st.art === "auswahl") return fall.auswahl[st.key] !== undefined || fall.eigen[st.key] !== undefined;
  return fall.werte[st.key] !== undefined || !!fall.spaeter[st.key];
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

/**
 * Antworten, die eine Stelle ohne eigene Antwort von einer anderen Stelle desselben Falls bekommt. Schlüssel ist der
 * Schlüssel der Zielstelle. Unter mehreren Antworten zählt die des nächstgelegenen Bezugs; widersprechen sich gleich
 * nahe, bekommt die Stelle nichts. Nur Stellen, die im Brief stehen, geben oder bekommen etwas: nicht in einem
 * ausgeblendeten oder von Hand geschriebenen Abschnitt und nicht in `nichtImBrief` (weggelassen oder durch ein
 * Standardprotokoll ersetzt, Schlüssel des Satzes oder der Auswahl). Sonst käme eine Antwort aus einem Satz, den der
 * Arzt im Brief nicht mehr sieht.
 */
export function uebertragungen(
  fall: Fall,
  katalog: KatalogIndex,
  regeln: Katalogregeln | undefined = katalog.katalog.regeln,
  nichtImBrief: ReadonlySet<string> = new Set(),
): Map<string, Uebertragung> {
  const aus = new Map<string, Uebertragung>();
  const zaehlt = (a: string) => !fall.ausgeblendet[a as AbschnittId] && fall.manuell[a as AbschnittId] === undefined;
  const imFall = new Set(Object.entries(fall.bausteine).flatMap(([a, l]) => (zaehlt(a) ? (l ?? []) : [])));
  const sichtbar = (key: string) => {
    const [b, seg] = key.split("/");
    return imFall.has(b) && !nichtImBrief.has(key) && !nichtImBrief.has(`${b}/${seg}`);
  };
  for (const k of regeln?.kopplungen ?? []) {
    const bezuege = [...new Set(k.glieder.map((g) => g.bezug))];
    const stellen = k.glieder
      .filter((g) => sichtbar(g.key))
      .map((g) => stelleVon(katalog, g, bezuege.indexOf(g.bezug)))
      .filter((s): s is Stelle => s !== null);
    if (stellen.length < 2) continue;
    const quellen = stellen.flatMap((st) => {
      const text = antwort(fall, st);
      const b = text === undefined ? null : begriff(text, k.begriffe);
      return text !== undefined && b !== null ? [{ st, text, b }] : [];
    });
    if (quellen.length === 0) continue;
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
      aus.set(ziel.key, { wert: nah[0].wert, quelle: nah[0].q.st.baustein.titel, aussage: nah.every((c) => c.q.st.bezug === ziel.bezug) });
    }
  }
  return aus;
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
