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

/** Was in der Zwischenablage gelandet ist: beide Fassungen, nur der reine Text oder nichts. */
export type Kopierweg = "formatiert" | "text" | false;

/**
 * Schreibt Text in die Zwischenablage, mit `html` zusätzlich die formatierte Fassung (E-61). Wege nacheinander:
 * 1. `navigator.clipboard.write` mit `ClipboardItem` (beide Fassungen; Edge und Chrome, nicht Firefox ESR 115);
 * 2. `navigator.clipboard.writeText` (nur reiner Text);
 * 3. verstecktes Textfeld und `execCommand("copy")`; das Kopierereignis setzt dabei beide Fassungen, wo der Browser es
 *    zulässt. Auf Klinik-PCs ist die moderne Schnittstelle je nach Richtlinie oder bei lokal geöffneter Datei gesperrt.
 * Jeder Weg ersetzt den ganzen Inhalt der Zwischenablage: Eine ältere formatierte Fassung bleibt nie zurück.
 */
export async function inZwischenablage(text: string, html?: string): Promise<Kopierweg> {
  const sicher = !!navigator.clipboard && window.isSecureContext;
  if (html !== undefined && sicher && typeof navigator.clipboard.write === "function" && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) }),
      ]);
      return "formatiert";
    } catch {
      /* weiter mit reinem Text */
    }
  }
  try {
    if (sicher) {
      await navigator.clipboard.writeText(text);
      return "text";
    }
  } catch {
    /* Rückfallweg unten */
  }
  const aktiv = document.activeElement as HTMLElement | null;
  const ta = document.createElement("textarea");
  let beide = false;
  const beimKopieren = (e: ClipboardEvent) => {
    if (html === undefined || !e.clipboardData) return;
    e.clipboardData.setData("text/plain", text);
    e.clipboardData.setData("text/html", html);
    e.preventDefault();
    beide = true;
  };
  document.addEventListener?.("copy", beimKopieren, true);
  try {
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand("copy") ? (beide ? "formatiert" : "text") : false;
  } catch {
    return false;
  } finally {
    document.removeEventListener?.("copy", beimKopieren, true);
    ta.remove();
    aktiv?.focus?.();
  }
}
