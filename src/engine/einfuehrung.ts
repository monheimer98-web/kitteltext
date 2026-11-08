// Wann die Anleitung von selbst aufgeht (D-05).

/**
 * Nur beim allerersten Start, und nur, wenn der Browser sich merken kann, dass sie schon offen war. Ohne dauerhaften
 * Speicher ginge sie sonst bei jedem Start wieder auf; dann bleibt sie zu und ist über den Knopf „Anleitung“ erreichbar.
 */
export function anleitungVonSelbst(schonGezeigt: boolean, merkbar: boolean): boolean {
  return merkbar && !schonGezeigt;
}
