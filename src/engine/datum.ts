// Kalenderdaten des Aufenthalts (Aufnahme, Operation, Entlassung): lesen, schreiben, rechnen. Ein Datum ist ein Tag
// ohne Uhrzeit; gerechnet wird in UTC, damit die Zeitumstellung keinen Tag verschluckt. Geschrieben wird immer
// TT.MM.JJJJ (Stilrichtlinie).

const MS_TAG = 86_400_000;

const STICHWORT: Record<string, number> = { vorgestern: -2, gestern: -1, heute: 0, morgen: 1 };

function utc(j: number, m: number, t: number): number {
  return Date.UTC(j, m - 1, t);
}

function heuteUtc(heute: Date): number {
  return utc(heute.getFullYear(), heute.getMonth() + 1, heute.getDate());
}

function gueltig(j: number, m: number, t: number): boolean {
  if (m < 1 || m > 12 || t < 1 || t > 31 || j < 1900 || j > 2999) return false;
  const d = new Date(utc(j, m, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

function schreibe(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

/** Ein gespeichertes Datum: genau TT.MM.JJJJ und ein Tag, den es gibt. */
export function istDatum(text: unknown): text is string {
  if (typeof text !== "string") return false;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  return !!m && gueltig(Number(m[3]), Number(m[2]), Number(m[1]));
}

/**
 * Liest, was der Arzt im Fallkopf tippt: „12.11.“ oder „12.11“ (das Jahr, mit dem das Datum heute am nächsten liegt),
 * „12.11.26“, „12.11.2026“, „heute“, „gestern“, „vorgestern“, „morgen“. Ergebnis TT.MM.JJJJ; null, wenn es kein
 * vollständiges Datum ist. Leerer Text ist kein Datum.
 */
export function leseDatum(text: string, heute: Date = new Date()): string | null {
  const t = text.trim().toLowerCase();
  if (t in STICHWORT) return schreibe(heuteUtc(heute) + STICHWORT[t] * MS_TAG);
  const m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4})?)?$/.exec(t);
  if (!m) return null;
  const tag = Number(m[1]);
  const monat = Number(m[2]);
  if (m[3]) {
    const jahr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return gueltig(jahr, monat, tag) ? schreibe(utc(jahr, monat, tag)) : null;
  }
  // Ohne Jahr: das Jahr, mit dem der Tag heute am nächsten liegt. Ein Aufenthalt liegt um den heutigen Tag herum; am
  // 05.01. ist „28.12.“ der vergangene Dezember, am 08.11. der kommende.
  const jetzt = heuteUtc(heute);
  const j = heute.getFullYear();
  let bester: number | null = null;
  for (const jahr of [j - 1, j, j + 1]) {
    if (!gueltig(jahr, monat, tag)) continue;
    const ms = utc(jahr, monat, tag);
    if (bester === null || Math.abs(ms - jetzt) < Math.abs(bester - jetzt)) bester = ms;
  }
  return bester === null ? null : schreibe(bester);
}

function alsMs(datum: string): number | null {
  if (!istDatum(datum)) return null;
  const [t, m, j] = datum.split(".").map(Number);
  return utc(j, m, t);
}

/** Datum plus `tage` Tage (auch negativ); null bei ungültigem Datum. */
export function plusTage(datum: string, tage: number): string | null {
  const ms = alsMs(datum);
  return ms === null ? null : schreibe(ms + tage * MS_TAG);
}

/** Tage von `a` bis `b` (positiv, wenn `b` später liegt); null bei ungültigem Datum. */
export function tageZwischen(a: string, b: string): number | null {
  const x = alsMs(a);
  const y = alsMs(b);
  return x === null || y === null ? null : Math.round((y - x) / MS_TAG);
}

const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/** Wochentag zur Kontrolle beim Eintippen („Mittwoch“). */
export function wochentag(datum: string): string {
  const ms = alsMs(datum);
  return ms === null ? "" : WOCHENTAG[new Date(ms).getUTCDay()];
}
