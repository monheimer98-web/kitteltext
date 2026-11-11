import { Component } from "preact";
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Fall, Seite, Setting, Vorlage } from "../model/types.ts";
import { fallName, mitPerson } from "../engine/fall.ts";
import { renderBrief, sichtbareAbschnitte } from "../engine/render.ts";
import type { AbschnittAnsicht } from "../engine/render.ts";
import {
  INDEX,
  abgleich,
  aendere,
  aktiverFall,
  aktivId,
  brief,
  eigeneVorlageSpeichern,
  einstellungen,
  faelle,
  fallNeu,
  fallWaehlen,
  kannVor,
  kannZurueck,
  katalogGeaendert,
  setting,
  setzeEinstellung,
  speichernMoeglich,
  stehendeMeldung,
  sucheOffen,
  vor,
  vorlageAnwenden,
  zurueck,
  anleitungOffen,
  bestand,
  eintragVon,
  istBehalten,
  merkerVon,
  nichtGespeichert,
} from "../store.ts";
import { BehalteneListe, FallBehaltenLink, FallkopfBehalten, KurzDialog, useBehaltenMeldung } from "./Behalten.tsx";
import { RaeumenFrage } from "./Raeumen.tsx";
import { dauerspeicherGeht, loescheFaelle } from "../speicher.ts";
import { anleitungVonSelbst } from "../engine/einfuehrung.ts";
import { Anleitung, schalteAnleitung } from "./Anleitung.tsx";
import { freigeschaltet, pruefeCode } from "../access.ts";
import { Brief, STATUS_TEXT } from "./Brief.tsx";
import { Feldfenster, PersonWahl, PillenText, SEITEN, SEITE_NAME, enterWaehltNur } from "./Feldfenster.tsx";
import { Regionenliste, Schnellwahl, Vorlagensuche } from "./Vorlagensuche.tsx";
import { Einstellungen } from "./Einstellungen.tsx";
import { Vorschau, vorschauOffen } from "./Vorschau.tsx";
import {
  alterInWorten,
  ausstehend,
  handkopie,
  jetztImTakt,
  kopiereAlles,
  kopiereNaechsten,
  letzteKopie,
  lueckePerF2,
  nachRueckkehr,
  naechsteStelle,
  offenesFeld,
  schliesseFall,
  schliesseFeld,
  schliesseListe,
  seiteDesBriefs,
  uhrzeit,
  unterschied,
  verwaist,
  verwerfeAlte,
  weiter,
  zugErlaubt,
  zugKnopfGewechselt,
} from "./aktionen.ts";
import { melde, meldung } from "./kopieren.ts";
import { MERKER_MAX, ungespeichertText } from "../engine/behalten.ts";
import { useFokusZurueck, useKopfhoehe } from "./fokus.ts";
import { Falldaten } from "./Falldaten.tsx";
import { kopfKurz, reiterVersatz } from "../engine/anzeige.ts";

