// ============================================================================
// Kitteltext – "Zuletzt verwendet"
// ----------------------------------------------------------------------------
// Merkt sich die zuletzt gestarteten Baustein-Kombinationen (nur Titel + IDs,
// keine Falldaten, keine Patientendaten). Rein zur schnelleren Wiederauswahl.
// ============================================================================

import { signal } from "@preact/signals";

export interface LetzterStart {
  titel: string;
  bausteinIds: string[];
}

const KEY = "kitteltext.letzte.v1";
const MAX = 6;

function laden(): LetzterStart[] {
  try {
    const roh = localStorage.getItem(KEY);
    if (roh) {
      const a = JSON.parse(roh);
      if (Array.isArray(a)) return a;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export const letzte = signal<LetzterStart[]>(laden());

export function merkeLetzte(titel: string, bausteinIds: string[]) {
  if (!titel || bausteinIds.length === 0) return;
  const key = bausteinIds.join(",");
  const ohneDup = letzte.value.filter(
    (x) => x.bausteinIds.join(",") !== key,
  );
  const neu = [{ titel, bausteinIds }, ...ohneDup].slice(0, MAX);
  letzte.value = neu;
  try {
    localStorage.setItem(KEY, JSON.stringify(neu));
  } catch {
    /* ignore */
  }
}
