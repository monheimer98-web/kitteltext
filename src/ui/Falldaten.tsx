// Falldaten im Fallkopf (E-58): Aufnahme, Operation, weitere Operation, Entlassung. Ein Datum, das hier steht, setzt
// jede Stelle des Briefs ein, die danach fragt; fehlt es, steht dort der Platzhalter fürs KIS. Errechnete Daten hinter
// Fristen (E-59) bleiben grau, bis der Arzt sie übernimmt.

import { useState } from "preact/hooks";
import type { Fall, FalldatumArt } from "../model/types.ts";
import { leseDatum, wochentag } from "../engine/datum.ts";
import { falldatenHinweise, fristDatum } from "../engine/falldaten.ts";
import { mitBaustein, mitFalldatum, mitFrist, mitWert } from "../engine/fall.ts";
import type { BriefAnsicht } from "../engine/render.ts";
import type { Token } from "../engine/text.ts";
import { FALLDATUM_NAME, WEITERE_OP_BAUSTEIN } from "../data/falldaten.ts";
import { INDEX, aendere, aktiverFall, brief } from "../store.ts";
import { nachDemZeichnen } from "./fokus.ts";
import { melde } from "./kopieren.ts";

const HILFE = "TT.MM. genügt, auch „heute“ oder „gestern“";

/** Datumsangaben, die der Fallkopf dieses Briefs zeigt: Aufnahme und Entlassung immer, OP nur, wenn der Brief danach fragt. */
export function sichtbareFalldaten(fall: Fall, b: BriefAnsicht | null): FalldatumArt[] {
  const gebraucht = new Set(b?.abschnitte.filter((a) => !a.ausgeblendet).flatMap((a) => a.tokens.map((t) => t.falldatum)) ?? []);
  const aus: FalldatumArt[] = ["aufnahme"];
  if (gebraucht.has("op") || fall.daten.op) aus.push("op");
  if (gebraucht.has("op2") || fall.daten.op2) aus.push("op2");
  aus.push("entlassung");
  return aus;
}

function heute(): string {
  return leseDatum("heute") ?? "";
}

/**
 * Datumsfeld mit Vorschau: Was der Arzt tippt, liest die App erst bei Enter, Tab oder beim Verlassen des Felds; bis
 * dahin zeigt sie daneben, was sie verstanden hat („Do 12.11.2026“). Unlesbares bleibt stehen und wird nicht gesetzt.
 */
