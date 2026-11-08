import { Component } from "preact";
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Fall, Seite, Setting, Vorlage } from "../model/types.ts";
import { fallName, mitPerson } from "../engine/fall.ts";
import { renderBrief, sichtbareAbschnitte } from "../engine/render.ts";
import type { AbschnittAnsicht } from "../engine/render.ts";
import {
  ABLAUF_STUNDEN,
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
  fallSchliessen,
  fallWaehlen,
  fallWiederherstellen,
  kannVor,
  kannZurueck,
  katalogGeaendert,
  setting,
  setzeEinstellung,
  speichernMoeglich,
  sucheOffen,
  vor,
  vorlageAnwenden,
  zurueck,
} from "../store.ts";
import { loescheFaelle } from "../speicher.ts";
import { freigeschaltet, pruefeCode } from "../access.ts";
import { Brief, STATUS_TEXT } from "./Brief.tsx";
import { Feldfenster, PersonWahl, PillenText, SEITEN, SEITE_NAME, enterWaehltNur } from "./Feldfenster.tsx";
import { Regionenliste, Schnellwahl, Vorlagensuche } from "./Vorlagensuche.tsx";
import { Einstellungen } from "./Einstellungen.tsx";
import {
  alterInWorten,
  ausstehend,
  handkopie,
  kopiereAlles,
  kopiereNaechsten,
  letzteKopie,
  naechsteStelle,
  offeneListe,
  offenesFeld,
  raeumeArbeitsplatz,
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
import { useFokusZurueck } from "./fokus.ts";

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

function Kopf({ onEinstellungen }: { onEinstellungen: () => void }) {
  const [raeumen, setRaeumen] = useState(false);
  return (
    <header class="kopf">
      <div class="marke-name">Kitteltext</div>
      <nav class="reiter" aria-label="Offene Fälle">
        {faelle.value.map((f) => {
          const aktiv = f.id === aktivId.value && !sucheOffen.value;
          const stand = fallStand(f);
          const alter = alterInWorten(f);
          return (
            <div class={aktiv ? "reiter-eintrag aktiv" : "reiter-eintrag"}>
              <button
                type="button"
                class="reiter-knopf"
                aria-current={aktiv}
                onClick={() => fallWaehlen(f.id)}
                title={`Fall ${f.nr} · ${fallName(f, INDEX)} · begonnen ${uhrzeit(f.erstellt)}${stand.text ? ` · ${stand.text}` : ""}${f.nr <= 9 ? ` (Alt+${f.nr})` : ""}`}
              >
                <span class="reiter-nr">{f.nr}</span>
                <span class="reiter-name">
                  {fallName(f, INDEX)}
                  {f.etikett && <em> · {f.etikett}</em>}
                </span>
                <span class={alter ? "reiter-zeit alt" : "reiter-zeit"}>{alter || uhrzeit(f.erstellt)}</span>
                {stand.zeichen && <span class={`reiter-stand r-${stand.art}`}>{stand.zeichen}</span>}
              </button>
              <button
                type="button"
                class="reiter-zu"
                aria-label={`Fall ${f.nr} schließen`}
                title="Fall schließen"
                onClick={() => {
                  fallSchliessen(f.id);
                  melde({ text: `Fall ${f.nr} geschlossen.`, art: "ok", aktion: { label: "Rückgängig", ausfuehren: fallWiederherstellen } });
                }}
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
          ↶
        </button>
        <button type="button" class="knopf leise icon" disabled={!kannVor.value} onClick={wiederholen} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
          ↷
        </button>
        {faelle.value.length > 0 &&
          (raeumen ? (
            <span class="kopf-frage">
              Alle {faelle.value.length} Fälle löschen?
              <button
                type="button"
                class="knopf gefahr klein"
                onClick={() => {
                  raeumeArbeitsplatz();
                  setRaeumen(false);
                  melde({ text: "Arbeitsplatz geräumt: alle Fälle gelöscht, Zwischenablage überschrieben. Eigene Bausteine bleiben.", art: "ok" }, 5000);
                }}
              >
                Ja, räumen
              </button>
              <button type="button" class="knopf leise klein" onClick={() => setRaeumen(false)}>
                Nein
              </button>
            </span>
          ) : (
            <button type="button" class="knopf leise" onClick={() => setRaeumen(true)} title="Vor dem Verlassen des Rechners: löscht alle offenen Fälle und überschreibt die Zwischenablage">
              Arbeitsplatz räumen
            </button>
          ))}
        <button type="button" class="knopf leise" onClick={onEinstellungen}>
          Einstellungen
        </button>
      </div>
    </header>
  );
}

/** Drei Sätze für den ersten Brief. Verschwindet mit „Verstanden“ oder nach dem ersten Kopieren. */
function Einstieg() {
  if (einstellungen.value.tippGesehen) return null;
  return (
    <div class="einstieg" role="note">
      <p>
        <strong>So geht es:</strong> <kbd>F2</kbd> führt Stelle für Stelle durch den Brief. <span class="marke marke-offen">● Gelb</span> fehlt noch: Ziffer wählen oder tippen.{" "}
        <span class="marke marke-vorschlag">○ Grau</span> schlägt die Vorlage vor: lesen, dann mit <kbd>Ü</kbd> übernehmen oder ändern. <kbd>Enter</kbd> allein setzt nie etwas. Ist ein Abschnitt fertig,
        kopiert ihn <kbd>Strg</kbd>+<kbd>Enter</kbd> fürs KIS.
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
  return (
    <div class="fallkopf">
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
        </div>
        <div class="fk-neben">
          <span class="fk-typ">
            {typ?.setting === "station" ? "Entlassbrief" : "Ambulanzbrief"} · seit {uhrzeit(fall.erstellt)}
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
        </div>
      </div>
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
        <div class="fk-feld fk-merker">
          <input
            spellcheck={false}
            autocomplete="off"
            id="fk-etikett"
            class="fk-eingabe"
            type="text"
            maxLength={14}
            value={fall.etikett}
            placeholder="Merker, z. B. Kabine 3"
            aria-label="Merker für diesen Fall (kein Patientenname)"
            title="Nur zum Wiederfinden im Reiter. Keinen Namen eintragen."
            onInput={(e) => aendere((f) => ({ ...f, etikett: (e.target as HTMLInputElement).value }), "etikett")}
          />
        </div>
      </div>
    </div>
  );
}

function abschnittStand(a: AbschnittAnsicht): { zeichen: string; text: string; art: string } {
  if (a.leer) return a.kopiert ? { zeichen: "!", text: "kopiert, jetzt leer", art: "offen" } : { zeichen: "·", text: "leer", art: "leer" };
  if (a.offen > 0) return { zeichen: "●", text: `${a.offen} offen`, art: "offen" };
  if (a.vorschlag > 0) return { zeichen: "○", text: `${a.vorschlag} grau`, art: "vorschlag" };
  if (a.geaendertSeitKopie) return { zeichen: "↻", text: "seit Kopie geändert", art: "geaendert" };
  if (a.kopiert) return { zeichen: "✓", text: `kopiert ${a.kopiertUm ? uhrzeit(a.kopiertUm) : ""}`, art: "fertig" };
  return { zeichen: "→", text: "fertig zum Kopieren", art: "bereit" };
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
  const schliessen = () => {
    fallSchliessen(fall.id);
    const offenImKis = b.spaeter.length > 0 ? ` Im KIS noch zu ergänzen: ${b.spaeter.map((p) => `[${p.label.toUpperCase()}]`).join(", ")}.` : "";
    melde({ text: `Fall ${fall.nr} geschlossen.${offenImKis}`, art: b.spaeter.length > 0 ? "warnung" : "ok", aktion: { label: "Rückgängig", ausfuehren: fallWiederherstellen } });
  };
  // Derselbe Knopf behält beim Wechsel den Fokus; was Enter dort tut, ist neu (R2-05).
  const warAlles = useRef(alleKopiert);
  useLayoutEffect(() => {
    if (alleKopiert && !warAlles.current) zugKnopfGewechselt();
    warAlles.current = alleKopiert;
  }, [alleKopiert]);
  return (
    <aside class="pruefleiste" aria-label="Prüfen und kopieren">
      <button type="button" class={zuKlaeren > 0 ? "knopf breit f2" : "knopf breit f2 ruhig"} disabled={zuKlaeren === 0} onClick={() => naechsteStelle()}>
        <span>
          {zuKlaeren > 0 ? `Nächste Stelle${b.offen > 0 ? ` · ● ${b.offen} offen` : ""}${b.vorschlag > 0 ? ` · ○ ${b.vorschlag} grau` : ""}` : "Nichts mehr zu klären"}
        </span>
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
                <span class="gl-titel">{a.titel}</span>
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
            <span>Alles kopiert · Fall schließen</span>
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
          <span>Ganzen Brief kopieren</span>
          <kbd>Strg+⇧+↵</kbd>
        </button>
      </div>

      {kopie && (
        <div class="letzte-kopie" aria-live="polite">
          <div class="lk-kopf">Zuletzt kopiert · {uhrzeit(kopie.um)}</div>
          <div>
            {kopie.was} · {kopie.fall}
          </div>
          <div class="lk-text">„{kopie.anfang}…"</div>
          <div class="lk-fuss">
            {kopie.zeichen} Zeichen{kopie.platzhalter > 0 && ` · ${kopie.platzhalter} Platzhalter fürs KIS`}
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
      {m.art === "fehler" && (
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
          <p>Vermutlich stammen sie aus einer älteren Fassung. Die offenen Fälle dieses Fensters werden verworfen, Einstellungen und eigene Bausteine bleiben.</p>
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

function istEingabe(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}

function Anwendung() {
  const [zeigeEinstellungen, setZeigeEinstellungen] = useState(false);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      // Hinter einem Dialog (Einstellungen, Handkopie) wirkt kein Kürzel auf den Brief.
      if (document.querySelector("[data-dialog]")) return;
      const strg = e.ctrlKey || e.metaKey;
      const briefSichtbar = aktiverFall.value !== null && sucheOffen.value === null;
      if (e.key === "F2") {
        e.preventDefault();
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
      } else if (!istEingabe(e) && !offenesFeld.value && !offeneListe.value) {
        if (strg && e.key.toLowerCase() === "z" && !e.shiftKey) {
          e.preventDefault();
          rueckgaengig();
        } else if (strg && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
          e.preventDefault();
          wiederholen();
        }
      }
    };
    document.addEventListener("keydown", taste);
    // Alte Fälle verfallen auch bei offenem Fenster.
    const uhr = window.setInterval(() => {
      const n = verwerfeAlte();
      if (n > 0) melde({ text: `${n} ${n === 1 ? "Fall wurde" : "Fälle wurden"} nach langer Ruhe verworfen (Notaufnahme ${ABLAUF_STUNDEN.zna} Std., Station ${ABLAUF_STUNDEN.station} Std.).`, art: "warnung" }, 8000);
    }, 60_000);
    return () => {
      document.removeEventListener("keydown", taste);
      window.clearInterval(uhr);
    };
  }, []);

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
    <div class="app">
      <Kopf onEinstellungen={() => setZeigeEinstellungen(true)} />
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
