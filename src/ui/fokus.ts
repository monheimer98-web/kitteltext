import { useLayoutEffect } from "preact/hooks";

/**
 * Merkt, wo der Fokus war, als sich ein Dialog oder die Suche öffnete, und gibt
 * ihn beim Schließen dorthin zurück. Ohne das landet er auf der Seite, und die
 * nächste Taste wirkt auf nichts. Gibt es die alte Stelle nicht mehr, bekommt
 * ihn der Knopf, mit dem es im Brief weitergeht.
 */
export function useFokusZurueck(offen = true) {
  useLayoutEffect(() => {
    if (!offen) return;
    const vorher = document.activeElement as HTMLElement | null;
    return () => {
      window.setTimeout(() => fokusSichern(vorher), 0);
    };
  }, [offen]);
}

/** Liegt der Fokus nirgends mehr, bekommt ihn `vorher` oder der Knopf, mit dem es im Brief weitergeht. */
export function fokusSichern(vorher: HTMLElement | null = null) {
  const jetzt = document.activeElement;
  if (jetzt && jetzt !== document.body && jetzt.isConnected) return;
  const ziel = vorher && vorher !== document.body && vorher.isConnected ? vorher : document.querySelector<HTMLElement>(".f2:not([disabled]), [data-naechste-kopie]:not([disabled])");
  ziel?.focus({ preventScroll: true });
}

/**
 * Führt `fn` aus, sobald Preact die eben geänderten Signale gezeichnet hat, aber noch im selben Ereignis:
 * Preact zeichnet in einer Mikroaufgabe, und Mikroaufgaben laufen vor der nächsten Taste. Ein Fokus, der so
 * gesetzt wird, steht, bevor eine vorausgetippte Taste ankommt (E-43, Grundsatz 3). `setTimeout` dagegen läuft
 * erst nach bereits wartenden Tasten; die träfen dann noch das alte Ziel (PS-K04, PS-K06, PS-K07).
 */
export function nachDemZeichnen(fn: () => void) {
  void Promise.resolve()
    .then(() => Promise.resolve())
    .then(fn);
}