export function DatumEingabe(p: {
  id: string;
  wert: string | undefined;
  name: string;
  onSetze: (datum: string | undefined) => void;
  klasse?: string;
  autoFocus?: boolean;
  /** Nach Enter oder Tab, wenn das Datum gelesen ist (im Feldfenster: weiter zur nächsten Stelle) */
  onFertig?: () => void;
}) {
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [fehler, setFehler] = useState(false);
  const text = entwurf ?? p.wert ?? "";
  const gelesen = entwurf !== null && entwurf.trim() ? leseDatum(entwurf) : null;
  /** true, wenn nichts mehr zu lesen bleibt */
  const uebernimm = (): boolean => {
    if (entwurf === null) return true;
    const t = entwurf.trim();
    if (t === "") {
      p.onSetze(undefined);
    } else {
      const datum = leseDatum(t);
      if (!datum) {
        setFehler(true);
        return false;
      }
      p.onSetze(datum);
    }
    setEntwurf(null);
    setFehler(false);
    return true;
  };
  const vorschau = entwurf !== null && entwurf.trim() ? (gelesen ? `${wochentag(gelesen).slice(0, 2)} ${gelesen}` : fehler ? "nicht erkannt" : "…") : p.wert ? wochentag(p.wert).slice(0, 2) : "";
  return (
    <>
      <input
        id={p.id}
        spellcheck={false}
        autocomplete="off"
        type="text"
        inputMode="text"
        maxLength={12}
        class={`${p.klasse ?? "fk-eingabe"} fd-eingabe${fehler ? " fd-fehler" : ""}`}
        value={text}
        placeholder="TT.MM."
        aria-label={p.name}
        aria-invalid={fehler || undefined}
        aria-describedby={`${p.id}-vorschau ${p.id}-hilfe`}
        title={HILFE}
        ref={(el) => {
          if (el && p.autoFocus && !el.dataset.fokus) {
            el.dataset.fokus = "1";
            el.focus();
            el.select();
          }
        }}
        // Wer mit Tab oder Klick ins Feld kommt, überschreibt das Datum, statt mitten hinein zu tippen. Beim Klick setzt
        // das Loslassen der Maus sonst die Schreibmarke und hebt die Markierung auf; ein zweiter Klick setzt sie.
        onFocus={(e) => {
          const el = e.target as HTMLInputElement;
          el.select();
          el.dataset.frisch = "1";
        }}
        onMouseUp={(e) => {
          const el = e.target as HTMLInputElement;
          if (el.dataset.frisch) e.preventDefault();
          delete el.dataset.frisch;
        }}
        onKeyUp={(e) => delete (e.target as HTMLInputElement).dataset.frisch}
        onInput={(e) => {
          setEntwurf((e.target as HTMLInputElement).value);
          setFehler(false);
        }}
        onBlur={() => uebernimm()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (e.repeat) return;
            if (uebernimm()) p.onFertig?.();
          } else if (e.key === "Tab" && !e.shiftKey && p.onFertig) {
            e.preventDefault();
            if (uebernimm()) p.onFertig();
          } else if (e.key === "Escape" && entwurf !== null) {
            // Erst den Entwurf verwerfen; ein zweites Escape schließt, was sonst schließt.
            e.preventDefault();
            e.stopPropagation();
            setEntwurf(null);
            setFehler(false);
          } else if (entwurf === null && p.wert && e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
            // Steht ein gesetztes Datum im Feld, beginnt das erste Zeichen ein neues, wo immer die Schreibmarke steht:
            // Hineintippen ergäbe „04.116..2026“. Korrigieren geht mit der Rücktaste.
            e.preventDefault();
            setEntwurf(e.key);
            setFehler(false);
          }
        }}
      />
      <span id={`${p.id}-hilfe`} class="nur-vorlesen">
        {HILFE}
      </span>
      <span id={`${p.id}-vorschau`} class={fehler ? "fd-vorschau fd-fehler-text" : "fd-vorschau"} aria-live="polite">
        {fehler ? "nicht erkannt" : vorschau}
      </span>
    </>
  );
}

/** Zeile der Falldaten im Fallkopf eines Stationsbriefs. */
export function Falldaten() {
  const fall = aktiverFall.value!;
  const b = brief.value;
  const arten = sichtbareFalldaten(fall, b);
  const hinweise = falldatenHinweise(fall.daten, heute(), (a) => FALLDATUM_NAME[a].lang);
  const weitereOp = arten.includes("op") && !arten.includes("op2") && INDEX.bausteine.has(WEITERE_OP_BAUSTEIN);
  return (
    <div class="fd-zeile" role="group" aria-label="Daten des Aufenthalts">
      {arten.map((art) => (
        <div class="fk-feld fd-feld" data-falldatum={art}>
          <label class="fk-label" for={`fd-${art}`} title={FALLDATUM_NAME[art].lang}>
            {FALLDATUM_NAME[art].kurz}
          </label>
          <DatumEingabe id={`fd-${art}`} wert={fall.daten[art]} name={FALLDATUM_NAME[art].lang} onSetze={(d) => aendere((f) => mitFalldatum(f, art, d), `falldatum:${art}`)} />
        </div>
      ))}
      {weitereOp && (
        <button
          type="button"
          class="link fd-weitere"
          title="Nimmt den Baustein „Weitere Operation“ in die Therapie auf; sein Datum steht dann hier."
          onClick={() => {
            aendere((f) => mitBaustein(f, WEITERE_OP_BAUSTEIN, INDEX, "therapie"));
            nachDemZeichnen(() => document.getElementById("fd-op2")?.focus());
          }}
        >
          + weitere OP
        </button>
      )}
      {hinweise.length > 0 && (
        <p class="fd-hinweis" role="status">
          {hinweise.join(" ")}
        </p>
      )}
    </div>
  );
}

