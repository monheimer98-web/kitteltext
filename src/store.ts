// ============================================================================
// Kitteltext – App-State (signal-basiert)
// ----------------------------------------------------------------------------
// Haelt den laufenden Fall + den aktuellen Screen. Autopersistenz nach jeder
// Aenderung -> Unterbrechungsfestigkeit (App-Wechsel/Sperrbildschirm).
// Gespeichert werden NUR Baustein-IDs, Werte, Seite – nie Patientendaten.
// ============================================================================

import { signal, effect } from "@preact/signals";
import { Baustein, Fall, Seite, leererFall } from "./model/types.ts";
import { katalog } from "./data/katalogStore.ts";
import { fallBrauchtSeite } from "./engine/render.ts";
import { merkeLetzte } from "./recent.ts";

function findeBaustein(id: string): Baustein | undefined {
  for (const r of katalog.value.regionen) {
    const b = r.bausteine.find((x) => x.id === id);
    if (b) return b;
  }
  return undefined;
}

export type Screen =
  | "home"
  | "gate"
  | "composer"
  | "review"
  | "uebergabe"
  | "editor"
  | "settings"
  | "pc-empfang";

const SPEICHER_KEY = "kitteltext.fall.v1";

function ladeFall(): Fall {
  try {
    const roh = localStorage.getItem(SPEICHER_KEY);
    if (!roh) return leererFall();
    const f = JSON.parse(roh) as Fall;
    // Minimalvalidierung
    if (!Array.isArray(f.bausteinIds)) return leererFall();
    return f;
  } catch {
    return leererFall();
  }
}

export const fall = signal<Fall>(ladeFall());
export const screen = signal<Screen>("home");
/** fuer die Home-Drilldown-Ansicht: aktuell aufgeklappte Region */
export const offeneRegion = signal<string | null>(null);

// Autopersistenz
effect(() => {
  try {
    localStorage.setItem(SPEICHER_KEY, JSON.stringify(fall.value));
  } catch {
    /* Speicher voll / privat – bewusst ignoriert, kein harter Fehler */
  }
});

function commit(next: Fall) {
  fall.value = { ...next };
}

/** Setzt Platzhalter-Defaults der angegebenen Bausteine in den Fall. */
function seedDefaults(f: Fall, ids: string[]) {
  for (const id of ids) {
    const b = findeBaustein(id);
    if (!b) continue;
    for (const p of b.platzhalter) {
      if (p.default != null && f.werte[p.id] == null) f.werte[p.id] = p.default;
    }
  }
}

/** Startet einen frischen Fall mit den gegebenen Bausteinen. */
export function starteFall(bausteinIds: string[], titel?: string) {
  if (titel) merkeLetzte(titel, bausteinIds);
  const f = leererFall();
  f.bausteinIds = [...bausteinIds];
  // Platzhalter-Defaults in den Fall-Zustand setzen, damit der Renderer sie
  // sieht (nicht nur das Eingabefeld). Leert der Arzt das Feld, blockiert der
  // Export – gewollt.
  seedDefaults(f, bausteinIds);
  fall.value = f;
  // Braucht der Fall eine Seite? -> Gate, sonst direkt Composer.
  screen.value = fallBrauchtSeite(f, katalog.value) ? "gate" : "composer";
}

/** Fügt einen Baustein zum laufenden Fall hinzu (ohne Neuanfang). */
export function fuegeBausteinHinzu(id: string) {
  if (fall.value.bausteinIds.includes(id)) return;
  const f: Fall = {
    ...fall.value,
    bausteinIds: [...fall.value.bausteinIds, id],
    werte: { ...fall.value.werte },
  };
  seedDefaults(f, [id]);
  fall.value = f;
  // Braucht der neue Baustein eine Seite, ist aber keine gesetzt? -> Gate.
  if (!f.seite && fallBrauchtSeite(f, katalog.value)) {
    screen.value = "gate";
  }
}

/** Entfernt einen Baustein aus dem laufenden Fall. */
export function entferneBaustein(id: string) {
  fall.value = {
    ...fall.value,
    bausteinIds: fall.value.bausteinIds.filter((x) => x !== id),
  };
}

export function setSeite(s: Seite) {
  commit({ ...fall.value, seite: s });
}

export function toggleBefund(id: string) {
  const befunde = { ...fall.value.befunde, [id]: !fall.value.befunde[id] };
  commit({ ...fall.value, befunde });
}

export function setWert(id: string, wert: string) {
  const werte = { ...fall.value.werte, [id]: wert };
  commit({ ...fall.value, werte });
}

export function setAuswahl(id: string, index: number) {
  const auswahl = { ...fall.value.auswahl, [id]: index };
  commit({ ...fall.value, auswahl });
}

export function neuerFall() {
  fall.value = leererFall();
  offeneRegion.value = null;
  screen.value = "home";
}

export function geheZu(s: Screen) {
  screen.value = s;
}