function SettingWahl() {
  const optionen: { wert: Setting; label: string }[] = [
    { wert: "zna", label: "Notaufnahme" },
    { wert: "station", label: "Station" },
  ];
  return (
    <div class="umschalter" role="radiogroup" aria-label="Einsatzort">
      {optionen.map((o) => (
        <button type="button" role="radio" aria-checked={setting.value === o.wert} class={setting.value === o.wert ? "aktiv" : ""} onClick={() => (setting.value = o.wert)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function fallStand(f: Fall): { zeichen: string; text: string; art: string } {
  const b = renderBrief(f, INDEX, { listen: einstellungen.value.listen });
  const sichtbar = sichtbareAbschnitte(b);
  if (b.offen > 0) return { zeichen: `●${b.offen}`, text: `${b.offen} offen`, art: "offen" };
  if (b.vorschlag > 0) return { zeichen: "○", text: `${b.vorschlag} Vorschläge nicht übernommen`, art: "vorschlag" };
  if (verwaist(b).length > 0) return { zeichen: "!", text: "kopierter Abschnitt ist nicht mehr im Brief", art: "offen" };
  if (sichtbar.length > 0 && ausstehend(b).length === 0) {
    return b.spaeter.length > 0 ? { zeichen: "✓[ ]", text: "kopiert, Platzhalter im KIS ergänzen", art: "fertig" } : { zeichen: "✓", text: "vollständig kopiert", art: "fertig" };
  }
  return { zeichen: "", text: "", art: "" };
}

function neuerFallDialog() {
  schliesseFeld(false);
  schliesseListe(false);
  if (aktiverFall.value) sucheOffen.value = "neu";
}

/**
 * Holt den Reiter des offenen Falls in den sichtbaren Teil der Leiste (QA-44, DS-R6-6). Rechts steht „+ Neuer Fall“
 * angeheftet; der Reiter muss links davon ganz zu sehen sein, mit seinem ×.
 */
function zeigeAktivenReiter(nav: HTMLElement | null) {
  const eintrag = nav?.querySelector<HTMLElement>("[data-reiter-offen]");
  if (!nav || !eintrag) return;
  const n = nav.getBoundingClientRect();
  const r = eintrag.getBoundingClientRect();
  const neu = nav.querySelector<HTMLElement>(".reiter-neu");
  const v = reiterVersatz({ links: r.left, rechts: r.right, sichtLinks: n.left, sichtRechts: n.right - (neu ? neu.getBoundingClientRect().width + 4 : 0) });
  if (v !== 0) nav.scrollLeft += v;
}

function Kopf({ onEinstellungen }: { onEinstellungen: () => void }) {
  const [raeumen, setRaeumen] = useState(false);
  const raeumenKnopf = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const jetzt = jetztImTakt();
  // Nur beim Wechsel des Falls, bei neuen oder geschlossenen Reitern und wenn die Leiste schmaler oder breiter wird (Fenster,
  // Anleitung): Wer die Leiste selbst seitlich schiebt, soll nicht jede Minute zurückgeholt werden.
  useLayoutEffect(() => zeigeAktivenReiter(nav.current), [aktivId.value, faelle.value.length]);
  useEffect(() => {
    const el = nav.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const beobachter = new ResizeObserver(() => zeigeAktivenReiter(el));
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);
  return (
    <>
    <header class="kopf">
      <div class="marke-name">Kitteltext</div>
      <nav class="reiter" aria-label="Offene Fälle" ref={nav}>
        {faelle.value.map((f) => {
          const aktiv = f.id === aktivId.value && !sucheOffen.value;
          const stand = fallStand(f);
          const alter = alterInWorten(f, jetzt);
          const behalten = istBehalten(f.id);
          const merker = merkerVon(f);
          return (
            <div class={aktiv ? "reiter-eintrag aktiv" : "reiter-eintrag"} data-reiter-offen={f.id === aktivId.value ? "" : undefined}>
              <button
                type="button"
                class="reiter-knopf"
                aria-current={aktiv}
                onClick={() => fallWaehlen(f.id)}
                title={`Fall ${f.nr} · ${fallName(f, INDEX)}${behalten ? ` · behalten als „${merker}“` : ""} · begonnen ${uhrzeit(f.erstellt, jetzt)}${stand.text ? ` · ${stand.text}` : ""}${f.nr <= 9 ? ` (Alt+${f.nr})` : ""}`}
              >
                <span class="reiter-nr">{f.nr}</span>
                {/* Behalten: Die Kurzbezeichnung zuerst und in voller Schrift, sonst kürzt die Auslassung genau das weg, woran man den
                    Fall erkennt (G-122, DS-R6-4). */}
                <span class="reiter-name">
                  {behalten ? (
                    <>
                      <em class="reiter-kurz">{merker}</em> · {fallName(f, INDEX)}
                    </>
                  ) : (
                    <>
                      {fallName(f, INDEX)}
                      {merker && <em> · {merker}</em>}
                    </>
                  )}
                </span>
                <span class={alter ? "reiter-zeit alt" : "reiter-zeit"}>{alter || uhrzeit(f.erstellt, jetzt)}</span>
                {stand.zeichen && <span class={`reiter-stand r-${stand.art}`}>{stand.zeichen}</span>}
              </button>
              <button
                type="button"
                class="reiter-zu"
                aria-label={behalten ? `Fall ${f.nr} schließen, bleibt behalten` : `Fall ${f.nr} schließen`}
                title={behalten ? "Fall in diesem Fenster schließen; er bleibt unter „Behaltene Fälle“ (Strg+K)" : "Fall schließen"}
                onClick={() => schliesseFall(f)}
              >
                ×
              </button>
            </div>
          );
        })}
        {aktiverFall.value && (
          <button type="button" class={sucheOffen.value === "neu" ? "reiter-neu aktiv" : "reiter-neu"} onClick={neuerFallDialog}>
            + Neuer Fall <kbd>Strg+K</kbd>
          </button>
        )}
      </nav>
      <div class="kopf-rechts">
        <button type="button" class="knopf leise icon" disabled={!kannZurueck.value} onClick={rueckgaengig} title="Rückgängig (Strg+Z)" aria-label="Rückgängig">
          <PfeilZurueck />
        </button>
        <button type="button" class="knopf leise icon" disabled={!kannVor.value} onClick={wiederholen} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
          <PfeilZurueck gespiegelt />
        </button>
        {(faelle.value.length > 0 || bestand.value.eintraege.length > 0 || raeumen) && (
          <button
            type="button"
            class={raeumen ? "knopf leise aktiv" : "knopf leise"}
            ref={raeumenKnopf}
            aria-expanded={raeumen}
            onClick={() => setRaeumen(!raeumen)}
            title="Vor dem Verlassen des PCs: löscht die Fälle dieses Fensters und überschreibt die Zwischenablage; behaltene Fälle löscht es nur, wenn du es wählst"
          >
            Arbeitsplatz räumen
          </button>
        )}
        <button
          type="button"
          class={anleitungOffen.value ? "knopf leise aktiv" : "knopf leise"}
          aria-expanded={anleitungOffen.value !== null}
          aria-controls={anleitungOffen.value ? "anleitung" : undefined}
          onClick={schalteAnleitung}
        >
          Anleitung
        </button>
        <button type="button" class="knopf leise" onClick={onEinstellungen}>
          Einstellungen
        </button>
      </div>
    </header>
    {/* Unter der Kopfzeile statt in ihr: Die Reiter behalten ihren Platz, und drei Knöpfe passen auch bei 1024 px. */}
    {raeumen && (
      <RaeumenFrage
        id="raeumen-kopf"
        onFertig={(geraeumt) => {
          setRaeumen(false);
          if (!geraeumt) queueMicrotask(() => raeumenKnopf.current?.focus());
        }}
      />
    )}
    </>
  );
}

/**
 * Rückgängig als gezeichneter Bogenpfeil, gespiegelt für Wiederholen: Die Zeichen ↶ ↷ sehen je nach Schrift verschieden
 * und blass aus. Inline, ohne Symbolpaket; Name und Titel trägt der Knopf.
 */
function PfeilZurueck({ gespiegelt = false }: { gespiegelt?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" style={gespiegelt ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M6 3.5 2.5 7 6 10.5M3 7h6.5a4 4 0 0 1 0 8H7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/**
 * Eine Zeile für den ersten Brief. Verschwindet mit „Verstanden“ oder nach dem ersten Kopieren. „Enter allein setzt nie
 * etwas“ steht in der Anleitung unter „Damit nichts fehlt“ (Entscheidung Lead (c)).
 */
function Einstieg() {
  if (einstellungen.value.tippGesehen) return null;
  return (
    <div class="einstieg" role="note">
      <p>
        <kbd>F2</kbd> nächste Stelle · <span class="marke marke-offen">● Gelb</span> ausfüllen · <span class="marke marke-vorschlag">○ Grau</span> lesen, <kbd>Ü</kbd> übernehmen ·{" "}
        <kbd>Strg</kbd>+<kbd>Enter</kbd> Abschnitt kopieren
      </p>
      <button type="button" class="knopf klein" onClick={() => setzeEinstellung("tippGesehen", true)}>
        Verstanden
      </button>
    </div>
  );
}

function rueckgaengig() {
  const fall = aktiverFall.value;
  const ansicht = brief.value;
  if (!zurueck()) return;
  const was = unterschied(fall, ansicht);
  melde({ text: was ? `Zurückgenommen: ${was}` : "Letzte Änderung zurückgenommen.", art: "ok" }, 3500);
}
function wiederholen() {
  const fall = aktiverFall.value;
  const ansicht = brief.value;
  if (!vor()) return;
  const was = unterschied(fall, ansicht);
  melde({ text: was ? `Wiederhergestellt: ${was}` : "Änderung wiederhergestellt.", art: "ok" }, 3500);
}

function Start() {
  useFokusZurueck();
  const wechseln = sucheOffen.value === "wechseln";
  const waehle = (v: Vorlage, seite?: Seite) => (wechseln ? vorlageAnwenden(v, seite) : fallNeu(v, seite));
  const leer = () => {
    const v = INDEX.vorlagen.get(setting.value === "zna" ? "zna-frei" : "station-frei");
    if (v) waehle(v);
    else fallNeu();
  };
  return (
    <main class="start">
      <div class="start-kopf">
        <h1>{wechseln ? "Andere Vorlage für diesen Fall" : "Was hat der Patient?"}</h1>
        {sucheOffen.value && (
          <button type="button" class="knopf leise" onClick={() => (sucheOffen.value = null)}>
            Zurück zum Brief <kbd>Esc</kbd>
          </button>
        )}
      </div>
      {wechseln && <p class="start-unter">Seite, Person und passende Eingaben bleiben erhalten. Rückgängig mit Strg+Z.</p>}
      <div class="start-zeile">
        <SettingWahl />
        <span class="start-typ">{setting.value === "zna" ? "Ambulanzbrief" : "Entlassbrief"}</span>
      </div>
      <Vorlagensuche onWahl={waehle} onLeer={leer} />
      {!wechseln && <BehalteneListe />}
      <Schnellwahl onWahl={waehle} />
      <Regionenliste onWahl={waehle} />
      <div class="start-fuss">
        <button type="button" class="knopf" onClick={leer}>
          Leerer Brief
        </button>
        <span>Formulierungshilfe. Keine Namen oder Geburtsdaten eingeben. Nichts verlässt diesen Browser.</span>
      </div>
    </main>
  );
}

/**
 * Seitenwahl im Fallkopf. Die erste Wahl ist ein Klick oder eine Ziffer. Eine gesetzte Seite zu ändern braucht zwei:
 * Der zweite Klick oder dieselbe Ziffer noch einmal bestätigt, damit ein Fehlgriff nicht den ganzen Brief auf die
 * andere Seite dreht; die Meldung nennt dann alte und neue Seite (E-43, Grundsatz 6). Pfeiltasten markieren, Enter
 * wählt nur den markierten Knopf; auf der Gruppe selbst (Halt im Durchlauf) wählt Enter nichts (QA-03, PS-K01).
 */
function Seitenwahl() {
  const fall = aktiverFall.value!;
  const [wunsch, setWunsch] = useState<Seite | null>(null);
  useEffect(() => setWunsch(null), [fall.id, fall.seite]);
  const alle: Seite[] = [...SEITEN, "ohne"];
  const abweichend = Object.entries(fall.seiteBaustein);
  const waehle = (s: Seite, amHalt: boolean) => {
    if (fall.seite === s) return;
    if (fall.seite && wunsch !== s) return setWunsch(s);
    const erste = !fall.seite;
    seiteDesBriefs(s);
    // Die erste Seite per Ziffer am Halt: weiter wie nach jeder anderen Angabe.
    if (erste && amHalt) weiter();
  };
  const taste = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const gruppe = e.currentTarget as HTMLElement;
    const knoepfe = [...gruppe.querySelectorAll<HTMLButtonElement>(":scope > button")];
    // Ziffern und Text gehen durch den Tipp-Zug (E-44): erst nach der Schreckzeit, und verirrter Text sperrt.
    if (e.key.length === 1 && e.key !== " ") {
      e.preventDefault();
      if (!zugErlaubt(e, "1234".slice(0, alle.length))) return;
      waehle(alle[Number(e.key) - 1], e.target === gruppe);
      return;
    }
    const schritt = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (schritt) {
      e.preventDefault();
      const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
      (i < 0 ? (knoepfe.find((k) => k.getAttribute("aria-checked") === "true") ?? knoepfe[schritt > 0 ? 0 : knoepfe.length - 1]) : knoepfe[(i + schritt + knoepfe.length) % knoepfe.length]).focus();
      return;
    }
    if (e.target === gruppe && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      melde({ text: enterWaehltNur(alle.length), art: "ok" });
    }
  };
  return (
    <div class={fall.seite ? "fk-feld" : "fk-feld fehlt"} data-seitenwahl onKeyDown={(e) => e.key === "Escape" && setWunsch(null)}>
      <FkLabel gewaehlt={!!fall.seite} name="Seite" />
      <div
        class="pillen"
        role="radiogroup"
        tabIndex={-1}
        aria-label="Seite"
        onKeyDown={taste}
        onFocusOut={(e) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null) && setWunsch(null)}
      >
        {alle.map((s, i) => (
          <button
            type="button"
            role="radio"
            aria-checked={fall.seite === s}
            class={fall.seite === s ? "pille aktiv" : wunsch === s ? "pille wunsch" : "pille"}
            onClick={() => waehle(s, false)}
          >
            <span class="pille-ziffer" aria-hidden="true">
              {i + 1}
            </span>
            <PillenText text={wunsch === s ? `auf „${SEITE_NAME[s]}“ ändern?` : SEITE_NAME[s]} />
          </button>
        ))}
      </div>
      {abweichend.length > 0 && (
        <span class="fk-abweichend" title="Diese Bausteine haben eine eigene Seite. Ändern: auf die Seitenangabe im Text klicken.">
          abweichend:{" "}
          {abweichend.map(([id, s]) => (
            <strong>
              {INDEX.bausteine.get(id)?.titel ?? id} {SEITE_NAME[s]}{" "}
            </strong>
          ))}
        </span>
      )}
    </div>
  );
}

/**
 * Beschriftung einer Wahl im Fallkopf: „● Seite wählen“, bis gewählt ist, dann „Seite“. Beide Wortlaute liegen
 * übereinander, der längere bestimmt die Breite: Nach der Wahl rückt nichts daneben zur Seite (QA-25).
 */
function FkLabel({ gewaehlt, name }: { gewaehlt: boolean; name: string }) {
  return (
    <span class="fk-label">
      <span class={gewaehlt ? undefined : "fk-unsichtbar"}>{name}</span>
      <span class={gewaehlt ? "fk-fehlt-text fk-unsichtbar" : "fk-fehlt-text"}>● {name} wählen</span>
    </span>
  );
}

function Fallkopf() {
  const fall = aktiverFall.value!;
  const b = brief.value!;
  const vorlage = fall.vorlageId ? INDEX.vorlagen.get(fall.vorlageId) : undefined;
  const typ = INDEX.brieftypen.get(fall.brieftypId);
  const [speichern, setSpeichern] = useState(false);
  const [name, setName] = useState("");
  // Das Attribut autofocus wirkt bei nachträglich eingefügten Feldern nicht in jedem Browser.
  const nameFeld = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!speichern) return;
    nameFeld.current?.focus();
    nameFeld.current?.select();
  }, [speichern]);
  const abweichend = Object.values(fall.seiteBaustein).filter((s) => s !== fall.seite && s !== "ohne");
  const titel = vorlage?.titel ?? (fall.setting === "station" ? "Freier Entlassbrief" : "Freier Brief");
  const seitenzusatz = [fall.seite && fall.seite !== "ohne" ? fall.seite.toUpperCase() : "", abweichend.length > 0 ? `+ ${[...new Set(abweichend)].map((x) => x.toUpperCase()).join(" + ")}` : ""].filter(Boolean).join(" ");
  const jetzt = jetztImTakt();
  const behalten = istBehalten(fall.id) ? eintragVon(fall.id) : undefined;
  const kurz = kopfKurz(
    { brauchtSeite: b.brauchtSeite, seite: fall.seite, brauchtPerson: b.brauchtPerson, geschlecht: fall.geschlecht, alter: fall.alter },
    behalten && { kurz: behalten.kurz, erstellt: fall.erstellt, geaendert: fall.geaendert, loeschenAb: behalten.loeschenAb },
    jetzt,
  );
  const kopf = useRef<HTMLDivElement>(null);
  useKopfhoehe(kopf);
  return (
    <div class="fallkopf" ref={kopf}>
      <div class="fk-kopfzeile">
        {/* Im schmalen Fenster bleibt nur diese Zeile stehen: Fall, Diagnose und Seite sind immer im Blick. Titel und
            Metazeile stehen immer in eigenen Zeilen, und der Titel bricht nie um: Die Wahl der Seite verschiebt nichts
            darunter (QA-25). Ein zu langer Titel wird gekürzt, die Seite bleibt ganz zu sehen. */}
        <div class="fk-titel" title={`${titel}${seitenzusatz ? ` ${seitenzusatz}` : ""}`}>
          <span class="fk-nr">Fall {fall.nr}</span>
          <h1>
            <span class="fk-titeltext">{titel}</span>
            {/* Das Leerzeichen gehört zum Text (Vorlesen, Kopieren); den sichtbaren Abstand gibt der Zwischenraum. */}
            {seitenzusatz && <span class="fk-seite"> {seitenzusatz}</span>}
          </h1>
          {/* Nur im kompakten Fallkopf zu sehen, wo die Felder mitscrollen: Seite und Person bleiben stehen. Der Text steht im
              Stil (data-text), nicht im Dokument: Vorlesehilfen und Suche finden ihn nur einmal, in den Feldern darunter. */}
          {kurz.length > 0 && (
            <span class="fk-person" aria-hidden="true">
              {kurz.map((t) => (
                <span class={["fk-person-teil", t.fehlt ? "fehlt" : "", t.art ?? ""].filter(Boolean).join(" ")} data-text={t.text} />
              ))}
            </span>
          )}
        </div>
        <div class="fk-neben">
          {/* Beim behaltenen Fall steht der Beginn in der Zeile darunter, nicht zweimal (MT-R6-08). Über Mitternacht mit Tag. */}
          <span class="fk-typ">
            {typ?.setting === "station" ? "Entlassbrief" : "Ambulanzbrief"}
            {behalten ? "" : ` · begonnen ${uhrzeit(fall.erstellt, jetzt)}`}
          </span>
          {vorlage && (
            <span class={`st-status s-${vorlage.status}`} title={vorlage.quelle ?? ""}>
              {STATUS_TEXT[vorlage.status]}
            </span>
          )}
          <button type="button" class="link" onClick={() => (sucheOffen.value = "wechseln")}>
            Vorlage wechseln
          </button>
          <button
            type="button"
            class="link"
            aria-expanded={speichern}
            title="Speichert den Aufbau dieses Briefs als eigene Vorlage: Bausteine und welche Sätze vorgeschlagen werden. Antworten, Werte, Befunde und freier Text gehören zum Patienten und bleiben draußen. Entweder-oder-Stellen bleiben offen."
            onClick={() => {
              setName(`${vorlage?.titel ?? "Freier Brief"} (eigen)`);
              setSpeichern(!speichern);
            }}
          >
            als eigene Vorlage speichern
          </button>
          <FallBehaltenLink fall={fall} />
        </div>
      </div>
      <FallkopfBehalten fall={fall} />
      {speichern && (
        <form
          class="fk-speichern"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const ok = eigeneVorlageSpeichern(name);
            melde(
              ok
                ? { text: `Eigene Vorlage „${name.trim()}“ gespeichert. Sie steht auf der Startseite unter „Eigene“.`, art: "ok" }
                : { text: "Der Browser hat das Speichern verweigert. Die Vorlage gilt nur, bis das Fenster geschlossen wird.", art: "fehler" },
            );
            setSpeichern(false);
          }}
        >
          <label for="fk-vorlagenname">Name der eigenen Vorlage</label>
          <input spellcheck={false} autocomplete="off" id="fk-vorlagenname" class="fk-eingabe breit" type="text" maxLength={60} value={name} ref={nameFeld} onInput={(e) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Escape" && setSpeichern(false)} />
          <button type="submit" class="knopf primaer">
            Speichern
          </button>
          <button type="button" class="knopf leise" onClick={() => setSpeichern(false)}>
            Abbrechen
          </button>
          <span class="fk-typ">Gespeichert wird der Aufbau, nicht der Fall: keine Antworten, keine Werte, keine Befunde, kein freier Text.</span>
        </form>
      )}
      <div class="fk-felder">
        {b.brauchtSeite && <Seitenwahl />}
        {b.brauchtPerson && (
          <>
            <div class={fall.geschlecht ? "fk-feld" : "fk-feld fehlt"} data-personwahl>
              <FkLabel gewaehlt={!!fall.geschlecht} name="Person" />
              <PersonWahl imKopf />
            </div>
            <div class="fk-feld">
              <label class="fk-label" for="fk-alter">
                Alter
              </label>
              <input
                spellcheck={false}
                autocomplete="off"
                id="fk-alter"
                class="fk-eingabe fk-alter"
                type="text"
                inputMode="numeric"
                maxLength={12}
                value={fall.alter}
                placeholder="Jahre"
                onInput={(e) => aendere((f) => mitPerson(f, f.geschlecht, (e.target as HTMLInputElement).value), "alter")}
              />
            </div>
          </>
        )}
        {!istBehalten(fall.id) && (
          <div class="fk-feld fk-merker">
            <input
              spellcheck={false}
              autocomplete="off"
              id="fk-etikett"
              class="fk-eingabe"
              type="text"
              maxLength={MERKER_MAX}
              value={fall.etikett}
              placeholder="Merker, z. B. Kabine 3"
              aria-label="Merker für diesen Fall (kein Patientenname)"
              title="Nur zum Wiederfinden im Reiter. Keinen Namen eintragen."
              onInput={(e) => aendere((f) => ({ ...f, etikett: (e.target as HTMLInputElement).value }), "etikett")}
            />
          </div>
        )}
      </div>
      {/* Je Fall eigene Felder: Ein unlesbarer Entwurf darf nicht in den nächsten Fall wandern (CR-R5-01). */}
      {fall.setting === "station" && <Falldaten key={fall.id} />}
    </div>
  );
}

function abschnittStand(a: AbschnittAnsicht): { zeichen: string; text: string; art: string } {
  if (a.leer) return a.kopiert ? { zeichen: "!", text: "kopiert, jetzt leer", art: "offen" } : { zeichen: "·", text: "leer", art: "leer" };
  if (a.offen > 0) return { zeichen: "●", text: `${a.offen} offen`, art: "offen" };
  if (a.vorschlag > 0) return { zeichen: "○", text: `${a.vorschlag} grau`, art: "vorschlag" };
  if (a.geaendertSeitKopie) return { zeichen: "↻", text: "seit Kopie geändert", art: "geaendert" };
  // Mit Abgleich-Hinweis nicht grün (M-27 Station), wie am Knopf des Abschnitts.
  if (a.kopiert && abgleich.value.some((h) => h.abschnitte.includes(a.id))) return { zeichen: "!", text: "kopiert, Hinweis prüfen", art: "geaendert" };
  if (a.kopiert) return { zeichen: "✓", text: `kopiert ${a.kopiertUm ? uhrzeit(a.kopiertUm) : ""}`, art: "fertig" };
  return { zeichen: "→", text: "fertig", art: "bereit" };
}

/** Rechte Leiste: Überblick, nächste offene Stelle, Kopieren. Hier wird nichts eingegeben. */
function Pruefleiste() {
  const b = brief.value!;
  const fall = aktiverFall.value!;
  const sichtbar = sichtbareAbschnitte(b);
  const offen = ausstehend(b);
  const naechster = offen[0];
  const zuKlaeren = b.offen + b.vorschlag;
  const kopie = letzteKopie.value;
  const alleKopiert = sichtbar.length > 0 && offen.length === 0;
  // Ein behaltener Fall, der ganz kopiert ist, wird gelöscht statt nur geschlossen: Er hat auf dem PC nichts mehr zu tun (E-67).
  const behalten = istBehalten(fall.id);
  const schliessen = () =>
    schliesseFall(fall, behalten, b.spaeter.length > 0 ? ` Im KIS noch zu ergänzen: ${b.spaeter.map((p) => `[${p.label.toUpperCase()}]`).join(", ")}.` : "", b.spaeter.length > 0);
  // Derselbe Knopf behält beim Wechsel den Fokus; was Enter dort tut, ist neu (R2-05).
  const warAlles = useRef(alleKopiert);
  useLayoutEffect(() => {
    if (alleKopiert && !warAlles.current) zugKnopfGewechselt();
    warAlles.current = alleKopiert;
  }, [alleKopiert]);
  return (
    // Ein gefüllter Knopf je Zustand: beim Klären F2, danach Kopieren (Design-Review Nr. 3).
    <aside class="pruefleiste" aria-label="Prüfen und kopieren" data-phase={zuKlaeren > 0 ? "klaeren" : "kopieren"}>
      <button type="button" class={zuKlaeren > 0 ? "knopf breit f2" : "knopf breit f2 ruhig"} disabled={zuKlaeren === 0} onClick={() => naechsteStelle()}>
        {zuKlaeren > 0 ? (
          // Zwei Zeilen: oben die Handlung, darunter die Zählung. Der Name bleibt „Nächste Stelle · ● 23 offen · ○ 11 grau“.
          <span class="f2-text">
            <span class="f2-titel">Nächste Stelle</span>
            <span class="nur-vorlesen"> · </span>
            <span class="f2-zahl">{[b.offen > 0 ? `● ${b.offen} offen` : "", b.vorschlag > 0 ? `○ ${b.vorschlag} grau` : ""].filter(Boolean).join(" · ")}</span>
          </span>
        ) : (
          <span>Nichts mehr zu klären</span>
        )}
        <kbd>F2</kbd>
      </button>

      <ul class="gliederung">
        {b.abschnitte.map((a) => {
          if (a.ausgeblendet && !a.kopiert) return null;
          const s = a.ausgeblendet ? { zeichen: "!", text: "kopiert, nicht mehr im Brief", art: "offen" } : abschnittStand(a);
          return (
            <li>
              <button type="button" class={`gl-eintrag g-${s.art}`} onClick={() => document.querySelector(`[data-abschnitt="${a.id}"]`)?.scrollIntoView({ block: "start" })}>
                <span class="gl-zeichen" aria-hidden="true">
                  {s.zeichen}
                </span>
                <span class="gl-titel" title={a.titel}>
                  {a.titel}
                </span>
                <span class="gl-stand">{s.text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {abgleich.value.length > 0 && (
        <div class="kis-liste" role="status">
          <div class="lk-kopf">Bitte abgleichen</div>
          {abgleich.value.map((h) => (
            <div>{h.text}</div>
          ))}
        </div>
      )}

      {b.spaeter.length > 0 && (
        <div class="kis-liste">
          <div class="lk-kopf">Im KIS zu ergänzen</div>
          {b.spaeter.map((p) => (
            <div>
              [{p.label.toUpperCase()}] <span class="gl-stand">{b.abschnitte.find((a) => a.id === p.abschnitt)?.titel}</span>
            </div>
          ))}
        </div>
      )}

      <div class="kopierblock">
        {alleKopiert ? (
          <button type="button" class="knopf primaer breit" onClick={schliessen} onKeyDown={knopfTaste(schliessen, "Fall bleibt offen")}>
            <span>{behalten ? "Alles kopiert · Fall löschen" : "Alles kopiert · Fall schließen"}</span>
          </button>
        ) : (
          <button type="button" class="knopf primaer breit" data-naechste-kopie disabled={!naechster} onClick={kopiereNaechsten} onKeyDown={knopfTaste(() => void kopiereNaechsten(), "nichts kopiert")} title={naechster && !naechster.fertig ? "Dieser Abschnitt ist noch nicht fertig; der Knopf führt zur Stelle, die zu klären ist" : undefined}>
            <span>{naechster ? (naechster.fertig ? `${naechster.titel} kopieren` : `${naechster.titel}: erst klären`) : "Nichts zu kopieren"}</span>
            <kbd>Strg+↵</kbd>
          </button>
        )}
        <span class="kopier-fortschritt">
          {sichtbar.length - offen.length} von {sichtbar.length} Abschnitten kopiert
        </span>
        <button type="button" class="knopf breit" disabled={sichtbar.length === 0} onClick={kopiereAlles} onKeyDown={knopfTaste(() => void kopiereAlles(), "nichts kopiert")}>
          {/* Kurzform nur, wo es eng wird (Fußleiste mit Anleitung); der Name bleibt „Ganzen Brief kopieren“. */}
          <span>
            <span class="lang">Ganzen Brief kopieren</span>
            <span class="kurz" aria-hidden="true">
              Brief kopieren
            </span>
          </span>
          <kbd>Strg+⇧+↵</kbd>
        </button>
        {einstellungen.value.formatiert && (
          <button type="button" class="link vorschau-knopf" disabled={sichtbar.length === 0} onClick={() => (vorschauOffen.value = true)} title="Zeigt den Brief so, wie er formatiert in die Zwischenablage geht">
            Vorschau formatiert
          </button>
        )}
      </div>
      <Vorschau />

      {kopie && (
        <div class="letzte-kopie" aria-live="polite">
          <div class="lk-kopf">Zuletzt kopiert · {uhrzeit(kopie.um)}</div>
          <div>
            {kopie.was} · {kopie.fall}
          </div>
          <div class="lk-text">„{kopie.anfang}…"</div>
          <div class="lk-fuss">
            {kopie.zeichen} Zeichen{kopie.platzhalter > 0 && ` · ${kopie.platzhalter} Platzhalter fürs KIS`}
            {/* Ob das KIS die formatierte Fassung getreu übernimmt, ist nicht geprüft; der Ausweg steht dabei (CR-R5-02, E-72). */}
            {kopie.fassung === "formatiert" && " · formatiert und als Text (abschalten: Einstellungen → Formatiert kopieren)"}
            {kopie.fassung === "text" && " · nur als Text: Der Browser hat die formatierte Fassung nicht angenommen"}
          </div>
        </div>
      )}
    </aside>
  );
}

/**
 * Meldungszeile. Im Brief eine eigene Zeile unter dem Papier, die nichts verdeckt: weder die Zeile mit dem Zeiger noch
 * Knöpfe oder das Fenster (R2-08). Auf der Startseite schwebt sie unten.
 */
function Meldung({ imFluss = false }: { imFluss?: boolean }) {
  const m = meldung.value;
  // Erscheint die Zeile, wird der Brief niedriger: Was den Fokus hat, bleibt zu sehen.
  useLayoutEffect(() => {
    if (!imFluss || !m) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body && a.closest(".papier-rahmen")) a.scrollIntoView({ block: "nearest" });
  }, [m, imFluss]);
  if (!m) return imFluss ? <div class="meldung-platz" /> : null;
  return (
    <div class={`meldung m-${m.art}${imFluss ? " im-fluss" : ""}`} role="status">
      <span>{m.text}</span>
      {m.aktion && (
        <button
          type="button"
          class="link"
          onClick={() => {
            m.aktion!.ausfuehren();
            // Bringt die Aktion eine eigene Meldung mit („Zurückgenommen in Fall 1 …“), bleibt diese stehen.
            if (meldung.peek() === m) meldung.value = null;
          }}
        >
          {m.aktion.label}
        </button>
      )}
      {(m.art === "fehler" || m.stehend) && (
        <button type="button" class="link" onClick={() => (meldung.value = null)}>
          Schließen
        </button>
      )}
    </div>
  );
}

/**
 * Lässt der Browser das Schreiben in die Zwischenablage nicht zu, zeigt dieses
 * Fenster genau den Text, der kopiert worden wäre, fertig markiert für Strg+C.
 */
function Handkopie() {
  const h = handkopie.value;
  useFokusZurueck(h !== null);
  useEffect(() => {
    if (!h) return;
    const el = document.getElementById("handkopie") as HTMLTextAreaElement | null;
    el?.focus();
    el?.select();
  }, [h]);
  if (!h) return null;
  return (
    <div class="dialog-flaeche ueber" data-dialog onMouseDown={(e) => e.target === e.currentTarget && (handkopie.value = null)}>
      <div class="dialog-karte breit" role="dialog" aria-modal="true" aria-label="Von Hand kopieren">
        <h1>Der Browser hat das Kopieren blockiert</h1>
        <p>
          {h.was}: Der Text ist markiert. <strong>Strg+C</strong> drücken, dann im KIS einfügen. Die App vermerkt diesen Abschnitt nicht als kopiert.
        </p>
        <textarea id="handkopie" class="ff-eingabe" readOnly rows={12} value={h.text} spellcheck={false} onKeyDown={(e) => e.key === "Escape" && (handkopie.value = null)} />
        <button type="button" class="knopf primaer" onClick={() => (handkopie.value = null)}>
          Schließen
        </button>
      </div>
    </div>
  );
}

function Zugang() {
  const [code, setCode] = useState("");
  const [falsch, setFalsch] = useState(false);
  return (
    <form
      class="dialog-karte zugang"
      onSubmit={(e) => {
        e.preventDefault();
        setFalsch(!pruefeCode(code));
      }}
    >
      <h1>Kitteltext</h1>
      <label for="zugang">Zugangscode</label>
      <input id="zugang" class="ff-eingabe" type="password" autocomplete="off" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} autoFocus />
      {falsch && <p class="fehlertext">Der Code stimmt nicht.</p>}
      <button type="submit" class="knopf primaer">
        Freischalten
      </button>
    </form>
  );
}

function Hinweis() {
  // autofocus wirkt nicht, wenn der Hinweis erst nach dem Freischalten eingehängt wird (QA-09).
  const knopf = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => knopf.current?.focus(), []);
  return (
    <div class="dialog-karte">
      <h1>Kitteltext</h1>
      <p>Eine Formulierungshilfe: Sie setzt aus Textbausteinen einen Arztbrief zusammen, den du prüfst und ins KIS übernimmst.</p>
      <ul>
        <li>
          <strong>Keine Namen, keine Geburtsdaten, keine Fallnummern.</strong> Dafür gibt es keine Felder; trag sie auch nicht in freien Text ein.
        </li>
        <li>Alles bleibt in diesem Browser. Die App sendet nichts.</li>
        <li>
          <strong>Grau ist ein Vorschlag der Vorlage, schwarz ist deine Aussage.</strong> Kopiert wird nur, was du übernommen, gewählt oder geschrieben hast.
        </li>
        <li>Die App trifft keine medizinische Entscheidung. Vorlagen mit dem Vermerk „Entwurf, ungeprüft" hat noch kein Arzt freigegeben.</li>
      </ul>
      <button type="button" class="knopf primaer" ref={knopf} onClick={() => setzeEinstellung("hinweisGelesen", true)}>
        Verstanden
      </button>
    </div>
  );
}

/** Fängt Fehler beim Zeichnen ab: Statt einer weißen Seite bleibt ein Ausweg. */
class Fehlergrenze extends Component<{ children: ComponentChildren }, { fehler: boolean }> {
  state = { fehler: false };
  componentDidCatch() {
    this.setState({ fehler: true });
  }
  render() {
    if (!this.state.fehler) return this.props.children;
    return (
      <div class="dialog-flaeche">
        <div class="dialog-karte">
          <h1>Kitteltext kann die gespeicherten Fälle nicht anzeigen</h1>
          <p>Vermutlich stammen sie aus einer älteren Fassung. Die offenen Fälle dieses Fensters werden verworfen; behaltene Fälle, Einstellungen und eigene Bausteine bleiben.</p>
          <button
            type="button"
            class="knopf primaer"
            onClick={() => {
              loescheFaelle();
              location.reload();
            }}
          >
            Fälle verwerfen und neu starten
          </button>
        </div>
      </div>
    );
  }
}

/**
 * „… kopieren“ ist der letzte Halt des Durchlaufs (amEnde). Enter und Leertaste lösen ihn erst nach der Schreckzeit und
 * ohne Sperre aus; verirrter Text sperrt und wird gemeldet wie an jedem Halt (E-44, CR-TS01).
 */
/**
 * Enter und Leertaste am Knopf am Ende (Kopieren, Fall schließen) sind Befehle (E-44): erst nach der Schreckzeit, nicht
 * bei gesperrten Tasten und nie als Wiederholung einer gehaltenen Taste. Ein Buchstabe setzt dort nichts.
 */
function knopfTaste(aktion: () => void, folge: string) {
  return (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const ausloesen = e.key === "Enter" || e.key === " ";
    if (!ausloesen && (e.key.length !== 1 || e.key === " ")) return;
    e.preventDefault();
    // `folge`: was ausbleibt, wenn die Taste verworfen ist; die Meldung nennt es („Enter verworfen, Fall bleibt offen.“, MT-04).
    if (zugErlaubt(e, "", true, folge) && ausloesen) aktion();
  };
}

/**
 * Der offene Fall ist ohne Zutun zugegangen (Ablauf, anderes Fenster): Die Meldung bleibt stehen, bis jemand sie gelesen hat
 * (PS-R6-1). Sie steht über Startseite und Brief, damit sie auch nach dem Wechsel in einen anderen Reiter zu sehen ist.
 */
function StehendeMeldung() {
  const m = stehendeMeldung.value;
  if (!m) return null;
  return (
    <div class={`banner stehend ${m.art}`} role="alert" data-stehend>
      <span>{m.text}</span>{" "}
      <button type="button" class="link" onClick={() => (stehendeMeldung.value = null)}>
        Verstanden
      </button>
    </div>
  );
}

/**
 * Das Schreiben eines behaltenen Falls scheitert (CR-R6-01, H-R6-4): ein Zustand, kein einmaliger Hinweis. Das Banner steht,
 * solange es scheitert, und geht von selbst, sobald ein Schreiben gelingt (bei der nächsten Eingabe oder in der Minutenprüfung).
 * Es liegt in der Seite, nicht über Dialogen, und hat keinen Knopf, der den Fokus verlieren ließe.
 */
function Speicherfehler() {
  const offen = nichtGespeichert.value;
  if (offen.size === 0) return null;
  const jetzt = jetztImTakt();
  const liste = [...offen].map(([id, um]) => ({ kurz: eintragVon(id)?.kurz ?? faelle.value.find((f) => f.id === id)?.etikett.trim() ?? "ohne Kurzbezeichnung", um }));
  return (
    <div class="banner stehend fehler" role="alert" data-speicherfehler>
      {ungespeichertText(liste, jetzt)}
    </div>
  );
}

function istEingabe(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}

function Anwendung() {
  const [zeigeEinstellungen, setZeigeEinstellungen] = useState(false);
  useBehaltenMeldung();

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      // Hinter einem Dialog (Einstellungen, Handkopie) wirkt kein Kürzel auf den Brief.
      if (document.querySelector("[data-dialog]")) return;
      const strg = e.ctrlKey || e.metaKey;
      const briefSichtbar = aktiverFall.value !== null && sucheOffen.value === null;
      if (e.key === "F2") {
        e.preventDefault();
        // Im freien Text erst von ‹…› zu ‹…›, dann weiter zum nächsten Halt (R5-02).
        if (lueckePerF2(e)) return;
        if (briefSichtbar && !naechsteStelle(e.shiftKey)) melde({ text: "Nichts mehr zu klären.", art: "ok" }, 1500);
      } else if (strg && e.key === "Enter") {
        // In einem Eingabefeld gehört Strg+Enter dem Feld, nicht dem Kopieren.
        if (istEingabe(e) || !briefSichtbar) return;
        e.preventDefault();
        if (e.shiftKey) kopiereAlles();
        else kopiereNaechsten();
      } else if (strg && e.key.toLowerCase() === "k") {
        e.preventDefault();
        neuerFallDialog();
        document.querySelector<HTMLElement>(".suche-eingabe")?.focus();
      } else if (e.altKey && !strg && /^Digit[1-9]$/.test(e.code)) {
        // Nur die Ziffernreihe: Alt mit dem Ziffernblock gibt unter Windows Sonderzeichen ein.
        const f = faelle.value.find((x) => x.nr === Number(e.code.slice(5)));
        if (f) {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur?.();
          fallWaehlen(f.id);
        }
      } else if (e.key === "Escape" && sucheOffen.value && !offenesFeld.value) {
        sucheOffen.value = null;
      } else if (!istEingabe(e)) {
        // Auch mit offenem Fenster oder offener Liste: Nach einer Entscheidung ist oft schon der nächste Halt offen, und
        // Strg+Z soll sie sofort zurücknehmen, nicht erst nach Esc (CR-R6F-04). In einem Textfeld gehört es dem Feld.
        // Das offene Fenster geht dabei zu: Seine Ziffernreihe und seine Stelle gehören zum Stand vor dem Schritt; sonst
        // träfe die nächste Ziffer eine andere Angabe als die angezeigte, oder ein zurückgenommener Satz käme über sein
        // stehengebliebenes Fenster wieder (CR-R6C-01, CR-R6C-05). F2 öffnet die Stelle neu.
        if (strg && e.key.toLowerCase() === "z" && !e.shiftKey) {
          e.preventDefault();
          if (offenesFeld.value) schliesseFeld();
          rueckgaengig();
        } else if (strg && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
          e.preventDefault();
          if (offenesFeld.value) schliesseFeld();
          wiederholen();
        }
      }
    };
    document.addEventListener("keydown", taste);
    // Alte Fälle verfallen auch bei offenem Fenster; die Meldung kommt aus dem Store (stehend, wenn der offene Fall dabei war).
    const uhr = window.setInterval(() => verwerfeAlte(), 60_000);
    // Zurück aus dem KIS, aus dem Ruhezustand oder über „Zurück“ aus dem Seitenspeicher: sofort prüfen, nicht erst in einer Minute.
    const fokus = () => nachRueckkehr();
    const sichtbar = () => document.visibilityState === "visible" && nachRueckkehr();
    const seite = (e: PageTransitionEvent) => e.persisted && nachRueckkehr(true);
    window.addEventListener("focus", fokus);
    document.addEventListener("visibilitychange", sichtbar);
    window.addEventListener("pageshow", seite);
    return () => {
      document.removeEventListener("keydown", taste);
      window.clearInterval(uhr);
      window.removeEventListener("focus", fokus);
      document.removeEventListener("visibilitychange", sichtbar);
      window.removeEventListener("pageshow", seite);
    };
  }, []);

  // D-05: Beim allerersten Start geht die Anleitung einmal von selbst auf, nach dem Hinweis zum Zweck der App.
  const bereitFuerAnleitung = freigeschaltet.value && einstellungen.value.hinweisGelesen;
  useEffect(() => {
    if (!bereitFuerAnleitung || !anleitungVonSelbst(einstellungen.peek().anleitungGezeigt, dauerspeicherGeht())) return;
    setzeEinstellung("anleitungGezeigt", true);
    anleitungOffen.value = "selbst";
  }, [bereitFuerAnleitung]);

  if (!freigeschaltet.value) {
    return (
      <div class="dialog-flaeche">
        <Zugang />
      </div>
    );
  }
  if (!einstellungen.value.hinweisGelesen) {
    return (
      <div class="dialog-flaeche">
        <Hinweis />
      </div>
    );
  }

  const fall = aktiverFall.value;
  const zeigeStart = !fall || sucheOffen.value !== null;
  return (
    <div class={anleitungOffen.value ? "app mit-anleitung" : "app"}>
      <Kopf onEinstellungen={() => setZeigeEinstellungen(true)} />
      <StehendeMeldung />
      <Speicherfehler />
      {!speichernMoeglich.value && <div class="banner">Dieser Browser speichert nichts: Beim Schließen oder Neuladen geht der Brief verloren.</div>}
      {katalogGeaendert.value > 0 && (
        <div class="banner">
          Die Vorlagen wurden aktualisiert. In {katalogGeaendert.value} offenen {katalogGeaendert.value === 1 ? "Fall" : "Fällen"} sind Auswahlen und Befunde zurückgesetzt und neu zu treffen; eingetragener Text ist erhalten.{" "}
          <button type="button" class="link" onClick={() => (katalogGeaendert.value = 0)}>
            Verstanden
          </button>
        </div>
      )}
      {zeigeStart ? (
        <Start />
      ) : (
        <div class="arbeit">
          <main class="papier-rahmen">
            <div class="papier">
              <Fallkopf />
              <Einstieg />
              <Brief />
            </div>
          </main>
          <Meldung imFluss />
          <Pruefleiste />
          <Feldfenster />
        </div>
      )}
      {zeigeStart && <Meldung />}
      <Handkopie />
      <KurzDialog />
      {anleitungOffen.value && <Anleitung />}
      {zeigeEinstellungen && <Einstellungen onZu={() => setZeigeEinstellungen(false)} />}
    </div>
  );
}

export function App() {
  return (
    <Fehlergrenze>
      <Anwendung />
    </Fehlergrenze>
  );
}
