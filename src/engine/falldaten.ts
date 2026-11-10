// Falldaten (E-58) und errechnete Daten hinter Fristen (E-59). Die Engine kennt nur die Regeln des Katalogs
// (`katalog.regeln`), keinen Wortlaut: Welche Felder ein Datum des Fallkopfs einsetzen und welche Fristen ein Datum
// bekommen, steht in `src/data/falldaten.ts`.
//
// Ein errechnetes Datum ist ein Vorschlag. Es steht grau in Klammern hinter der Frist und wird erst mit „Übernehmen“
// zur Aussage des Arztes; dann zählt der übernommene Wert. Rechnet die App später etwas anderes aus (OP-Datum
// geändert), ist es wieder ein Vorschlag.

import type { AbschnittId, Baustein, Fall, FalldatumArt, Katalogregeln, Platzhalter } from "../model/types.ts";
import { FALLDATUM_ARTEN } from "../model/types.ts";
import { istDatum, plusTage, tageZwischen } from "./datum.ts";
import type { FristTeil, Token } from "./text.ts";

/** Datum des Fallkopfs, das dieses Feld einsetzt; null, wenn es keines ist (Notaufnahme, anderes Datum). */
export function falldatumFeld(def: Platzhalter, fall: Fall, regeln: Katalogregeln | undefined): FalldatumArt | null {
  if (fall.setting !== "station" || def.typ !== "datum") return null;
  return regeln?.falldatumFelder?.[def.label] ?? null;
}

/**
 * Welches Datum des Fallkopfs jedes gebundene Datumsfeld einsetzt, Schlüssel `baustein/feld` (E-58, PS-R5-1). Die
 * Bausteine kommen in der Reihenfolge des Briefs. Ein Feld „Datum der weiteren Operation“ nimmt das Datum der 2. OP.
 * Von den Feldern „OP-Datum“ nimmt das erste das OP-Datum, das nächste das Datum der 2. OP, wenn kein solches Feld es
 * schon hat; jedes weitere bekommt `null` und bleibt ein gewöhnliches Datumsfeld, also eine Lücke. Sonst stünde neben
 * einer Revision das Datum der Erstoperation, und eine Korrektur im zweiten Satz änderte auch den ersten.
 */
export function falldatumZuordnung(fall: Fall, bausteine: readonly Baustein[], regeln: Katalogregeln | undefined): Map<string, FalldatumArt | null> {
  const aus = new Map<string, FalldatumArt | null>();
  const felder: { key: string; art: FalldatumArt }[] = [];
  for (const b of bausteine) {
    for (const seg of b.segmente) {
      if (seg.art !== "platzhalter") continue;
      const def = b.platzhalter.find((p) => p.id === seg.ref);
      const art = def ? falldatumFeld(def, fall, regeln) : null;
      const key = def ? `${b.id}/${def.id}` : "";
      if (art && !felder.some((f) => f.key === key)) felder.push({ key, art });
    }
  }
  const frei = new Set<FalldatumArt>(["op", "op2"]);
  // Ausdrücklich als weitere Operation bezeichnet: zuerst, damit kein zweites „OP-Datum“ ihm das Datum nimmt.
  for (const f of felder) {
    if (f.art === "op") continue;
    aus.set(f.key, frei.delete(f.art) ? f.art : null);
  }
  for (const f of felder) {
    if (f.art !== "op") continue;
    const art = frei.has("op") ? "op" : frei.has("op2") ? "op2" : null;
    if (art) frei.delete(art);
    aus.set(f.key, art);
  }
  return aus;
}

export function fristSchluessel(stelle: string, anker: FalldatumArt, tage: number): string {
  return `${stelle}|${anker}${tage < 0 ? "" : "+"}${tage}`;
}

/** Zerlegt einen Fristschlüssel; null, wenn es keiner ist. */
export function leseFristSchluessel(key: string): { stelle: string; anker: FalldatumArt; tage: number } | null {
  const m = /^(.+)\|([a-z0-9]+)([+-]\d{1,4})$/.exec(key);
  if (!m || !(FALLDATUM_ARTEN as readonly string[]).includes(m[2])) return null;
  return { stelle: m[1], anker: m[2] as FalldatumArt, tage: Number(m[3]) };
}

/** Das Datum, das die App für diesen Fristschlüssel gerade ausrechnet; null ohne Anker im Fallkopf. */
export function fristDatum(fall: Fall, key: string): string | null {
  const f = leseFristSchluessel(key);
  const anker = f ? fall.daten[f.anker] : undefined;
  return f && anker ? plusTage(anker, f.tage) : null;
}

const MIT_FRIST: ReadonlySet<string> = new Set(["gesetzt", "vorschlag", "ok", "abw"]);

/**
 * Anker, die im Fall nicht eindeutig sind: Mit einer weiteren Operation im Brief (ein zweiter OP-Baustein, „+ weitere OP“
 * oder ein Datum der 2. OP im Fallkopf) kann „nach der Operation“ beide meinen. Dann bekommt keine Frist auf die
 * Operation ein Datum; der Satz bleibt relativ. Ein dritter OP-Baustein hat schon einen zweiten vor sich.
 */
