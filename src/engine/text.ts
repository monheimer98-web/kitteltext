// Textbausteine werden als Folge von Tokens gehalten, damit die Oberfläche jede
// veränderliche Stelle im Brief anklickbar machen kann. Der kopierte Text ist
// immer die Verkettung genau dieser Tokens.

import type { FalldatumArt } from "../model/types.ts";

export type TokenArt =
  | "fix"
  | "seite"
  | "feld"
  | "auswahl"
  | "befund"
  | "messwert"
  | "person"
  | "option"
  | "wahl" // Entweder-oder-Stelle der Vorlage, noch nicht entschieden
  | "zusatz"
  | "manuell"
  | "gliederung" // Zeichen eines Unterpunkts samt Einzug („\n  - “): bleibt beim Glätten unverändert
  | "titel"; // Überschrift über dem Text eines Bausteins („Nebendiagnosen:“), steht nur, wenn er Text hat

export type TokenZustand =
  | "offen" // Pflichtangabe fehlt
  | "vorschlag" // Aussage der Vorlage, vom Arzt noch nicht übernommen
  | "gesetzt" // vom Arzt gewählt, eingetragen oder übernommen
  | "spaeter" // bewusst als Platzhalter fürs KIS stehen gelassen
  | "ok" // Normalbefund bestätigt
  | "abw"; // auffälliger Befund

export interface Token {
  t: string;
  art: TokenArt;
  /** Zustandsschlüssel des Feldes; fehlt bei festem Text */
  key?: string;
  bausteinId?: string;
  zustand?: TokenZustand;
  /** Bezeichnung des Feldes für Beschriftung und Lückentext */
  label?: string;
  /** Untersuchungsgruppe eines Befunds */
  gruppe?: string;
  /** vom Arzt frei geschriebener Text: wird nicht geglättet */
  frei?: boolean;
  /**
   * Zellen einer Tabellenzeile, wenn der Text aus einer strukturierten Eingabe stammt (Medikation: Wirkstoff,
   * Stärke/Form, Schema in einer Zelle, Hinweis). Die formatierte Fassung baut daraus die Tabelle; der Text bleibt `t`.
   */
  zellen?: string[];
  /** Das Feld setzt ein Datum des Fallkopfs ein (E-58); fehlt es, steht der Platzhalter fürs KIS. */
  falldatum?: FalldatumArt;
  /** Errechnete Daten in Klammern im Text dieses Tokens (E-59), nach Lage im Text. */
  fristen?: FristTeil[];
  /** Fristen dieses Tokens, deren Datum der Arzt weggelassen hat („ohne Datum“): zum Zurückholen im Feldfenster. */
  ohneFrist?: string[];
  /** Angaben dieses Satzes, deren Antwort von einer anderen Stelle stammt (E-60): Bezeichnung der Quelle. */
  uebertragen?: string[];
}

/**
 * Ein errechnetes Datum in Klammern hinter einer Frist: `t.slice(start, ende)` ist „(20.11.2026)“. Es hat einen
 * eigenen Zustand: Vorschlag, bis der Arzt es übernimmt; dann zählt es zu seiner Aussage.
 */
export interface FristTeil {
  key: string;
  start: number;
  ende: number;
  zustand: "vorschlag" | "gesetzt";
  anker: FalldatumArt;
  tage: number;
  datum: string;
}

/** Steht im Token etwas, das noch Vorschlag ist: der Satz selbst oder ein errechnetes Datum darin? */
export function mitVorschlag(t: Token): boolean {
  return t.zustand === "vorschlag" || (!!t.fristen && t.fristen.some((f) => f.zustand === "vorschlag"));
}

/** Schlüssel der errechneten Daten eines Tokens, die noch Vorschlag sind. */
export function offeneFristen(t: Token): string[] {
  return (t.fristen ?? []).filter((f) => f.zustand === "vorschlag").map((f) => f.key);
}

/** Sichtbare Lücke für eine fehlende Pflichtangabe. */
export function luecke(label: string): string {
  return `‹${label}›`;
}

export const LUECKE = /‹[^›]*›/g;

/**
 * Nächste Lücke ‹…› im freien Text, ausgehend von der Auswahl `anfang`–`ende` (R5-02). Vorwärts die erste, die hinter
 * dem Ende der Auswahl endet; rückwärts die letzte, die vor ihrem Anfang beginnt. Eine schon ausgewählte Lücke zählt
 * so in keiner Richtung, eine Lücke mit der Einfügemarke darin in beiden.
 */
