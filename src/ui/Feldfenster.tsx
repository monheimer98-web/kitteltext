// Das kleine Fenster, das sich an einer angeklickten Textstelle öffnet. Jede
// Änderung wirkt sofort auf den Brief dahinter.

import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import type { BefundSlot, Fall, Platzhalter, Seite, Wahlstelle } from "../model/types.ts";
import { schluessel } from "../model/types.ts";
import { fundstelle } from "../engine/zugriff.ts";
import { schnellwerteVon } from "../engine/vorlage.ts";
import type { SegmentMitId } from "../engine/zugriff.ts";
import {
  enthaeltNoch,
  mitAngabe,
  mitAuswahl,
  mitEigenemText,
  mitOption,
  mitPerson,
  mitSlot,
  mitSpaeter,
  mitWahl,
  mitWert,
} from "../engine/fall.ts";
import { INDEX, aendere, aktiverFall, brief, schnellwertMerken, schnellwertVergessen, schnellwerteFuer } from "../store.ts";
import { gueltigerSchnellwert } from "../speicher.ts";
import { melde } from "./kopieren.ts";
import { PERSON_WORT } from "../engine/aenderung.ts";
import { meldeErsetzt, offenesFeld, personDesBriefs, schliesseFeld, seiteDesBausteins, seiteDesBriefs, stellenZustand, tokenElement, uebernimm, weiter, zugErlaubt, zugNachEingabe, zugStand } from "./aktionen.ts";
import { SPERRE } from "../data/tastatur.ts";
import { naechsteAngabe } from "../engine/ziffernreihe.ts";
import { nachDemZeichnen } from "./fokus.ts";
import { NormwertInfo } from "./Normwert.tsx";
import { MedikationEditor } from "./Medikation.tsx";
import { FalldatumEditor, FristZeilen } from "./Falldaten.tsx";
import { mitVorschlag } from "../engine/text.ts";

export const SEITEN: Seite[] = ["rechts", "links", "beidseits"];
export const SEITE_NAME: Record<Seite, string> = { rechts: "rechts", links: "links", beidseits: "beidseits", ohne: "ohne Seite" };

/** Text einer Textstelle, wie ihn die Engine erzeugt hat (nicht die geschmückte Anzeige). */
function tokenVon(k: string) {
  for (const a of brief.value?.abschnitte ?? []) {
    const t = a.tokens.find((x) => x.key === k);
    if (t) return t;
  }
  return undefined;
}

/** Optionstexte tragen Leerzeichen, Klammern und Kommas für den Satzbau; im Knopf stören sie. */
export function anzeige(option: string): string {
  return option.trim().replace(/^[(,]\s*/, "").replace(/[),.]$/, "") || "ohne Angabe";
}

export function Pillen<T extends string | number>(p: {
  optionen: { wert: T; label: string }[];
  wert: T | undefined;
  /**
   * `perTaste`: mit der Tastatur gewählt, nicht mit der Maus. `vomRahmen`: Ziffer, während die Gruppe selbst den Fokus
   * hatte, also am Halt des Durchlaufs, nicht auf einem markierten Knopf.
   */
  onWahl: (w: T, perTaste: boolean, vomRahmen: boolean) => void;
  label: string;
  /** Diese Gruppe nimmt die Ziffern des Fensters, auch wenn der Fokus auf dem Fenster selbst liegt. */
  ziffern?: boolean;
}) {
  // Pfeiltasten markieren nur; gewählt wird mit Enter oder Leertaste auf dem markierten Knopf oder mit seiner Ziffer.
  // Die Gruppe selbst kann den Fokus haben (Halt im Durchlauf): Dann ist nichts markiert, und Enter wählt nichts (E-43).
  const beiTaste = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const gruppe = e.currentTarget as HTMLElement;
    const n = Number(e.key);
    if (n >= 1 && n <= 9 && n <= p.optionen.length) {
      e.preventDefault();
      e.stopPropagation();
      // Erst nach der Schreckzeit und ohne Sperre (E-44); eine gehaltene Ziffer wählt nur einmal (CR-K13).
      if (zugErlaubt(e, "123456789")) p.onWahl(p.optionen[n - 1].wert, true, e.target === gruppe);
      return;
    }
    // Auf der Gruppe selbst ist nichts markiert: Enter wählt nichts und sagt, was geht (E-43, QA-22).
    if (e.target === gruppe && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      melde({ text: enterWaehltNur(p.optionen.length), art: "ok" });
      return;
    }
    // Text in einer Gruppe außerhalb eines Fensters (Fallkopf) sperrt wie an jedem Halt, auch mit dem Fokus auf einem
    // Knopf wie bei der Seite (QA-34); im Fenster sperrt das Fenster. Eine Ziffer ohne Knopf wählt nichts (CR-TS15).
    if (e.key.length === 1 && e.key !== " " && !gruppe.closest(".feldfenster")) {
      e.preventDefault();
      zugErlaubt(e, "123456789", false, "", "");
      return;
    }
    // Nur links und rechts: Auf und Ab gehört den Zeilen der Befundliste.
    const schritt = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!schritt) return;
    const knoepfe = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(":scope > button")];
    const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    e.stopPropagation();
    if (i < 0) (knoepfe.find((k) => k.getAttribute("aria-checked") === "true") ?? knoepfe[schritt > 0 ? 0 : knoepfe.length - 1])?.focus();
    else knoepfe[(i + schritt + knoepfe.length) % knoepfe.length].focus();
  };
  return (
    <div class="pillen" role="radiogroup" tabIndex={-1} aria-label={p.label} data-offen={p.wert === undefined || undefined} data-ziffern={p.ziffern || undefined} onKeyDown={beiTaste}>
      {p.optionen.map((o, i) => (
        <button
          type="button"
          role="radio"
          aria-checked={p.wert === o.wert}
          class={p.wert === o.wert ? "pille aktiv" : "pille"}
          onClick={(e) => p.onWahl(o.wert, e.detail === 0, false)}
        >
          {i < 9 && (
            <span class="pille-ziffer" aria-hidden="true">
              {i + 1}
            </span>
          )}
          <PillenText text={o.label} />
        </button>
      ))}
    </div>
  );
}

/**
 * Aufschrift eines Knopfs, der fett wird, wenn er gewählt ist. Der Platz für die fette Schrift ist immer reserviert:
 * Sonst rückten die Knöpfe daneben nach einer Wahl zur Seite, und der nächste Klick träfe ein anderes Ziel (QA-25).
 */
export function PillenText({ text }: { text: string }) {
  return (
    <span class="pille-text" data-text={text}>
      {text}
    </span>
  );
}

