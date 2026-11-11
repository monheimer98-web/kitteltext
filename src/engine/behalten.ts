// Behaltene Stationsfälle (E-50, E-67): Speicherformat, Ablauf nach drei Tagen, Prüfung der Kurzbezeichnung und
// Zeitangaben in Worten. Reine Logik ohne Browser; Lesen und Schreiben macht `speicher.ts`, den Ablauf im Fenster der Store.

/** Höchstdauer ab Beginn des Falls. Gemessen ab `erstellt`, nicht ab der letzten Änderung: Sonst hielte jede Eingabe den Fall länger. */
export const BEHALTEN_TAGE = 3;
export const BEHALTEN_MS = BEHALTEN_TAGE * 24 * 3600_000;

/**
 * Formatstand des Eintrags `kitteltext3.behalten`. 1: `{ format, faelle: Eintrag[] }`. Die Felder `id`, `kurz`, `erstellt` und
 * `loeschenAb` jedes Eintrags bleiben in jedem künftigen Stand gleich: Damit kann auch ein älterer Stand fremde Einträge
 * anzeigen, nach Ablauf löschen und auf Wunsch löschen, ohne sie zu lesen. Öffnen und Neuanlegen lehnt er dann ab.
 * Wer das Format ändert, erhöht die Nummer und behält diese vier Felder. Das Format des Falls darin steht je Eintrag in
 * `fallFormat` und folgt `SITZUNG_FORMAT` (`speicher.ts`), nicht dieser Nummer (CR-R6-03).
 */
export const BEHALTEN_FORMAT = 1;

/**
 * Formatstand der Fälle, die vor der Angabe `fallFormat` behalten wurden. Behalten gibt es erst seit Format 3 der Sitzung;
 * ein Eintrag ohne Angabe ist also so geschrieben.
 */
export const FALL_FORMAT_OHNE_ANGABE = 3;

/** Länge der Kurzbezeichnung: genug für „Zi 12 Fenster“ oder „OSG li Bett 3“, zu kurz für Name und Geburtsdatum zusammen. */
export const KURZ_MAX = 20;

export interface Eintrag {
  /** Kennung des Falls */
  id: string;
  /** frei gewählte Kurzbezeichnung ohne Namen */
  kurz: string;
  /** Beginn des Falls */
  erstellt: number;
  /** ab diesem Zeitpunkt wird der Eintrag gelöscht */
  loeschenAb: number;
  /** zählt jedes Schreiben; ein Fenster schreibt nur auf den Stand, den es kennt */
  stand: number;
  /** Kennung des Fensters, in dem der Fall gerade offen ist; null: in keinem */
  fenster: string | null;
  /** roher Fall; der Store prüft ihn beim Öffnen mit `ergaenzt` */
  fall: unknown;
  /**
   * Formatstand, mit dem `fall` geschrieben ist (`SITZUNG_FORMAT` der Fassung, die ihn schrieb). `ergaenzt` bekommt ihn wie
   * bei der Sitzung; ein höherer als der eigene heißt: nur listen, ablaufen lassen, löschen, nie öffnen (CR-R6-03).
   */
  fallFormat: number;
  /** der Eintrag, wie er gelesen wurde; nur bei einem neueren Format, damit er unverändert zurückgeschrieben wird */
  roh?: Record<string, unknown>;
}

export interface Bestand {
  format: number;
  eintraege: Eintrag[];
  /** aus einer neueren Fassung: nur anzeigen, ablaufen lassen und löschen */
  neuer: boolean;
}

export const LEERER_BESTAND: Bestand = { format: BEHALTEN_FORMAT, eintraege: [], neuer: false };

export function loeschzeit(erstellt: number): number {
  return erstellt + BEHALTEN_MS;
}

/**
 * Warum der Eintrag zu löschen ist, oder null, wenn er bleibt. „frist“: Löschzeit erreicht, oder sie liegt mehr als drei Tage
 * nach dem Beginn und kann nicht stimmen. „uhr“: Die Uhr des PCs steht vor dem Beginn des Falls (zurückgestellt, falsch
 * gestellt). Im Zweifel wird gelöscht, nicht behalten; eine Toleranz gibt es nicht (RD-R6-8, E-80).
 */
