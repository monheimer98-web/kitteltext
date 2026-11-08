import { signal } from "@preact/signals";

export interface Meldung {
  text: string;
  art: "ok" | "warnung" | "fehler";
  aktion?: { label: string; ausfuehren: () => void };
  /** Fall, dem die Meldung gilt: Beim Wechsel zu einem anderen Fall verschwindet sie (PS-N09). */
  fallId?: string;
}

export const meldung = signal<Meldung | null>(null);
let timer: number | undefined;

/**
 * Zeigt eine Meldung. Fehler bleiben stehen, bis sie geschlossen oder von der nächsten Meldung ersetzt werden. Ohne
 * Angabe steht eine Meldung 3,5 s, mit „Rückgängig“ 8 s (G-77); eine übergebene Dauer gilt immer (PS-N09).
 */
export function melde(m: Meldung, dauerMs?: number) {
  meldung.value = m;
  window.clearTimeout(timer);
  if (m.art === "fehler") return;
  timer = window.setTimeout(() => meldung.peek() === m && (meldung.value = null), dauerMs ?? (m.aktion ? 8000 : 3500));
}

/**
 * Schreibt Text in die Zwischenablage. Erst über die moderne Schnittstelle,
 * sonst über ein verstecktes Textfeld: Auf Klinik-PCs ist die moderne
 * Schnittstelle je nach Richtlinie oder bei lokal geöffneter Datei gesperrt.
 */
export async function inZwischenablage(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Rückfallweg unten */
  }
  const aktiv = document.activeElement as HTMLElement | null;
  const ta = document.createElement("textarea");
  try {
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    ta.remove();
    aktiv?.focus?.();
  }
}
