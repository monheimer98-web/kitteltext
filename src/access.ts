// ============================================================================
// Kitteltext – Zugangscode (weiches Schloss)
// ----------------------------------------------------------------------------
// Hält Zufallsbesucher von der öffentlichen Adresse ab. WICHTIG: das ist KEINE
// echte Sicherheitssperre – der Code steht im veröffentlichten JavaScript und
// ist für jeden auffindbar, der danach sucht. Der Inhalt ist bewusst
// anonymisiert (keine Patientendaten), damit das vertretbar ist.
//
// >>> CODE ÄNDERN: hier den Wert ersetzen und neu deployen (git push). <<<
// Am besten etwas, das nur ihr kennt.
export const ZUGANG_CODE = "kittel25";

import { signal } from "@preact/signals";

const KEY = "kitteltext.zugang.v1";

export const freigeschaltet = signal<boolean>(
  localStorage.getItem(KEY) === ZUGANG_CODE,
);

/** Prüft den eingegebenen Code; bei Erfolg wird das Gerät dauerhaft freigeschaltet. */
export function pruefeCode(eingabe: string): boolean {
  if (eingabe.trim().toLowerCase() === ZUGANG_CODE.toLowerCase()) {
    try {
      localStorage.setItem(KEY, ZUGANG_CODE);
    } catch {
      /* ignore */
    }
    freigeschaltet.value = true;
    return true;
  }
  return false;
}
