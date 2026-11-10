// Formatierte Fassung fürs Kopieren (E-61): Neben den reinen Text legt die App eine HTML-Fassung in die
// Zwischenablage. Beide entstehen aus denselben Tokens; die HTML-Fassung trägt nur Gliederung (fette Überschriften,
// Absätze im Blocksatz, Listen mit Unterpunkten, die Medikation als Tabelle), keine Schriftart, keine Farbe, keine
// Bilder, keine Verweise. Jeder Text wird als Text maskiert; aus Eingaben entsteht nie ein Tag.

import type { AbschnittId } from "../model/types.ts";
import type { KopierFormat, Token } from "./text.ts";
import { fuerZwischenablage } from "./text.ts";
import { MED_SCHEMA_SPALTE, MED_SPALTEN, zellenAusText } from "./medikation.ts";

/** Eine Zeile des Abschnitts, wie sie im reinen Text steht, mit dem, was die Tokens über sie wissen. */
export interface TextZeile {
  text: string;
  /** Zellen einer strukturierten Medikationszeile und der Text des Tokens, aus dem sie stammen */
  zellen?: string[];
  zellenText?: string;
  /** Überschrift eines Bausteins („Nebendiagnosen:“) */
  titel?: boolean;
}

export interface Zelle {
  text: string;
  /** über mehrere Spalten (ungeteilte Zeile, nicht erkannte Stärke) */
  spalten?: number;
  /** Schema mittig */
  mitte?: boolean;
}

export interface Punkt {
  text: string;
  unter: string[];
}

export type Block =
  | { art: "titel"; text: string }
  | { art: "zeile"; text: string }
  | { art: "leer" }
  /** tiefe 2: eingerückte Liste ohne Oberpunkt, etwa Unterpunkte unter einer Diagnose */
  | { art: "liste"; tiefe: 1 | 2; punkte: Punkt[] }
  | { art: "tabelle"; kopf: readonly string[]; zeilen: Zelle[][] };

/** Inline-Stile der HTML-Fassung; die Vorschau benutzt dieselben. Keine Schrift, keine Größe, keine Farbe. */
export const STIL = {
  titel: "margin:0",
  zeile: "margin:0;text-align:justify",
  leer: "margin:0",
  liste: "margin:0;padding-left:2em",
  punkt: "margin:0",
  tabelle: "border-collapse:collapse;margin:0",
  kopf: "border:1px solid;padding:1px 6px;text-align:left;vertical-align:top;font-weight:bold",
  zelle: "border:1px solid;padding:1px 6px;text-align:left;vertical-align:top",
  zelleMitte: "border:1px solid;padding:1px 6px;text-align:center;vertical-align:top",
} as const;

const PUNKT = /^- (.*)$/s;
const UNTERPUNKT = /^ {2}- (.*)$/s;

/** Zerlegt Tokens in Zeilen des reinen Texts und merkt sich Zellen und Überschriften. */
export function zeilenAusTokens(tokens: Token[]): TextZeile[] {
  const zeilen: TextZeile[] = [{ text: "" }];
  for (const tok of tokens) {
    const teile = tok.t.replace(/\r/g, "").split("\n");
    teile.forEach((teil, i) => {
      if (i > 0) zeilen.push({ text: "" });
      const z = zeilen[zeilen.length - 1];
      z.text += teil;
      if (teil && tok.zellen) {
        z.zellen = tok.zellen;
        z.zellenText = tok.t;
      }
      if (teil && tok.art === "titel") z.titel = true;
    });
  }
  return zeilen;
}

export function zeilenAusText(text: string): TextZeile[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((t) => ({ text: t }));
}

function tabellenZeile(z: TextZeile, text: string): Zelle[] {
  const n = MED_SPALTEN.length;
  // Strukturierte Zeile: genau die eingegebenen Felder. Gilt nur, wenn die Zeile allein aus diesem Eintrag besteht.
  if (z.zellen && z.zellen.length === n && z.zellenText?.trim() === text.trim()) {
    return z.zellen.map((t, i) => ({ text: t, mitte: i === MED_SCHEMA_SPALTE }));
  }
  const geteilt = zellenAusText(text);
  if (!geteilt) return [{ text, spalten: n }];
  const vorne: Zelle[] = geteilt.staerke === null ? [{ text: geteilt.wirkstoff, spalten: 2 }] : [{ text: geteilt.wirkstoff }, { text: geteilt.staerke }];
  return [...vorne, { text: geteilt.schema.join("-"), mitte: true }, { text: geteilt.hinweis }];
}

/**
 * Gliedert die Zeilen eines Abschnitts: „- “ ist ein Listenpunkt, „  - “ ein Unterpunkt, eine leere Zeile trennt
 * Absätze. Mit `tabelle` (Medikation) werden Listenpunkte zu Zeilen einer Tabelle.
 */