/** Im Feldfenster einer Stelle, die ein Datum des Fallkopfs einsetzt: Das Datum gilt für den ganzen Brief. */
export function FalldatumEditor({ k, art, fertig }: { k: string; art: FalldatumArt; fertig: () => void }) {
  const fall = aktiverFall.value!;
  const name = FALLDATUM_NAME[art];
  return (
    <>
      <div class="ff-zeile">
        <div class="ff-label">{name.lang} · gilt für den ganzen Brief</div>
        <DatumEingabe id={`ff-${art}`} klasse="ff-eingabe" wert={fall.daten[art]} name={name.lang} autoFocus onSetze={(d) => aendere((f) => mitFalldatum(f, art, d), `falldatum:${art}`)} onFertig={fertig} />
      </div>
      <p class="ff-hinweis">
        Steht auch im Fallkopf. {HILFE}.{" "}
        {fall.daten[art] ? "" : `Ohne Datum bleibt [${name.lang.toUpperCase()}] im Text, wird mitkopiert und steht unter „Im KIS zu ergänzen“.`}
      </p>
      {fall.werte[k] !== undefined && <EigenesDatum k={k} wert={fall.werte[k]} />}
    </>
  );
}

/** Ein an dieser Stelle eigens eingetragenes Datum (Fall von vorher) geht dem Fallkopf vor, bis der Arzt es löst. */
function EigenesDatum({ k, wert }: { k: string; wert: string }) {
  return (
    <div class="ff-vorschlag">
      <span>Hier steht ein eigenes Datum: {wert || "leer"}</span>
      <button
        type="button"
        class="knopf klein"
        onClick={() => {
          aendere((f) => mitWert(f, k, undefined));
          melde({ text: "Die Stelle verwendet jetzt das Datum aus dem Fallkopf.", art: "ok" });
        }}
      >
        Datum aus dem Fallkopf verwenden
      </button>
    </div>
  );
}

/**
 * Daten in Klammern hinter Fristen dieser Stelle (E-59): woraus sie errechnet sind, Übernehmen oder ohne Datum. Auch
 * ein weggelassenes Datum steht hier, damit es sich zurückholen lässt.
 */
export function FristZeilen({ token, onUebernommen }: { token: Token | undefined; onUebernommen: () => void }) {
  const fall = aktiverFall.value!;
  const fristen = token?.fristen ?? [];
  const weggelassen = token?.ohneFrist ?? [];
  if (fristen.length === 0 && weggelassen.length === 0) return null;
  return (
    <div class="ff-fristen">
      {fristen.map((f) => (
        <div class="ff-vorschlag ff-frist" data-frist-zeile={f.key}>
          <span>
            {f.zustand === "gesetzt" ? "Datum übernommen: " : "Errechnetes Datum: "}
            <strong>{f.datum}</strong>, {wochentag(f.datum)} ({FALLDATUM_NAME[f.anker].lang}
            {f.tage === 0 ? "" : ` + ${f.tage} ${f.tage === 1 ? "Tag" : "Tage"}`})
          </span>
          {f.zustand === "vorschlag" && (
            <button
              type="button"
              class="knopf primaer klein"
              data-taste="ü"
              aria-keyshortcuts="Ü"
              onClick={() => {
                aendere((x) => mitFrist(x, f.key, f.datum));
                onUebernommen();
              }}
            >
              Übernehmen ✓
            </button>
          )}
          <button type="button" class="knopf leise klein" onClick={() => aendere((x) => mitFrist(x, f.key, ""))}>
            ohne Datum
          </button>
        </div>
      ))}
      {weggelassen.map((key) => (
        <div class="ff-vorschlag ff-frist">
          <span>Datum in Klammern weggelassen ({fristDatum(fall, key)}).</span>
          <button type="button" class="knopf leise klein" onClick={() => aendere((x) => mitFrist(x, key, undefined))}>
            wieder vorschlagen
          </button>
        </div>
      ))}
    </div>
  );
}
