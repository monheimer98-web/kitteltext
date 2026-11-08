// Zugangscode der gehosteten Fassung (weiches Schloss). Er hält
// Zufallsbesucher von der öffentlichen Adresse ab. Das ist keine
// Sicherheitssperre: Der Code steht im ausgelieferten JavaScript und ist für
// jeden auffindbar, der danach sucht.
//
// Code ändern: hier den Wert ersetzen und neu ausliefern.
export const ZUGANG_CODE = "FusselTapsi2898";

import { signal } from "@preact/signals";
import { liesRoh, schreibRoh } from "./speicher.ts";

const KEY = "kitteltext.zugang.v1";
/** Name des Eintrags im Browser-Speicher; die Klicktests legen ihn vorab an, statt den Code zu tippen. */
export const ZUGANG_SCHLUESSEL = KEY;

// Bei gesperrtem Speicher gilt der Code als nicht hinterlegt; die App startet trotzdem.
export const freigeschaltet = signal<boolean>(liesRoh(KEY) === ZUGANG_CODE);

/** Prüft den eingegebenen Code; bei Erfolg bleibt das Gerät freigeschaltet, soweit der Browser das Speichern zulässt. */
export function pruefeCode(eingabe: string): boolean {
  if (eingabe.trim().toLowerCase() === ZUGANG_CODE.toLowerCase()) {
    schreibRoh(KEY, ZUGANG_CODE);
    freigeschaltet.value = true;
    return true;
  }
  return false;
}
