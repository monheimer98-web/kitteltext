// Falldaten im Fallkopf (E-58) und errechnete Daten hinter Fristen (E-59). Was hier steht, hängt am Wortlaut des
// Katalogs: Wer Datumsfelder umbenennt oder Fristen anders formuliert, prüft diese Liste mit; der Katalogtest nennt
// jede gebundene Stelle und jede Frist, die ein Datum bekäme.

import type { AbschnittId, FalldatumArt, Fristmuster } from "../model/types.ts";

/** Beschriftung im Fallkopf und Platzhalter fürs KIS, wenn das Datum fehlt (`[OP-DATUM]`). */
export const FALLDATUM_NAME: Record<FalldatumArt, { kurz: string; lang: string }> = {
  aufnahme: { kurz: "Aufnahme", lang: "Aufnahmedatum" },
  op: { kurz: "OP", lang: "OP-Datum" },
  op2: { kurz: "2. OP", lang: "Datum der weiteren Operation" },
  entlassung: { kurz: "Entlassung", lang: "Entlassdatum" },
};

/**
 * Platzhalter vom Typ `datum` in Stationsbausteinen, die das Datum aus dem Fallkopf einsetzen, erkannt an ihrer
 * Bezeichnung. Ein neuer OP-Baustein mit dem Feld „OP-Datum“ ist damit ohne weiteren Eintrag angeschlossen.
 */
export const FALLDATUM_FELDER: Readonly<Record<string, FalldatumArt>> = {
  "OP-Datum": "op",
  "Datum der weiteren Operation": "op2",
};

/** Baustein für eine weitere Operation im selben Aufenthalt; „+ weitere OP“ im Fallkopf nimmt ihn auf. */
export const WEITERE_OP_BAUSTEIN = "th-st-operation-2";

/** Abschnitte, in denen eine Frist ihr Datum in Klammern bekommt: was der Leser künftig tun soll, und der Aufnahmetag. */
export const FRIST_ABSCHNITTE: readonly AbschnittId[] = ["anamnese", "procedere", "medikation"];

const zahl = (t: RegExpExecArray) => Number(t[1]);
const woche = (t: RegExpExecArray) => Number(t[1]) * (/^Woche/i.test(t[2] ?? "") ? 7 : 1);

/**
 * Fristen mit genau einem Tag. Bereiche („2 bis 3 Tage nach der Entlassung“, „2–3 Tage“, „in der 1. Woche“, „1. bis
 * 6. Woche nach der Operation“) und Aufzählungen („am 4., 7. und 11. Tag“, „6 und 12 Wochen nach der Operation“, „leichte
 * Tätigkeit 12 Wochen, schwere Tätigkeit 16 Wochen nach der Operation“) bekommen kein Datum: Ein einzelnes Datum dahinter
 * wäre falsch oder gälte scheinbar für die ganze Zeile. „für 6 Wochen nach der Operation“ bekommt das Ende der Frist.
 */
const AUFZAEHLUNG = String.raw`(?<!(?:\bbis|\bund|\boder|,|[–-]) ?)(?<!\b\d{1,2} (?:Wochen?|Tagen?),[^.;:\n]*)`;
export const FRISTEN: readonly Fristmuster[] = [
  { muster: /\b(?:am|ab dem|bis einschließlich|bis zum) (\d{1,2})\. Tag nach der Operation\b/gi, anker: "op", tage: zahl },
  { muster: /\b(?:am|ab dem) Operationstag\b/gi, anker: "op", tage: () => 0 },
  { muster: /\bEnde der (\d{1,2})\. Woche nach der Operation\b/gi, anker: "op", tage: (t) => Number(t[1]) * 7 },
  { muster: new RegExp(String.raw`${AUFZAEHLUNG}\b(\d{1,2}) (Wochen?|Tagen?) nach der Operation\b`, "gi"), anker: "op", tage: woche },
  { muster: /\b(?:am|ab dem) Aufnahmetag\b/gi, anker: "aufnahme", tage: () => 0 },
  { muster: /\b(?:am|ab dem) Tag nach der Aufnahme\b/gi, anker: "aufnahme", tage: () => 1 },
  { muster: /\b(?:am|ab dem) (\d{1,2})\. Tag nach der Aufnahme\b/gi, anker: "aufnahme", tage: zahl },
  { muster: new RegExp(String.raw`${AUFZAEHLUNG}\b(\d{1,2}) (Wochen?|Tagen?) nach der Entlassung\b`, "gi"), anker: "entlassung", tage: woche },
];
