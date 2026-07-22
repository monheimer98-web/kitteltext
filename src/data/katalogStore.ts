// ============================================================================
// Kitteltext – Katalog-Store
// ----------------------------------------------------------------------------
// Effektiver Katalog = eingebauter Standard ODER vom Nutzer im Editor
// bearbeitete Fassung (in localStorage). Alle UI-/Engine-Aufrufe lesen den
// Katalog ueber dieses Signal, damit Editor-Aenderungen sofort greifen.
// ============================================================================

import { signal, effect } from "@preact/signals";
import { Katalog } from "../model/types.ts";
import { KATALOG } from "./katalog.ts";

const KEY = "kitteltext.katalog.v1";

function tiefeKopie<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

function laden(): { katalog: Katalog; eigen: boolean } {
  try {
    const roh = localStorage.getItem(KEY);
    if (roh) {
      const k = JSON.parse(roh) as Katalog;
      if (k && Array.isArray(k.regionen)) return { katalog: k, eigen: true };
    }
  } catch {
    /* ignore */
  }
  return { katalog: tiefeKopie(KATALOG), eigen: false };
}

const initial = laden();
export const katalog = signal<Katalog>(initial.katalog);
export const istEigenerKatalog = signal<boolean>(initial.eigen);

// Persistiere nur, wenn es ein eigener (bearbeiteter) Katalog ist.
effect(() => {
  const k = katalog.value;
  if (istEigenerKatalog.value) {
    try {
      localStorage.setItem(KEY, JSON.stringify(k));
    } catch {
      /* ignore */
    }
  }
});

/** Ersetzt den Katalog (Editor) und markiert ihn als eigenen. */
export function setzeKatalog(k: Katalog) {
  istEigenerKatalog.value = true;
  katalog.value = tiefeKopie(k);
}

/** Wendet eine Mutation auf eine Kopie an und speichert. */
export function bearbeiteKatalog(fn: (k: Katalog) => void) {
  const k = tiefeKopie(katalog.value);
  fn(k);
  setzeKatalog(k);
}

/** Zuruecksetzen auf den eingebauten Standard. */
export function resetKatalog() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  istEigenerKatalog.value = false;
  katalog.value = tiefeKopie(KATALOG);
}

export function ladeKatalogInfo() {
  const k = katalog.value;
  let bausteine = 0;
  for (const r of k.regionen) bausteine += r.bausteine.length;
  return {
    regionen: k.regionen.length,
    bausteine,
    stapel: k.stapel.length,
    eigen: istEigenerKatalog.value,
    version: k.version,
  };
}

/** Speichert eine Baustein-Kombination als neuen (eigenen) Stapel. */
export function speichereAlsStapel(name: string, bausteinIds: string[]) {
  const basis = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "stapel";
  const vorhanden = new Set(katalog.value.stapel.map((s) => s.id));
  let id = `eigen-${basis}`;
  let n = 2;
  while (vorhanden.has(id)) id = `eigen-${basis}-${n++}`;
  bearbeiteKatalog((k) => {
    k.stapel.unshift({ id, name: name.trim(), bausteinIds: [...bausteinIds] });
  });
}

export function exportJson(): string {
  return JSON.stringify(katalog.value, null, 2);
}

/** Importiert einen Katalog aus JSON. Wirft bei ungueltiger Struktur. */
export function importJson(text: string) {
  const k = JSON.parse(text) as Katalog;
  if (!k || !Array.isArray(k.regionen) || !Array.isArray(k.stapel)) {
    throw new Error("Ungültige Katalog-Datei");
  }
  setzeKatalog(k);
}
