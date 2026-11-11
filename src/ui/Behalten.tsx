// Behaltene Stationsfälle (E-50, E-67): Einstellung mit Erklärung, Frage nach der Kurzbezeichnung, Liste auf der
// Startseite, Zeile im Fallkopf. Die Regeln stehen in `engine/behalten.ts` und im Store; hier wird nur gezeigt und gefragt.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Fall } from "../model/types.ts";
import { fallName } from "../engine/fall.ts";
import { BEHALTEN_TAGE, KURZ_MAX, begonnenText, behaltenAnzeige, kurzHinweise, kurzVergeben, loeschText, loeschzeit, tagUndUhr } from "../engine/behalten.ts";
import type { Eintrag } from "../engine/behalten.ts";
import {
  FENSTER,
  INDEX,
  ausNeuererFassung,
  behaltenAusschalten,
  behaltenHier,
  behaltenLoeschen,
  behaltenLesbar,
  behaltenMeldung,
  behaltenOeffnen,
  behaltenVerfuegbar,
  bestand,
  eintragVon,
  einstellungen,
  faelle,
  fallAusEintrag,
  fallBehalten,
  kurzFrage,
  setzeEinstellung,
} from "../store.ts";
import type { BehaltenErgebnis } from "../store.ts";
import { SCHRECKZEIT_MS } from "../engine/tippzug.ts";
import { melde } from "./kopieren.ts";
import { NEUERE_FASSUNG, OEFFNEN_FEHLER, jetztImTakt } from "./aktionen.ts";
import { nachDemZeichnen, useFokusZurueck } from "./fokus.ts";
import "./behalten.css";

const FEHLER: Record<Exclude<BehaltenErgebnis, "ok">, string> = {
  leer: "Bitte eine Kurzbezeichnung eingeben.",
  doppelt: "Diese Kurzbezeichnung trägt schon ein anderer behaltener Fall. Bitte eine andere wählen.",
  aus: "„Stationsfälle behalten“ ist ausgeschaltet. Einschalten unter Einstellungen.",
  station: "Nur Stationsfälle lassen sich behalten.",
  gesperrt: "Der Browser hat das Speichern verweigert. Der Fall bleibt nur in diesem Fenster.",
  neuer: NEUERE_FASSUNG,
  "zu-alt": `Dieser Fall ist älter als ${BEHALTEN_TAGE} Tage und lässt sich nicht mehr behalten.`,
  fremd: "Dieser Fall ist inzwischen in einem anderen Fenster geöffnet. Dort weiterarbeiten oder ihn unter „Behaltene Fälle“ hierher holen.",
};

/** Meldungen des Speichers (Ablauf, anderes Fenster) in die Meldungszeile. */
export function useBehaltenMeldung() {
  const m = behaltenMeldung.value;
  useEffect(() => {
    if (!m) return;
    melde({ text: m.text, art: m.art }, 10_000);
    behaltenMeldung.value = null;
  }, [m]);
}

// --- Frage nach der Kurzbezeichnung -------------------------------------------

export function KurzDialog() {
  const frage = kurzFrage.value;
  const fall = frage ? faelle.value.find((f) => f.id === frage.fallId) : undefined;
  useFokusZurueck(!!frage);
  useEffect(() => {
    if (frage && !fall) kurzFrage.value = null;
  }, [frage, fall]);
  if (!frage || !fall) return null;
  return <KurzFrage key={`${frage.fallId}/${frage.anlass}`} fall={fall} anlass={frage.anlass} />;
}

/** Nennt den anderen Fall mit Vorlage und Beginn, damit man ihn in der Liste findet, etwa um ihn zu löschen. */
function doppeltText(text: string, id: string): string {
  const anderer = kurzVergeben(text, bestand.peek().eintraege, id);
  if (!anderer) return FEHLER.doppelt;
  const f = fallAusEintrag(anderer);
  const was = f ? `${fallName(f, INDEX)}, ` : "";
  return `„${anderer.kurz}“ trägt schon ein anderer behaltener Fall (${was}begonnen ${tagUndUhr(anderer.erstellt, Date.now())}). Andere Kurzbezeichnung wählen oder den alten Fall unter „Behaltene Fälle“ (Strg+K) löschen.`;
}

