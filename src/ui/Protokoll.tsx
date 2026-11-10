// Kasten „Standardprotokoll“ zuoberst im Procedere einer Stationsvorlage (E-49, E-52, E-54). Je Variante: Titel, graue
// Vorschau zum Aufklappen (steht nicht im Brief, lässt sich nicht markieren) und „Übernehmen“. Übernommene Zeilen stehen
// schwarz im Brief; was das Protokoll ersetzt, tritt zurück und kommt beim Entfernen so wieder, wie es war.
//
// Der Kasten ist kein Halt: F2 hält hier nicht, er hält nichts auf, Tab und Maus erreichen ihn. Übernehmen und Entfernen
// lösen nur ein Klick oder Enter bzw. Leertaste auf dem Knopf aus, den der Arzt selbst markiert hat (E-43 (1)); innerhalb
// von `.papier` gilt dafür der Tipp-Zug (Schreckzeit, Sperre). Kein Sprung legt den Fokus auf einen dieser Knöpfe.

import { useState } from "preact/hooks";
import type { Fall, Protokoll } from "../model/types.ts";
import type { AbschnittAnsicht } from "../engine/render.ts";
import type { Token } from "../engine/text.ts";
import { sicherZuruecknehmen } from "../engine/fall.ts";
import { ersteProtokollLuecke, mitProtokoll, mitZusatzzeile, ohneProtokoll, protokollImFall, protokolleFuer, titelOhnePraefix, verdraengteStellen, vorschauZeile, zusatzId } from "../engine/protokoll.ts";
import { INDEX, aendere, aendereFall, aktiverFall, brief, faelle, katalogStand } from "../store.ts";
import { melde } from "./kopieren.ts";
import { hebeHervor, oeffneFeld } from "./aktionen.ts";
import { nachDemZeichnen } from "./fokus.ts";

function procedereTokens(): Token[] {
  return brief.peek()?.abschnitte.find((a) => a.id === "procedere")?.tokens ?? [];
}

/** Nach Übernehmen ohne Lücke, nach Entfernen und Rückgängig: Fokus auf den Kasten, nie auf einen seiner Knöpfe. */
function fokusKasten() {
  nachDemZeichnen(() => document.querySelector<HTMLElement>("[data-protokoll-kasten]")?.focus({ preventScroll: true }));
}

function zitiert(namen: string[]): string {
  return namen.map((n) => `„${n}“`).join(", ");
}

/**
 * „Rückgängig“ in der Meldung, nur in die sichere Richtung (E-48): Ein eben übernommenes Protokoll geht ganz zurück;
 * ein entferntes oder ersetztes kommt grau wieder, nicht als Aussage.
 */
function rueckgaengig(fallId: string, vorher: Fall, nachher: Fall, was: string) {
  return () => {
    const jetzt = faelle.peek().find((f) => f.id === fallId);
    if (!jetzt) return melde({ text: "Nichts zurückzunehmen: Der Fall ist geschlossen.", art: "ok" });
    const zurueck = sicherZuruecknehmen(jetzt, [{ vorher, nachher }]).fall;
    if (zurueck === jetzt) return melde({ text: "Nichts zurückzunehmen: Die Stelle ist inzwischen geändert.", art: "ok", fallId });
    aendereFall(fallId, () => zurueck);
    const wieder = protokollImFall(zurueck, INDEX);
    const grau = wieder ? ` „${wieder.variante}“ steht grau im Brief; Ü übernimmt.` : "";
    melde({ text: `Zurückgenommen: ${was}.${grau}`, art: "ok", fallId });
    if (aktiverFall.peek()?.id === fallId) fokusKasten();
  };
}

