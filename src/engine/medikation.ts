// Strukturierte Medikation (M-07, E-62): Zeilen mit Wirkstoff, Stärke/Form, Schema, Hinweis und Status; dazwischen
// dürfen freie Zeilen stehen. Gespeichert wird als Text im Feld des Falls, ein Eintrag je Zeile. Eine strukturierte
// Zeile trennt ihre Felder mit Tabulatoren; die kann man in keinem Eingabefeld tippen, und `feldText` nimmt sie aus
// eingefügtem Text. Ältere Fälle mit getipptem Freitext lesen sich so ohne Umbau als freie Zeilen.
//
// Die App schlägt weder Wirkstoff noch Stärke noch Schema vor (E-29) und rechnet nichts: Jede Angabe stammt aus
// einer Eingabe des Arztes. Unvollständige Zeilen sind Lücken und sperren das Kopieren.

import { luecke } from "./text.ts";

export const MED_STATUS = ["NEU", "UNVERÄNDERT", "GEÄNDERT", "PAUSIERT", "ABGESETZT"] as const;

/**
 * Spalten der Tabelle in der formatierten Fassung. Das Schema steht in einer Zelle wie im Text („1-0-1-0“): Ebnet das
 * KIS eine Tabelle zu Text ein, wird daraus sonst „1 0 1 0“ oder „1010“ (CR-R5-02).
 */
export const MED_SPALTEN = ["Wirkstoff", "Stärke/Form", "Schema", "Hinweis"] as const;

/** Spalte des Schemas, mittig gesetzt */
export const MED_SCHEMA_SPALTE = 2;

export const MED_ZEITEN = ["morgens", "mittags", "abends", "nachts"] as const;

export interface MedZeile {
  art: "zeile";
  wirkstoff: string;
  /** Stärke und Darreichungsform, wie getippt („600 mg Tablette“) */
  staerke: string;
  /** morgens, mittags, abends, nachts; leer heißt: nicht angegeben, nicht „0“ */
  schema: [string, string, string, string];
  /** Hinweis oder Dauer („für 7 Tage“, „bei Bedarf, höchstens 3-mal täglich“) */
  hinweis: string;
  /** einer aus MED_STATUS oder leer */
  status: string;
}

export interface MedFrei {
  art: "frei";
  text: string;
}

export type MedEintrag = MedZeile | MedFrei;

const TRENNER = "\t";

export function leereZeile(): MedZeile {
  return { art: "zeile", wirkstoff: "", staerke: "", schema: ["", "", "", ""], hinweis: "", status: "" };
}

/** Text aus einem Eingabefeld für die Speicherung: ohne Tabulatoren und Zeilenumbrüche, sonst unverändert. */
export function feldText(s: string): string {
  return s.replace(/[\t\r\n]+/g, " ");
}

export function leseMedikation(wert: string | undefined): MedEintrag[] {
  if (!wert) return [];
  return wert
    .replace(/\r/g, "")
    .split("\n")
    .map((zeile): MedEintrag => {
      if (!zeile.includes(TRENNER)) return { art: "frei", text: zeile };
      const f = zeile.split(TRENNER);
      return { art: "zeile", wirkstoff: f[0] ?? "", staerke: f[1] ?? "", schema: [f[2] ?? "", f[3] ?? "", f[4] ?? "", f[5] ?? ""], hinweis: f[6] ?? "", status: f[7] ?? "" };
    });
}

export function schreibeMedikation(eintraege: MedEintrag[]): string {
  return eintraege
    .map((e) => (e.art === "frei" ? feldText(e.text) : [e.wirkstoff, e.staerke, ...e.schema, e.hinweis, e.status].map(feldText).join(TRENNER)))
    .join("\n");
}

export function istLeer(e: MedEintrag): boolean {
  return e.art === "frei" ? !e.text.trim() : ![e.wirkstoff, e.staerke, ...e.schema, e.hinweis, e.status].some((x) => x.trim());
}

/** Einnahme zu einer Zeit: getippte Brüche als Zeichen („1/2“ → „½“, „1 1/2“ → „1½“); sonst wie getippt. */
export function schemaWert(s: string): string {
  return s
    .trim()
    .replace(/\s*\b1\/2\b/g, "½")
    .replace(/\s*\b1\/4\b/g, "¼")
    .replace(/\s*\b3\/4\b/g, "¾");
}

