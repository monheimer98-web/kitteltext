// Zugangscode der gehosteten Fassung (weiches Schloss). Er hält
// Zufallsbesucher von der öffentlichen Adresse ab. Das ist keine
// Sicherheitssperre: Wer im Browser-Speicher die Freischaltung von Hand
// anlegt, kommt auch ohne Code hinein.
//
// Hier steht nur ein Prüfwert, nicht der Code: Das Repository ist öffentlich,
// ein lesbarer Code wäre dort für jeden auffindbar (E-51). Gesalzen und
// 10 000-fach gehasht, damit naheliegende Codes nicht durch einfaches
// Durchprobieren zu finden sind.
//
// Code ändern: den neuen Code in die Umgebungsvariable ZUGANG_CODE legen,
// `node tools/zugang-pruefwert.mjs` ausführen, den ausgegebenen Wert unten
// eintragen und neu ausliefern. Den Code selbst nie in eine Datei, einen
// Commit oder einen Bericht schreiben.

import { signal } from "@preact/signals";
import { alsHex, sha256 } from "./sha256.ts";
import { liesRoh, schreibRoh } from "./speicher.ts";

const ZUGANG_SALZ = "kitteltext-zugang-2026-11";
const ZUGANG_RUNDEN = 10_000;
export const ZUGANG_PRUEFWERT = "22f1bc2b151115136ef2e55c8bf11fbc03a616d8229061950bb7b1071a9978c4";

/** Prüfwert einer Eingabe; Groß- und Kleinschreibung und Leerraum am Rand zählen nicht. */
export function zugangsPruefwert(eingabe: string): string {
  let h = sha256(new TextEncoder().encode(ZUGANG_SALZ + eingabe.trim().toLowerCase()));
  for (let i = 1; i < ZUGANG_RUNDEN; i++) h = sha256(h);
  return alsHex(h);
}

const KEY = "kitteltext.zugang.v1";
/** Name des Eintrags im Browser-Speicher; die Klicktests legen ihn vorab an, statt den Code zu tippen. */
export const ZUGANG_SCHLUESSEL = KEY;

// Bei gesperrtem Speicher gilt der Code als nicht hinterlegt; die App startet trotzdem.
// Ein Gerät mit dem Merker eines früheren Codes muss neu freischalten.
export const freigeschaltet = signal<boolean>(liesRoh(KEY) === ZUGANG_PRUEFWERT);

/** Prüft den eingegebenen Code; bei Erfolg bleibt das Gerät freigeschaltet, soweit der Browser das Speichern zulässt. */
export function pruefeCode(eingabe: string): boolean {
  if (zugangsPruefwert(eingabe) === ZUGANG_PRUEFWERT) {
    schreibRoh(KEY, ZUGANG_PRUEFWERT);
    freigeschaltet.value = true;
    return true;
  }
  return false;
}