function Variante({ p, aktiv, anderes, name, fall, tokens }: { p: Protokoll; aktiv: boolean; anderes: Protokoll | undefined; name: (p: Protokoll) => string; fall: Fall; tokens: Token[] }) {
  const [offen, setOffen] = useState(false);
  // Zusatzzeilen vor dem Übernehmen; danach gilt, was im Fall steht.
  const [vorab, setVorab] = useState<number[]>([]);
  const titelId = `pk-titel-${p.id}`;
  const vorschauId = `pk-vorschau-${p.id}`;
  const imBrief = new Set(tokens.filter((t) => t.bausteinId === p.id && t.key).map((t) => t.key!));

  const uebernehmen = () => {
    const vorher = aktiverFall.peek();
    if (!vorher) return;
    const tokensVorher = procedereTokens();
    aendere((f) => mitProtokoll(f, p.id, INDEX, vorab));
    const nachher = aktiverFall.peek();
    if (!nachher || nachher === vorher) return;
    setOffen(false);
    setVorab([]);
    const tokens = procedereTokens();
    hebeHervor(tokens.filter((t) => t.bausteinId === p.id && t.key).map((t) => t.key!));
    const weg = verdraengteStellen(tokensVorher, vorher, nachher, INDEX);
    const was = anderes ? `${name(p)} statt „${anderes.variante}“` : name(p);
    melde(
      {
        text: `Übernommen: ${was}.${weg.length > 0 ? ` Dafür nicht mehr im Brief: ${zitiert(weg)}.` : ""}`,
        art: "ok",
        fallId: vorher.id,
        aktion: { label: "Rückgängig", ausfuehren: rueckgaengig(vorher.id, vorher, nachher, name(p)) },
      },
      10000,
    );
    // Fehlt eine Angabe (Gehhilfe, Region), geht es gleich in ihr Fenster, im selben Ereignis wie bei „+ …“ (PS-K06).
    const luecke = ersteProtokollLuecke(tokens, p.id);
    if (luecke) oeffneFeld({ key: luecke, art: "option", abschnitt: "procedere" });
    else fokusKasten();
  };

  const entfernen = () => {
    const vorher = aktiverFall.peek();
    if (!vorher) return;
    aendere((f) => ohneProtokoll(f, p.id));
    const nachher = aktiverFall.peek();
    if (!nachher || nachher === vorher) return;
    const wieder = verdraengteStellen(procedereTokens(), nachher, vorher, INDEX);
    melde(
      {
        text: `Entfernt: ${name(p)}.${wieder.length > 0 ? ` Wieder im Brief: ${zitiert(wieder)}.` : ""}`,
        art: "ok",
        fallId: vorher.id,
        aktion: { label: "Rückgängig", ausfuehren: rueckgaengig(vorher.id, vorher, nachher, `Entfernen von ${name(p)}`) },
      },
      10000,
    );
    fokusKasten();
  };

  const zusatzUmschalten = (i: number) => {
    if (aktiv) {
      const drin = imBrief.has(`${p.id}/${zusatzId(i)}`);
      aendere((f) => mitZusatzzeile(f, p.id, i, !drin));
    } else {
      setVorab((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i].sort((a, b) => a - b)));
    }
  };

  return (
    <li class={`pk-variante${aktiv ? " aktiv" : ""}`} data-protokoll={p.id}>
      <div class="pk-zeile">
        <span class="pk-titel" id={titelId}>
          {titelOhnePraefix(p)}
        </span>
        {aktiv ? (
          <>
            <span class="pk-im-brief">
              <span aria-hidden="true">✓ </span>im Brief
            </span>
            {/* Eigener Schlüssel: Preact soll den Knopf „Übernehmen“ nicht zu „Entfernen“ umbauen, während er den Fokus hat. */}
            <button key="entfernen" type="button" class="knopf leise klein" data-pk="entfernen" aria-describedby={titelId} onClick={entfernen}>
              Entfernen
            </button>
          </>
        ) : (
          <>
            <button type="button" class="knopf leise klein" data-pk="vorschau" aria-expanded={offen} aria-controls={vorschauId} aria-describedby={titelId} onClick={() => setOffen(!offen)}>
              {offen ? "Vorschau schließen" : "Vorschau"}
            </button>
            <button key="uebernehmen" type="button" class="knopf klein" data-pk="uebernehmen" aria-describedby={titelId} onClick={uebernehmen}>
              {anderes ? "Stattdessen übernehmen" : "Übernehmen"}
            </button>
          </>
        )}
      </div>
      {!aktiv && offen && (
        <div class="pk-vorschau" id={vorschauId}>
          <div class="pk-hinweis">Vorschau, steht nicht im Brief</div>
          <ul>
            {p.zeilen.map((z) => (
              <li>{vorschauZeile(p, z, fall)}</li>
            ))}
          </ul>
        </div>
      )}
      {p.zusatz.length > 0 && (aktiv || offen) && (
        <div class="pk-zusatz" role="group" aria-label={`Zusatzzeilen zu ${titelOhnePraefix(p)}`}>
          <div class="pk-hinweis">{aktiv ? "Zusatzzeilen, einzeln in den Brief" : "Zusatzzeilen, mit übernehmen"}</div>
          {p.zusatz.map((z, i) => {
            const an = aktiv ? imBrief.has(`${p.id}/${zusatzId(i)}`) : vorab.includes(i);
            return (
              <button type="button" class="pk-haken" role="checkbox" aria-checked={an} data-pk="zusatz" data-nr={i} onClick={() => zusatzUmschalten(i)}>
                <span class="pk-kaestchen" aria-hidden="true">
                  {an ? "✓" : ""}
                </span>
                <span>{vorschauZeile(p, z, fall)}</span>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

/** Steht zuoberst im Procedere, wenn die Vorlage des Falls Standardprotokolle hat; sonst nichts. */
export function Protokollkasten({ a }: { a: AbschnittAnsicht }) {
  katalogStand.value;
  const fall = aktiverFall.value;
  if (!fall || a.id !== "procedere") return null;
  const liste = protokolleFuer(fall, INDEX);
  if (liste.length === 0) return null;
  const aktiv = protokollImFall(fall, INDEX);
  const name = (p: Protokoll) => (liste.length > 1 ? `Standardprotokoll „${p.variante}“` : "Standardprotokoll");
  // Der Kasten selbst setzt nichts. Enter und Leertaste auf ihm sagen, wie es geht, statt still nichts zu tun.
  const taste = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      melde({ text: "Enter übernimmt hier nichts. Tab führt zu „Übernehmen“, F2 zur nächsten Stelle.", art: "ok" });
    }
  };
  return (
    <section class="protokoll" data-protokoll-kasten tabIndex={-1} aria-labelledby="pk-ueberschrift" onKeyDown={taste}>
      <div class="pk-kopf">
        <h3 id="pk-ueberschrift">Standardprotokoll</h3>
        <span class="pk-quelle">{liste[0].quelle}</span>
      </div>
      {liste.length > 1 && <div class="pk-hinweis">{aktiv ? "Eine andere Variante ersetzt die übernommene." : "Eine Variante wählen:"}</div>}
      <ul class="pk-liste" aria-label={liste.length > 1 ? "Varianten" : undefined}>
        {liste.map((p) => (
          <Variante key={p.id} p={p} aktiv={aktiv?.id === p.id} anderes={aktiv && aktiv.id !== p.id ? aktiv : undefined} name={name} fall={fall} tokens={a.tokens} />
        ))}
      </ul>
    </section>
  );
}