export function ablaufGrund(e: Pick<Eintrag, "erstellt" | "loeschenAb">, jetzt: number): "frist" | "uhr" | null {
  if (jetzt < e.erstellt) return "uhr";
  if (jetzt >= e.loeschenAb || e.loeschenAb > loeschzeit(e.erstellt)) return "frist";
  return null;
}

export function abgelaufen(e: Pick<Eintrag, "erstellt" | "loeschenAb">, jetzt: number): boolean {
  return ablaufGrund(e, jetzt) !== null;
}

function istZahl(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function kennung(x: unknown): x is string {
  return typeof x === "string" && x.length > 0 && x.length <= 64;
}

export interface Gelesen {
  bestand: Bestand;
  /** Kurzbezeichnungen der Einträge, die wegen Ablaufs entfallen sind */
  abgelaufen: string[];
  /** davon die, deren Beginn nach der Uhr des PCs noch in der Zukunft liegt */
  uhr: string[];
  /** dieselben Einträge mit Kennung und Grund */
  entfallen: { id: string; kurz: string; grund: "frist" | "uhr" }[];
  /** Einträge, die kein gültiger Eintrag waren */
  verworfen: number;
}

/**
 * Liest den gespeicherten Bestand. Abgelaufene und ungültige Einträge fallen weg (der Aufrufer schreibt den Rest zurück),
 * doppelte Kennungen gelten einmal. Ein Format ohne Nummer oder mit unbekannter kleinerer Nummer gilt als ungültig.
 */
export function liesBestand(roh: unknown, jetzt: number): Gelesen {
  const leer = { bestand: { ...LEERER_BESTAND, eintraege: [] }, abgelaufen: [], uhr: [], entfallen: [], verworfen: 0 };
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return leer;
  const r = roh as { format?: unknown; faelle?: unknown };
  if (!Number.isInteger(r.format) || (r.format as number) < 1) return { ...leer, verworfen: Array.isArray(r.faelle) ? r.faelle.length : 0 };
  const format = r.format as number;
  const neuer = format > BEHALTEN_FORMAT;
  const liste = Array.isArray(r.faelle) ? r.faelle : [];
  const eintraege: Eintrag[] = [];
  const weg: string[] = [];
  const uhr: string[] = [];
  const entfallen: Gelesen["entfallen"] = [];
  let verworfen = 0;
  const gesehen = new Set<string>();
  for (const x of liste) {
    const e = x as Partial<Eintrag> | null;
    if (!e || typeof e !== "object" || !kennung(e.id) || typeof e.kurz !== "string" || !e.kurz.trim() || !istZahl(e.erstellt) || !istZahl(e.loeschenAb) || gesehen.has(e.id)) {
      verworfen++;
      continue;
    }
    const grund = ablaufGrund({ erstellt: e.erstellt, loeschenAb: e.loeschenAb }, jetzt);
    if (grund) {
      weg.push(e.kurz);
      if (grund === "uhr") uhr.push(e.kurz);
      entfallen.push({ id: e.id, kurz: e.kurz, grund });
      continue;
    }
    if (neuer) {
      gesehen.add(e.id);
      eintraege.push({ id: e.id, kurz: e.kurz, erstellt: e.erstellt, loeschenAb: e.loeschenAb, stand: 0, fenster: null, fall: null, fallFormat: 0, roh: x as Record<string, unknown> });
      continue;
    }
    const fall = e.fall as { id?: unknown } | null | undefined;
    const stand = e.stand;
    const fenster = e.fenster;
    const fallFormat = e.fallFormat === undefined ? FALL_FORMAT_OHNE_ANGABE : e.fallFormat;
    if (
      !fall ||
      typeof fall !== "object" ||
      fall.id !== e.id ||
      !Number.isInteger(stand) ||
      (stand as number) < 0 ||
      !(fenster === null || kennung(fenster)) ||
      !Number.isInteger(fallFormat) ||
      fallFormat < 1
    ) {
      verworfen++;
      continue;
    }
    gesehen.add(e.id);
    eintraege.push({ id: e.id, kurz: e.kurz, erstellt: e.erstellt, loeschenAb: e.loeschenAb, stand: stand as number, fenster: fenster as string | null, fall, fallFormat });
  }
  return { bestand: { format, eintraege, neuer }, abgelaufen: weg, uhr, entfallen, verworfen };
}

/** Der Bestand, wie er gespeichert wird. Einträge eines neueren Formats gehen unverändert zurück. */
export function alsSpeicher(b: Bestand): { format: number; faelle: unknown[] } {
  return {
    format: b.format,
    faelle: b.eintraege.map((e) =>
      b.neuer && e.roh ? e.roh : { id: e.id, kurz: e.kurz, erstellt: e.erstellt, loeschenAb: e.loeschenAb, stand: e.stand, fenster: e.fenster, fall: e.fall, fallFormat: e.fallFormat },
    ),
  };
}

/** Länge des Merkers eines Falls, der nicht behalten ist (Feld im Fallkopf). */
export const MERKER_MAX = 14;

/**
 * Merker aus der Kurzbezeichnung, wenn ein behaltener Fall zum Notaufnahmefall wird: Der Reiter bleibt erkennbar, statt nur
 * noch den Namen der Vorlage zu zeigen (PS-R6-7, G-122). Länger als `MERKER_MAX` wird gekürzt.
 */
export function merkerAusKurz(kurz: string): string {
  return [...kurzBereinigt(kurz)].slice(0, MERKER_MAX).join("").trim();
}

/** Kurzbezeichnung, wie sie gespeichert wird: ohne Steuerzeichen, Leerraum zusammengezogen, höchstens `KURZ_MAX` Zeichen. */
export function kurzBereinigt(text: string): string {
  return [...text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()].slice(0, KURZ_MAX).join("").trim();
}

/**
 * Schlüssel für den Vergleich zweier Kurzbezeichnungen: klein, ohne Leerraum, Satzzeichen und Symbole, „Zimmer“ wie „Zi“.
 * „Zi12“, „Zi. 12“ und „Zimmer 12“ sind damit dasselbe wie „Zi 12“ (PS-R6-4, E-83).
 */
export function kurzSchluessel(kurz: string): string {
  return kurzBereinigt(kurz)
    .toLocaleLowerCase("de")
    .replace(/zimmer/g, "zi")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

/**
 * Der andere behaltene Fall, der dieselbe Kurzbezeichnung schon trägt (Vergleich über `kurzSchluessel`). Sie ist das
 * einzige, woran man einen Fall in der Liste erkennt; zweimal „Zi 12“ wäre eine Verwechslung mit Ansage, etwa wenn im
 * selben Bett über Nacht ein anderer Patient liegt.
 */
export function kurzVergeben(kurz: string, eintraege: readonly Eintrag[], ausser?: string): Eintrag | undefined {
  const k = kurzSchluessel(kurz);
  if (!k) return undefined;
  return eintraege.find((e) => e.id !== ausser && kurzSchluessel(e.kurz) === k);
}

/**
 * Hinweise, wenn die Kurzbezeichnung nach Name, Geburtsdatum oder Fallnummer aussieht. Nur ein Hinweis, keine Sperre: Die
 * App kann einen Namen nicht sicher von einem Wort unterscheiden (E-03), und „Zi 12 Fenster“ soll ohne Warnung durchgehen.
 */
export function kurzHinweise(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const h: string[] = [];
  if (/\d{1,2}\s?[./-]\s?\d{1,2}\s?[./-]\s?\d{2,4}/.test(t) || /(^|\D)\d{1,2}\.\d{1,2}\.(\D|$)/.test(t) || /\*\s?\d/.test(t)) {
    h.push("Enthält ein Datum. Kein Geburtsdatum eintragen.");
  } else if (/(^|\D)(19|20)\d{2}(\D|$)/.test(t)) {
    h.push("Enthält eine Jahreszahl. Kein Geburtsjahr eintragen.");
  }
  if (/\d{6,}/.test(t.replace(/\s/g, ""))) h.push("Enthält eine lange Nummer. Keine Fall- oder Patientennummer eintragen.");
  if (/(^|[^\p{L}])(herr|frau|hr\.|fr\.|fam\.|familie)\s*\p{L}/iu.test(t)) h.push("Enthält eine Anrede. Keinen Namen eintragen.");
  if (/(^|[^\p{L}])(geb\.|geboren|jahrgang|jg\.)/iu.test(t)) h.push("Enthält eine Geburtsangabe. Kein Geburtsdatum eintragen.");
  if (/^\p{Lu}[\p{Ll}ß]+(-\p{Lu}[\p{Ll}ß]+)?\s*,\s*\p{Lu}[\p{Ll}ß]+/u.test(t)) h.push("Sieht aus wie „Name, Vorname“. Keinen Namen eintragen.");
  if (/(^|[^\p{L}])\p{Lu}\.\s?\p{Lu}\./u.test(t)) h.push("Sieht aus wie Initialen. Keinen Namen eintragen.");
  return h;
}

// --- Zeitangaben in Worten -------------------------------------------------
// Eigene Wochentage statt `toLocaleDateString`: Dessen Kurzform („Mo.“) hängt vom Browser ab.

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const TAG_WORT: Record<number, string> = { [-2]: "vorgestern", [-1]: "gestern", 0: "heute", 1: "morgen", 2: "übermorgen" };

function zwei(n: number): string {
  return String(n).padStart(2, "0");
}

/** „14:10“ in Ortszeit. */
export function uhr(ms: number): string {
  const d = new Date(ms);
  return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

/** Kalendertage von `jetzt` bis `ms` in Ortszeit: 0 heute, -1 gestern, 1 morgen. */
export function tageBis(ms: number, jetzt: number): number {
  const a = new Date(ms);
  const b = new Date(jetzt);
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86_400_000);
}

/** „heute“, „gestern“, „morgen“ … oder „Do 13.11.“. */
export function tagText(ms: number, jetzt: number): string {
  const d = new Date(ms);
  return TAG_WORT[tageBis(ms, jetzt)] ?? `${WOCHENTAG[d.getDay()]} ${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.`;
}

/** Uhrzeit, und wenn es nicht heute war, der Tag davor: „14:10“, „gestern 14:10“, „Mo 10.11. 14:10“. */
export function zeitpunkt(ms: number, jetzt: number): string {
  return tageBis(ms, jetzt) === 0 ? uhr(ms) : `${tagText(ms, jetzt)} ${uhr(ms)}`;
}

/**
 * Zeitpunkt nach „wurde … kopiert“: „um 14:10“, an einem anderen Tag „gestern um 14:10“, „Mo 09.11. um 14:10“. Nicht
 * „um gestern 14:10“ (CR-R6-13): Erst behaltene Fälle tragen einen Kopiervermerk über Mitternacht.
 */
export function umZeitpunkt(ms: number, jetzt: number): string {
  return tageBis(ms, jetzt) === 0 ? `um ${uhr(ms)}` : `${tagText(ms, jetzt)} um ${uhr(ms)}`;
}

/**
 * Banner, solange das Schreiben behaltener Fälle scheitert (CR-R6-01, MT-R6-22, H-R6-4): welcher Stand auf dem PC bleibt und
 * dass das Weitere nur bis zum Schließen des Fensters hält (es liegt dann im Sitzungsspeicher). Leer, wenn alles gespeichert ist.
 */
export function ungespeichertText(liste: { kurz: string; um: number }[], jetzt: number): string {
  if (liste.length === 0) return "";
  const folge = "was du seitdem einträgst, geht mit dem Schließen dieses Fensters verloren.";
  if (liste.length === 1) {
    return `Der Browser hat das Speichern von „${liste[0].kurz}“ verweigert (Speicher voll oder gesperrt). Behalten bleibt der Stand von ${zeitpunkt(liste[0].um, jetzt)}; ${folge}`;
  }
  const namen = liste.map((x) => `„${x.kurz}“ (Stand von ${zeitpunkt(x.um, jetzt)})`);
  return `Der Browser hat das Speichern von ${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]} verweigert (Speicher voll oder gesperrt). Behalten bleibt jeweils dieser Stand; ${folge}`;
}

/** Immer mit Tag: „heute 09:12“, „gestern 14:10“, „Mo 09.11. 23:00“. */
export function tagUndUhr(ms: number, jetzt: number): string {
  return `${tagText(ms, jetzt)} ${uhr(ms)}`;
}

/**
 * „begonnen heute 09:12“, „begonnen gestern 14:10“. Ein Wort für den Beginn in Fallkopf, Liste und Reiter: „seit“ las sich
 * als „behalten seit“ (MT-R6-08, E-82).
 */
export function begonnenText(ms: number, jetzt: number): string {
  return `begonnen ${tagUndUhr(ms, jetzt)}`;
}

/**
 * Alter eines Falls im Reiter, sobald es für die Unterscheidung zählt: an einem früheren Kalendertag nur der Tag („gestern“,
 * „Mo 09.11.“), am selben Tag ab zwei Stunden „vor 3 Std.“, sonst leer. Die Uhrzeit steht im Titel des Reiters; der Tag allein
 * hält den Reiter schmal (DS-R6-6, MT-R6-08).
 */
export function alterKurz(erstellt: number, jetzt: number): string {
  if (tageBis(erstellt, jetzt) < 0) return tagText(erstellt, jetzt);
  const stunden = Math.floor((jetzt - erstellt) / 3600_000);
  return stunden >= 2 ? `vor ${stunden} Std.` : "";
}

/**
 * Vorwarnung vor dem Löschen eines behaltenen Falls (Entscheidung Lead zu PS-R6-1, E-82): Wer gerade daran arbeitet, soll es
 * nicht erst merken, wenn der Fall weg ist. Die Frist läuft ab Beginn und endet zur Uhrzeit des Beginns, also mitten im Dienst.
 */
export const VORWARNUNG_MS = 2 * 3600_000;

/** Was die Zeile eines behaltenen Falls im Fallkopf zeigt und was davon hervorgehoben ist. */
export interface BehaltenAnzeige {
  /** Begonnen an einem früheren Kalendertag: Was im Brief steht, kann von gestern sein (G-121). */
  alt: boolean;
  /** Löschzeit in höchstens `VORWARNUNG_MS`. */
  bald: boolean;
  /** „begonnen gestern 14:10“ */
  begonnen: string;
  /** „zuletzt geändert heute 09:12“ */
  geaendert: string;
  /** „wird heute um 14:10 gelöscht“ */
  loeschen: string;
}

export function behaltenAnzeige(f: { erstellt: number; geaendert: number; loeschenAb: number }, jetzt: number): BehaltenAnzeige {
  return {
    alt: tageBis(f.erstellt, jetzt) < 0,
    bald: f.loeschenAb - jetzt <= VORWARNUNG_MS,
    begonnen: begonnenText(f.erstellt, jetzt),
    geaendert: `zuletzt geändert ${tagUndUhr(f.geaendert, jetzt)}`,
    loeschen: loeschText(f.loeschenAb, jetzt),
  };
}

/** „wird heute um 14:10 gelöscht“, „wird morgen um …“, sonst „wird am Do 13.11. um 14:10 gelöscht“. */
export function loeschText(ms: number, jetzt: number): string {
  const t = tageBis(ms, jetzt);
  const tag = t === 0 || t === 1 ? TAG_WORT[t] : `am ${WOCHENTAG[new Date(ms).getDay()]} ${zwei(new Date(ms).getDate())}.${zwei(new Date(ms).getMonth() + 1)}.`;
  return `wird ${tag} um ${uhr(ms)} gelöscht`;
}
