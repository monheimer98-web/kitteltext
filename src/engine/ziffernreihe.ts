// Ziffernreihe im Fenster eines Satzes mit mehreren Angaben (PS-N01, E-44 Satz 3): Welche Angabe nach einer Antwort die
// Ziffern nimmt. Rein rechnerisch; die Ansicht beschreibt jede Angabe in Lesereihenfolge. Dass ein grauer Satz nach
// Antworten auf alle Knopfreihen gilt, regelt `mitAngabe` (engine/fall.ts), nicht diese Datei.

export interface Angabe {
  /** Eine Knopfreihe, in der Ziffern wählen (sonst ein Textfeld). */
  knoepfe: boolean;
  /** Noch nichts eingetragen, obwohl verlangt. */
  offen: boolean;
}

/**
 * Nächste Angabe nach einer Antwort in Angabe `nach`. Per Taste (`perTaste`): die nächste darunter, die eine Knopfreihe
 * ist, die der Arzt in diesem Fenster noch nicht beantwortet hat, auch wenn sie vorbelegt ist, oder ein offenes Textfeld
 * (PS-N01). Nach einem Klick zuerst die erste offene Angabe: Der Klick sagt nichts über eine Reihenfolge, offen ist, was
 * fehlt (QA-24). Nie zurück auf eine beantwortete Reihe: Darunter keine mehr, dann die erste offene Angabe, sonst die
 * erste unbeantwortete Knopfreihe. null, wenn es keine solche Angabe gibt.
 */
export function naechsteAngabe(angaben: readonly Angabe[], beantwortet: ReadonlySet<number>, nach: number, perTaste = true): number | null {
  const kandidat = (a: Angabe, j: number) => (a.knoepfe ? !beantwortet.has(j) : a.offen);
  const offen = angaben.findIndex((a) => a.offen);
  if (!perTaste && offen >= 0) return offen;
  for (let j = nach + 1; j < angaben.length; j++) if (kandidat(angaben[j], j)) return j;
  if (offen >= 0) return offen;
  const frei = angaben.findIndex((a, j) => a.knoepfe && !beantwortet.has(j));
  return frei >= 0 ? frei : null;
}
