// Das „i“ an Messfeldern (E-48 (10)): zeigt Normalwerte zum Nachschlagen, setzt nichts in den Brief. Es öffnet per Klick,
// Enter, Leertaste oder Zeigen mit der Maus; Esc schließt die Box zuerst. Es ist kein Halt: Tasten auf ihm zählen nicht zum
// Tippen im Brief, ein Klick nimmt den Fokus nicht, die Ziffernreihe kennt es nicht.

import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { NORMWERTE } from "../data/normwerte.ts";
import { normTitel, normwertKarte } from "../engine/normwerte.ts";
import type { NormAnzeige, Normeintrag } from "../engine/normwerte.ts";

const KARTE = normwertKarte(NORMWERTE);
let zaehler = 0;

/** Ob die Box über dem „i“ aufgeht (untere Hälfte des Fensters) und wie viel Platz sie dort hat. */
interface Lage {
  oben: boolean;
  platz: number;
}

function lageVon(el: HTMLElement | null): Lage {
  const r = el?.getBoundingClientRect();
  if (!r) return { oben: false, platz: 400 };
  const oben = r.top > window.innerHeight / 2;
  // Unten liegt die Leiste mit den Kopierknöpfen über dem Brief; ihr Platz zählt nicht.
  return { oben, platz: Math.max(160, Math.round(oben ? r.top - 56 : window.innerHeight - r.bottom - 96)) };
}

/** Schlüssel eines Fensters oder einer Zeile auf das Feld kürzen, an dem die Werte hängen (Baustein/Segment). */
function feld(k: string): string {
  return k.split("/").slice(0, 2).join("/");
}

/** Wie `normZeile`, aber jeder Wert bleibt auf einer Zeile: „0–10/0/120–150°“ bricht sonst am Gedankenstrich um. */
function Zeile({ e }: { e: Normeintrag }) {
  if (e.stellungen?.length) {
    return (
      <>
        {e.bewegung}:{" "}
        {e.stellungen.map((s, i) => (
          <>
            {i > 0 && "; "}
            {s.stellung} <span class="nw-wert">{s.normal}</span>
          </>
        ))}
      </>
    );
  }
  return (
    <>
      {e.bewegung} <span class="nw-wert">{e.normal}</span>
    </>
  );
}

function Box({ id, anzeige, lage }: { id: string; anzeige: NormAnzeige; lage: Lage }) {
  const eintraege = anzeige.art === "einzeln" ? anzeige.eintraege : anzeige.gruppen.flatMap((g) => g.eintraege);
  const titel = normTitel(eintraege);
  const einer = anzeige.art === "einzeln" && eintraege.length === 1 ? eintraege[0] : undefined;
  return (
    <span id={id} role="tooltip" class={`nw-box${anzeige.art === "tabelle" ? " nw-tabelle" : ""}${lage.oben ? " nw-oben" : ""}`} style={{ maxHeight: `${lage.platz}px` }} tabIndex={anzeige.art === "tabelle" ? 0 : undefined}>
      {einer ? (
        <>
          <span class="nw-zeile">
            {titel}: <Zeile e={einer} />
          </span>
          <span class="nw-hinweis">{einer.hinweis}</span>
        </>
      ) : (
        <>
          <span class="nw-zeile nw-titel">{titel}:</span>
          {anzeige.art === "einzeln"
            ? eintraege.map((e) => (
                <span class="nw-zeile">
                  <Zeile e={e} />
                  <span class="nw-hinweis">{e.hinweis}</span>
                </span>
              ))
            : anzeige.gruppen.map((g) => (
                <span class="nw-gruppe">
                  <span class="nw-gelenk">{g.gelenk}</span>
                  {g.eintraege.map((e) => (
                    <span class="nw-zeile">
                      <Zeile e={e} />
                    </span>
                  ))}
                </span>
              ))}
        </>
      )}
      <span class="nw-quelle" title={NORMWERTE.quelle}>
        {NORMWERTE.freigegeben ? "Richtwerte" : "Entwurf"}
      </span>
    </span>
  );
}

export function NormwertInfo({ k, label }: { k: string; label: string }) {
  const anzeige = KARTE.get(feld(k));
  const [offen, setOffen] = useState(false);
  const [zeigt, setZeigt] = useState(false);
  const [id] = useState(() => `normwert-${++zaehler}`);
  const [lage, setLage] = useState<Lage>({ oben: false, platz: 400 });
  const huelle = useRef<HTMLSpanElement>(null);
  const sichtbar = offen || zeigt;
  const vermesse = () => setLage(lageVon(huelle.current));
  // Im Layout-Effekt, damit der Hörer mit dem Schließen sofort geht: Ein zweites Esc gleich danach gilt wieder dem Fenster.
  useLayoutEffect(() => {
    if (!sichtbar) return;
    // Fensterebene, Einfangphase: vor Fenster und Befundliste, die Esc sonst für sich nähmen.
    const taste = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOffen(false);
      setZeigt(false);
    };
    window.addEventListener("keydown", taste, true);
    return () => window.removeEventListener("keydown", taste, true);
  }, [sichtbar]);
  if (!anzeige) return null;
  return (
    <span
      class="nw"
      ref={huelle}
      onMouseEnter={() => {
        vermesse();
        setZeigt(true);
      }}
      onMouseLeave={() => setZeigt(false)}
    >
      <button
        type="button"
        class="nw-knopf"
        data-normwert
        aria-label={`Normalwerte zu ${label}`}
        aria-expanded={sichtbar}
        aria-controls={sichtbar ? id : undefined}
        title="Normalwerte (nur zur Ansicht)"
        // Ein Klick nimmt den Fokus nicht: Er bleibt in der Eingabe oder Zeile, in der der Arzt gerade ist.
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          if (e.detail === 0) return;
          vermesse();
          setOffen(!offen);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            if (!e.repeat) {
              vermesse();
              setOffen(!offen);
            }
          } else if (e.key.length === 1) {
            // Zeichen auf dem „i“ wählen nichts in der Zeile und zählen nicht als Tippen im Brief.
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onKeyUp={(e) => e.key === " " && e.preventDefault()}
      >
        i
      </button>
      {sichtbar && <Box id={id} anzeige={anzeige} lage={lage} />}
    </span>
  );
}
