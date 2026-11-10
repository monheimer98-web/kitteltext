// Zugriff auf den Browser-Speicher. Fallinhalte liegen nur im Sitzungsspeicher:
// Auf gemeinsam genutzten Klinik-PCs sollen sie nach dem Schließen des Fensters
// verschwunden sein. Dauerhaft liegen Einstellungen, Nutzungszähler und die
// vom Arzt selbst angelegten Textbausteine und Vorlagen.

import type { AbschnittId, Vorlage, Wahlstelle } from "./model/types.ts";
import { ALLE_ABSCHNITTE } from "./model/types.ts";
import type { KatalogIndex } from "./engine/render.ts";
import { bausteineDerVorlage, imBausteinVorgeschlagen, istFragesatz, keineErsatzstelle, satzNichtWeglassbar } from "./engine/vorlage.ts";

const PRAEFIX = "kitteltext3.";

function lager(dauerhaft: boolean): Storage | null {
  try {
    return dauerhaft ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function lies<T>(dauerhaft: boolean, name: string): T | null {
  try {
    const roh = lager(dauerhaft)?.getItem(PRAEFIX + name);
    return roh ? (JSON.parse(roh) as T) : null;
  } catch {
    return null;
  }
}

function schreib(dauerhaft: boolean, name: string, wert: unknown): boolean {
  try {
    const l = lager(dauerhaft);
    if (!l) return false;
    l.setItem(PRAEFIX + name, JSON.stringify(wert));
    return true;
  } catch {
    return false;
  }
}

function entferne(dauerhaft: boolean, name: string) {
  try {
    lager(dauerhaft)?.removeItem(PRAEFIX + name);
  } catch {
    /* Speicher gesperrt: nichts zu entfernen */
  }
}

/** Liest einen einzelnen Eintrag außerhalb des eigenen Namensraums, ohne bei gesperrtem Speicher zu scheitern. */
export function liesRoh(name: string): string | null {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

export function schreibRoh(name: string, wert: string): boolean {
  try {
    window.localStorage.setItem(name, wert);
    return true;
  } catch {
    return false;
  }
}

/** Ob der Sitzungsspeicher beschreibbar ist (für den Arbeitsplatz-Check). */
export function sitzungsspeicherGeht(): boolean {
  if (!schreib(false, "check", 1)) return false;
  entferne(false, "check");
  return true;
}

/** Ob der dauerhafte Speicher beschreibbar ist; ohne ihn ginge die Anleitung bei jedem Start von selbst auf (D-05). */
export function dauerspeicherGeht(): boolean {
  if (!schreib(true, "check", 1)) return false;
  entferne(true, "check");
  return true;
}

export type Farbmodus = "system" | "hell" | "dunkel";

export interface Einstellungen {
  farbmodus: Farbmodus;
  zeilenende: "crlf" | "lf";
  /** "einfach" schreibt Zeichen um, die ältere Klinikprogramme verfälschen */
  zeichen: "original" | "einfach";
  /** Abschnittsüberschriften im Gesamtbrief mitkopieren */
  ueberschriften: boolean;
  /** neben dem reinen Text eine formatierte Fassung (HTML) in die Zwischenablage legen (E-61) */
  formatiert: boolean;
  listen: "striche" | "fliesstext";
  /** Hinweis zur Zweckbestimmung gelesen */
  hinweisGelesen: boolean;
  /** Kurzanleitung über dem ersten Brief gesehen oder den ersten Abschnitt kopiert */
  tippGesehen: boolean;
  /** Die Anleitung in der Seitenleiste ist einmal von selbst aufgegangen (D-05) */
  anleitungGezeigt: boolean;
}

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  farbmodus: "system",
  zeilenende: "crlf",
  zeichen: "einfach",
  ueberschriften: true,
  formatiert: true,
  listen: "striche",
  hinweisGelesen: false,
  tippGesehen: false,
  anleitungGezeigt: false,
};

export function ladeEinstellungen(): Einstellungen {
  const g = lies<Partial<Einstellungen>>(true, "einstellungen") ?? {};
  const e = { ...STANDARD_EINSTELLUNGEN };
  for (const k of Object.keys(e) as (keyof Einstellungen)[]) {
    if (typeof g[k] === typeof e[k]) (e as Record<string, unknown>)[k] = g[k];
  }
  return e;
}

export function speichereEinstellungen(e: Einstellungen): boolean {
  return schreib(true, "einstellungen", e);
}

/**
 * Formatstand der gespeicherten Fälle. 1 (ohne Angabe): bis v2. 2: Falldaten im Fallkopf (`daten`) und übernommene
 * errechnete Daten (`fristen`), E-58, E-59; Werte vom Typ `medikation` mit Tabulator als Feldgrenze (E-62), aus Format 1
 * werden Tabulatoren dort Leerzeichen (CR-R5-03). Ein Fall mit älterem Stand lädt weiter; die neuen Felder sind dann
 * leer (`ergaenzt` in `engine/fall.ts`). Wer das Format der Fälle ändert, erhöht die Nummer und ergänzt `ergaenzt`.
 */
export const SITZUNG_FORMAT = 2;

export interface Sitzung {
  /** rohe Fälle; der Store prüft und ergänzt sie */
  faelle: unknown[];
  aktivId: string | null;
  /** höchste bisher vergebene Fallnummer */
  zaehler: number;
  /** Formatstand, mit dem die Fälle geschrieben wurden; beim Laden 1, wenn er fehlt */
  format: number;
}

export function ladeSitzung(): Sitzung {
  const s = lies<Partial<Sitzung>>(false, "sitzung");
  return {
    faelle: Array.isArray(s?.faelle) ? s.faelle : [],
    aktivId: typeof s?.aktivId === "string" ? s.aktivId : null,
    zaehler: typeof s?.zaehler === "number" ? s.zaehler : 0,
    format: typeof s?.format === "number" && Number.isInteger(s.format) && s.format >= 1 ? s.format : 1,
  };
}

/** Fallinhalte liegen nur im Sitzungsspeicher, nie im dauerhaften Speicher. Geschrieben wird immer der heutige Formatstand. */
export function speichereSitzung(s: Omit<Sitzung, "format">): boolean {
  return schreib(false, "sitzung", { ...s, format: SITZUNG_FORMAT });
}

export interface Nutzung {
  /** Vorlagen-ID -> Anzahl Verwendungen */
  anzahl: Record<string, number>;
  /** zuletzt verwendete Vorlagen, neueste zuerst */
  zuletzt: string[];
}

export function ladeNutzung(): Nutzung {
  const n = lies<Partial<Nutzung>>(true, "nutzung");
  return {
    anzahl: n?.anzahl && typeof n.anzahl === "object" ? n.anzahl : {},
    zuletzt: Array.isArray(n?.zuletzt) ? n.zuletzt.filter((x) => typeof x === "string") : [],
  };
}

export function speichereNutzung(n: Nutzung) {
  schreib(true, "nutzung", n);
}

/** Löscht alle Fallinhalte auf diesem Gerät; Einstellungen und eigene Bausteine bleiben. */
export function loescheFaelle() {
  entferne(true, "sitzung");
  entferne(false, "sitzung");
}

/** Entfernt, was die erste Fassung der App dauerhaft abgelegt hatte, darunter den letzten Fall. */
export function raeumeAltlasten() {
  try {
    for (const k of ["kitteltext.fall.v1", "kitteltext.letzte.v1", "kitteltext.settings.v1", "kitteltext.theme.v1", "kitteltext.zweck.bestaetigt.v1", "kitteltext3.sitzung"]) {
      window.localStorage.removeItem(k);
    }
  } catch {
    /* Speicher gesperrt */
  }
}

/** Vom Arzt angelegter Textbaustein: fester Text für einen Abschnitt. `{seite}` folgt der Seite des jeweiligen Falls. */
export interface EigenerBaustein {
  id: string;
  titel: string;
  abschnitt: AbschnittId;
  text: string;
}

/**
 * Eigene Bausteine und Vorlagen. Es sind Formulierungen des Arztes, keine
 * Fälle; sie bleiben dauerhaft auf dem Gerät.
 */
export interface Eigenes {
  bausteine: EigenerBaustein[];
  vorlagen: Vorlage[];
  /**
   * Eigene Schnellwerte je Bezeichnung eines Feldes: Formulierungen, die der Arzt
   * einmal getippt und sich gemerkt hat („Schmerzmittel" → seine Hausliste).
   * Felder mit derselben Bezeichnung teilen sich die Liste.
   */
  schnellwerte?: Record<string, string[]>;
}

export const SCHNELLWERT_MAX = 12;
export const SCHNELLWERT_LAENGE = 240;

/** Ein Schnellwert ist allgemeiner Wortlaut: keine Lücke, nicht leer, nicht zu lang. */
export function gueltigerSchnellwert(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= SCHNELLWERT_LAENGE && !t.includes("‹") && !t.includes("›");
}

const EIGEN_ID = /^eigen-[a-z0-9]+$/;

/**
 * Formatstand der eigenen Inhalte im kopierten Text. 2: Vorlagen mit
 * Entweder-oder-Stellen und `weglassen` mit Ersatzstellen. 3: Platz einer
 * Entweder-oder-Stelle (`vor`). 4: Pflichtstelle ohne „nichts davon“
 * (`pflicht`, PS-T1-01). Ein älterer Stand
 * kennt neue Felder nicht und würde sie beim Einfügen still fallen lassen;
 * deshalb weist er Text mit höherer Nummer ab (G-58). Text ohne Nummer stammt
 * aus der Zeit vor dem 04.11.2026 und bleibt einfügbar.
 */
export const EIGENES_FORMAT = 4;

/**
 * Die eigenen Inhalte als Text für „Als Text kopieren“, mit dem niedrigsten Formatstand, der alles enthält: 4 nur, wenn
 * eine Stelle `pflicht` trägt, 3 nur, wenn eine Stelle `vor` trägt. Sonst liest auch ein Stand mit Format 2 (etwa die Einzeldatei auf einem anderen Rechner) den
 * Text vollständig, statt ihn abzuweisen (CR-T1-06).
 */
export function eigenesAlsText(e: Eigenes): string {
  const stellen = e.vorlagen.flatMap((v) => v.wahl ?? []);
  const format = stellen.some((w) => w.pflicht) ? 4 : stellen.some((w) => w.vor !== undefined) ? 3 : 2;
  return JSON.stringify({ format, ...e });
}

/** Stammt der eingefügte Text aus einer neueren Fassung, als dieser Stand lesen kann? */
export function ausNeuererFassung(x: unknown): boolean {
  const f = (x as { format?: unknown } | null)?.format;
  return typeof f === "number" && f > EIGENES_FORMAT;
}

function istTextliste(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((e) => typeof e === "string");
}

/** Brauchbare Schnellwerte einer Liste: Text, getrimmt, gültig, ohne Doppelte, höchstens `SCHNELLWERT_MAX`. */
function saubereSchnellwerte(liste: unknown[]): string[] {
  const texte = liste.filter((t): t is string => typeof t === "string");
  return [...new Set(texte.map((t) => t.trim()).filter(gueltigerSchnellwert))].slice(0, SCHNELLWERT_MAX);
}

function istZuordnung(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/**
 * Prüft eingefügte oder gespeicherte eigene Inhalte vollständig. Kennungen
 * von Vorlagen müssen mit „eigen-" beginnen, damit nichts Mitgeliefertes
 * verdrängt wird. Was am Aufbau einer Vorlage nicht stimmt, aber ohne
 * Schaden wegfallen kann (`weglassen`, Schnellwerte, abgeschaltete Fragen),
 * wird ausgelassen; der Katalog `index` liefert die Bausteine dazu.
 */
export function pruefeEigenes(x: unknown, index: KatalogIndex): Eigenes | null {
  const e = x as Partial<Eigenes> | null;
  if (!e || typeof e !== "object" || !Array.isArray(e.bausteine) || !Array.isArray(e.vorlagen)) return null;
  const format = (e as { format?: unknown }).format;
  if (format !== undefined && !(Number.isInteger(format) && (format as number) >= 1 && (format as number) <= EIGENES_FORMAT)) return null;
  // Eine Frage, die der Baustein stellt, kann eine eigene Vorlage nur abgeschaltet von einer mitgelieferten Vorlage erben.
  // Sonst hat ein Arzt sie bei einem Patienten entfernt, und das gilt nicht für den nächsten (B-1).
  const abschaltbar = new Set([...index.vorlagen.values()].filter((v) => v.status !== "eigen").flatMap((v) => v.vorgaben?.aus ?? []));
  const bausteine: EigenerBaustein[] = [];
  for (const b of e.bausteine as Partial<EigenerBaustein>[]) {
    if (!b || typeof b.id !== "string" || !/^[a-z0-9]+$/.test(b.id)) return null;
    if (typeof b.titel !== "string" || !b.titel.trim() || typeof b.text !== "string" || !b.text.trim()) return null;
    if (!ALLE_ABSCHNITTE.includes(b.abschnitt as AbschnittId)) return null;
    if (b.text.includes("‹")) return null;
    bausteine.push({ id: b.id, titel: b.titel, abschnitt: b.abschnitt as AbschnittId, text: b.text });
  }
  const vorlagen: Vorlage[] = [];
  for (const v of e.vorlagen as Partial<Vorlage>[]) {
    if (!v || typeof v.id !== "string" || !EIGEN_ID.test(v.id)) return null;
    if (typeof v.titel !== "string" || !v.titel.trim()) return null;
    if (v.setting !== "zna" && v.setting !== "station") return null;
    if (!v.abschnitte || typeof v.abschnitte !== "object") return null;
    const abschnitte: Vorlage["abschnitte"] = {};
    const gesehen = new Set<string>();
    for (const [a, liste] of Object.entries(v.abschnitte)) {
      if (!ALLE_ABSCHNITTE.includes(a as AbschnittId) || !istTextliste(liste)) return null;
      // Ein Baustein darf in einer Vorlage nur einmal stehen; seine Eingaben hängen an seinem Schlüssel.
      if (liste.some((id) => gesehen.has(id) || (gesehen.add(id), false))) return null;
      abschnitte[a as AbschnittId] = liste;
    }
    if (v.wahl !== undefined && v.wahl !== null && !Array.isArray(v.wahl)) return null;
    const wahl: Wahlstelle[] = [];
    for (const w of (v.wahl ?? []) as Partial<Wahlstelle>[]) {
      if (!w || !ALLE_ABSCHNITTE.includes(w.abschnitt as AbschnittId) || typeof w.label !== "string" || !w.label.trim() || !istTextliste(w.bausteine) || w.bausteine.length === 0) return null;
      if (w.bausteine.some((id) => gesehen.has(id) || (gesehen.add(id), false))) return null;
      // Ein Platz, der auf keinen festen Baustein des Abschnitts zeigt, entfällt: Die Stelle steht dann am Ende, ihr Inhalt bleibt.
      const vor = typeof w.vor === "string" && (abschnitte[w.abschnitt as AbschnittId] ?? []).includes(w.vor) ? w.vor : undefined;
      wahl.push({ abschnitt: w.abschnitt as AbschnittId, label: w.label, bausteine: w.bausteine, ...(vor ? { vor } : {}), ...(w.pflicht === true ? { pflicht: true } : {}) });
    }
    const g = v.vorgaben ?? {};
    if (typeof g !== "object" || (g.an !== undefined && !istTextliste(g.an)) || (g.aus !== undefined && !istTextliste(g.aus))) return null;
    const neu: Vorlage = {
      id: v.id,
      titel: v.titel,
      suchbegriffe: istTextliste(v.suchbegriffe) ? v.suchbegriffe : [],
      region: "eigen",
      setting: v.setting,
      abschnitte,
      wahl,
      entscheiden: istTextliste(v.entscheiden) ? v.entscheiden : [],
      ohne: istTextliste(v.ohne) ? v.ohne : [],
      // Eigene Vorlagen tragen nur den Aufbau: welche Sätze vorgeschlagen werden. Antworten gehören zum Patienten.
      vorgaben: { an: g.an ?? [], aus: (g.aus ?? []).filter((k) => !(istFragesatz(k, index) && imBausteinVorgeschlagen(k, index) && !abschaltbar.has(k))) },
      status: "eigen",
      quelle: typeof v.quelle === "string" ? v.quelle : "eigene Vorlage",
    };
    // Nur Sätze, die die Engine weglassen würde, und nur Ersatzstellen in Bausteinen dieser Vorlage.
    const weglassen: Record<string, string[]> = {};
    for (const [satz, ersatz] of Object.entries(istZuordnung(v.weglassen) ? v.weglassen : {})) {
      if (!istTextliste(ersatz) || satzNichtWeglassbar(neu, satz, index)) continue;
      const gueltig = ersatz.filter((s) => !keineErsatzstelle(neu, satz, s, index));
      if (gueltig.length > 0) weglassen[satz] = gueltig;
    }
    const schnellwerte: Record<string, string[]> = {};
    const ids = bausteineDerVorlage(neu);
    for (const [key, liste] of Object.entries(istZuordnung(v.schnellwerte) ? v.schnellwerte : {})) {
      if (!Array.isArray(liste) || !ids.has(key.split("/")[0])) continue;
      const sauber = saubereSchnellwerte(liste);
      // Eine leere Liste heißt „keine Schnellwerte“; eine, von der nichts Brauchbares bleibt, gilt nicht.
      if (liste.length === 0 || sauber.length > 0) schnellwerte[key] = sauber;
    }
    vorlagen.push({ ...neu, weglassen, schnellwerte });
  }
  // Schnellwerte: Unbrauchbares wird ausgelassen, nicht der ganze Bestand verworfen.
  const schnellwerte: Record<string, string[]> = {};
  const roh = (e as { schnellwerte?: unknown }).schnellwerte;
  if (roh && typeof roh === "object" && !Array.isArray(roh)) {
    for (const [label, liste] of Object.entries(roh as Record<string, unknown>)) {
      if (!Array.isArray(liste) || !label.trim() || label.length > 120) continue;
      const sauber = saubereSchnellwerte(liste);
      if (sauber.length > 0) schnellwerte[label] = sauber;
    }
  }
  return { bausteine, vorlagen, schnellwerte };
}

export function ladeEigenes(index: KatalogIndex): Eigenes {
  return pruefeEigenes(lies<Eigenes>(true, "eigenes"), index) ?? { bausteine: [], vorlagen: [], schnellwerte: {} };
}

export function speichereEigenes(e: Eigenes): boolean {
  return schreib(true, "eigenes", e);
}