export function mehrdeutigeAnker(fall: Fall, zuordnung: ReadonlyMap<string, FalldatumArt | null>): Set<FalldatumArt> {
  const zweite = !!fall.daten.op2 || [...zuordnung.values()].includes("op2");
  return new Set(zweite ? (["op"] as const) : []);
}

/**
 * Setzt hinter jede Frist mit genau einem Tag das errechnete Datum in Klammern, wenn der Fallkopf den Anker kennt
 * („am 12. Tag nach der Operation (20.11.2026)“). Nur in Stationsbriefen, nur in den Abschnitten der Regeln, nur in
 * Text des Katalogs: Frei geschriebener Text, Lücken und Platzhalter bleiben, wie sie sind. Läuft nach dem Glätten,
 * damit die Lage der Klammer im Token genau stimmt. Anker in `mehrdeutig` bekommen kein Datum.
 */
export function mitFristen(
  tokens: Token[],
  abschnitt: AbschnittId,
  fall: Fall,
  regeln: Katalogregeln | undefined,
  mehrdeutig: ReadonlySet<FalldatumArt> = new Set(),
): Token[] {
  const muster = regeln?.fristen ?? [];
  if (fall.setting !== "station" || muster.length === 0 || !regeln?.fristAbschnitte?.includes(abschnitt)) return tokens;
  if (!FALLDATUM_ARTEN.some((a) => fall.daten[a])) return tokens;
  return tokens.map((tok) => {
    if (!tok.key || tok.frei || !MIT_FRIST.has(tok.zustand ?? "gesetzt") || tok.art === "fix") return tok;
    const treffer: { ende: number; anker: FalldatumArt; tage: number }[] = [];
    for (const m of muster) {
      m.muster.lastIndex = 0;
      for (let t = m.muster.exec(tok.t); t; t = m.muster.exec(tok.t)) {
        if (t[0].length === 0) {
          m.muster.lastIndex++;
          continue;
        }
        treffer.push({ ende: t.index + t[0].length, anker: m.anker, tage: m.tage(t) });
      }
    }
    if (treffer.length === 0) return tok;
    treffer.sort((a, b) => a.ende - b.ende);
    let text = "";
    let bis = 0;
    const fristen: FristTeil[] = [];
    const gesehen = new Set<string>();
    const ohne: string[] = [];
    for (const tr of treffer) {
      const anker = mehrdeutig.has(tr.anker) ? undefined : fall.daten[tr.anker];
      const datum = anker && Number.isFinite(tr.tage) ? plusTage(anker, tr.tage) : null;
      if (!datum || tr.ende < bis) continue;
      const key = fristSchluessel(tok.key, tr.anker, tr.tage);
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      const uebernommen = fall.fristen[key];
      // „Ohne Datum“ gilt für diese Frist, auch wenn sich der Anker ändert: Der Arzt will an dieser Stelle kein Datum.
      if (uebernommen === "") {
        ohne.push(key);
        continue;
      }
      text += tok.t.slice(bis, tr.ende) + " ";
      const start = text.length;
      text += `(${datum})`;
      fristen.push({ key, start, ende: text.length, zustand: uebernommen === datum ? "gesetzt" : "vorschlag", anker: tr.anker, tage: tr.tage, datum });
      bis = tr.ende;
    }
    if (fristen.length === 0) return ohne.length > 0 ? { ...tok, ohneFrist: ohne } : tok;
    return { ...tok, t: text + tok.t.slice(bis), fristen, ...(ohne.length > 0 ? { ohneFrist: ohne } : {}) };
  });
}

/**
 * Hinweise zu den Daten im Fallkopf, wenn sie nicht zueinander passen (Operation vor Aufnahme, Entlassung vor
 * Operation) oder weit in der Zukunft liegen. Nur Hinweis: Die App ändert nichts und sperrt nichts.
 */
export function falldatenHinweise(daten: Fall["daten"], heute: string, name: (a: FalldatumArt) => string): string[] {
  const aus: string[] = [];
  const vor = (a: FalldatumArt, b: FalldatumArt) => {
    const x = daten[a];
    const y = daten[b];
    const d = x && y ? tageZwischen(x, y) : null;
    if (d !== null && d < 0) aus.push(`${name(b)} liegt vor dem ${name(a)}.`);
  };
  vor("aufnahme", "op");
  vor("aufnahme", "op2");
  vor("op", "op2");
  vor("aufnahme", "entlassung");
  vor("op", "entlassung");
  vor("op2", "entlassung");
  for (const a of FALLDATUM_ARTEN) {
    const x = daten[a];
    const d = x && istDatum(heute) ? tageZwischen(heute, x) : null;
    if (d !== null && d > 14) aus.push(`${name(a)} liegt mehr als zwei Wochen in der Zukunft.`);
    if (d !== null && d < -365) aus.push(`${name(a)} liegt mehr als ein Jahr zurück.`);
  }
  return aus;
}
