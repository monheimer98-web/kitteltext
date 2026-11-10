// Eingabe der strukturierten Medikation (M-07, E-62) im Feldfenster: je Arzneimittel eine Zeile mit Wirkstoff,
// Stärke/Form, Schema, Hinweis und Status; dazwischen freie Zeilen. Die App schlägt kein Präparat und keine Dosis vor
// (E-29): Schnellwerte des Katalogs und eigene des Arztes kommen als freie Zeile dazu, nie als Ersatz der Liste.
//
// Tasten: Tab geht von Feld zu Feld wie in einer Tabelle, Enter weiter zur nächsten Lücke im Brief. Ein Bindestrich im
// Schema springt zur nächsten Einnahmezeit, damit „1-0-1-0“ in einem Zug getippt werden kann.

import { useLayoutEffect, useRef } from "preact/hooks";
import type { Platzhalter } from "../model/types.ts";
import { mitSpaeter, mitWert } from "../engine/fall.ts";
import { schnellwerteVon } from "../engine/vorlage.ts";
import { MED_STATUS, MED_ZEITEN, SCHEMA_ODER_HINWEIS, fehlendes, feldText, istLeer, leereZeile, leseMedikation, medText, schemaAusText, schreibeMedikation } from "../engine/medikation.ts";
import type { MedEintrag, MedZeile } from "../engine/medikation.ts";
import { INDEX, aendere, aktiverFall } from "../store.ts";
import { schliesseFeld, weiter, zugNachEingabe } from "./aktionen.ts";
import { FreitextHinweis, Schnellwerte } from "./Feldfenster.tsx";

/** Einträge zum Bearbeiten: ohne gespeicherte Zeile eine leere strukturierte, damit gleich getippt werden kann. */
function eintraegeVon(wert: string | undefined): MedEintrag[] {
  const e = leseMedikation(wert);
  return e.length > 0 ? e : [leereZeile()];
}

/** Text eines Eintrags, wie er im Brief steht; Grundlage für „als Schnellwert merken“. */
function eintragText(e: MedEintrag): string {
  if (e.art === "frei") return e.text.trim();
  const { text, offen } = medText(e);
  return offen ? "" : text;
}

