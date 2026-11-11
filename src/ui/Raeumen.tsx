// Frage vor „Arbeitsplatz räumen“ (E-81). Gibt es behaltene Fälle, wählt der Arzt, ob sie bleiben oder mit gelöscht werden.
// Texte und Zahlen kommen aus `engine/raeumen.ts`, das Löschen aus dem Store; hier wird nur gefragt und gemeldet.

import { useLayoutEffect, useRef } from "preact/hooks";
import { raeumenFrage, raeumenKnoepfe } from "../engine/raeumen.ts";
import type { RaeumenLage } from "../engine/raeumen.ts";
import { bestand, faelle, istBehalten } from "../store.ts";
import { raeumeArbeitsplatz } from "./aktionen.ts";
import { melde } from "./kopieren.ts";

export function raeumenLage(): RaeumenLage {
  const e = bestand.value.eintraege;
  return { fenster: faelle.value.filter((f) => !istBehalten(f.id)).length, behalten: e.length, einziger: e.length === 1 ? e[0].kurz : undefined };
}

/** Räumt und meldet erst danach, was nachweislich gelöscht ist. */
export async function raeumeUndMelde(mitBehaltenen: boolean) {
  const m = await raeumeArbeitsplatz(mitBehaltenen);
  melde(m, m.art === "fehler" ? 10_000 : 6000);
}

/**
 * Die Frage als Leiste. Den Fokus hat „Abbrechen“ (oder „Nein“): Kein Knopf, der löscht, liegt vorab auf Enter.
 * `onFertig(true)` nach dem Räumen, `onFertig(false)` bei Abbrechen oder Esc.
 */
export function RaeumenFrage({ id, onFertig }: { id: string; onFertig: (geraeumt: boolean) => void }) {
  const lage = raeumenLage();
  const k = raeumenKnoepfe(lage);
  const abbrechen = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => abbrechen.current?.focus(), []);
  const raeume = (mitBehaltenen: boolean) => {
    void raeumeUndMelde(mitBehaltenen);
    onFertig(true);
  };
  return (
    <div class="raeumen-frage" role="group" aria-labelledby={`${id}-titel`} data-raeumen-frage onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onFertig(false))}>
      <span id={`${id}-titel`} class="raeumen-titel">
        {raeumenFrage(lage)}
      </span>
      <span class="raeumen-knoepfe">
        {lage.behalten > 0 ? (
          <>
            <button type="button" class="knopf klein" onClick={() => raeume(false)}>
              {k.bleiben}
            </button>
            <button type="button" class="knopf gefahr klein" onClick={() => raeume(true)}>
              {k.alles}
            </button>
          </>
        ) : (
          <button type="button" class="knopf gefahr klein" onClick={() => raeume(true)}>
            Ja, räumen
          </button>
        )}
        <button type="button" class="knopf leise klein" ref={abbrechen} onClick={() => onFertig(false)}>
          {lage.behalten > 0 ? "Abbrechen" : "Nein"}
        </button>
      </span>
    </div>
  );
}