/**
 * Schema aus eingefügtem Text („1-0-1-0“, „½ - 0 - ½“, „1 1/2-0-0-0“): zwei bis vier Einnahmezeiten, sonst null. Die
 * Eingabe verteilt sie auf die Felder ab dem, in das eingefügt wurde; fehlende Zeiten bleiben leer, also Lücke.
 */
export function schemaAusText(t: string): string[] | null {
  const teile = t.trim().split(/\s*-\s*/);
  return teile.length >= 2 && teile.length <= 4 && teile.every((x) => /^[\d½¼¾/.,]+$/.test(x) || /^\d+ \d\/\d$/.test(x)) ? teile : null;
}

/** Ein Schema, das als Ganzes in eine Einnahmezeit kam, und was es dabei geleert hat. */
export interface EingefuegtesSchema {
  schema: MedZeile["schema"];
  /** Erste Einnahmezeit des Schemas (0 = morgens) */
  ab: number;
  /** Zeiten, die das Schema nicht nennt und die vorher einen Wert hatten: jetzt leer, also Lücke */
  geleert: { zeit: number; vorher: string }[];
}

/**
 * Schema, das als Ganzes in eine Einnahmezeit kommt („1-0-1-0“ eingefügt, abgelegt oder von einem Hilfsmittel
 * eingegeben, QA-43). Es ersetzt alle vier Zeiten (PS-R6F-3, E-94): Zeiten, die es nicht nennt, werden leer und damit
 * Lücke, statt alte Werte zu behalten; sonst entstünde aus „1-1-1-1“ und „0-0-1“ still „0-0-1-1“. Ab drei Teilen
 * beginnt es bei morgens („1-0-1“ heißt morgens, mittags, abends, CR-R6F-09); zwei Teile beginnen in der Zeit mit dem
 * Fokus, passen sie dort nicht hinein, bei morgens. `null`, wenn der Text kein Schema ist; dann ist er eine gewöhnliche
 * Eingabe.
 */
export function mitEingefuegtemSchema(schema: MedZeile["schema"], ab: number, text: string): EingefuegtesSchema | null {
  const teile = schemaAusText(text);
  if (!teile) return null;
  const start = teile.length >= 3 || teile.length > 4 - ab ? 0 : ab;
  const neu: MedZeile["schema"] = ["", "", "", ""];
  teile.forEach((t, j) => (neu[start + j] = t));
  const geleert = schema.flatMap((vorher, zeit) => (zeit >= start && zeit < start + teile.length) || !vorher.trim() ? [] : [{ zeit, vorher }]);
  return { schema: neu, ab: start, geleert };
}