export function MedikationEditor({ k, def }: { k: string; def: Platzhalter }) {
  const fall = aktiverFall.value!;
  const roh = fall.werte[k];
  const eintraege = eintraegeVon(roh);
  const ref = useRef<HTMLDivElement>(null);
  const katalog = schnellwerteVon(fall.vorlageId ? INDEX.vorlagen.get(fall.vorlageId) : undefined, k, def.vorschlaege ?? []);

  const speichere = (neu: MedEintrag[], gruppe?: string) => aendere((f) => mitWert(f, k, neu.length === 0 ? "" : schreibeMedikation(neu)), gruppe);
  const aendereZeile = (i: number, teil: Partial<MedZeile>) =>
    speichere(
      eintraege.map((e, j) => (j === i && e.art === "zeile" ? { ...e, ...teil } : e)),
      `wert:${k}`,
    );
  // Fokus in eine eben angelegte Zeile: gleich nach dem Zeichnen, noch vor der nächsten Taste. Mit einem Bild Verzug
  // landete das erste getippte Zeichen auf dem Knopf und sperrte die Tasten (Sichtprüfung r5-kopieren).
  const fokusNachZeichnen = useRef<string | null>(null);
  const fokus = (sel: string) => (fokusNachZeichnen.current = sel);
  useLayoutEffect(() => {
    const sel = fokusNachZeichnen.current;
    fokusNachZeichnen.current = null;
    if (sel) ref.current?.querySelector<HTMLElement>(sel)?.focus();
  });
  // Eine neue Zeile kommt ans Ende; leere Zeilen davor entfallen, sie sagen nichts.
  const neueZeile = (e: MedEintrag) => speichere([...leseMedikation(roh).filter((x) => !istLeer(x)), e]);

  // Beim Öffnen: in die erste Zeile mit Lücke, sonst in eine leere Liste; sonst bleibt der Fokus beim Fenster.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ziel = el.querySelector<HTMLElement>(".med-offen [data-fehlt='1']") ?? (leseMedikation(roh).some((e) => !istLeer(e)) ? null : el.querySelector<HTMLElement>("[data-med-feld='wirkstoff']"));
    ziel?.focus({ preventScroll: true });
  }, []);

  const taste = (e: KeyboardEvent) => {
    const ziel = e.target as HTMLElement;
    // Das Statusfeld nimmt Buchstaben und Pfeile selbst; die Tasten des Fensters gelten dort nicht.
    if (ziel.tagName === "SELECT" && e.key !== "Enter") {
      e.stopPropagation();
      return;
    }
    if ((ziel.tagName === "INPUT" || ziel.tagName === "SELECT") && e.key === "Enter" && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      zugNachEingabe();
      weiter();
      return;
    }
    // Bindestrich im Schema: zur nächsten Einnahmezeit, nach „nachts“ zum Hinweis.
    const zeit = ziel.dataset.medZeit;
    if (zeit !== undefined && e.key === "-" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const zeile = ziel.closest(".med-zeile");
      const n = Number(zeit);
      (zeile?.querySelector<HTMLElement>(n < 3 ? `[data-med-zeit='${n + 1}']` : "[data-med-feld='hinweis']") ?? ziel).focus();
    }
  };

  const merken = [...eintraege].reverse().map(eintragText).find(Boolean) ?? "";
  const nr = (i: number) => i + 1;

  return (
    <div class="med-editor" ref={ref} role="group" aria-labelledby="med-titel" onKeyDown={taste}>
      <div class="ff-label" id="med-titel">
        {def.label}
      </div>
      <div class="med-liste">
        {eintraege.map((e, i) => {
          const weg = (
            <button
              type="button"
              class="knopf leise klein med-weg"
              aria-label={`Zeile ${nr(i)} entfernen${e.art === "zeile" && e.wirkstoff.trim() ? ` (${e.wirkstoff.trim()})` : ""}`}
              title="Zeile entfernen"
              onClick={() => {
                // Der Knopf „+ Arzneimittel“ steht schon da: Fokus sofort, nicht erst nach dem Zeichnen.
                ref.current?.querySelector<HTMLElement>(".med-neu")?.focus();
                speichere(eintraege.filter((_, j) => j !== i));
              }}
            >
              ×
            </button>
          );
          if (e.art === "frei") {
            return (
              <div class="med-zeile med-frei" data-med-zeile={i}>
                <label class="med-feld">
                  <span>Freie Zeile</span>
                  <input
                    class="ff-eingabe"
                    type="text"
                    spellcheck={false}
                    autocomplete="off"
                    aria-label={`Zeile ${nr(i)}: freier Text`}
                    data-med-feld="frei"
                    value={e.text}
                    onInput={(ev) => speichere(eintraege.map((x, j) => (j === i ? { art: "frei", text: feldText((ev.target as HTMLInputElement).value) } : x)), `wert:${k}`)}
                  />
                </label>
                {weg}
              </div>
            );
          }
          const fehlt = istLeer(e) ? [] : fehlendes(e);
          // `fehlendes` nennt „Wirkstoff“, „Schema mittags, nachts“ und „Schema oder Hinweis“; Letzteres führt zu „morgens“.
          const fehltFeld = (f: string) =>
            fehlt.some((x) => x === f || (x === SCHEMA_ODER_HINWEIS ? f === MED_ZEITEN[0] : x.startsWith("Schema ") && x.slice(7).split(", ").includes(f)));
          const feld = (name: "wirkstoff" | "staerke" | "hinweis", titel: string) => (
            <label class="med-feld">
              <span>{titel}</span>
              <input
                class="ff-eingabe"
                type="text"
                spellcheck={false}
                autocomplete="off"
                aria-label={`Zeile ${nr(i)}: ${titel}`}
                aria-invalid={name === "wirkstoff" && fehltFeld("Wirkstoff") ? "true" : undefined}
                data-med-feld={name}
                data-fehlt={name === "wirkstoff" && fehltFeld("Wirkstoff") ? "1" : undefined}
                value={e[name]}
                onInput={(ev) => aendereZeile(i, { [name]: feldText((ev.target as HTMLInputElement).value) })}
              />
            </label>
          );
          return (
            <div class={fehlt.length ? "med-zeile med-offen" : "med-zeile"} data-med-zeile={i}>
              {feld("wirkstoff", "Wirkstoff")}
              {feld("staerke", "Stärke/Form")}
              <div class="med-feld" role="group" aria-label={`Zeile ${nr(i)}: Schema morgens-mittags-abends-nachts`}>
                <span aria-hidden="true">Schema mo-mi-ab-na</span>
                <div class="med-schema">
                  {MED_ZEITEN.map((zeitName, z) => {
                    const offen = fehltFeld(zeitName);
                    return (
                      <>
                        {z > 0 && <span aria-hidden="true">-</span>}
                        <input
                          class="ff-eingabe med-zeit"
                          type="text"
                          inputMode="decimal"
                          spellcheck={false}
                          autocomplete="off"
                          maxLength={8}
                          aria-label={`Zeile ${nr(i)}: ${zeitName}`}
                          aria-invalid={offen ? "true" : undefined}
                          data-med-zeit={z}
                          data-fehlt={offen ? "1" : undefined}
                          value={e.schema[z]}
                          onInput={(ev) => {
                            const schema = [...e.schema] as MedZeile["schema"];
                            schema[z] = feldText((ev.target as HTMLInputElement).value);
                            aendereZeile(i, { schema });
                          }}
                          onPaste={(ev) => {
                            // „1-0-1-0“ eingefügt: verteilt auf die Einnahmezeiten ab dieser.
                            const teile = schemaAusText(ev.clipboardData?.getData("text/plain") ?? "");
                            if (!teile) return;
                            ev.preventDefault();
                            const schema = [...e.schema] as MedZeile["schema"];
                            teile.slice(0, 4 - z).forEach((t, j) => (schema[z + j] = t));
                            aendereZeile(i, { schema });
                          }}
                        />
                      </>
                    );
                  })}
                </div>
              </div>
              {feld("hinweis", "Hinweis, Dauer")}
              <label class="med-feld">
                <span>Status</span>
                <select
                  class="ff-eingabe med-status"
                  aria-label={`Zeile ${nr(i)}: Status`}
                  data-med-feld="status"
                  value={e.status}
                  onChange={(ev) => aendereZeile(i, { status: (ev.target as HTMLSelectElement).value })}
                >
                  <option value="">ohne</option>
                  {MED_STATUS.map((s) => (
                    <option value={s}>{s}</option>
                  ))}
                  {e.status && !(MED_STATUS as readonly string[]).includes(e.status) && <option value={e.status}>{e.status}</option>}
                </select>
              </label>
              {/* Im Raster oben rechts, in der Tab-Folge zuletzt: Tab geht von Stärke/Form direkt ins Schema. */}
              {weg}
              {fehlt.length > 0 && <p class="med-fehlt">fehlt: {fehlt.join("; ")}</p>}
            </div>
          );
        })}
      </div>
      <div class="med-knoepfe">
        <button type="button" class="link med-neu" onClick={() => (neueZeile(leereZeile()), fokus(".med-zeile:last-child [data-med-feld='wirkstoff']"))}>
          + Arzneimittel
        </button>
        <button type="button" class="link" onClick={() => (neueZeile({ art: "frei", text: "" }), fokus(".med-zeile:last-child [data-med-feld='frei']"))}>
          + freie Zeile
        </button>
      </div>
      <Schnellwerte label={def.label} katalog={katalog} wert={merken} eigene onWahl={(v) => neueZeile({ art: "frei", text: v })} />
      <p class="ff-hinweis">
        Schema morgens-mittags-abends-nachts, etwa 1-0-1-0 oder ½-0-½-0; der Bindestrich springt weiter. Bei Bedarfsmedikation bleibt das Schema leer, die
        Anwendung steht im Hinweis. Nichts wird mit 0 aufgefüllt.
      </p>
      <FreitextHinweis />
      <div class="ff-fuss">
        {def.required ? (
          <button
            type="button"
            class="link"
            title={`Im Text steht dann [${def.label.toUpperCase()}] und fällt im KIS auf`}
            onClick={() => {
              aendere((f) => mitSpaeter(f, k, true));
              weiter();
            }}
          >
            erst im KIS ausfüllen
          </button>
        ) : (
          roh && (
            <button type="button" class="link" onClick={() => (speichere([]), schliesseFeld())}>
              leeren
            </button>
          )
        )}
      </div>
    </div>
  );
}
