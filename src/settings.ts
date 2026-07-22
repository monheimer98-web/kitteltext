// ============================================================================
// Kitteltext – Einstellungen (lokal, geraetegebunden)
// ----------------------------------------------------------------------------
// Enthaelt bewusst KEINE Patientendaten. Das Klinik-Postfach ist die eigene
// dienstliche Adresse des Arztes (personenbezogen auf ihn, nicht auf Patienten)
// und dient nur als Vorbelegung des E-Mail-Fallbacks.
// ============================================================================

import { signal, effect } from "@preact/signals";

const KEY = "kitteltext.settings.v1";

export interface Settings {
  /** eigenes Klinik-Postfach, Vorbelegung fuer den E-Mail-Fallback */
  klinikMail: string;
  /** Betreff-Praefix fuer die Fallback-Mail */
  mailBetreff: string;
}

function laden(): Settings {
  try {
    const roh = localStorage.getItem(KEY);
    if (roh) return { ...standard(), ...JSON.parse(roh) };
  } catch {
    /* ignore */
  }
  return standard();
}

function standard(): Settings {
  return { klinikMail: "", mailBetreff: "Befundtext" };
}

export const settings = signal<Settings>(laden());

effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings.value));
  } catch {
    /* ignore */
  }
});

export function setSetting<K extends keyof Settings>(key: K, wert: Settings[K]) {
  settings.value = { ...settings.value, [key]: wert };
}