function mitPunkt(t: string): string {
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Lücke einer Zeile mit Wirkstoff, aber ohne Schema und ohne Hinweis (PS-R5-2). */
export const SCHEMA_ODER_HINWEIS = "Schema oder Hinweis";

// Wer ein Mittel nicht mehr oder gerade nicht nimmt, braucht kein Schema.
const OHNE_EINNAHME: ReadonlySet<string> = new Set(["ABGESETZT", "PAUSIERT"]);

/** Ohne Schema und ohne Hinweis sagt eine Zeile nicht, wie das Mittel zu nehmen ist („Ibuprofen 600 mg.“). */
function ohneEinnahme(z: MedZeile, gefuellt: number): boolean {
  return !!z.wirkstoff.trim() && gefuellt === 0 && !z.hinweis.trim() && !OHNE_EINNAHME.has(z.status.trim());
}

/**
 * Was an einer Zeile fehlt: ohne Wirkstoff, mit nur teilweise ausgefülltem Schema oder mit Wirkstoff, aber ohne Schema
 * und ohne Hinweis ist sie keine Aussage. Abgesetzte und pausierte Mittel brauchen kein Schema.
 */
export function fehlendes(z: MedZeile): string[] {
  const zeiten = z.schema.map(schemaWert);
  const gefuellt = zeiten.filter(Boolean).length;
  return [
    z.wirkstoff.trim() ? "" : "Wirkstoff",
    gefuellt > 0 && gefuellt < 4 ? `Schema ${MED_ZEITEN.filter((_, i) => !zeiten[i]).join(", ")}` : "",
    ohneEinnahme(z, gefuellt) ? SCHEMA_ODER_HINWEIS : "",
  ].filter(Boolean);
}

/**
 * Zeile im Wortlaut der Stilrichtlinie: „Wirkstoff Stärke Form, Schema, Hinweis. STATUS.“ Ein ganz leeres Schema
 * entfällt (Bedarfsmedikation steht im Hinweis); ein teilweise leeres wird nicht mit 0 aufgefüllt, sondern bleibt Lücke.
 */
export function medText(z: MedZeile): { text: string; offen: boolean } {
  const zeiten = z.schema.map(schemaWert);
  const gefuellt = zeiten.filter(Boolean).length;
  const name = [z.wirkstoff.trim() || luecke("Wirkstoff"), z.staerke.trim()].filter(Boolean).join(" ");
  const schema = gefuellt === 0 ? (ohneEinnahme(z, gefuellt) ? luecke(SCHEMA_ODER_HINWEIS) : "") : zeiten.map((x) => x || luecke("?")).join("-");
  const satz = mitPunkt([name, schema, z.hinweis.trim()].filter(Boolean).join(", "));
  const status = z.status.trim();
  return { text: status ? `${satz} ${status}.` : satz, offen: fehlendes(z).length > 0 };
}

/** Zellen der Tabelle: Wirkstoff, Stärke/Form, Schema in einer Zelle wie im Satz, Hinweis mit Status. */
export function medZellen(z: MedZeile): string[] {
  const zeiten = z.schema.map(schemaWert);
  const gefuellt = zeiten.filter(Boolean).length;
  const hinweis = z.hinweis.trim();
  const status = z.status.trim();
  return [
    z.wirkstoff.trim() || luecke("Wirkstoff"),
    z.staerke.trim(),
    gefuellt === 0 ? (ohneEinnahme(z, gefuellt) ? luecke(SCHEMA_ODER_HINWEIS) : "") : zeiten.map((x) => x || luecke("?")).join("-"),
    hinweis && status ? `${mitPunkt(hinweis)} ${status}` : hinweis || status,
  ];
}

// Schema aus vier Angaben mit Bindestrich, nicht Teil einer längeren Kette oder eines Worts („1-0-1-0“, „½-0-½-0“).
const SCHEMA = /(?<![\p{L}\p{N}½¼¾/-])([\d½¼¾]+(?:[.,]\d+)?)-([\d½¼¾]+(?:[.,]\d+)?)-([\d½¼¾]+(?:[.,]\d+)?)-([\d½¼¾]+(?:[.,]\d+)?)(?![\p{L}\p{N}½¼¾/-])/u;

/**
 * Teilt eine getippte Zeile im Format der Stilrichtlinie für die Tabelle auf, nur zur Darstellung: Anker ist das
 * vierstellige Schema. Davor stehen Wirkstoff (bis zum ersten Wort, das mit einer Ziffer beginnt) und Stärke/Form,
 * dahinter der Hinweis. Ohne Schema oder ohne Text davor: null, die Zeile bleibt ungeteilt. `staerke` ist null, wenn
 * keine Stärke zu erkennen war; dann gehört der Text davor ungeteilt in Wirkstoff und Stärke/Form.
 */
export function zellenAusText(text: string): { wirkstoff: string; staerke: string | null; schema: string[]; hinweis: string } | null {
  const m = SCHEMA.exec(text);
  if (!m) return null;
  const vor = text.slice(0, m.index).replace(/[\s,;:]+$/, "");
  if (!vor.trim()) return null;
  const hinweis = text.slice(m.index + m[0].length).replace(/^[\s,;:]+/, "");
  const ziffer = /\s\d/.exec(vor);
  return {
    wirkstoff: ziffer ? vor.slice(0, ziffer.index).trim() : vor.trim(),
    staerke: ziffer ? vor.slice(ziffer.index).trim() : null,
    schema: [m[1], m[2], m[3], m[4]],
    hinweis,
  };
}