export function lueckeImText(text: string, anfang: number, ende: number, rueckwaerts = false): { anfang: number; ende: number } | undefined {
  const alle = [...text.matchAll(LUECKE)].map((m) => ({ anfang: m.index, ende: m.index + m[0].length }));
  return rueckwaerts ? alle.filter((l) => l.anfang < anfang).pop() : alle.find((l) => l.ende > ende);
}

/** Platzhalter, der mitkopiert wird und im KIS auffallen soll. */
export function kisPlatzhalter(label: string): string {
  return `[${label.toUpperCase()}]`;
}

const SATZZEICHEN = ".,;:!?)";
// Nach diesen Zeichen beginnt ein neuer Satz oder eine neue Angabe; auch eine Lücke oder ein Platzhalter endet so.
const SATZENDE = ".!?;:›]";
const WORTANFANG = /[\p{L}\p{N}‹[„(]/u;

/**
 * Bereinigt Leerraum und Satzzeichen über Tokengrenzen hinweg: keine doppelten
 * Leerzeichen, kein Leerzeichen vor Satzzeichen oder am Zeilenanfang, höchstens
 * eine Leerzeile, kein ".." oder ",,". Stoßen zwei Sätze ohne Leerzeichen
 * aneinander, wird eines eingefügt. Frei geschriebener Text bleibt, wie er ist.
 */
export function glaetten(tokens: Token[]): Token[] {
  const aus: Token[] = [];
  let letztes = "\n";
  let umbrueche = 2;

  const kuerzeLeerzeichen = () => {
    for (let i = aus.length - 1; i >= 0; i--) {
      const t = aus[i].t;
      if (t.length === 0) continue;
      if (t.endsWith(" ") && !aus[i].frei) aus[i] = { ...aus[i], t: t.slice(0, -1) };
      return;
    }
  };

  for (const tok of tokens) {
    const roh = tok.t.replace(/\r/g, "");
    if (roh.length === 0) continue;

    // Einzug eines Unterpunkts: Leerzeichen am Zeilenanfang tragen hier die Gliederung und bleiben stehen.
    if (tok.art === "gliederung") {
      if (letztes === " ") kuerzeLeerzeichen();
      // Steht schon ein Zeilenumbruch davor, entsteht keine Leerzeile.
      const t = letztes === "\n" ? roh.replace(/^\n/, "") : roh;
      aus.push({ ...tok, t, frei: true });
      letztes = t[t.length - 1];
      umbrueche = 0;
      continue;
    }

    // Satzende trifft ohne Leerzeichen auf den nächsten Satz.
    const trenner = SATZENDE.includes(letztes) && WORTANFANG.test(roh[0]) ? " " : "";

    if (tok.frei) {
      const t = letztes === " " || letztes === "\n" ? roh.replace(/^[ \t]+/, "") : roh;
      if (t.length === 0) continue;
      aus.push({ ...tok, t: trenner + t });
      letztes = t[t.length - 1];
      umbrueche = /\n+$/.exec(t)?.[0].length ?? 0;
      continue;
    }

    let s = trenner;
    if (trenner) letztes = " ";
    for (const c of roh) {
      if (c === " " || c === "\t" || c === " ") {
        if (letztes === " " || letztes === "\n") continue;
        s += " ";
        letztes = " ";
      } else if (c === "\n") {
        if (letztes === " ") {
          if (s.endsWith(" ")) s = s.slice(0, -1);
          else kuerzeLeerzeichen();
        }
        if (umbrueche >= 2) continue;
        s += "\n";
        letztes = "\n";
        umbrueche++;
      } else {
        if (SATZZEICHEN.includes(c)) {
          if (letztes === " ") {
            if (s.endsWith(" ")) s = s.slice(0, -1);
            else kuerzeLeerzeichen();
            letztes = s.length ? s[s.length - 1] : letztesZeichen(aus);
          }
          if ((c === "." || c === ",") && letztes === c) continue;
          if (c === "." && (letztes === "?" || letztes === "!")) continue;
        }
        s += c;
        letztes = c;
        umbrueche = 0;
      }
    }
    if (s.length > 0) aus.push({ ...tok, t: s });
  }

  // Leerraum am Ende entfernen
  for (let i = aus.length - 1; i >= 0; i--) {
    const t = aus[i].t.replace(/[ \n]+$/, "");
    if (t.length === 0) {
      aus.pop();
      continue;
    }
    aus[i] = { ...aus[i], t };
    break;
  }
  return aus;
}

function letztesZeichen(tokens: Token[]): string {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].t;
    if (t.length) return t[t.length - 1];
  }
  return "\n";
}

