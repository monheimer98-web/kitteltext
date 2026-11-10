// Vorschau der formatierten Fassung (E-61): zeigt den Brief so, wie er formatiert in die Zwischenablage geht. Gezeichnet
// aus denselben Blöcken und Inline-Stilen wie die HTML-Fassung, als Preact-Elemente, nie als eingesetztes HTML.

import { signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { sichtbareAbschnitte } from "../engine/render.ts";
import { STIL, abschnittBloecke, mitZeichen } from "../engine/kopierformat.ts";
import type { Block, Punkt, Zelle } from "../engine/kopierformat.ts";
import type { KopierFormat } from "../engine/text.ts";
import { brief, einstellungen } from "../store.ts";
import { useFokusZurueck } from "./fokus.ts";

export const vorschauOffen = signal(false);

function Liste({ punkte, f }: { punkte: Punkt[]; f: KopierFormat }) {
  return (
    <ul style={STIL.liste}>
      {punkte.map((p) => (
        <li style={STIL.punkt}>
          {mitZeichen(p.text, f)}
          {p.unter.length > 0 && <Liste punkte={p.unter.map((u) => ({ text: u, unter: [] }))} f={f} />}
        </li>
      ))}
    </ul>
  );
}

function ZelleAnsicht({ z, f, kopf }: { z: Zelle; f: KopierFormat; kopf?: boolean }) {
  const stil = kopf ? STIL.kopf : z.mitte ? STIL.zelleMitte : STIL.zelle;
  return kopf ? (
    <th style={stil} scope="col">
      {mitZeichen(z.text, f)}
    </th>
  ) : (
    <td style={stil} colSpan={z.spalten}>
      {mitZeichen(z.text, f)}
    </td>
  );
}

function BlockAnsicht({ b, f }: { b: Block; f: KopierFormat }) {
  switch (b.art) {
    case "titel":
      return (
        <p style={STIL.titel}>
          <b>{mitZeichen(b.text, f)}</b>
        </p>
      );
    case "zeile":
      return <p style={STIL.zeile}>{mitZeichen(b.text, f)}</p>;
    case "leer":
      return (
        <p style={STIL.leer}>
          <br />
        </p>
      );
    case "liste":
      return <Liste punkte={b.punkte} f={f} />;
    case "tabelle":
      return (
        <table style={STIL.tabelle}>
          <thead>
            <tr>
              {b.kopf.map((k) => (
                <ZelleAnsicht z={{ text: k }} f={f} kopf />
              ))}
            </tr>
          </thead>
          <tbody>
            {b.zeilen.map((r) => (
              <tr>
                {r.map((z) => (
                  <ZelleAnsicht z={z} f={f} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

export function Vorschau() {
  const offen = vorschauOffen.value;
  useFokusZurueck(offen);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (offen) ref.current?.focus();
  }, [offen]);
  const b = brief.value;
  if (!offen || !b) return null;
  const e = einstellungen.value;
  const f: KopierFormat = { zeilenende: e.zeilenende, zeichen: e.zeichen };
  const teile = sichtbareAbschnitte(b);
  const zu = () => (vorschauOffen.value = false);
  return (
    <div class="dialog-flaeche ueber" data-dialog onMouseDown={(ev) => ev.target === ev.currentTarget && zu()}>
      <div
        class="dialog-karte breit vorschau"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vorschau-titel"
        onKeyDown={(ev) => {
          if (ev.key === "Escape") {
            ev.stopPropagation();
            zu();
          }
        }}
      >
        <div class="es-kopf">
          <h1 id="vorschau-titel">Vorschau: formatiert kopiert</h1>
          <button type="button" class="knopf leise" ref={ref} onClick={zu}>
            Schließen
          </button>
        </div>
        <p class="es-hilfe">
          {e.formatiert
            ? "So sieht der Brief aus, wenn das KIS Formatierung annimmt; Schrift und Größe bestimmt dort die Briefvorlage. Nimmt es keine an, kommt der reine Text an, wie er im Brief steht."
            : "Formatiert kopieren ist in den Einstellungen aus: Kopiert wird nur der reine Text, wie er im Brief steht."}
        </p>
        <div class="vorschau-papier" tabIndex={0} aria-label="Brief in formatierter Fassung">
          {teile.length === 0 && <p class="es-hilfe">Der Brief hat noch keinen Text.</p>}
          {teile.map((a, i) => (
            <section data-vorschau={a.id}>
              {i > 0 && (
                <p style={STIL.leer}>
                  <br />
                </p>
              )}
              {e.ueberschriften && (
                <p style={STIL.titel}>
                  <b>{mitZeichen(`${a.titel}:`, f)}</b>
                </p>
              )}
              {!a.fertig && <p class="vorschau-hinweis">noch nicht fertig: Lücken und graue Vorschläge gehen so nicht hinaus</p>}
              {abschnittBloecke(a).map((bl) => (
                <BlockAnsicht b={bl} f={f} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
