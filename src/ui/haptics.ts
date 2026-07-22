// Dezentes haptisches Feedback (nur wo vom Gerät unterstützt – iOS Safari
// ignoriert es, schadet aber nicht). Macht das Antippen von Chips/Seite
// fühlbar – kleiner Qualitätsgewinn im Dienst.
export function tick() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* ignore */
  }
}

export function tock() {
  try {
    navigator.vibrate?.([0, 14]);
  } catch {
    /* ignore */
  }
}
