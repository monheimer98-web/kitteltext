import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { ABLAUF_STUNDEN, INDEX, eigeneVorlageLoeschen, eigenenBausteinLoeschen, eigenes, eigenesErsetzen, einstellungen, faelle, setzeEinstellung } from "../store.ts";
import { raeumeArbeitsplatz } from "./aktionen.ts";
import { useFokusZurueck } from "./fokus.ts";
import { ausNeuererFassung, eigenesAlsText, pruefeEigenes } from "../speicher.ts";
import { inZwischenablage } from "./kopieren.ts";
import type { Einstellungen as E } from "../speicher.ts";
import { KATALOG } from "../data/katalog.ts";
import { TASTATUR, TASTENSPERRE } from "../data/tastatur.ts";
import { melde } from "./kopieren.ts";
import { Arbeitsplatz } from "./Arbeitsplatz.tsx";

function Wahl<K extends keyof E>(p: { name: K; titel: string; hilfe?: string; optionen: { wert: E[K]; label: string }[] }) {
  const aktuell = einstellungen.value[p.name];
  return (
    <div class="es-zeile">
      <div>
        <div class="es-titel">{p.titel}</div>
        {p.hilfe && <div class="es-hilfe">{p.hilfe}</div>}
      </div>
      <div class="umschalter" role="radiogroup" aria-label={p.titel}>
        {p.optionen.map((o) => (
          <button type="button" role="radio" aria-checked={aktuell === o.wert} class={aktuell === o.wert ? "aktiv" : ""} onClick={() => setzeEinstellung(p.name, o.wert)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Gruppe(p: { titel: string; children: ComponentChildren }) {
  return (
    <section class="es-gruppe">
      <h2>{p.titel}</h2>
      {p.children}
    </section>
  );
}

/** „1 Vorlage“, „2 Vorlagen“, „0 Bausteine“ (QA-12). */
function anzahl(n: number, eins: string, mehr: string): string {
  return `${n} ${n === 1 ? eins : mehr}`;
}

/**
 * Löschen eines eigenen Inhalts in zwei Schritten (QA-13): Der erste Klick fragt, der zweite löscht und meldet es.
 * Der Knopf nennt den Inhalt, damit ein Bildschirmleser weiß, welcher gemeint ist.
 */
function Loeschen(p: { name: string; art: "Vorlage" | "Baustein"; loesche: () => boolean; belegt: string; danach: () => void }) {
  const [frage, setFrage] = useState(false);
  return (
    <button
      type="button"
      class={frage ? "knopf gefahr" : "knopf leise"}
      aria-label={frage ? `${p.art} „${p.name}“ wirklich löschen?` : `${p.art} „${p.name}“ löschen`}
      onBlur={() => setFrage(false)}
      onClick={() => {
        if (!frage) return setFrage(true);
        setFrage(false);
        if (!p.loesche()) return melde({ text: p.belegt, art: "warnung" });
        melde({ text: `${p.art === "Vorlage" ? "Eigene Vorlage" : "Eigener Baustein"} „${p.name}“ gelöscht.`, art: "ok" });
        p.danach();
      }}
    >
      {frage ? "wirklich löschen?" : "löschen"}
    </button>
  );
}

function Eigenes() {
  const e = eigenes.value;
  const [einfuegen, setEinfuegen] = useState(false);
  const [text, setText] = useState("");
  const leer = e.bausteine.length === 0 && e.vorlagen.length === 0;
  // Nach dem Löschen fällt der Fokus sonst auf die Seite (QA-07, QA-13).
  const weiterRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <p class="es-hilfe">
        Eigene Bausteine entstehen im Brief über „⋯ → Als eigenen Baustein speichern", eigene Vorlagen über „als eigene Vorlage speichern" im Fallkopf. Sie bleiben dauerhaft auf diesem Rechner und stehen jedem zur Verfügung, der ihn
        unter demselben Konto benutzt; sie dürfen nichts enthalten, was zu einem Patienten gehört. Zum Mitnehmen auf einen anderen Rechner: als Text kopieren, dort einfügen.
      </p>
      {leer && <p class="es-hilfe">Noch nichts gespeichert.</p>}
      {e.vorlagen.map((v) => (
        <div class="es-zeile">
          <div>
            <div class="es-titel">{v.titel}</div>
            <div class="es-hilfe">Vorlage · {v.setting === "zna" ? "Notaufnahme" : "Station"}</div>
          </div>
          <Loeschen
            name={v.titel}
            art="Vorlage"
            loesche={() => eigeneVorlageLoeschen(v.id)}
            belegt="Ein offener Fall verwendet diese Vorlage. Erst den Fall schließen."
            danach={() => weiterRef.current?.focus()}
          />
        </div>
      ))}
      {e.bausteine.map((b) => (
        <div class="es-zeile">
          <div>
            <div class="es-titel">{b.titel}</div>
            <div class="es-hilfe">
              Baustein · {b.abschnitt} · {b.text.slice(0, 80)}
              {b.text.length > 80 ? " …" : ""}
            </div>
          </div>
          <Loeschen
            name={b.titel}
            art="Baustein"
            loesche={() => eigenenBausteinLoeschen(b.id)}
            belegt="Ein offener Fall verwendet diesen Baustein. Erst dort entfernen oder den Fall schließen."
            danach={() => weiterRef.current?.focus()}
          />
        </div>
      ))}
      <div class="es-zeile">
        <button
          type="button"
          class="knopf"
          disabled={leer}
          onClick={async () => {
            const ok = await inZwischenablage(eigenesAlsText(e));
            melde(ok ? { text: "Eigene Inhalte als Text kopiert. Auf dem anderen Rechner hier einfügen.", art: "ok" } : { text: "Der Browser hat das Kopieren blockiert.", art: "fehler" });
          }}
        >
          Als Text kopieren
        </button>
        <button type="button" class="knopf" ref={weiterRef} onClick={() => setEinfuegen(!einfuegen)}>
          Aus Text einfügen
        </button>
      </div>
      {einfuegen && (
        <div>
          <textarea spellcheck={false} class="ff-eingabe" rows={4} value={text} placeholder="Kopierten Text hier einfügen (Strg+V)" aria-label="Eigene Inhalte einfügen" onInput={(ev) => setText((ev.target as HTMLTextAreaElement).value)} />
          <div class="ff-fuss">
            <span class="es-hilfe">Ersetzt die eigenen Inhalte auf diesem Gerät.</span>
            <button
              type="button"
              class="knopf primaer"
              disabled={!text.trim()}
              onClick={() => {
                let roh: unknown = null;
                try {
                  roh = JSON.parse(text);
                } catch {
                  /* kein gültiger Text */
                }
                if (ausNeuererFassung(roh)) return melde({ text: "Der Text stammt aus einer neueren Fassung von Kitteltext und lässt sich hier nicht einfügen.", art: "fehler" });
                const neu = pruefeEigenes(roh, INDEX);
                if (!neu) return melde({ text: "Das ist kein gültiger Text aus „Als Text kopieren“.", art: "fehler" });
                if (!eigenesErsetzen(neu)) return melde({ text: "Offene Fälle verwenden eigene Inhalte. Erst diese Fälle schließen.", art: "warnung" });
                setText("");
                setEinfuegen(false);
                melde({ text: `${anzahl(neu.vorlagen.length, "Vorlage", "Vorlagen")} und ${anzahl(neu.bausteine.length, "Baustein", "Bausteine")} übernommen.`, art: "ok" });
              }}
            >
              Übernehmen
            </button>
          </div>
        </div>
      )}
    </>
  );
}


export function Einstellungen({ onZu }: { onZu: () => void }) {
  useFokusZurueck();
  const ref = useRef<HTMLDivElement>(null);
  const [check, setCheck] = useState(false);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const taste = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[aria-label='Arbeitsplatz-Check']") && onZu();
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, []);
  if (check) return <Arbeitsplatz onZu={() => setCheck(false)} />;
  const vorlagen = KATALOG.vorlagen.length;
  const entwuerfe = KATALOG.vorlagen.filter((v) => v.status === "entwurf").length;
  return (
    <div class="dialog-flaeche ueber" data-dialog onMouseDown={(e) => e.target === e.currentTarget && onZu()}>
      <div class="dialog-karte breit" role="dialog" aria-modal="true" aria-label="Einstellungen" ref={ref}>
        <div class="es-kopf">
          <h1>Einstellungen</h1>
          <button type="button" class="knopf leise" onClick={onZu}>
            Schließen
          </button>
        </div>

        <Gruppe titel="Einfügen ins KIS">
          <Wahl
            name="zeichen"
            titel="Sonderzeichen"
            hilfe={'„KIS-sicher“ schreibt Zeichen um, die ältere Klinikprogramme verfälschen: Gedankenstrich zu Bindestrich, „ “ zu ", ≥ zu >=.'}
            optionen={[
              { wert: "einfach", label: "KIS-sicher" },
              { wert: "original", label: "Original" },
            ]}
          />
          <Wahl
            name="zeilenende"
            titel="Zeilenumbrüche"
            hilfe="Windows ist richtig für fast alle Klinikprogramme. Nur umstellen, wenn im KIS doppelte Leerzeilen erscheinen."
            optionen={[
              { wert: "crlf", label: "Windows" },
              { wert: "lf", label: "Unix" },
            ]}
          />
          <Wahl
            name="ueberschriften"
            titel="Ganzer Brief"
            hilfe="Ob beim Kopieren des ganzen Briefs die Abschnittsüberschriften mitkommen."
            optionen={[
              { wert: true, label: "mit Überschriften" },
              { wert: false, label: "ohne" },
            ]}
          />
          <Wahl
            name="listen"
            titel="Aufzählungen"
            hilfe="Maßnahmen und Procedere als Liste mit Spiegelstrichen oder als Fließtext."
            optionen={[
              { wert: "striche", label: "Spiegelstriche" },
              { wert: "fliesstext", label: "Fließtext" },
            ]}
          />
        </Gruppe>

        <Gruppe titel="Arbeitsplatz-Check">
          <div class="es-zeile">
            <div>
              <div class="es-titel">Kommt der Text im KIS richtig an?</div>
              <div class="es-hilfe">Drei Prüftexte zum Einfügen ins KIS, mit Vergleichstext und Notizliste. Einmal je Arbeitsplatz, etwa zehn Minuten.</div>
            </div>
            <button type="button" class="knopf" onClick={() => setCheck(true)}>
              Check öffnen
            </button>
          </div>
        </Gruppe>

        <Gruppe titel="Dieses Gerät">
          <div class="es-zeile">
            <div>
              <div class="es-titel">Arbeitsplatz räumen</div>
              <div class="es-hilfe">
                Löscht alle {faelle.value.length} offenen Fälle sofort und überschreibt die Zwischenablage. Eigene Bausteine und Vorlagen bleiben. Ohnehin gilt: Fälle liegen nur in diesem Browserfenster und verfallen ohne
                Änderung nach {ABLAUF_STUNDEN.zna} Stunden (Notaufnahme) bzw. {ABLAUF_STUNDEN.station} Stunden (Station).
              </div>
            </div>
            <button
              type="button"
              class="knopf gefahr"
              onClick={() => {
                raeumeArbeitsplatz();
                melde({ text: "Alle Fälle gelöscht, Zwischenablage überschrieben. Eigene Bausteine und Vorlagen bleiben.", art: "ok" }, 5000);
                onZu();
              }}
            >
              Alle Fälle löschen
            </button>
          </div>
          <Wahl
            name="farbmodus"
            titel="Darstellung"
            optionen={[
              { wert: "system", label: "wie System" },
              { wert: "hell", label: "hell" },
              { wert: "dunkel", label: "dunkel" },
            ]}
          />
        </Gruppe>

        <Gruppe titel="Eigene Bausteine und Vorlagen">
          <Eigenes />
        </Gruppe>

        <Gruppe titel="Tastatur">
          <dl class="es-kuerzel">
            {TASTATUR.map((r) => (
              <>
                <dt>
                  <kbd>{r.taste}</kbd>
                </dt>
                <dd>{r.wirkt}</dd>
              </>
            ))}
          </dl>
          <p class="es-hilfe">{TASTENSPERRE}</p>
        </Gruppe>

        <Gruppe titel="Über Kitteltext">
          <p class="es-hilfe">
            Formulierungshilfe für die ärztliche Dokumentation. Keine medizinische Entscheidungsunterstützung, kein Medizinprodukt. Die App sendet keine Daten und hat keine Felder für Name, Geburtsdatum oder Fallnummer. Jeder
            übernommene Text ist ärztlich zu prüfen.
          </p>
          <p class="es-hilfe">
            Katalog Version {KATALOG.version}: {vorlagen} Vorlagen, davon {entwuerfe} als Entwurf ohne ärztliche Freigabe.
          </p>
        </Gruppe>
      </div>
    </div>
  );
}