function KurzFrage({ fall, anlass }: { fall: Fall; anlass: "neu" | "behalten" | "aendern" }) {
  const eintrag = eintragVon(fall.id);
  const [text, setText] = useState(eintrag?.kurz ?? fall.etikett.trim());
  const [fehler, setFehler] = useState("");
  const feld = useRef<HTMLInputElement>(null);
  const seit = useRef(performance.now());
  // Fokus im selben Einhängen: Was danach getippt wird, landet im Feld, nicht im Brief dahinter.
  useLayoutEffect(() => {
    seit.current = performance.now();
    feld.current?.focus();
    feld.current?.select();
  }, []);
  // Die Frage erscheint nach dem Enter in der Suche. Wer ohne hinzusehen weitertippt („1“ für rechts, Enter), schreibt sonst
  // eine Ziffer als Kurzbezeichnung und behält den Fall (E-43): Tasten in der Schreckzeit gehen verloren, bis ein Klick oder
  // eine Eingabe ohne Taste (Einfügen) zeigt, dass jemand hinsieht.
  const hinsehen = useRef(false);
  const zuFrueh = (e: KeyboardEvent) => !hinsehen.current && e.timeStamp - seit.current < SCHRECKZEIT_MS;
  const jetzt = Date.now();
  const ab = eintrag?.loeschenAb ?? loeschzeit(fall.erstellt);
  const hinweise = kurzHinweise(text);
  const zu = () => (kurzFrage.value = null);
  const aendern = anlass === "aendern";
  const absenden = (e: Event) => {
    e.preventDefault();
    const r = fallBehalten(fall.id, text);
    if (r !== "ok") {
      setFehler(r === "doppelt" ? doppeltText(text, fall.id) : FEHLER[r]);
      feld.current?.focus();
      return;
    }
    const kurz = eintragVon(fall.id)?.kurz ?? text.trim();
    zu();
    melde({ text: aendern ? `Kurzbezeichnung jetzt „${kurz}“.` : `Fall behalten als „${kurz}“: bleibt auf diesem PC und ${loeschText(ab, Date.now())}.`, art: "ok" }, 6000);
  };
  return (
    <div class="dialog-flaeche ueber" data-dialog onMouseDown={(e) => e.target === e.currentTarget && zu()}>
      <form
        class="dialog-karte kurz-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kurz-titel"
        aria-describedby="kurz-text"
        onSubmit={absenden}
        onPointerDown={() => (hinsehen.current = true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            zu();
          } else if ((e.key === "Enter" || e.key.length === 1) && zuFrueh(e)) e.preventDefault();
        }}
      >
        {/* h2: Die Frage steht über dem Brief, dessen Überschrift die Seite trägt. */}
        <h2 id="kurz-titel">{aendern ? "Kurzbezeichnung ändern" : "Fall behalten?"}</h2>
        <p id="kurz-text">
          {aendern
            ? "Die Kurzbezeichnung steht im Reiter und in der Liste „Behaltene Fälle“ (Strg+K)."
            : `Behalten heißt: Der Fall bleibt auf diesem PC, auch wenn du das Fenster schließt, und ${loeschText(ab, jetzt)}. Jeder, der diesen Browser unter demselben Windows-Konto öffnet, sieht ihn in der Liste „Behaltene Fälle“.`}
        </p>
        <label for="kurz-feld" class="es-titel">
          Kurzbezeichnung
        </label>
        <input
          id="kurz-feld"
          ref={feld}
          class="ff-eingabe"
          type="text"
          maxLength={KURZ_MAX}
          spellcheck={false}
          autocomplete="off"
          placeholder="z. B. Zi 12 Fenster"
          aria-describedby="kurz-hilfe kurz-hinweise"
          aria-invalid={fehler ? true : undefined}
          value={text}
          onInput={(e) => {
            hinsehen.current = true;
            setText((e.target as HTMLInputElement).value);
            setFehler("");
          }}
        />
        <p id="kurz-hilfe" class="es-hilfe">
          Ohne Namen und ohne Geburtsdatum: Zimmer, Bett oder Diagnose, höchstens {KURZ_MAX} Zeichen.
        </p>
        <div id="kurz-hinweise" aria-live="polite">
          {hinweise.map((h) => (
            <p class="kurz-hinweis">{h}</p>
          ))}
        </div>
        {fehler && (
          <p class="fehlertext" role="alert">
            {fehler}
          </p>
        )}
        <div class="kurz-knoepfe">
          <button type="submit" class="knopf primaer">
            {aendern ? "Ändern" : "Behalten"}
          </button>
          <button type="button" class="knopf leise" onClick={zu}>
            {anlass === "neu" ? "Nur in diesem Fenster" : "Abbrechen"}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Zeile im Fallkopf ---------------------------------------------------------

const ALT_TITEL = "Begonnen an einem früheren Tag: Was im Brief steht, kann von gestern sein.";

/**
 * Behaltener Fall: eine Zeile mit Kurzbezeichnung, Beginn, letzter Änderung und Löschzeit (DS-R6-2, MT-R6-15, E-82). Ab dem
 * zweiten Kalendertag in der Form eines Hinweises am Abschnitt, „begonnen …“ fett: Was im Brief steht, kann von gestern sein
 * (G-121). Zwei Stunden vor dem Löschen ist die Löschzeit fett (Vorwarnung). Die Trenner stehen als Text, damit ein
 * Bildschirmleser die Angaben nicht als einen Satz liest.
 */
export function FallkopfBehalten({ fall }: { fall: Fall }) {
  const hier = behaltenHier.value.has(fall.id);
  const e = hier ? eintragVon(fall.id) : undefined;
  if (!e) return null;
  const a = behaltenAnzeige({ erstellt: fall.erstellt, geaendert: fall.geaendert, loeschenAb: e.loeschenAb }, jetztImTakt());
  const klasse = ["fk-behalten", a.alt ? "alt" : "", a.bald ? "bald" : ""].filter(Boolean).join(" ");
  return (
    <div class={klasse} data-behalten title={a.alt ? ALT_TITEL : undefined}>
      <span class="fk-behalten-kurz">Behalten · „{e.kurz}“</span>{" "}
      <button type="button" class="link" aria-label="Kurzbezeichnung ändern" onClick={() => (kurzFrage.value = { fallId: fall.id, anlass: "aendern" })}>
        ändern
      </button>
      {" · "}
      <span class="fk-behalten-alter">{a.begonnen}</span>
      {" · "}
      <span>{a.geaendert}</span>
      {" · "}
      <span class="fk-behalten-loeschen">{a.loeschen}</span>
    </div>
  );
}

/**
 * Nicht behaltener Stationsfall bei eingeschalteter Einstellung: der Weg zum Behalten als Link in der Metazeile, ohne eigene
 * Zeile; „nur in diesem Fenster“ ist der Normalfall und braucht keinen Satz (DS-R6-2).
 */
export function FallBehaltenLink({ fall }: { fall: Fall }) {
  if (behaltenHier.value.has(fall.id)) return null;
  if (fall.setting !== "station" || !einstellungen.value.stationBehalten || behaltenVerfuegbar() !== "ja") return null;
  return (
    <button type="button" class="link" data-fall-behalten onClick={() => (kurzFrage.value = { fallId: fall.id, anlass: "behalten" })}>
      Fall behalten …
    </button>
  );
}

// --- Liste auf der Startseite --------------------------------------------------

function vergleiche(a: Eintrag, b: Eintrag): number {
  return a.kurz.localeCompare(b.kurz, "de", { numeric: true, sensitivity: "base" });
}

export function BehalteneListe() {
  const b = bestand.value;
  const an = einstellungen.value.stationBehalten;
  if (b.eintraege.length === 0 && !an && behaltenLesbar.value) return null;
  const jetzt = jetztImTakt();
  return (
    <section class="behalten-liste" aria-labelledby="behalten-titel">
      <h2 id="behalten-titel" tabIndex={-1}>
        Behaltene Fälle
      </h2>
      {!behaltenLesbar.value ? (
        // Nicht lesbar ist nicht „keine“: Die Fälle liegen weiter auf dem PC (CR-R6-06).
        <p class="es-hilfe" data-unlesbar>
          Gerade nicht lesbar: Der Browser verweigert den Zugriff auf die behaltenen Fälle. Sie bleiben auf diesem PC.
        </p>
      ) : b.eintraege.length === 0 ? (
        <p class="es-hilfe">Noch kein Fall behalten. Bei jedem neuen Stationsfall fragt die App nach einer Kurzbezeichnung.</p>
      ) : (
        <ul>
          {[...b.eintraege].sort(vergleiche).map((e) => (
            <BehaltenZeile key={e.id} e={e} jetzt={jetzt} neuer={ausNeuererFassung(e, b)} />
          ))}
        </ul>
      )}
      <p class="es-hilfe">
        Auf diesem PC, für jeden an diesem Windows-Konto sichtbar; jeder Fall wird {BEHALTEN_TAGE} Tage nach Beginn gelöscht.
        {b.neuer ? " Diese Fälle stammen aus einer neueren Fassung von Kitteltext und lassen sich hier nur löschen." : ""}
        {!an && b.eintraege.length > 0 ? " „Stationsfälle behalten“ ist aus: Neue Fälle kommen nicht hinzu." : ""}
      </p>
    </section>
  );
}

function BehaltenZeile({ e, jetzt, neuer }: { e: Eintrag; jetzt: number; neuer: boolean }) {
  const fall = useMemo(() => (neuer ? null : fallAusEintrag(e)), [e, neuer]);
  const hier = behaltenHier.value.has(e.id);
  const anderswo = !hier && e.fenster !== null && e.fenster !== FENSTER;
  const [frage, setFrage] = useState<"holen" | "loeschen" | null>(null);
  const titel = fall ? fallName(fall, INDEX) : neuer ? "aus einer neueren Fassung" : "nicht lesbar";
  const oeffnen = () => {
    if (anderswo && frage !== "holen") return setFrage("holen");
    setFrage(null);
    const r = behaltenOeffnen(e.id);
    if (r !== "ok") return melde({ text: OEFFNEN_FEHLER[r], art: "fehler" });
    if (!hier) melde({ text: `„${e.kurz}“ geöffnet: begonnen ${tagUndUhr(e.erstellt, Date.now())}.`, art: "ok" }, 5000);
  };
  const loeschen = () => {
    if (frage !== "loeschen") return setFrage("loeschen");
    setFrage(null);
    if (!behaltenLoeschen(e.id)) return melde({ text: "Nicht gelöscht: Der Browser hat das Löschen verweigert, der Fall liegt weiter auf diesem PC. Bitte melden.", art: "fehler" });
    melde({ text: `Behaltener Fall „${e.kurz}“ gelöscht.`, art: "ok" });
    // Der Knopf ist mit seiner Zeile weg; der Fokus geht an die Überschrift der Liste statt auf die Seite. War es der letzte
    // Eintrag bei ausgeschalteter Einstellung, ist die ganze Liste weg: dann ins Suchfeld der Startseite (CR-R6-12).
    nachDemZeichnen(() => (document.getElementById("behalten-titel") ?? document.querySelector<HTMLElement>(".suche-eingabe"))?.focus({ preventScroll: true }));
  };
  return (
    <li class="behalten-zeile" data-behalten-zeile={e.kurz}>
      <div class="behalten-text">
        <span class="behalten-kurz">{e.kurz}</span>
        <span class="behalten-vorlage">{titel}</span>
        <span class="behalten-zeit">
          {begonnenText(e.erstellt, jetzt)} · {loeschText(e.loeschenAb, jetzt)}
        </span>
        {hier && <span class="behalten-ort">in diesem Fenster offen</span>}
        {anderswo && <span class="behalten-ort anderswo">in einem anderen Fenster oder Tab geöffnet</span>}
      </div>
      <div class="behalten-knoepfe" onFocusOut={(ev) => !(ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node | null) && setFrage(null)}>
        <button
          type="button"
          class={frage === "holen" ? "knopf absicht" : "knopf"}
          disabled={!fall}
          aria-label={frage === "holen" ? `„${e.kurz}“ dort schließen und hier öffnen?` : `„${e.kurz}“ ${anderswo ? "hierher holen" : hier ? "anzeigen" : "öffnen"}`}
          onClick={oeffnen}
        >
          {frage === "holen" ? "Dort schließen und hier öffnen?" : anderswo ? "Hierher holen" : hier ? "Anzeigen" : "Öffnen"}
        </button>
        <button type="button" class={frage === "loeschen" ? "knopf gefahr" : "knopf leise"} aria-label={frage === "loeschen" ? `„${e.kurz}“ wirklich löschen?` : `„${e.kurz}“ löschen`} onClick={loeschen}>
          {frage === "loeschen" ? "Wirklich löschen?" : "Löschen"}
        </button>
      </div>
    </li>
  );
}

// --- Einstellung ---------------------------------------------------------------

const ERKLAERUNG = [
  "Gespeichert wird der ganze Arbeitsstand eines behaltenen Falls: Bausteine, Befunde, Werte, Daten des Aufenthalts und freier Text. Er liegt im Browser dieses PCs, unter einer Kurzbezeichnung, die du wählst. Die App sendet weiterhin nichts.",
  `Höchstens ${BEHALTEN_TAGE} Tage ab Beginn des Falls, nicht ab der letzten Änderung. Danach löscht die App ihn von selbst: beim Start und jede Minute, solange sie offen ist. Wird sie nicht geöffnet, bleibt er bis zum nächsten Start im Browser.`,
  "Jeder, der an diesem PC diesen Browser unter demselben Windows-Konto öffnet, sieht die Liste „Behaltene Fälle“ und kann die Fälle öffnen.",
  "In die Kurzbezeichnung keine Namen und keine Geburtsdaten, nur etwa „Zi 12 Fenster“. Das gilt auch für jeden freien Text.",
  "Löschen: einzeln unter „Behaltene Fälle“, nach „Alles kopiert · Fall löschen“, alle mit „Arbeitsplatz räumen“ oder beim Ausschalten, wenn du es wählst. Notaufnahmefälle bleiben wie bisher nur im Fenster.",
];

export function BehaltenEinstellung() {
  const an = einstellungen.value.stationBehalten;
  const verfuegbar = behaltenVerfuegbar();
  const anzahl = bestand.value.eintraege.length;
  const [frage, setFrage] = useState<"an" | "aus" | null>(null);
  // Beim Einschalten der Knopf „Einschalten“, beim Ausschalten „Abbrechen“: Kein Knopf, der löscht, liegt vorab auf Enter (QA-46).
  const erster = useRef<HTMLButtonElement>(null);
  const umschalter = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (frage) erster.current?.focus();
  }, [frage]);
  const fertig = () => {
    setFrage(null);
    queueMicrotask(() => umschalter.current?.querySelector<HTMLElement>("[aria-checked='true']")?.focus());
  };
  const ausschalten = (loeschen: boolean) => {
    const r = behaltenAusschalten(loeschen);
    const faelle = (n: number) => (n === 1 ? "1 behaltener Fall" : `${n} behaltene Fälle`);
    // Gemeldet wird, was nachweislich geschehen ist (CR-R6-14), mit der Zahl statt „vorhandene“ (MT-R6-06).
    if (loeschen && !r.geloescht && r.anzahl > 0) {
      melde({ text: "Ausgeschaltet. Nicht gelöscht: Der Browser hat das Löschen verweigert, die behaltenen Fälle liegen weiter auf diesem PC. Bitte melden.", art: "fehler" }, 10_000);
    } else if (r.anzahl === 0) {
      melde({ text: "Ausgeschaltet.", art: "ok" }, 5000);
    } else if (loeschen) {
      melde({ text: `Ausgeschaltet. ${faelle(r.anzahl)} gelöscht.`, art: "ok" }, 5000);
    } else {
      melde({ text: `Ausgeschaltet. ${faelle(r.anzahl)} ${r.anzahl === 1 ? "bleibt bis zu seinem" : "bleiben bis zu ihrem"} Ablauf.`, art: "ok" }, 5000);
    }
    fertig();
  };
  const hilfe = !an
    ? "Aus: Fälle bleiben nur in diesem Browserfenster."
    : `An: Stationsfälle bleiben unter einer Kurzbezeichnung höchstens ${BEHALTEN_TAGE} Tage ab Beginn auf diesem PC. Zurzeit ${anzahl === 0 ? "keine behaltenen Fälle" : anzahl === 1 ? "1 behaltener Fall" : `${anzahl} behaltene Fälle`}.`;
  return (
    <div class="behalten-einstellung" onKeyDown={(e) => e.key === "Escape" && frage && (e.stopPropagation(), fertig())}>
      <div class="es-zeile">
        <div>
          <div class="es-titel">Stationsfälle behalten</div>
          <div class="es-hilfe" id="behalten-es-hilfe">
            {hilfe}
            {verfuegbar === "gesperrt" && !an && " Nicht wählbar: Dieser Browser speichert nichts dauerhaft (privates Fenster oder Vorgabe der Klinik-IT)."}
            {verfuegbar === "gesperrt" && an && " Der Browser speichert gerade nichts dauerhaft: Neue Fälle lassen sich nicht behalten."}
            {verfuegbar === "neuer" && " Nicht wählbar: Die behaltenen Fälle stammen aus einer neueren Fassung von Kitteltext. Mit der neueren Fassung arbeiten oder die Fälle unter „Behaltene Fälle“ löschen."}
          </div>
        </div>
        <div class="umschalter" role="radiogroup" aria-label="Stationsfälle behalten" aria-describedby="behalten-es-hilfe" ref={umschalter}>
          <button type="button" role="radio" aria-checked={!an} class={!an ? "aktiv" : ""} onClick={() => an && (anzahl > 0 ? setFrage("aus") : ausschalten(false))}>
            aus
          </button>
          <button type="button" role="radio" aria-checked={an} class={an ? "aktiv" : ""} disabled={!an && verfuegbar !== "ja"} onClick={() => !an && setFrage("an")}>
            an
          </button>
        </div>
      </div>
      {frage === "an" && (
        <div class="behalten-frage" role="group" aria-labelledby="behalten-an-titel">
          <h3 id="behalten-an-titel">Stationsfälle behalten einschalten?</h3>
          <ul id="behalten-an-text">
            {ERKLAERUNG.map((s) => (
              <li>{s}</li>
            ))}
          </ul>
          <div class="kurz-knoepfe">
            <button
              type="button"
              class="knopf primaer"
              ref={erster}
              aria-describedby="behalten-an-text"
              onClick={() => {
                setzeEinstellung("stationBehalten", true);
                melde({ text: "Eingeschaltet. Bei jedem neuen Stationsfall fragt die App jetzt nach einer Kurzbezeichnung.", art: "ok" }, 5000);
                fertig();
              }}
            >
              Einschalten
            </button>
            <button type="button" class="knopf leise" onClick={fertig}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {frage === "aus" && (
        <div class="behalten-frage" role="group" aria-labelledby="behalten-aus-titel">
          <h3 id="behalten-aus-titel">
            „Stationsfälle behalten“ ausschalten? {anzahl === 1 ? "1 behaltener Fall liegt" : `${anzahl} behaltene Fälle liegen`} auf diesem PC.
          </h3>
          <p class="es-hilfe" id="behalten-aus-text">
            „Löschen und ausschalten“ löscht {anzahl === 1 ? "ihn" : "sie"} sofort, auch wenn {anzahl === 1 ? "er" : "sie"} gerade offen {anzahl === 1 ? "ist" : "sind"}. „Nur ausschalten“ lässt{" "}
            {anzahl === 1 ? "ihn" : "sie"} unter „Behaltene Fälle“, bis die App {anzahl === 1 ? "ihn" : "sie"} {BEHALTEN_TAGE} Tage nach Beginn löscht; neue kommen nicht hinzu.
          </p>
          <div class="kurz-knoepfe">
            <button type="button" class="knopf gefahr" aria-describedby="behalten-aus-text" onClick={() => ausschalten(true)}>
              Löschen und ausschalten
            </button>
            <button type="button" class="knopf" onClick={() => ausschalten(false)}>
              Nur ausschalten
            </button>
            <button type="button" class="knopf leise" ref={erster} onClick={fertig}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