/** Enter auf einer Gruppe ohne Markierung (MT-12); mit der Zahl der Möglichkeiten, wenn es eine Reihe ist. */
export function enterWaehltNur(anzahl?: number): string {
  return `Enter wählt nur, was markiert ist: ${anzahl ? `Ziffer 1 bis ${Math.min(9, anzahl)}` : "Ziffer"}, oder mit Pfeiltaste markieren und dann Enter.`;
}

export function Zeile(p: { label: string; children: ComponentChildren; offen?: boolean; slot?: number }) {
  return (
    <div class={p.offen ? "ff-zeile ff-offen" : "ff-zeile"} data-slot={p.slot}>
      <div class="ff-label">{p.label}</div>
      {p.children}
    </div>
  );
}

export function FreitextHinweis() {
  return <p class="ff-hinweis">Nur klinische Angaben. Keine Namen, keine Geburtsdaten.</p>;
}

const fertig = weiter;

export function Eingabe(p: {
  wert: string;
  onInput: (v: string) => void;
  mehrzeilig?: boolean;
  platzhalter?: string;
  label: string;
  zahl?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  /** Schreibmarke ans Ende statt den Inhalt zu markieren (Text zum Weiterschreiben) */
  ansEnde?: boolean;
  /** Was Enter (im mehrzeiligen Feld Strg+Enter) tut; Standard: weiter zur nächsten Lücke */
  onEnter?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  // Sofort nach dem Einhängen, nicht erst nach dem nächsten Bild: Wer gleich lostippt, verliert sonst Zeichen.
  useLayoutEffect(() => {
    if (p.autoFocus) {
      const el = ref.current;
      el?.focus();
      if (p.ansEnde) el?.setSelectionRange(el.value.length, el.value.length);
      else el?.select();
    }
  }, []);
  const taste = (e: KeyboardEvent) => {
    const tab = e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey;
    // Umschalt+Tab tut im Feld nichts: zurück geht es mit Umschalt+F2 (E-45).
    if (tab && e.shiftKey) {
      e.preventDefault();
      return;
    }
    if ((e.key === "Enter" && !e.altKey) || tab) {
      // Im mehrzeiligen Feld ist Enter eine neue Zeile wie in KIS und Textverarbeitung; weiter geht es mit Strg+Enter
      // oder Tab (E-43, Grundsatz 4). Sonst landete der Rest des Satzes in den nächsten Stellen (PS-K02). Eine Zeile in
      // einem noch leeren Feld wäre nur Leerraum (QA-28). Tab geht weiter wie Strg+Enter und legt den Fokus nie auf
      // einen Schnellwert: Ein Enter danach ersetzte sonst den getippten Text (PS-N05).
      if (!tab && p.mehrzeilig && !e.ctrlKey && !e.metaKey) {
        if (!(e.target as HTMLTextAreaElement).value) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (e.repeat) return;
      // Wer nach Enter weitertippt, meint noch das Feld: Was danach an einer Knopfreihe, einer Befundzeile oder einem
      // Fenster ankommt, wirkt erst nach der Schreckzeit, auch wenn der Fokus nur innerhalb von Fenster oder Liste
      // weiterrückt (E-44, CR-TS01).
      zugNachEingabe();
      (p.onEnter ?? fertig)();
    } else if (e.key === "ArrowDown" && !p.wert) {
      // Aus dem leeren Feld führt Pfeil-ab zu den Schnellwerten darunter.
      const erster = (e.target as HTMLElement).closest(".feldfenster")?.querySelector<HTMLElement>(".ff-vorschlaege button");
      if (erster) {
        e.preventDefault();
        erster.focus();
      }
    }
  };
  if (p.mehrzeilig) {
    const zeilen = Math.min(8, Math.max(2, p.wert.split("\n").length + Math.floor(p.wert.length / 60)));
    return (
      <textarea
        spellcheck={false}
        ref={ref}
        class="ff-eingabe"
        rows={zeilen}
        value={p.wert}
        aria-label={p.label}
        placeholder={p.platzhalter}
        onInput={(e) => p.onInput((e.target as HTMLTextAreaElement).value)}
        onKeyDown={taste}
      />
    );
  }
  return (
    <input
        spellcheck={false}
        autocomplete="off"
      ref={ref}
      class="ff-eingabe"
      type="text"
      inputMode={p.zahl ? "decimal" : "text"}
      value={p.wert}
      maxLength={p.maxLength}
      aria-label={p.label}
      placeholder={p.platzhalter}
      onInput={(e) => p.onInput((e.target as HTMLInputElement).value)}
      onKeyDown={taste}
    />
  );
}

/**
 * Schnellwerte eines Feldes: die neutralen Formulierungen des Katalogs und die eigenen des Arztes.
 * Eigene entstehen mit „als Schnellwert merken“ und gelten für alle Felder mit derselben Bezeichnung.
 * So liefert die App keine Präparate und Dosierungen mit; die Hausliste schreibt der Arzt selbst.
 */
export function Schnellwerte({ label, katalog, wert, onWahl, eigene: mitEigenen }: { label: string; katalog: string[]; wert: string; onWahl: (v: string) => void; eigene: boolean }) {
  const eigene = mitEigenen ? schnellwerteFuer(label).filter((v) => !katalog.includes(v)) : [];
  const t = wert.trim();
  const merkbar = mitEigenen && gueltigerSchnellwert(t) && !katalog.includes(t) && !eigene.includes(t);
  if (katalog.length === 0 && eigene.length === 0 && !merkbar) return null;
  return (
    <div
      class="ff-vorschlaege"
      onKeyDown={(e) => {
        const knoepfe = [...e.currentTarget.querySelectorAll<HTMLElement>("button.pille")];
        const i = knoepfe.indexOf(e.target as HTMLElement);
        const ziel = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : -2;
        if (ziel === -2 || i < 0) return;
        e.preventDefault();
        if (ziel < 0) e.currentTarget.closest(".feldfenster, .bz-detail")?.querySelector<HTMLElement>(".ff-eingabe")?.focus();
        else knoepfe[Math.min(ziel, knoepfe.length - 1)]?.focus();
      }}
    >
      {katalog.map((v) => (
        <button type="button" class="pille" onClick={() => onWahl(v)}>
          {v}
        </button>
      ))}
      {eigene.map((v) => (
        <span class="ff-eigen">
          <button type="button" class="pille" title="Eigener Schnellwert dieses Arbeitsplatzes" onClick={() => onWahl(v)}>
            {v}
          </button>
          <button type="button" class="ff-vergessen" aria-label={`Eigenen Schnellwert „${v}“ vergessen`} title="Diesen eigenen Schnellwert vergessen" onClick={() => schnellwertVergessen(label, v)}>
            ×
          </button>
        </span>
      ))}
      {merkbar && (
        <button
          type="button"
          class="link"
          title="Bleibt dauerhaft auf diesem Rechner und erscheint künftig als Knopf. Nur allgemeine Formulierungen, nichts zu einem Patienten."
          onClick={() =>
            melde(
              schnellwertMerken(label, t)
                ? { text: `Gemerkt für „${label}“. Erscheint künftig als Knopf an jedem Feld mit dieser Bezeichnung.`, art: "ok" }
                : { text: "Der Browser hat das Speichern verweigert.", art: "fehler" },
            )
          }
        >
          als Schnellwert merken
        </button>
      )}
    </div>
  );
}

function FeldEditor({ k, def }: { k: string; def: Platzhalter }) {
  const fall = aktiverFall.value!;
  // Datum des Fallkopfs (E-58): Hier eingetragen, gilt es für den ganzen Brief; ohne Datum bleibt der Platzhalter fürs KIS.
  // Welches Datum (OP oder 2. OP) die Stelle nimmt, steht am Token (PS-R5-1); ein dritter OP-Baustein hat keines.
  const art = tokenVon(k)?.falldatum;
  if (art) return <FalldatumEditor k={k} art={art} fertig={() => (zugNachEingabe(), fertig())} />;
  const wert = fall.werte[k] ?? "";
  const vorschlag = fall.werte[k] === undefined && !!def.default?.trim() && !fall.spaeter[k];
  const setze = (v: string) => aendere((f) => mitWert(f, k, v), `wert:${k}`);
  const frei = def.typ === "freitext" || def.typ === "begriff";
  const katalog = schnellwerteVon(fall.vorlageId ? INDEX.vorlagen.get(fall.vorlageId) : undefined, k, def.vorschlaege ?? []);
  const hilfe: Partial<Record<Platzhalter["typ"], string>> = {
    rom: "z. B. 0/0/130",
    datum: "TT.MM.JJJJ",
    zeitraum: "z. B. 2 oder 4–6",
  };
  return (
    <>
      <Zeile label={def.einheit ? `${def.label} (${def.einheit})` : def.label}>
        <Eingabe
          wert={wert}
          onInput={setze}
          label={def.label}
          mehrzeilig={def.typ === "freitext"}
          zahl={def.typ === "zahl"}
          platzhalter={hilfe[def.typ]}
          autoFocus
        />
      </Zeile>
      {vorschlag && (
        <div class="ff-vorschlag">
          <span>
            Standardtext: {def.default}
            {def.einheit ? ` ${def.einheit}` : ""}
          </span>
          <button type="button" class="knopf primaer klein" onClick={() => (uebernimm([k]), fertig())}>
            Übernehmen ✓
          </button>
        </div>
      )}
      <Schnellwerte
        label={def.label}
        katalog={katalog}
        wert={wert}
        eigene={frei || def.typ === "zeitraum"}
        onWahl={(v) => {
          aendere((f) => mitWert(f, k, v));
          meldeErsetzt(def.label, wert, v, (f) => enthaeltNoch(f, "wert", k, v), (f) => mitWert(f, k, wert));
          fertig();
        }}
      />
      {def.typ === "datum" && (
        <div class="ff-vorschlaege">
          <button
            type="button"
            class="pille"
            onClick={() => {
              const heute = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
              setze(heute);
              meldeErsetzt(def.label, wert, heute, (f) => enthaeltNoch(f, "wert", k, heute), (f) => mitWert(f, k, wert));
              fertig();
            }}
          >
            heute
          </button>
        </div>
      )}
      {frei && <FreitextHinweis />}
      <div class="ff-fuss">
        {def.required ? (
          <button
            type="button"
            class="link"
            title={`Im Text steht dann [${def.label.toUpperCase()}] und fällt im KIS auf`}
            onClick={() => {
              aendere((f) => mitSpaeter(f, k, true));
              fertig();
            }}
          >
            erst im KIS ausfüllen
          </button>
        ) : (
          wert && (
            <button type="button" class="link" onClick={() => (setze(""), schliesseFeld())}>
              leeren
            </button>
          )
        )}
      </div>
    </>
  );
}

export function Slots({
  bausteinId,
  segId,
  slots,
  nachWahl,
  satz,
  auffaellig,
}: {
  bausteinId: string;
  segId: string;
  slots: BefundSlot[];
  /** Nach einer Angabe; `angabe`: ihre Nummer in Lesereihenfolge. */
  nachWahl?: (perTaste: boolean, angabe: number) => void;
  /** Schlüssel des Satzes, wenn die Angaben zu einem zuwählbaren Satz gehören. */
  satz?: string;
  /** Angaben zu einem auffälligen Befund: Nichts ist vorgewählt, was der Arzt nicht selbst gewählt hat. */
  auffaellig?: boolean;
}) {
  const fall = aktiverFall.value!;
  const vorlage = fall.vorlageId ? INDEX.vorlagen.get(fall.vorlageId) : undefined;
  const vorgaben = vorlage?.vorgaben?.slots ?? {};
  const setze = (f: Fall, k: string, wert: string | undefined) => (satz ? mitAngabe(f, satz, k, wert) : mitSlot(f, k, wert));
  return (
    <>
      {slots.map((slot, nr) => {
        const k = schluessel(bausteinId, segId, slot.id);
        const roh = fall.slots[k];
        if (slot.art === "auswahl") {
          // Ohne eigene Wahl zeigt der Knopf, was im Satz steht: den Vorschlag der Vorlage oder des Hausstandards.
          const start = vorgaben[k] ?? slot.default ?? 0;
          const startLeer = (slot.optionen[start] ?? "").trim() === "";
          const idx = roh != null && roh !== "" ? Number(roh) : (slot.required && startLeer) || (auffaellig && !startLeer) ? undefined : start;
          return (
            <Zeile label={slot.label} offen={idx === undefined} slot={nr}>
              <Pillen
                label={slot.label}
                wert={idx}
                optionen={slot.optionen
                  .map((o, i) => ({ wert: i, label: anzeige(o) }))
                  .filter((o) => !(slot.required && slot.optionen[o.wert] === ""))}
                onWahl={(i, perTaste) => {
                  aendere((f) => setze(f, k, String(i)));
                  nachWahl?.(perTaste, nr);
                }}
              />
            </Zeile>
          );
        }
        if (slot.art === "lokaleSeite") {
          return (
            <Zeile label={slot.label} offen={slot.required && !roh} slot={nr}>
              <Pillen
                label={slot.label}
                wert={roh as Seite | undefined}
                optionen={SEITEN.map((s) => ({ wert: s, label: s }))}
                onWahl={(s, perTaste) => {
                  aendere((f) => setze(f, k, roh === s && !slot.required ? undefined : s));
                  nachWahl?.(perTaste, nr);
                }}
              />
            </Zeile>
          );
        }
        return (
          <Zeile label={slot.art === "zahl" && slot.einheit ? `${slot.label} (${slot.einheit})` : slot.label} offen={slot.required === true && !(roh ?? "").trim()} slot={nr}>
            <Eingabe
              wert={roh ?? ""}
              label={slot.label}
              zahl={slot.art === "zahl"}
              maxLength={slot.art === "detail" ? slot.maxLen : undefined}
              onEnter={() => nachWahl?.(true, nr)}
              onInput={(v) => aendere((f) => setze(f, k, v), `slot:${k}`)}
            />
            {slot.art === "detail" && (
              <Schnellwerte
                label={slot.label}
                katalog={schnellwerteVon(vorlage, k, slot.vorschlaege ?? [])}
                wert={roh ?? ""}
                eigene
                onWahl={(v) => {
                  const alt = roh ?? "";
                  aendere((f) => setze(f, k, v));
                  meldeErsetzt(slot.label, alt, v, (f) => enthaeltNoch(f, "angabe", k, v), (f) => setze(f, k, alt));
                  nachWahl?.(true, nr);
                }}
              />
            )}
          </Zeile>
        );
      })}
    </>
  );
}

/** Eigener Wortlaut für einen Satz. Startet mit dem aktuellen Text, damit man ihn nur anpassen muss. */
export function EigenerWortlaut({ k, aktuell }: { k: string; aktuell: string }) {
  const fall = aktiverFall.value!;
  const eigen = fall.eigen[k];
  const [offen, setOffen] = useState(eigen !== undefined);
  // Der Ausgangstext wird beim Öffnen festgehalten, damit er sich beim Tippen nicht unter der Hand ändert.
  // Fehlt im Satz noch eine Angabe, beginnt der eigene Wortlaut leer statt mit Lückenzeichen.
  const [start, setStart] = useState("");
  if (!offen) {
    return (
      <button type="button" class="link" onClick={() => (setStart(aktuell.includes("‹") ? "" : aktuell), setOffen(true))}>
        Eigenen Wortlaut schreiben
      </button>
    );
  }
  return (
    <Zeile label="Eigener Wortlaut">
      <Eingabe
        wert={eigen ?? start}
        label="Eigener Wortlaut"
        mehrzeilig
        autoFocus={eigen === undefined}
        ansEnde
        onInput={(v) => aendere((f) => mitEigenemText(f, k, v), `eigen:${k}`)}
      />
      <p class="ff-hinweis">Seite und Person folgen in eigenem Wortlaut nicht mehr dem Fallkopf. Keine Namen, keine Geburtsdaten.</p>
      {eigen !== undefined && (
        <button type="button" class="link" onClick={() => (aendere((f) => mitEigenemText(f, k, undefined)), setOffen(false))}>
          zurück zum Baustein-Text
        </button>
      )}
    </Zeile>
  );
}

function AuswahlEditor({ k, seg }: { k: string; seg: Extract<SegmentMitId, { art: "auswahl" }> }) {
  const fall = aktiverFall.value!;
  const eigen = fall.eigen[k];
  const token = tokenVon(k);
  const gewaehlt = fall.auswahl[k];
  const vorlage = fall.vorlageId ? INDEX.vorlagen.get(fall.vorlageId) : undefined;
  const vorgeschlagen = token?.zustand === "vorschlag" ? (vorlage?.vorgaben?.auswahl?.[k] ?? seg.default ?? 0) : -1;
  const idx = eigen !== undefined ? -1 : (gewaehlt ?? (seg.variante ? (seg.default ?? 0) : -1));
  const waehle = (i: number) => {
    aendere((f) => mitAuswahl(f, k, i));
    weiter();
  };
  // Ziffern wertet das Fenster selbst aus (Feldfenster, `fensterTaste`), nicht ein Hörer am Dokument (CR-K01).
  return (
    <>
      <div class="ff-liste" role="listbox" aria-label={seg.label}>
        {seg.optionen.map((o, i) => (
          <button type="button" role="option" aria-selected={i === idx} class={i === idx ? "ff-option aktiv" : "ff-option"} onClick={() => waehle(i)}>
            <span class="ff-ziffer">{i < 9 ? i + 1 : ""}</span>
            <span>{o.trim() || "— weglassen —"}</span>
            {i === vorgeschlagen && <span class="bw-da">Vorschlag</span>}
          </button>
        ))}
      </div>
      <Zeile label="Eigener Text">
        <Eingabe
          wert={eigen ?? ""}
          label="Eigener Text"
          mehrzeilig
          platzhalter="Statt der Auswahl frei formulieren …"
          onInput={(v) => aendere((f) => (v ? mitEigenemText(f, k, v) : mitAuswahl(f, k, gewaehlt)), `eigen:${k}`)}
        />
      </Zeile>
    </>
  );
}

function OptionEditor({ k, seg }: { k: string; seg: Extract<SegmentMitId, { art: "option" }> }) {
  const fall = aktiverFall.value!;
  const [bausteinId] = k.split("/");
  const token = tokenVon(k);
  return (
    <>
      {token?.zustand === "vorschlag" && (
        <div class="ff-vorschlag">
          <span>
            {token.uebertragen ? `Angabe aus ${token.uebertragen.map((q) => `„${q}“`).join(", ")}.` : "Vorschlag der Vorlage."} Grau wird nicht kopiert.
          </span>
          <button type="button" class="knopf primaer klein" data-taste="ü" aria-keyshortcuts="Ü" onClick={() => (uebernimm([k]), weiter())}>
            <kbd class="taste">Ü</kbd> Übernehmen ✓
          </button>
        </div>
      )}
      {seg.slots && fall.eigen[k] === undefined && (
        <Slots
          bausteinId={bausteinId}
          segId={seg.id}
          slots={seg.slots}
          satz={k}
          nachWahl={(perTaste, nr) => {
            // War das die letzte offene Angabe des Satzes, geht es im selben Ereignis zur nächsten Stelle (PS-K04):
            // Der Stand kommt aus dem Brief, nicht aus der Seite, die erst noch gezeichnet wird. Gesetzt ist ein grauer
            // Satz, sobald der Arzt jede Knopfreihe selbst beantwortet hat (`mitAngabe`); ein Ü ist dann nicht nötig
            // (PS-N01, PS-N02). Sonst nimmt nach einer Ziffer die nächste Angabe in Lesereihenfolge die Ziffern, auch
            // eine vorbelegte; nach einem Klick die erste offene. Der Fokus geht dafür aufs Fenster, damit genau eine
            // Reihe Nummern trägt (QA-24).
            const slots = seg.slots ?? [];
            const antworten = merkeAntwort(k, nr);
            if (stellenZustand(k) === "gesetzt") return weiter();
            nachDemZeichnen(() => {
              const el = document.querySelector<HTMLElement>(".feldfenster");
              if (!el || offenesFeld.peek()?.key !== k) return;
              const angaben = slots.map((s, j) => ({ knoepfe: istKnopfreihe(s), offen: !!el.querySelector(`[data-slot="${j}"].ff-offen`) }));
              const j = naechsteAngabe(angaben, antworten, nr, perTaste);
              if (j === null) return fokusImFenster(el);
              if (angaben[j].knoepfe) {
                el.dataset.zifferAngabe = String(j);
                el.focus({ preventScroll: true });
                markiereZiffern(el);
              } else el.querySelector<HTMLElement>(`[data-slot="${j}"] .ff-eingabe`)?.focus({ preventScroll: true });
            });
          }}
        />
      )}
      <EigenerWortlaut k={k} aktuell={token?.t.trim() ?? ""} />
      <div class="ff-fuss">
        <button
          type="button"
          class="link gefahr"
          onClick={() => {
            aendere((f) => mitEigenemText(mitOption(f, k, false), k, undefined));
            schliesseFeld(false);
          }}
        >
          Satz entfernen
        </button>
      </div>
    </>
  );
}

/**
 * Seite an einer Seitenangabe im Text. Wer hier klickt, meint meist nur diesen Baustein (G-03); deshalb gehen die
 * Ziffern dorthin, sobald der Fall eine Seite hat. Die Seite des ganzen Briefs zu ändern braucht wie im Fallkopf eine
 * Bestätigung und meldet alte und neue Seite mit „Rückgängig“ (PS-K08, E-43 Grundsatz 6).
 */
function SeiteEditor({ bausteinId }: { bausteinId: string }) {
  const fall = aktiverFall.value!;
  const b = INDEX.bausteine.get(bausteinId);
  const abweichend = fall.seiteBaustein[bausteinId];
  const alle: Seite[] = [...SEITEN, "ohne"];
  const [wunsch, setWunsch] = useState<Seite | null>(null);
  const ganzerBrief = (s: Seite) => {
    if (fall.seite === s) return schliesseFeld();
    if (fall.seite && wunsch !== s) return setWunsch(s);
    seiteDesBriefs(s);
    schliesseFeld();
  };
  return (
    <>
      <Zeile label={`Nur „${b?.titel ?? "dieser Baustein"}“ (andere Seite als der übrige Brief)`}>
        <Pillen label="Seite nur dieses Bausteins" ziffern={!!fall.seite} wert={abweichend} optionen={alle.map((s) => ({ wert: s, label: SEITE_NAME[s] }))} onWahl={(s) => (seiteDesBausteins(bausteinId, s), schliesseFeld())} />
      </Zeile>
      <Zeile label="Ganzer Brief">
        <Pillen label="Seite des ganzen Briefs" ziffern={!fall.seite} wert={fall.seite ?? undefined} optionen={alle.map((s) => ({ wert: s, label: SEITE_NAME[s] }))} onWahl={ganzerBrief} />
        {wunsch && (
          <p class="ff-hinweis" role="status">
            Den ganzen Brief auf „{SEITE_NAME[wunsch]}“ ändern? Zum Bestätigen „{SEITE_NAME[wunsch]}“ noch einmal wählen.
          </p>
        )}
      </Zeile>
      {abweichend && (
        <button type="button" class="link" onClick={() => (seiteDesBausteins(bausteinId, null), schliesseFeld())}>
          wieder wie der übrige Brief
        </button>
      )}
    </>
  );
}

/** Person; im Fallkopf (`imKopf`) geht der Durchlauf nach der Ziffer am Halt weiter wie nach jeder anderen Angabe. */
export function PersonWahl({ imKopf = false }: { imKopf?: boolean }) {
  const fall = aktiverFall.value!;
  return (
    <Pillen
      label="Patient oder Patientin"
      wert={fall.geschlecht ?? undefined}
      optionen={(["m", "w", "k", "n"] as const).map((wert) => ({ wert, label: PERSON_WORT[wert] }))}
      onWahl={(g, _perTaste, vomRahmen) => {
        personDesBriefs(g);
        if (imKopf && vomRahmen) weiter();
      }}
    />
  );
}

function PersonEditor() {
  const fall = aktiverFall.value!;
  return (
    <>
      <PersonWahl />
      <Zeile label="Alter">
        <Eingabe
          wert={fall.alter}
          label="Alter"
          platzhalter="Jahre, oder z. B. 8 Monate"
          onInput={(v) => aendere((f) => mitPerson(f, f.geschlecht, v), "alter")}
        />
      </Zeile>
    </>
  );
}

/** Entweder-oder-Stelle der Vorlage: Der Arzt nimmt einen der Bausteine auf oder lässt die Stelle bewusst leer. */
function WahlEditor({ k, stelle }: { k: string; stelle: Wahlstelle }) {
  const nimm = (bausteinId: string | null) => {
    aendere((f) => mitWahl(f, k, bausteinId, INDEX));
    weiter();
  };
  // Ziffern wertet das Fenster selbst aus, nur wenn der Fokus in ihm liegt (CR-K01).
  return (
    <>
      <div class="ff-liste" role="listbox" aria-label={stelle.label}>
        {stelle.bausteine.map((id, i) => (
          <button type="button" role="option" aria-selected={false} class="ff-option" onClick={() => nimm(id)}>
            <span class="ff-ziffer">{i + 1}</span>
            <span>{INDEX.bausteine.get(id)?.titel ?? id}</span>
          </button>
        ))}
      </div>
      {/* Pflichtstelle: kein „nichts davon“; einzelne Sätze des gewählten Bausteins bleiben entfernbar (PS-T1-01). */}
      {!stelle.pflicht && (
        <div class="ff-fuss">
          <button type="button" class="knopf leise klein" onClick={() => nimm(null)} title="Die Stelle bleibt leer; der Abschnitt nennt dazu nichts">
            nichts davon, Stelle leer lassen
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Die Gruppe, die die Ziffern des Fensters nimmt, solange das Fenster selbst den Fokus hat: ausdrücklich bestimmt, sonst
 * die Liste, sonst die Angabe, zu der die Ziffernreihe nach der letzten Antwort gerückt ist (PS-N01), sonst die erste
 * offene Knopfreihe, sonst die erste.
 */
function zifferGruppe(el: HTMLElement): HTMLElement | null {
  const nr = el.dataset.zifferAngabe;
  return (
    el.querySelector<HTMLElement>("[data-ziffern]") ??
    el.querySelector<HTMLElement>(".ff-liste") ??
    (nr ? el.querySelector<HTMLElement>(`[data-slot="${nr}"] .pillen`) : null) ??
    el.querySelector<HTMLElement>(".ff-offen .pillen") ??
    el.querySelector<HTMLElement>(".pillen")
  );
}

/**
 * Die eine Gruppe, in der eine Ziffer gerade wählt (QA-24): die markierte Knopfreihe, wenn der Fokus auf einem ihrer
 * Knöpfe liegt; im Textfeld keine, dort wird die Ziffer geschrieben; sonst die Gruppe des Fensters.
 */
function ziffernZiel(el: HTMLElement): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null;
  if (!a || !el.contains(a)) return null;
  if (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable) return null;
  return a.closest<HTMLElement>(".pillen") ?? zifferGruppe(el);
}

/**
 * Wo der Fokus im offenen Fenster steht, für den Tastenhinweis im Fuß (TS-01, PS-N05): Name der Gruppe mit Nummern,
 * Art des Textfelds samt Schnellwerten, oder der Knopf mit dem Fokus und was Enter dort tut.
 */
interface FokusStand {
  gruppe: string;
  feld: "" | "zeile" | "mehrzeilig" | "tabelle";
  /** Das Feld ist leer und hat Schnellwerte darunter: ↓ führt dorthin. */
  schnell: boolean;
  knopf: "" | "schnellwert" | "wahl" | "knopf";
  aufschrift: string;
}
const fokusStand = signal<FokusStand>({ gruppe: "", feld: "", schnell: false, knopf: "", aufschrift: "" });

/** Aufschrift eines Knopfs ohne Nummer, Tastenzeichen und Zusatz („Vorschlag“). */
function aufschrift(knopf: HTMLElement): string {
  return [...knopf.childNodes]
    .filter((n) => !(n instanceof HTMLElement && n.matches(".pille-ziffer, .ff-ziffer, kbd, .bw-da")))
    .map((n) => n.textContent ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nur die Gruppe, die die Ziffer nimmt, zeigt Nummern; der Platz dafür ist überall reserviert (QA-19, QA-24). */
function markiereZiffern(el: HTMLElement | null) {
  if (!el) return;
  const ziel = ziffernZiel(el);
  for (const g of el.querySelectorAll(".ziffern-ziel")) if (g !== ziel) g.classList.remove("ziffern-ziel");
  ziel?.classList.add("ziffern-ziel");
  const a = document.activeElement as HTMLElement | null;
  const drin = !!a && el.contains(a) && a !== el;
  // In der Medikation geht Tab von Feld zu Feld wie in einer Tabelle (E-62).
  const tabelle = drin && !!a!.closest(".med-editor") && (a!.tagName === "INPUT" || a!.tagName === "SELECT");
  const feld = tabelle ? "tabelle" : drin && a!.tagName === "TEXTAREA" ? "mehrzeilig" : drin && a!.tagName === "INPUT" ? "zeile" : "";
  const zeile = feld ? a!.closest(".ff-zeile") : null;
  const vorschlaege = zeile?.querySelector(".ff-vorschlaege .pille") ?? (el.querySelectorAll(".ff-eingabe").length === 1 ? el.querySelector(".ff-vorschlaege .pille") : null);
  const schnell = !!feld && !!vorschlaege && !(a as HTMLInputElement).value;
  const istKnopf = drin && a!.tagName === "BUTTON";
  const knopf: FokusStand["knopf"] = !istKnopf ? "" : a!.closest(".ff-vorschlaege") ? "schnellwert" : a!.matches("[role=radio], [role=option]") ? "wahl" : "knopf";
  const neu: FokusStand = { gruppe: ziel ? (ziel.getAttribute("aria-label") ?? "") : "", feld, schnell, knopf, aufschrift: istKnopf ? aufschrift(a!) : "" };
  const alt = fokusStand.peek();
  if (alt.gruppe !== neu.gruppe || alt.feld !== neu.feld || alt.schnell !== neu.schnell || alt.knopf !== neu.knopf || alt.aufschrift !== neu.aufschrift) fokusStand.value = neu;
}

/** Was Enter am Element mit dem Fokus tut; leer, wenn der Hinweis des Fensters gilt (PS-N05, A-4 der Vorgaben). */
function fokusHinweis(f: FokusStand): string {
  const schnell = f.schnell ? " · ↓ Schnellwerte" : "";
  if (f.feld === "tabelle") return "Tab: nächstes Feld · Enter: weiter · Esc schließt";
  if (f.feld === "zeile") return `Enter oder Tab: weiter${schnell} · Esc schließt`;
  if (f.feld === "mehrzeilig") return `Enter: neue Zeile · Strg+Enter oder Tab: weiter${schnell} · Esc schließt`;
  if (f.knopf === "schnellwert") return `Enter setzt „${f.aufschrift}“ ein · ↑ zurück ins Feld · Esc schließt`;
  if (f.knopf === "wahl") return `Enter wählt „${f.aufschrift}“ · Esc schließt`;
  if (f.knopf === "knopf" && f.aufschrift) return `Enter: ${f.aufschrift} · Esc schließt`;
  return "";
}

/** Welche Angaben der Arzt im offenen Fenster selbst beantwortet hat; gilt nur für dieses Fenster (PS-N01). */
const beantwortet = { key: "", angaben: new Set<number>() };
function merkeAntwort(k: string, nr: number): ReadonlySet<number> {
  if (beantwortet.key !== k) {
    beantwortet.key = k;
    beantwortet.angaben = new Set();
  }
  beantwortet.angaben.add(nr);
  return beantwortet.angaben;
}

function istKnopfreihe(s: BefundSlot): boolean {
  return s.art === "auswahl" || s.art === "lokaleSeite";
}

function zifferKnoepfe(el: HTMLElement): HTMLElement[] {
  const g = ziffernZiel(el);
  return g ? [...g.querySelectorAll<HTMLElement>(":scope > button")] : [];
}

/**
 * Fokus beim Öffnen und nach einer Angabe: Ist die erste offene Angabe ein Textfeld, dorthin, sonst auf das Fenster
 * selbst. Nie auf Option 1 oder „Übernehmen ✓“: Dort setzte ein Enter, was der Arzt nicht markiert hat (PS-K01).
 */
export function fokusImFenster(el: HTMLElement | null) {
  if (!el) return;
  const offen = el.querySelector<HTMLElement>(".ff-offen");
  const eingabe = offen?.querySelector<HTMLElement>(".ff-eingabe");
  (offen && eingabe && !offen.querySelector(".pillen") ? eingabe : el).focus({ preventScroll: true });
}

export function Feldfenster() {
  const feld = offenesFeld.value;
  const fall = aktiverFall.value;
  const ref = useRef<HTMLDivElement>(null);
  const ansicht = brief.value;
  // Ein Hinweis im Fenster gilt nur für das Fenster, in dem er entstand. Die Sperre gilt für den ganzen Tipp-Zug (E-44).
  const [hinweis, setHinweis] = useState<{ key: string; text: string } | null>(null);
  const gesperrt = zugStand.value === "gesperrt";

  /**
   * Freie Fläche für das Fenster: oben bis unter den stehenden Fallkopf (im schmalen Fenster nur seine Titelzeile), unten
   * bis zum Rand des Briefs. Darunter liegen die Meldungszeile und im schmalen Fenster die Kopierleiste; das Fenster
   * verdeckt keine von beiden (R2-08, H-R2-2) und nicht den Fallkopf (QA-04).
   */
  const flaeche = () => {
    const rahmen = document.querySelector<HTMLElement>(".papier-rahmen");
    const s = rahmen?.getBoundingClientRect();
    const stehend = rahmen ? [...rahmen.querySelectorAll<HTMLElement>(".fallkopf, .fk-titel")].find((e) => getComputedStyle(e).position === "sticky") : undefined;
    const oben = Math.max(s?.top ?? 0, stehend?.getBoundingClientRect().bottom ?? 0);
    const unten = Math.min(window.innerHeight, s?.bottom ?? window.innerHeight);
    return { rahmen, oben, unten };
  };

  // Liegt die Stelle außer Sicht oder unter dem stehenden Fallkopf, rückt sie in die Mitte. Passt das Fenster dann weder
  // darunter noch darüber, rückt sie so weit nach oben, dass es darunter Platz hat.
  const inSichtHolen = () => {
    const anker = feld ? tokenElement(feld.key) : null;
    const { rahmen, oben, unten } = flaeche();
    if (!anker || !rahmen) return;
    let r = anker.getBoundingClientRect();
    if (r.top < oben + 8 || r.bottom > unten - 8) {
      anker.scrollIntoView({ block: "center" });
      r = anker.getBoundingClientRect();
    }
    const h = ref.current?.offsetHeight ?? 0;
    const fehlt = r.bottom + 6 + h + 8 - unten;
    const darueber = r.top - 6 - h >= oben + 8;
    if (h > 0 && fehlt > 0 && !darueber) rahmen.scrollTop += Math.max(0, Math.min(fehlt, r.top - oben - 8));
  };

  const platziere = () => {
    const el = ref.current;
    const anker = feld ? tokenElement(feld.key) : null;
    if (!el || !anker) return;
    const rahmen = anker.getBoundingClientRect();
    const erste = anker.getClientRects()[0] ?? rahmen;
    const b = el.offsetWidth;
    const h = el.offsetHeight;
    const rand = 8;
    const { oben: frei, unten } = flaeche();
    let left = Math.min(Math.max(rand, erste.left), window.innerWidth - b - rand);
    let top = rahmen.bottom + 6;
    if (top + h > unten - rand) {
      const oben = rahmen.top - h - 6;
      top = oben >= frei + rand ? oben : Math.max(rand, unten - h - rand);
    }
    if (left < rand) left = rand;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.opacity = "1";
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!feld || !el) return;
    inSichtHolen();
    platziere();
    // Preact zeichnet Fenster und Brief nacheinander: Klappt im selben Schritt eine Befundliste zu, verschiebt sich der
    // Brief erst danach. Deshalb noch einmal nach dem Zeichnen und bei jeder Größenänderung des Briefs (QA-04).
    nachDemZeichnen(() => {
      inSichtHolen();
      platziere();
    });
    // Das Papier, nicht die Stelle: Die Stelle kann beim Einhängen noch fehlen (neu eingeschalteter Baustein).
    const papier = document.querySelector(".papier");
    const rahmen = document.querySelector(".papier-rahmen");
    const beobachter = typeof ResizeObserver === "function" && papier ? new ResizeObserver(() => (el.contains(document.activeElement) && inSichtHolen(), platziere())) : null;
    if (papier) beobachter?.observe(papier);
    // Erscheint oder verschwindet die Meldungszeile, wird der Rahmen kürzer oder länger.
    if (rahmen) beobachter?.observe(rahmen);
    window.addEventListener("resize", platziere);
    document.addEventListener("scroll", platziere, true);
    return () => {
      beobachter?.disconnect();
      window.removeEventListener("resize", platziere);
      document.removeEventListener("scroll", platziere, true);
    };
  }, [feld?.key]);

  // Nach jeder Änderung im Brief neu platzieren (die Stelle kann gewachsen sein).
  useLayoutEffect(() => platziere(), [ansicht]);

  // Escape und Klick daneben gelten ab dem Einhängen, nicht erst nach dem nächsten Bild (PS-K05, CR-K07).
  useLayoutEffect(() => {
    if (!feld) return;
    const maus = (e: MouseEvent) => {
      const ziel = e.target as HTMLElement;
      if (ref.current?.contains(ziel) || ziel.closest("[data-key]") || ziel.closest("[data-haelt-feld]")) return;
      schliesseFeld(false);
    };
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        schliesseFeld();
      }
    };
    document.addEventListener("mousedown", maus);
    document.addEventListener("keydown", taste, true);
    return () => {
      document.removeEventListener("mousedown", maus);
      document.removeEventListener("keydown", taste, true);
    };
  }, [feld?.key]);

  // Fokus im selben Einhängen: Eine vorausgetippte Taste kommt im neuen Fenster an, nicht im alten (E-43, Grundsatz 3).
  // Jedes Fenster beginnt ohne Antworten des Arztes.
  useLayoutEffect(() => {
    const el = ref.current;
    beantwortet.key = feld?.key ?? "";
    beantwortet.angaben = new Set();
    if (!feld || !el) return;
    if (!el.contains(document.activeElement)) fokusImFenster(el);
  }, [feld?.key]);

  // Die Gruppe, die die Ziffern nimmt, zeigt sie an; nach jedem Zeichnen und jedem Fokuswechsel im Fenster.
  useLayoutEffect(() => markiereZiffern(ref.current));

  if (!feld || !fall) return null;
  const [bausteinId] = feld.key.split("/");
  const f = fundstelle(INDEX, feld.key);
  const seg = f?.segment;

  let titel = "";
  let inhalt: ComponentChildren = null;
  let tipp = "";
  if (feld.art === "seite") {
    titel = "Seite";
    inhalt = <SeiteEditor bausteinId={bausteinId} />;
    tipp = fall.seite ? "Ziffer: Seite nur dieses Bausteins · Esc schließt" : "Ziffer: Seite des ganzen Briefs · Esc schließt";
  } else if (feld.art === "person") {
    titel = "Patient";
    inhalt = <PersonEditor />;
    tipp = "Ziffer wählt · Esc schließt";
  } else if (feld.art === "wahl") {
    const [, abschnitt, nr] = feld.key.split("/");
    const stelle = (fall.vorlageId ? INDEX.vorlagen.get(fall.vorlageId) : undefined)?.wahl?.[Number(nr)];
    if (stelle && stelle.abschnitt === abschnitt) {
      titel = stelle.label;
      inhalt = <WahlEditor k={feld.key} stelle={stelle} />;
      tipp = "Ziffer wählt · ↑ ↓ markieren, Enter wählt das Markierte · Esc schließt";
    }
  } else if (feld.art === "feld" && f?.platzhalter) {
    inhalt = f.platzhalter.typ === "medikation" ? <MedikationEditor k={feld.key} def={f.platzhalter} /> : <FeldEditor k={feld.key} def={f.platzhalter} />;
  } else if (seg?.art === "auswahl") {
    titel = seg.label;
    inhalt = <AuswahlEditor k={feld.key} seg={seg} />;
    tipp = "Ziffer wählt · ↑ ↓ markieren, Enter wählt das Markierte · Esc schließt";
  } else if (seg?.art === "option") {
    titel = seg.label;
    inhalt = <OptionEditor k={feld.key} seg={seg} />;
    const t = tokenVon(feld.key);
    const grau = !!t && mitVorschlag(t);
    const gruppe = fokusStand.value.gruppe;
    tipp = [grau ? "Ü übernimmt" : "", seg.slots && gruppe ? `Ziffer wählt in „${gruppe}“` : "", "Esc schließt"].filter(Boolean).join(" · ");
  }
  if (!inhalt) return null;
  // Im Textfeld schreibt eine Ziffer, auf einem Knopf löst Enter ihn aus; der Hinweis sagt, was Enter dort tut (TS-01).
  tipp = fokusHinweis(fokusStand.value) || tipp;

  /**
   * Tasten, solange der Fokus im Fenster und nicht in einem Eingabefeld liegt (E-43, E-44): Eine Ziffer wählt in der
   * Gruppe, die die Nummern zeigt; Ü übernimmt einen Vorschlag. Beides erst nach der Schreckzeit und ohne Sperre
   * (`zugErlaubt`). Enter und Leertaste auf dem Fenster selbst wählen nichts, weil nichts markiert ist. Anderer Text
   * sperrt alle Befehle, bis Pfeiltaste, Tab, F2 oder Klick: Sonst wählte die „1“ aus „1 Schnitt“ (PS-K02, CR-TS01).
   */
  const fensterTaste = (e: KeyboardEvent) => {
    const el = ref.current;
    if (!el || e.defaultPrevented) return;
    const ziel = e.target as HTMLElement;
    if (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA" || ziel.isContentEditable) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const sage = (text: string) => setHinweis({ key: feld.key, text });
    if (e.key.length === 1 && e.key !== " ") {
      e.preventDefault();
      const uebernehmen = el.querySelector<HTMLElement>("[data-taste='ü']");
      const knoepfe = zifferKnoepfe(el);
      if (!zugErlaubt(e, `${knoepfe.length ? "123456789" : ""}${uebernehmen ? "ü" : ""}`, false, "", `${"123456789".slice(0, knoepfe.length)}${uebernehmen ? "ü" : ""}`)) return;
      if (e.key === "ü" || e.key === "Ü") {
        uebernehmen?.click();
        return;
      }
      const knopf = knoepfe[Number(e.key) - 1];
      if (knopf) knopf.click();
      else sage(`Hier gibt es nur ${knoepfe.length === 1 ? "die 1" : `1 bis ${knoepfe.length}`}.`);
      return;
    }
    const pfeil = e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowLeft";
    if (ziel !== el) {
      // In der Liste markieren ↑ und ↓ die nächste Möglichkeit; Enter wählt dann die markierte.
      const liste = ziel.closest(".ff-liste");
      if (liste && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        const knoepfe = [...liste.querySelectorAll<HTMLElement>(":scope > button")];
        const i = knoepfe.indexOf(ziel);
        e.preventDefault();
        knoepfe[(i + (e.key === "ArrowDown" ? 1 : -1) + knoepfe.length) % knoepfe.length]?.focus();
      }
      return;
    }
    if (pfeil) {
      const knoepfe = zifferKnoepfe(el);
      if (knoepfe.length === 0) return;
      e.preventDefault();
      setHinweis(null);
      const vor = e.key === "ArrowDown" || e.key === "ArrowRight";
      (knoepfe.find((k) => k.getAttribute("aria-checked") === "true" || k.getAttribute("aria-selected") === "true") ?? knoepfe[vor ? 0 : knoepfe.length - 1]).focus();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const knoepfe = zifferKnoepfe(el);
      sage(enterWaehltNur(el.querySelectorAll(".pillen, .ff-liste").length === 1 ? knoepfe.length : undefined));
    }
  };

  const text = gesperrt ? SPERRE : hinweis?.key === feld.key ? hinweis.text : tipp;
  return (
    <div
      ref={ref}
      class={feld.art === "feld" && f?.platzhalter?.typ === "medikation" ? "feldfenster breit" : "feldfenster"}
      role="dialog"
      tabIndex={-1}
      aria-label={titel || "Feld bearbeiten"}
      style={{ opacity: 0 }}
      key={feld.key}
      onKeyDown={fensterTaste}
      onFocusIn={() => markiereZiffern(ref.current)}
      onFocusOut={() => markiereZiffern(ref.current)}
    >
      {titel && (
        <div class="ff-titel">
          {titel}
          <NormwertInfo k={feld.key} label={titel} />
        </div>
      )}
      {inhalt}
      <FristZeilen token={tokenVon(feld.key)} onUebernommen={weiter} />
      {tokenVon(feld.key)?.uebertragen && (
        <p class="ff-hinweis" data-uebertragen>
          {`Angabe aus ${tokenVon(feld.key)!.uebertragen!.map((q) => `„${q}“`).join(", ")}${tokenVon(feld.key)!.zustand === "vorschlag" ? ": grau, bis du sie übernimmst" : ""}. Eine eigene Wahl hier geht vor.`}
        </p>
      )}
      {text && (
        <p class={gesperrt || hinweis?.key === feld.key ? "ff-tipp ff-tastenhinweis aktiv" : "ff-tipp ff-tastenhinweis"} role="status">
          {text}
        </p>
      )}
    </div>
  );
}
