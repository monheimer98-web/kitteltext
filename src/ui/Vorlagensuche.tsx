// Einstieg: Der Arzt tippt Diagnose, Kürzel oder Region und bekommt den Brief.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Seite, Vorlage } from "../model/types.ts";
import { sucheVorlagen } from "../engine/suche.ts";
import { INDEX, katalogStand, nutzung, setting } from "../store.ts";
import { STATUS_TEXT } from "./Brief.tsx";

const SEITENWORT: Record<string, Seite> = {
  re: "rechts",
  rechts: "rechts",
  li: "links",
  links: "links",
  bds: "beidseits",
  bdsts: "beidseits",
  beidseits: "beidseits",
  bilateral: "beidseits",
};

/** Liest eine Seitenangabe aus der Eingabe ("osg re") und gibt den Rest zurück. */
export function trenneSeite(eingabe: string): { frage: string; seite?: Seite } {
  const woerter = eingabe.trim().split(/\s+/);
  let seite: Seite | undefined;
  const rest = woerter.filter((w) => {
    const s = SEITENWORT[w.toLowerCase().replace(/\.$/, "")];
    if (s && woerter.length > 1) {
      seite = s;
      return false;
    }
    return true;
  });
  return { frage: rest.join(" "), seite };
}

function regionName(id: string): string {
  return INDEX.katalog.regionen.find((r) => r.id === id)?.name ?? "";
}

type Wahl = (v: Vorlage, seite?: Seite) => void;

export function Vorlagensuche({ onWahl, onLeer }: { onWahl: Wahl; onLeer: () => void }) {
  const [eingabe, setEingabe] = useState("");
  const [aktiv, setAktiv] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => ref.current?.focus(), []);

  const { frage, seite } = trenneSeite(eingabe);
  const treffer = useMemo(
    () => (frage.trim() ? sucheVorlagen(INDEX.katalog.vorlagen, frage, setting.value, nutzung.value.anzahl).slice(0, 8).map((t) => t.vorlage) : []),
    [frage, setting.value, katalogStand.value],
  );

  // Die Markierung springt beim Tippen im selben Ereignis auf den ersten Treffer, nicht erst nach dem nächsten Bild:
  // Sonst setzte ein späteres Zurücksetzen eine sofort gedrückte Pfeiltaste zurück, und Enter öffnete einen anderen
  // Treffer als den markierten (CR-K06, PS-K09). Die Grenze gilt auch, wenn die Liste ohne Tippen kürzer wird.
  const markiert = Math.max(0, Math.min(aktiv, treffer.length - 1));
  useEffect(() => {
    listeRef.current?.querySelector(".aktiv")?.scrollIntoView({ block: "nearest" });
  }, [aktiv]);

  const sucht = frage.trim().length > 0;

  return (
    <div class="suche">
      <div class="suche-feld">
        <input
          ref={ref}
          type="search"
          class="suche-eingabe"
          role="combobox"
          aria-expanded={sucht}
          aria-controls="suche-liste"
          aria-label="Diagnose oder Kürzel"
          autocomplete="off"
          spellcheck={false}
          placeholder="Diagnose oder Kürzel, z. B. osg re, drf, Platzwunde"
          value={eingabe}
          onInput={(e) => {
            setEingabe((e.target as HTMLInputElement).value);
            setAktiv(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAktiv(Math.min(markiert + 1, treffer.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAktiv(Math.max(markiert - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (treffer[markiert]) onWahl(treffer[markiert], seite);
              else if (sucht) onLeer();
            }
          }}
        />
        {seite && <span class="suche-seite">Seite: {seite}</span>}
      </div>
      {sucht && (
        <div class="suche-liste" id="suche-liste" role="listbox" ref={listeRef}>
          {treffer.map((v, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === markiert}
              class={i === markiert ? "suche-treffer aktiv" : "suche-treffer"}
              onMouseEnter={() => setAktiv(i)}
              onClick={() => onWahl(v, seite)}
            >
              <span class="st-titel">{v.titel}</span>
              {v.kuerzel?.[0] && <kbd>{v.kuerzel[0]}</kbd>}
              <span class="st-meta">
                {regionName(v.region)}
                {v.setting !== setting.value && ` · ${v.setting === "zna" ? "Notaufnahme" : "Station"}`}
              </span>
              <span class={`st-status s-${v.status}`}>{STATUS_TEXT[v.status]}</span>
            </button>
          ))}
          {treffer.length === 0 && (
            <button type="button" class="suche-treffer aktiv" onClick={onLeer}>
              <span class="st-titel">Keine Vorlage für „{frage}" · Leeren Brief beginnen</span>
              <kbd>↵</kbd>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Kurzliste({ titel, ids, onWahl }: { titel: string; ids: string[]; onWahl: Wahl }) {
  const vorlagen = ids
    .map((id) => INDEX.vorlagen.get(id))
    .filter((v): v is Vorlage => !!v && v.setting === setting.value);
  if (vorlagen.length === 0) return null;
  return (
    <div class="kurzliste">
      <h3>{titel}</h3>
      {vorlagen.map((v) => (
        <button type="button" class="region-vorlage" onClick={() => onWahl(v)}>
          <span>{v.titel}</span>
          {v.kuerzel?.[0] && <kbd>{v.kuerzel[0]}</kbd>}
        </button>
      ))}
    </div>
  );
}

/** Zuletzt und häufig verwendete Vorlagen. Die Reihenfolge der Regionenliste darunter bleibt immer gleich. */
export function Schnellwahl({ onWahl }: { onWahl: Wahl }) {
  const n = nutzung.value;
  const haeufig = Object.entries(n.anzahl)
    .filter(([, zahl]) => zahl >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);
  if (n.zuletzt.length === 0) return null;
  return (
    <div class="schnellwahl">
      <Kurzliste titel="Zuletzt" ids={n.zuletzt.slice(0, 5)} onWahl={onWahl} />
      <Kurzliste titel="Häufig" ids={haeufig} onWahl={onWahl} />
    </div>
  );
}

export function Regionenliste({ onWahl }: { onWahl: Wahl }) {
  katalogStand.value;
  const gruppen = INDEX.katalog.regionen
    .map((r) => ({
      region: r,
      vorlagen: INDEX.katalog.vorlagen
        .filter((v) => v.region === r.id && v.setting === setting.value && !v.id.endsWith("-frei"))
        .sort((a, b) => a.titel.localeCompare(b.titel, "de")),
    }))
    .filter((g) => g.vorlagen.length > 0);
  if (gruppen.length === 0) {
    return <p class="start-leer">Für diesen Einsatzort gibt es noch keine Vorlagen. Ein leerer Brief geht immer.</p>;
  }
  return (
    <div class="regionen">
      {gruppen.map((g) => (
        <div class="region">
          <h3>{g.region.name}</h3>
          {g.vorlagen.map((v) => (
            <button type="button" class="region-vorlage" onClick={() => onWahl(v)}>
              <span>{v.titel}</span>
              {v.status === "entwurf" && <span class="punkt-entwurf" title="Entwurf, ungeprüft" aria-label="Entwurf, ungeprüft" />}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
