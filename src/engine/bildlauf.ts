// Bildlauf ohne Browser (CR-R6F-03, PS-R6F-5): um wie viel ein Ausschnitt rücken muss, damit ein Bereich darin zu sehen
// ist. Die Ansicht misst, diese Rechnung entscheidet; so lässt sie sich ohne Seite prüfen.

export interface Strecke {
  oben: number;
  unten: number;
}

/**
 * Verschiebung, die `ziel` in den sichtbaren Ausschnitt `sicht` holt, mit möglichst kleiner Bewegung (wie „nearest“).
 * Beide Strecken auf derselben Achse, in Pixeln; `rand` hält Abstand zum Rand, damit die Zeile davor oder danach mit zu
 * sehen ist. Positiv heißt weiter nach unten, 0: liegt schon im Bild. Ist das Ziel höher als der Ausschnitt, kommt sein
 * Anfang ins Bild, denn dort steht, was ersetzt wird.
 */
export function verschiebung(sicht: Strecke, ziel: Strecke, rand = 0): number {
  const r = Math.max(0, Math.min(rand, (sicht.unten - sicht.oben - (ziel.unten - ziel.oben)) / 2));
  const oben = sicht.oben + r;
  const unten = sicht.unten - r;
  if (ziel.oben < oben) return ziel.oben - oben;
  if (ziel.unten > unten) return Math.min(ziel.unten - unten, ziel.oben - oben);
  return 0;
}