export function tokensZuText(tokens: Token[]): string {
  return tokens.map((t) => t.t).join("");
}

/**
 * Text für „Von Hand bearbeiten“, auch bevor alles geklärt ist (M-18 Station, E-66). Im freien Text gibt es kein Grau:
 * Ein Vorschlag steht deshalb als „‹Vorschlag: …›“ da, eine offene Stelle als Lücke. Beides zählt als Lücke und sperrt
 * das Kopieren, bis der Arzt den Text übernimmt (Klammern löschen), ändert oder streicht. So wird kein Vorschlag still
 * zur Aussage des Arztes.
 */
export function handtext(tokens: Token[]): string {
  return tokens
    .map((t) => {
      if (t.zustand !== "vorschlag" && t.zustand !== "offen") return mitGrauenFristen(t);
      if (t.t.includes("‹")) return t.t;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t.t)!;
      if (!m[2]) return t.zustand === "offen" ? `${t.t}${luecke(t.label ?? "offen")}` : t.t;
      // Klammern im Satz selbst würden die Lücke vorzeitig schließen.
      const kern = m[2].replace(/[‹›]/g, "");
      return `${m[1]}${luecke(t.zustand === "vorschlag" ? `Vorschlag: ${kern}` : kern)}${m[3]}`;
    })
    .join("");
}

/** Ein errechnetes Datum, das noch Vorschlag ist, steht im freien Text als Lücke „‹Vorschlag: (20.11.2026)›“ (E-59). */
function mitGrauenFristen(t: Token): string {
  const grau = (t.fristen ?? []).filter((f) => f.zustand === "vorschlag").sort((a, b) => a.start - b.start);
  if (grau.length === 0) return t.t;
  let aus = "";
  let bis = 0;
  for (const f of grau) {
    aus += t.t.slice(bis, f.start) + luecke(`Vorschlag: ${t.t.slice(f.start, f.ende)}`);
    bis = f.ende;
  }
  return aus + t.t.slice(bis);
}

export interface KopierFormat {
  /** Windows-Programme erwarten CRLF; manche Felder zeigen bei LF keine Umbrüche */
  zeilenende: "crlf" | "lf";
  /** "einfach" ersetzt typografische Zeichen durch solche, die jedes Feld annimmt */
  zeichen: "original" | "einfach";
}

// Ältere Klinikprogramme arbeiten mit dem Zeichensatz Windows-1252. Zeichen
// außerhalb davon ersetzt Windows beim Einfügen still, zum Teil sinnentstellend
// (aus "≥" wird "="). Deshalb werden sie vorher eindeutig umgeschrieben.
export const ERSATZ: [RegExp, string][] = [
  [/[„“”«»]/g, '"'],
  [/[‚‘’]/g, "'"],
  [/[–—−‐‑]/g, "-"],
  [/…/g, "..."],
  [/[     \t]/g, " "],
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/≠/g, "ungleich"],
  [/≈/g, "ca."],
  [/→/g, "->"],
  [/←/g, "<-"],
  [/μ/g, "µ"], // griechisches My -> Mikro-Zeichen, das der Zeichensatz kennt
  [/₂/g, "2"],
  [/ ?‰/g, " Promille"],
  [/[•●▪]/g, "-"],
  [/[​‌‍﻿]/g, ""],
];

const UNSICHER = /[^\n\r -~¡-ÿ]/g;

function umschreiben(text: string): string {
  let t = text.normalize("NFC");
  for (const [muster, ersatz] of ERSATZ) t = t.replace(muster, ersatz);
  return t;
}

/** Zeichen, die auch nach der Umschrift nicht in jedem Klinikprogramm unverändert ankommen. */
export function unsichereZeichen(text: string): string[] {
  return [...new Set(umschreiben(text).match(UNSICHER) ?? [])];
}

/** Ob ein Text nach der Umschrift nur Zeichen enthält, die jedes Windows-Programm unverändert annimmt (ISO 8859-1). */
export function istKisSicher(text: string): boolean {
  return unsichereZeichen(text).length === 0;
}

export function fuerZwischenablage(text: string, format: KopierFormat): string {
  let t = text.replace(/\r\n?/g, "\n").normalize("NFC");
  if (format.zeichen === "einfach") t = umschreiben(t);
  return format.zeilenende === "crlf" ? t.replace(/\n/g, "\r\n") : t;
}