export function gliedere(zeilen: TextZeile[], opt: { tabelle?: boolean } = {}): Block[] {
  const bloecke: Block[] = [];
  const letzter = () => bloecke[bloecke.length - 1];
  for (const z of zeilen) {
    const text = z.text.replace(/\s+$/, "");
    const punkt = PUNKT.exec(text);
    const unter = UNTERPUNKT.exec(text);
    if (!text.trim()) {
      if (bloecke.length > 0 && letzter().art !== "leer") bloecke.push({ art: "leer" });
    } else if (punkt && opt.tabelle) {
      const l = letzter();
      const zeile = tabellenZeile(z, punkt[1]);
      if (l?.art === "tabelle") l.zeilen.push(zeile);
      else bloecke.push({ art: "tabelle", kopf: MED_SPALTEN, zeilen: [zeile] });
    } else if (punkt) {
      const l = letzter();
      if (l?.art === "liste" && l.tiefe === 1) l.punkte.push({ text: punkt[1], unter: [] });
      else bloecke.push({ art: "liste", tiefe: 1, punkte: [{ text: punkt[1], unter: [] }] });
    } else if (unter) {
      const l = letzter();
      if (l?.art === "liste" && l.tiefe === 1) l.punkte[l.punkte.length - 1].unter.push(unter[1]);
      else if (l?.art === "liste" && l.tiefe === 2) l.punkte.push({ text: unter[1], unter: [] });
      else bloecke.push({ art: "liste", tiefe: 2, punkte: [{ text: unter[1], unter: [] }] });
    } else {
      bloecke.push({ art: z.titel ? "titel" : "zeile", text: text.trim() });
    }
  }
  while (bloecke.length > 0 && letzter().art === "leer") bloecke.pop();
  return bloecke;
}

export interface AbschnittQuelle {
  id: AbschnittId;
  titel: string;
  tokens: Token[];
}

export function abschnittBloecke(a: AbschnittQuelle): Block[] {
  return gliedere(zeilenAusTokens(a.tokens), { tabelle: a.id === "medikation" });
}

const MASKE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function maskiere(t: string): string {
  return t.replace(/[&<>"']/g, (c) => MASKE[c]);
}

/** Zeichen nach dem eingestellten Profil, wie im reinen Text (KIS-sicher schreibt um); ohne Zeilenumbruch. */
export function mitZeichen(t: string, format: KopierFormat): string {
  return fuerZwischenablage(t, { zeichen: format.zeichen, zeilenende: "lf" }).replace(/\n/g, " ");
}

function inhalt(t: string, format: KopierFormat): string {
  return maskiere(mitZeichen(t, format));
}

function liste(punkte: Punkt[], format: KopierFormat): string {
  const li = (p: Punkt) => `<li style="${STIL.punkt}">${inhalt(p.text, format)}${p.unter.length ? liste(p.unter.map((u) => ({ text: u, unter: [] })), format) : ""}</li>`;
  return `<ul style="${STIL.liste}">${punkte.map(li).join("")}</ul>`;
}

function zelle(z: Zelle, format: KopierFormat, tag: "td" | "th" = "td"): string {
  const stil = tag === "th" ? STIL.kopf : z.mitte ? STIL.zelleMitte : STIL.zelle;
  return `<${tag}${z.spalten ? ` colspan="${z.spalten}"` : ""} style="${stil}">${inhalt(z.text, format)}</${tag}>`;
}

export function blockHtml(b: Block, format: KopierFormat): string {
  switch (b.art) {
    case "titel":
      return `<p style="${STIL.titel}"><b>${inhalt(b.text, format)}</b></p>`;
    case "zeile":
      return `<p style="${STIL.zeile}">${inhalt(b.text, format)}</p>`;
    case "leer":
      return `<p style="${STIL.leer}"><br></p>`;
    case "liste":
      return liste(b.punkte, format);
    case "tabelle":
      return `<table style="${STIL.tabelle}"><thead><tr>${b.kopf.map((k) => zelle({ text: k }, format, "th")).join("")}</tr></thead><tbody>${b.zeilen
        .map((r) => `<tr>${r.map((z) => zelle(z, format)).join("")}</tr>`)
        .join("")}</tbody></table>`;
  }
}

/** Kopf der HTML-Fassung: Programme wie Word lesen die Zwischenablage sonst nicht sicher als UTF-8. */
const KOPF = '<meta charset="utf-8">';

export function htmlAusBloecken(bloecke: Block[], format: KopierFormat): string {
  return KOPF + bloecke.map((b) => blockHtml(b, format)).join("");
}

/** Abschnitte mit Überschrift, getrennt durch eine Leerzeile, wie `briefText`. */
export function briefBloecke(teile: AbschnittQuelle[], ueberschriften: boolean): Block[] {
  const aus: Block[] = [];
  teile.forEach((a, i) => {
    if (i > 0) aus.push({ art: "leer" });
    if (ueberschriften) aus.push({ art: "titel", text: `${a.titel}:` });
    aus.push(...abschnittBloecke(a));
  });
  return aus;
}

export function abschnittHtml(a: AbschnittQuelle, format: KopierFormat): string {
  return htmlAusBloecken(abschnittBloecke(a), format);
}

export function briefHtml(teile: AbschnittQuelle[], format: KopierFormat, ueberschriften: boolean): string {
  return htmlAusBloecken(briefBloecke(teile, ueberschriften), format);
}

/** Markierter Text aus dem Brief: Gliederung aus den Zeilen, ohne Tabelle (die Markierung kann mitten in einer Zeile beginnen). */
export function auswahlHtml(text: string, format: KopierFormat): string {
  return htmlAusBloecken(gliedere(zeilenAusText(text)), format);
}
