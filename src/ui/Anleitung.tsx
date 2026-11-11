// Seitenleiste „Anleitung“ (D-05): nicht blockierend, der Brief bleibt bedienbar. Inhalt aus `src/data/anleitung.ts`,
// Tastenliste aus `src/data/tastatur.ts` wie in den Einstellungen.

import { useLayoutEffect, useRef } from "preact/hooks";
import { ABLAUF_STUNDEN, anleitungOffen, sucheOffen } from "../store.ts";
import { offeneListe, offenesFeld } from "./aktionen.ts";
import { fokusSichern } from "./fokus.ts";
import { ANLEITUNG_TITEL, GRUNDREGEL, NICHTS_VERGESSEN, SCHLUSSSATZ, TASTATUR_TITEL, VIER_SCHRITTE, ZEHN_MINUTEN, datenschutz } from "../data/anleitung.ts";
import { TASTATUR, TASTENSPERRE } from "../data/tastatur.ts";
import { BEHALTEN_TAGE } from "../engine/behalten.ts";

export function schalteAnleitung() {
  anleitungOffen.value = anleitungOffen.value ? null : "knopf";
}

/**
 * Esc gehört zuerst dem, was sonst offen ist (Fenster, Befundliste, Suche, Dialog, Bausteinwahl): Dort schließt es das
 * und lässt die Anleitung stehen. Steht der Fokus in der Anleitung, oder ist sonst nichts offen, schließt Esc sie.
 */
function escSchliesstAnleitung(innen: boolean): boolean {
  if (innen) return true;
  return !offenesFeld.peek() && !offeneListe.peek() && sucheOffen.peek() === null && !document.querySelector("[data-dialog], .bausteinwahl");
}

function Absatzgruppe({ titel, saetze }: { titel: string; saetze: readonly string[] }) {
  return (
    <section class="al-gruppe">
      <h3>{titel}</h3>
      {saetze.map((s) => (
        <p>{s}</p>
      ))}
    </section>
  );
}

export function Anleitung() {
  const ref = useRef<HTMLElement>(null);
  const titel = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    // Von selbst geöffnet nimmt sie den Fokus nicht: Wer beim ersten Start gleich tippt, tippt ins Suchfeld.
    const vorher = document.activeElement as HTMLElement | null;
    if (anleitungOffen.peek() === "knopf") titel.current?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const innen = !!ref.current?.contains(document.activeElement);
      if (!escSchliesstAnleitung(innen)) return;
      if (innen) {
        e.preventDefault();
        e.stopPropagation();
      }
      anleitungOffen.value = null;
    };
    // Einfangphase: Esc wird geprüft, bevor Fenster oder Befundliste es verbrauchen und ihren Zustand schon geschlossen haben.
    document.addEventListener("keydown", taste, true);
    return () => {
      document.removeEventListener("keydown", taste, true);
      window.setTimeout(() => fokusSichern(vorher), 0);
    };
  }, []);

  const schutz = datenschutz(ABLAUF_STUNDEN, BEHALTEN_TAGE);
  return (
    <aside id="anleitung" class="anleitung" aria-labelledby="anleitung-titel" ref={ref}>
      <div class="al-kopf">
        <h2 id="anleitung-titel" tabIndex={-1} ref={titel}>
          {ANLEITUNG_TITEL}
        </h2>
        <button type="button" class="knopf leise" aria-label="Anleitung schließen" title="Schließen (Esc)" onClick={() => (anleitungOffen.value = null)}>
          Schließen
        </button>
      </div>
      <Absatzgruppe titel={GRUNDREGEL.titel} saetze={GRUNDREGEL.saetze} />
      <section class="al-gruppe">
        <h3>{VIER_SCHRITTE.titel}</h3>
        <ol>
          {VIER_SCHRITTE.schritte.map((s) => (
            <li>
              <strong>{s.was}</strong> {s.wie}
            </li>
          ))}
        </ol>
      </section>
      <Absatzgruppe titel={NICHTS_VERGESSEN.titel} saetze={NICHTS_VERGESSEN.saetze} />
      <section class="al-gruppe">
        <h3>{TASTATUR_TITEL}</h3>
        <dl class="al-tasten">
          {TASTATUR.map((r) => (
            <>
              <dt>
                <kbd>{r.taste}</kbd>
              </dt>
              <dd>{r.wirkt}</dd>
            </>
          ))}
        </dl>
        <p class="al-leise">{TASTENSPERRE}</p>
      </section>
      <Absatzgruppe titel={schutz.titel} saetze={schutz.saetze} />
      <Absatzgruppe titel={ZEHN_MINUTEN.titel} saetze={ZEHN_MINUTEN.saetze} />
      <p class="al-leise">{SCHLUSSSATZ}</p>
    </aside>
  );
}
