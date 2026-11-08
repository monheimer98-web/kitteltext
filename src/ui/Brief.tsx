// Der Brief als Arbeitsfläche: Abschnitte mit anklickbaren Textstellen.
// Grau steht, was die Vorlage vorschlägt; schwarz, was der Arzt übernommen,
// gewählt oder eingetragen hat. Kopiert wird nur ein Abschnitt ohne Grau und
// ohne Lücken.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { AbschnittId, Baustein, BefundStatus, Pruefstatus, Segment } from "../model/types.ts";
import { abschnittVon, schluessel } from "../model/types.ts";
import { istWahlbefund } from "../engine/render.ts";
import type { AbschnittAnsicht, AusEintrag } from "../engine/render.ts";
import type { Token } from "../engine/text.ts";
import {
  mitAusgeblendet,
  mitAuswahl,
  mitBaustein,
  mitBefund,
  mitManuell,
  mitOption,
  mitSlot,
  mitVersteckt,
  mitWert,
  mitZusatz,
  ohneBaustein,
} from "../engine/fall.ts";
import { normalisiere } from "../engine/suche.ts";
import { bausteinStand, sammelAussagen, sammelSchritte } from "../engine/sammel.ts";
import { INDEX, abgleich, aendere, aendereFall, aktiverFall, brief, eigenenBausteinSpeichern, einstellungen, katalogStand, zurueck } from "../store.ts";
import { melde } from "./kopieren.ts";
import {
  beiKopieAusBrief,
  blindesZeichen,
  frischeStellen,
  hebeHervor,
  klaere,
  kopiereAbschnitt,
  naechsteStelle,
  oeffneFeld,
  offeneListe,
  offenesFeld,
  sammelangabeSetzen,
  sammelErledigt,
  schliesseListe,
  stellenZustand,
  uebernimmMitMeldung,
  uhrzeit,
  zugErlaubt,
} from "./aktionen.ts";
import { nachDemZeichnen } from "./fokus.ts";
import { EigenerWortlaut, Eingabe, Pillen, Slots, anzeige } from "./Feldfenster.tsx";
import { entwurfEigenerBaustein } from "../engine/eigen.ts";
import { aufzaehlen } from "../engine/aenderung.ts";

export const STATUS_TEXT: Record<Pruefstatus, string> = {
  hausstandard: "Standardtext",
  geprueft: "ärztlich geprüft",
  entwurf: "Entwurf, ungeprüft",
  eigen: "eigener Text, ungeprüft",
};

const ZUSTAND_TEXT: Record<string, string> = {
  offen: "fehlt noch",
  vorschlag: "Vorschlag der Vorlage, noch nicht übernommen",
  spaeter: "Platzhalter fürs KIS",
  ok: "unauffällig, bestätigt",
  abw: "auffällig",
  gesetzt: "",
};

/** Was an einer offenen Stelle steht: die Bezeichnung der Lücke oder der Satz mit Auslassungspunkten. */
function offeneAnzeige(kern: string, label: string | undefined): string {
  const einzeln = /^‹([^›]*)›[.,;:!?]?$/.exec(kern);
  if (einzeln) return einzeln[1];
  const mitPunkten = kern.replace(/‹[^›]*›/g, "…").replace(/…(\s*…)+/g, "…");
  // Beginnt der Satz mit der Lücke, sagt erst die Bezeichnung, worum es geht.
  return kern.startsWith("‹") && label ? `${label}: ${mitPunkten}` : mitPunkten;
}

function TokenAnsicht({ t, abschnitt }: { t: Token; abschnitt: AbschnittId }) {
  if (!t.key || t.art === "fix" || t.art === "zusatz" || t.art === "manuell") {
    return <span class={t.art === "zusatz" ? "tok-zusatz" : undefined}>{t.t}</span>;
  }
  const key = t.key;
  const offen = offenesFeld.value?.key === key || offeneListe.value?.key === key;
  // Ein Klick öffnet nur die Auswahl. Kein einzelner Klick ändert den Inhalt des Briefs.
  const oeffne = () => oeffneFeld({ key, art: t.art, abschnitt });
  const ende = /\s+$/.exec(t.t)?.[0] ?? "";
  const anfang = /^\s+/.exec(t.t)?.[0] ?? "";
  const kern = t.t.slice(anfang.length, t.t.length - ende.length);
  const anzeige = t.zustand === "offen" ? `● ${offeneAnzeige(kern, t.label)}` : kern;
  const zusatz = ZUSTAND_TEXT[t.zustand ?? "gesetzt"];
  const marke = (
    <span
      role="button"
      tabIndex={0}
      data-key={key}
      class={`tok tok-${t.art} z-${t.zustand ?? "gesetzt"}${offen ? " tok-aktiv" : ""}${frischeStellen.value.has(key) ? " tok-frisch" : ""}`}
      aria-label={`${t.label ?? ""}: ${kern}${zusatz ? `, ${zusatz}` : ""}`}
      aria-expanded={offen}
      onClick={oeffne}
      onKeyDown={(e) => {
        // Mit Strg, Alt oder der Befehlstaste gehört Enter einem anderen Befehl (Strg+Enter kopiert); das Fenster öffnet dann nicht (QA-01).
        if ((e.key === "Enter" || e.key === " ") && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          if (!e.repeat) oeffne();
        }
      }}
    >
      {anzeige}
    </span>
  );
  // Leerraum am Rand gehört neben die Markierung, sonst kleben gerahmte Stellen am Nachbartext.
  return anfang || ende ? (
    <>
      {anfang}
      {marke}
      {ende}
    </>
  ) : (
    marke
  );
}

type BefundSeg = Extract<Segment, { art: "befund" }>;
type MesswertSeg = Extract<Segment, { art: "messwert" }>;
type ZeilenStand = "abw" | "ok" | "weg" | "offen" | "vorschlag";

/** Wie die Engine: Die Vorlage kann einen Befund entscheiden lassen oder aus den Vorschlägen nehmen. */
function zeilenStand(seg: BefundSeg, status: BefundStatus | undefined, entscheiden: boolean, ohne = false): ZeilenStand {
  const hatNormal = seg.normal.trim() !== "";
  if (status === "ok" && !hatNormal) return "weg";
  if (status) return status;
  if (entscheiden) return "offen";
  return !hatNormal || seg.selten || ohne ? "weg" : "vorschlag";
}

const OFFENE_ZEILE = ".bz-luecke, .bz-offen, .bz-vorschlag";

/** Erste Zeile von oben, die zu klären ist: Hier beginnt der Zeiger, wenn die Liste aufgeht. */
function ersteOffeneZeile(liste: Element): HTMLElement | null {
  return liste.querySelector<HTMLElement>(`:is(${OFFENE_ZEILE})[data-zeile]`);
}

/**
 * Zeile unter `nach` in der Reihenfolge, in der die Zeilen zu sehen sind; `offen`: nur eine, die zu klären ist. Nie eine
 * darüber (PS-N03): Wer je sichtbarer Zeile eine Taste drückt, trifft genau diese Zeilen.
 */
function zeileDarunter(liste: Element, nach: Element | null, offen = false): HTMLElement | null {
  const alle = [...liste.querySelectorAll<HTMLElement>("[data-zeile]")];
  const i = nach ? alle.indexOf(nach as HTMLElement) : -1;
  return alle.slice(i + 1).find((z) => !offen || z.matches(OFFENE_ZEILE)) ?? null;
}

/** Fokus auf „Weiter“ am Ende der Liste, sichtbar (QA-21). */
function fokusWeiter(liste: Element) {
  const knopf = liste.querySelector<HTMLElement>(".bl-fuss .knopf");
  knopf?.focus({ preventScroll: true });
  knopf?.scrollIntoView({ block: "nearest" });
}

/**
 * Fokus auf eine Zeile der Befundliste. Die Zeile selbst ist der Zeiger: U, A, N, Ziffern und Ü wirken auf sie.
 * Ist die erste fehlende Angabe ein Textfeld oder die Zeile ein Messwert, geht der Fokus gleich ins Feld.
 */
function fokusZeile(z: HTMLElement) {
  const offen = z.querySelector<HTMLElement>(".bz-detail .ff-offen");
  const eingabe = offen && !offen.querySelector(".pillen") ? offen.querySelector<HTMLElement>(".ff-eingabe") : z.matches(".bz-offen") ? z.querySelector<HTMLElement>(".bz-wahl input") : null;
  (eingabe ?? z).focus({ preventScroll: true });
  z.scrollIntoView({ block: "nearest" });
}

/**
 * Weiter zur Zeile darunter, gleich in welchem Stand (PS-N03); `offen`: zur nächsten offenen darunter. Unter der letzten
 * Zeile auf „Weiter“, nie zurück nach oben. Gibt false zurück, wenn keine Zeile mehr kam.
 */
function weiterInListe(von: HTMLElement | null, offen = false): boolean {
  const liste = von?.closest(".befundliste");
  if (!liste) return false;
  const n = zeileDarunter(liste, von, offen);
  if (n) {
    fokusZeile(n);
    return true;
  }
  fokusWeiter(liste);
  return false;
}

/** Die Knopfreihe einer Zeile, die die Ziffern nimmt: die erste offene Angabe, sonst die einzige Angabe der Zeile. */
function zeilenGruppe(z: HTMLElement): HTMLElement | null {
  return z.querySelector<HTMLElement>(".bz-detail .ff-offen .pillen") ?? z.querySelector<HTMLElement>(".bz-detail .pillen[data-offen]") ?? z.querySelector<HTMLElement>(".bz-detail .pillen");
}

function zeilenZiffern(z: HTMLElement): HTMLButtonElement[] {
  const g = zeilenGruppe(z);
  return g ? [...g.querySelectorAll<HTMLButtonElement>(":scope > button")] : [];
}

const STAND_NAME: Record<BefundStatus, string> = { ok: "unauffällig", abw: "auffällig", weg: "nicht untersucht" };

function BefundZeile({ b, seg, entscheiden, ohne, a }: { b: Baustein; seg: BefundSeg; entscheiden: boolean; ohne: boolean; a: AbschnittAnsicht }) {
  const fall = aktiverFall.value!;
  const k = schluessel(b.id, seg.id);
  const status = fall.befund[k];
  const hatNormal = seg.normal.trim().length > 0;
  const stand = zeilenStand(seg, status, entscheiden, ohne);
  // Einen auffälligen Befund auf unauffällig oder nicht untersucht zu setzen geht nur per Klick oder markiertem Knopf, nie
  // per Buchstabe; die Meldung nennt alten und neuen Stand mit „Rückgängig“, die Stelle blitzt auf (PS-K03, wie G-42).
  const setze = (neu: BefundStatus) => {
    aendere((f) => mitBefund(f, k, neu));
    if (status === "abw" && neu !== "abw") {
      const fallId = fall.id;
      hebeHervor([k]);
      melde({ text: `${seg.chip}: jetzt ${STAND_NAME[neu]} (vorher auffällig)`, art: "warnung", fallId, aktion: { label: "Rückgängig", ausfuehren: () => aendereFall(fallId, (f) => mitBefund(f, k, "abw")) } }, 7000);
    }
    // Danach ist die Zeile wieder der Zeiger, auch nach einem Klick: Die Angabe, die jetzt fehlt, trägt die Nummern, und
    // eine Ziffer wählt dort (QA-26).
    nachDemZeichnen(() => zeile.current && fokusZeile(zeile.current));
  };
  // Ein Wahlbefund wird angegeben, nicht als auffällig gemeldet: „stabil" steht in derselben Liste wie „aufklappbar".
  const wahl = istWahlbefund(seg);
  const zeichen = wahl && stand === "abw" ? "◆" : { abw: "▲", ok: "✓", weg: "–", offen: "●", vorschlag: "○" }[stand];
  const fokus = offeneListe.value?.key === k;
  const wegText = !hatNormal ? (entscheiden ? "nicht untersucht" : "weglassen") : seg.selten || ohne ? "nicht erhoben" : "nicht untersucht";
  const token = a.tokens.find((t) => t.key === k);
  // Auffällig gewählt, aber Art oder Ort fehlt noch.
  const luecke = status === "abw" && token?.zustand === "offen";
  // Verlangter Wahlbefund mit einer einzigen Angabe: Die Möglichkeiten stehen gleich in der Zeile, ein Klick genügt.
  const einstufig = wahl && stand === "offen" && seg.slots?.length === 1 && seg.slots[0].art === "auswahl" ? seg.slots[0] : undefined;
  const zeile = useRef<HTMLDivElement>(null);
  // Mit der Tastatur geht es nach einer Angabe von selbst weiter: Fehlt in der Zeile noch eine, bleibt der Zeiger hier,
  // sonst rückt er zur nächsten Zeile, die zu klären ist. Nach dem Neuzeichnen, aber im selben Ereignis: Eine schnell
  // getippte nächste Taste trifft die neue Zeile, nicht die alte (PS-K07). Wer mit der Maus wählt, behält seinen Platz.
  const nachAngabe = (perTaste: boolean) => {
    if (!perTaste) return;
    nachDemZeichnen(() => {
      const z = zeile.current;
      if (!z) return;
      if (z.matches(OFFENE_ZEILE)) fokusZeile(z);
      else weiterInListe(z);
    });
  };
  return (
    <div
      class={`bz bz-${einstufig ? "einstufig" : wahl && stand === "abw" ? "angegeben" : stand}${luecke || einstufig ? " bz-luecke" : ""}`}
      ref={zeile}
      tabIndex={-1}
      role="group"
      aria-label={`${seg.chip}: ${luecke ? "auffällig, Angabe fehlt" : stand === "offen" ? (wahl ? "angeben" : "entscheiden") : stand === "vorschlag" ? "Normalbefund vorgeschlagen" : stand === "weg" ? wegText : wahl && stand === "abw" ? "angegeben" : STAND_NAME[stand]}`}
      data-zeile={k}
      data-gruppe={seg.gruppe ?? ""}
    >
      <div class="bz-kopf">
        <span class="bz-zeichen" aria-hidden="true">
          {luecke ? "●" : zeichen}
        </span>
        <span class="bz-label">
          {seg.chip}
          {stand === "offen" && <em> {wahl ? "angeben" : "entscheiden"}</em>}
          {luecke && <em> Angabe fehlt</em>}
        </span>
        <div class="bz-wahl" role="radiogroup" aria-label={seg.chip}>
          {hatNormal && (
            <button type="button" role="radio" aria-checked={status === "ok"} aria-keyshortcuts="U" class={status === "ok" ? "bz-knopf aktiv" : "bz-knopf"} data-fokus={fokus || undefined} onClick={() => setze("ok")} title="untersucht und unauffällig (U)">
              unauffällig
            </button>
          )}
          <button type="button" role="radio" aria-checked={status === "abw"} aria-keyshortcuts="A" class={status === "abw" ? "bz-knopf aktiv" : "bz-knopf"} data-fokus={(!hatNormal && fokus) || undefined} onClick={() => setze("abw")} title={wahl ? "Befund angeben (A)" : "auffällig (A)"}>
            {wahl ? "angeben" : "auffällig"}
          </button>
          <button type="button" role="radio" aria-checked={stand === "weg"} aria-keyshortcuts="N" class={stand === "weg" ? "bz-knopf aktiv" : "bz-knopf"} onClick={() => setze("weg")} title={`${wegText}: Der Satz steht nicht im Brief (N)`}>
            {wegText}
          </button>
        </div>
      </div>
      {einstufig && (
        <div class="bz-detail">
          <Pillen
            label={einstufig.label}
            wert={undefined}
            optionen={einstufig.optionen.map((o, i) => ({ wert: i, label: anzeige(o) })).filter((o) => einstufig.optionen[o.wert].trim() !== "")}
            onWahl={(i, perTaste) => {
              aendere((f) => mitSlot(mitBefund(f, k, "abw"), schluessel(b.id, seg.id, einstufig.id), String(i)));
              nachAngabe(perTaste);
            }}
          />
        </div>
      )}
      {status === "abw" && (
        <div class="bz-detail">
          {seg.slots && fall.eigen[k] === undefined && <Slots bausteinId={b.id} segId={seg.id} slots={seg.slots} auffaellig nachWahl={nachAngabe} />}
          <EigenerWortlaut k={k} aktuell={token?.t.trim() ?? ""} />
        </div>
      )}
    </div>
  );
}

function MesswertZeile({ b, seg, entscheiden }: { b: Baustein; seg: MesswertSeg; entscheiden: boolean }) {
  const fall = aktiverFall.value!;
  const k = schluessel(b.id, seg.id);
  const wert = fall.werte[k] ?? "";
  const nichtGemessen = !!fall.versteckt[k] && !wert.trim();
  // Verlangt die Vorlage den Wert, ist die Zeile offen, bis er eingetragen oder als nicht gemessen gekennzeichnet ist.
  const stand = wert.trim() ? "ok" : entscheiden && !nichtGemessen ? "offen" : "weg";
  return (
    <div class={`bz bz-${stand}`} tabIndex={-1} role="group" aria-label={`${seg.label}: ${stand === "ok" ? wert : stand === "offen" ? "eintragen" : "nicht gemessen"}`} data-zeile={k} data-gruppe={seg.gruppe ?? ""}>
      <div class="bz-kopf">
        <span class="bz-zeichen" aria-hidden="true">
          {stand === "ok" ? "✓" : stand === "offen" ? "●" : "–"}
        </span>
        <span class="bz-label">
          {seg.label}
          {stand === "offen" && <em> eintragen</em>}
        </span>
        <div class="bz-wahl">
          <Eingabe wert={wert} label={seg.label} platzhalter="nicht gemessen" onEnter={() => weiterInListe(document.querySelector<HTMLElement>(`[data-zeile="${CSS.escape(k)}"]`))} onInput={(v) => aendere((f) => mitVersteckt(mitWert(f, k, v), k, false), `wert:${k}`)} />
          {seg.normal && (
            <button type="button" class={wert.trim() === seg.normal ? "bz-knopf aktiv" : "bz-knopf"} onClick={() => aendere((f) => mitVersteckt(mitWert(f, k, seg.normal), k, false))} title="Diesen Wert gemessen: einsetzen">
              {seg.normal}
            </button>
          )}
          {entscheiden && (
            <button type="button" class={nichtGemessen ? "bz-knopf aktiv" : "bz-knopf"} onClick={() => aendere((f) => mitVersteckt(mitWert(f, k, undefined), k, true))} title="Nicht gemessen: Die Angabe steht nicht im Brief">
              nicht gemessen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Aufgeklappte Liste der Einzelbefunde eines Bausteins, direkt unter seinem Text. Übernommen wird je Untersuchungsgruppe. */
function Befundliste({ b, a }: { b: Baustein; a: AbschnittAnsicht }) {
  const fall = aktiverFall.value!;
  const ref = useRef<HTMLDivElement>(null);
  const vorlage = fall.vorlageId ? INDEX.vorlagen.get(fall.vorlageId) : undefined;
  const entscheiden = new Set(vorlage?.entscheiden ?? []);
  const ohne = new Set(vorlage?.ohne ?? []);
  const zeilen = b.segmente.filter((s): s is BefundSeg | MesswertSeg => s.art === "befund" || s.art === "messwert");
  const standVon = (s: BefundSeg) => zeilenStand(s, fall.befund[schluessel(b.id, s.id)], entscheiden.has(schluessel(b.id, s.id)), ohne.has(schluessel(b.id, s.id)));
  const gruppen: { name: string; zeilen: (BefundSeg | MesswertSeg)[] }[] = [];
  for (const s of zeilen) {
    const name = s.gruppe ?? "";
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.name === name) letzte.zeilen.push(s);
    else gruppen.push({ name, zeilen: [s] });
  }
  const vorschlaegeIn = (g: (typeof gruppen)[number]) => g.zeilen.filter((s): s is BefundSeg => s.art === "befund" && standVon(s) === "vorschlag").map((s) => schluessel(b.id, s.id));
  // Offen sind Befunde, die zu entscheiden sind, und auffällige, denen eine Angabe fehlt.
  const offen = a.tokens.filter((t) => t.bausteinId === b.id && (t.art === "befund" || t.art === "messwert") && t.zustand === "offen").length;
  const vorschlaege = gruppen.reduce((n, g) => n + vorschlaegeIn(g).length, 0);

  // Hinweise der Liste stehen in der Meldungszeile: Der Fuß der Liste liegt oft außer Sicht (QA-21). Verirrter Text
  // sperrt wie an jedem Halt den ganzen Tipp-Zug (E-44).
  const sage = (text: string, art: "ok" | "warnung" = "ok") => melde({ text, art }, 5000);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Der Zeiger beginnt an der angeklickten Zeile, sonst an der ersten, die zu klären ist; nie auf einem Knopf (E-43).
    const key = offeneListe.value?.key;
    const ziel = (key ? el.querySelector<HTMLElement>(`[data-zeile="${CSS.escape(key)}"]`) : null) ?? ersteOffeneZeile(el) ?? el.querySelector<HTMLElement>("[data-zeile]");
    if (ziel) fokusZeile(ziel);
    // Satz und Liste sollen zusammen sichtbar sein: der Block rückt an den oberen Rand.
    const block = el.closest(".block") ?? el;
    if (block.getBoundingClientRect().height < window.innerHeight - 180) block.scrollIntoView({ block: "start" });
    else ziel?.scrollIntoView({ block: "center" });
  }, [offeneListe.value?.key]);

  // Je Zeile trägt die Knopfreihe, die ihre Ziffern nimmt, die Markierung; Nummern zeigt sie nur, solange die Zeile selbst
  // der Zeiger ist (QA-20, QA-24). Der Platz dafür ist immer reserviert (QA-19).
  useLayoutEffect(() => {
    for (const z of ref.current?.querySelectorAll<HTMLElement>("[data-zeile]") ?? []) {
      const g = zeilenGruppe(z);
      for (const x of z.querySelectorAll(".ziffern-ziel")) if (x !== g) x.classList.remove("ziffern-ziel");
      g?.classList.add("ziffern-ziel");
    }
  });

  const fertig = () => {
    schliesseListe(false);
    naechsteStelle();
  };

  /**
   * Übernimmt die Vorschläge einer Gruppe mit Meldung und „Rückgängig“ (E-44). Ist die Zeile `von`, auf der Ü kam, danach
   * noch offen, bleibt der Zeiger dort; sonst geht er zur nächsten offenen Zeile darunter (per Klick auf den Knopf der
   * Gruppe: ab ihrer ersten Zeile), nie darüber. Eine offene Zeile derselben Gruppe, die nicht grau war, bleibt so nicht
   * übersprungen liegen. Ist nichts mehr offen, geht es aus der Liste; sonst auf „Weiter“.
   */
  const gruppeUebernehmen = (name: string, von: string | null = null) => {
    const g = gruppen.find((x) => x.name === name);
    if (!g) return;
    const keys = vorschlaegeIn(g);
    const namen = g.zeilen.filter((s) => keys.includes(schluessel(b.id, s.id))).map((s) => (s.art === "befund" ? s.chip : s.label));
    uebernimmMitMeldung(keys, `${keys.length} ${keys.length === 1 ? "Normalbefund" : "Normalbefunde"}${g.name ? ` „${g.name}“` : ""} (${aufzaehlen(namen)})`);
    nachDemZeichnen(() => {
      const el = ref.current;
      if (!el) return;
      const alle = [...el.querySelectorAll<HTMLElement>("[data-zeile]")];
      const hier = von ? alle.find((z) => z.dataset.zeile === von) : undefined;
      // Ü auf einer Zeile, die nicht grau war, lässt sie offen: Der Zeiger bleibt, wie nach U mit fehlender Angabe. Sonst
      // träfe das nächste U die Zeile darunter statt der, auf der der Arzt stand (R2-02).
      if (hier?.matches(OFFENE_ZEILE)) {
        fokusZeile(hier);
        return;
      }
      const ab = von
        ? (hier ?? alle[alle.length - 1] ?? null)
        : (alle[alle.findIndex((z) => (z.dataset.gruppe ?? "") === name) - 1] ?? null);
      const n = zeileDarunter(el, ab, true);
      if (n) fokusZeile(n);
      else if (!el.querySelector(OFFENE_ZEILE)) fertig();
      else fokusWeiter(el);
    });
  };

  /**
   * Tasten der Liste (E-43, E-44). Die Zeile mit dem Fokus ist der Zeiger: U, A, N, Ziffern und Ü wirken nur, wenn die
   * Zeile selbst oder einer ihrer drei Zustandsknöpfe den Fokus hat, nie aus einer Angabe heraus (PS-K03), und erst nach
   * der Schreckzeit und ohne Sperre (`zugErlaubt`). Ein auffälliger Befund kippt per Buchstabe nicht. Danach rückt der
   * Zeiger genau eine Zeile nach unten (PS-N03). Enter wählt nichts: Es geht zur nächsten offenen Zeile darunter, in einer
   * fertigen Liste hinaus. Auf einem markierten Knopf (Pfeiltaste, Tab) löst Enter oder die Leertaste diesen Knopf aus.
   */
  const taste = (e: KeyboardEvent) => {
    const ziel = e.target as HTMLElement;
    if (e.key === "Escape") {
      e.stopPropagation();
      schliesseListe();
      return;
    }
    if (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA" || e.altKey || e.ctrlKey || e.metaKey) return;
    const zeile = ziel.closest<HTMLElement>("[data-zeile]");
    const alle = [...(ref.current?.querySelectorAll<HTMLElement>("[data-zeile]") ?? [])];
    const imFuss = !zeile && !!ziel.closest(".bl-fuss");
    const i = zeile ? alle.indexOf(zeile) : imFuss ? alle.length : -1;
    const aufZeile = !!zeile && ziel === zeile;
    const imKopf = !!zeile && !!ziel.closest(".bz-wahl") && ziel.classList.contains("bz-knopf");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (e.key === "ArrowDown" && imFuss) return;
      const z = alle[e.key === "ArrowDown" ? Math.min(i + 1, alle.length - 1) : Math.max(i - 1, 0)];
      z?.focus({ preventScroll: true });
      z?.scrollIntoView({ block: "nearest" });
      return;
    }
    // Unter der letzten Zeile steht der Zeiger auf „Weiter“: Ein Buchstabe oder eine Ziffer zu viel setzt nichts, auch
    // nicht oben in der Liste (PS-N03), und sagt, wo der Zeiger steht. Kommt das Zeichen gleich nach einer Wahl, war der
    // Zug blind, und seine Wahlen gehen zurück (E-45 Satz 2).
    if (imFuss && e.key.length === 1 && e.key !== " ") {
      e.preventDefault();
      if (!e.repeat && !blindesZeichen(e)) sage("Ende der Liste: Enter auf „Weiter“, oder Pfeil nach oben zurück zu den Zeilen.");
      return;
    }
    if (zeile && (e.key === "ArrowRight" || e.key === "ArrowLeft") && (aufZeile || imKopf)) {
      // Markiert einen Zustandsknopf der Zeile; Enter oder Leertaste löst ihn dann aus.
      e.preventDefault();
      const knoepfe = [...zeile.querySelectorAll<HTMLElement>(".bz-wahl > button")];
      const j = knoepfe.indexOf(ziel);
      const rechts = e.key === "ArrowRight";
      (j < 0 ? (knoepfe.find((k) => k.classList.contains("aktiv")) ?? knoepfe[rechts ? 0 : knoepfe.length - 1]) : knoepfe[(j + (rechts ? 1 : -1) + knoepfe.length) % knoepfe.length])?.focus();
      return;
    }
    if (!zeile || !(aufZeile || imKopf)) return;
    const k = zeile.dataset.zeile!;
    const seg = b.segmente.find((s): s is BefundSeg => s.art === "befund" && schluessel(b.id, s.id) === k);
    if (e.key.length === 1 && e.key !== " ") {
      e.preventDefault();
      // Ziffern auch mit dem Fokus auf einem Zustandsknopf: Sie wählen in der Angabe der Zeile (QA-26).
      if (!zugErlaubt(e, `123456789ü${seg ? "uan" : ""}`)) return;
      const buchstabe = e.key.toLowerCase();
      if (/^[1-9]$/.test(e.key)) {
        const knopf = zeilenZiffern(zeile)[Number(e.key) - 1];
        if (knopf) knopf.click();
        else sage(zeilenZiffern(zeile).length ? "Diese Ziffer gibt es in der Zeile nicht." : "In dieser Zeile wird nicht mit Ziffern gewählt: U, A oder N.");
        return;
      }
      if (buchstabe === "ü") {
        const g = gruppen.find((x) => x.name === (zeile.dataset.gruppe ?? ""));
        if (g && vorschlaegeIn(g).length > 0) gruppeUebernehmen(g.name, k);
        else sage("In dieser Gruppe ist nichts mehr grau.");
        return;
      }
      if (!seg) return;
      const neu: BefundStatus = buchstabe === "u" ? "ok" : buchstabe === "a" ? "abw" : "weg";
      if (neu === "ok" && !seg.normal.trim()) return sage(`${seg.chip}: ohne Normalbefund, also A oder N.`);
      if (fall.befund[k] === "abw" && neu !== "abw") return sage(`${seg.chip} ist auffällig erfasst. Ändern nur per Klick auf den Knopf.`, "warnung");
      aendere((f) => mitBefund(f, k, neu));
      // Fehlt der Zeile danach noch eine Angabe (auffällig mit Art und Ort), bleibt der Zeiger hier; sonst eine Zeile tiefer.
      nachDemZeichnen(() => {
        const z = ref.current?.querySelector<HTMLElement>(`[data-zeile="${CSS.escape(k)}"]`);
        if (z?.matches(OFFENE_ZEILE)) fokusZeile(z);
        else weiterInListe(z ?? null);
      });
      return;
    }
    if (aufZeile && e.key === "Enter") {
      e.preventDefault();
      if (e.repeat) return;
      if (!weiterInListe(zeile, true) && !ref.current?.querySelector(OFFENE_ZEILE)) fertig();
      return;
    }
    if (aufZeile && e.key === " ") e.preventDefault();
  };

  return (
    <div class="befundliste" ref={ref} data-haelt-feld onKeyDown={taste} role="group" aria-label={`Befunde ${b.titel}`}>
      <div class="bl-kopf">
        <strong>{b.titel}</strong>
        <span class="bl-tipp">↑ ↓ Zeile · U unauffällig · A auffällig oder angeben · N nicht untersucht · Ziffer: Angabe · Ü: Gruppe übernehmen · Enter: nächste offene Zeile</span>
      </div>
      {gruppen.map((g) => {
        const vor = vorschlaegeIn(g);
        return (
          <div class="bl-abschnitt">
            <div class="bl-gruppe">
              <span>{g.name || "Befunde"}</span>
              {vor.length > 0 && (
                <span class="bl-gruppe-aktionen">
                  <button type="button" class="knopf klein" aria-keyshortcuts="Ü" onClick={() => gruppeUebernehmen(g.name)} title="Alle noch grauen Befunde dieser Gruppe als untersucht und unauffällig übernehmen (Ü)">
                    <kbd class="taste">Ü</kbd> {vor.length} unauffällig ✓
                  </button>
                  <button type="button" class="knopf leise klein" onClick={() => aendere((f) => vor.reduce((x, k) => mitBefund(x, k, "weg"), f))} title="Diese Gruppe wurde nicht untersucht: Die grauen Sätze entfallen">
                    nicht untersucht
                  </button>
                </span>
              )}
            </div>
            {g.zeilen.map((s) => (s.art === "befund" ? <BefundZeile b={b} seg={s} entscheiden={entscheiden.has(schluessel(b.id, s.id))} ohne={ohne.has(schluessel(b.id, s.id))} a={a} /> : <MesswertZeile b={b} seg={s} entscheiden={entscheiden.has(schluessel(b.id, s.id))} />))}
          </div>
        );
      })}
      <div class="bl-fuss">
        <span class="bl-stand">
          {offen > 0 && <span class="marke marke-offen">● {offen} offen</span>}
          {vorschlaege > 0 && <span class="marke marke-vorschlag">○ {vorschlaege} noch grau</span>}
          {offen === 0 && vorschlaege === 0 && <span class="marke marke-ok">✓ alles geklärt</span>}
        </span>
        <button type="button" class={offen === 0 && vorschlaege === 0 ? "knopf primaer" : "knopf"} onClick={fertig}>
          Weiter
        </button>
      </div>
    </div>
  );
}

/** Zerlegt die Tokens eines Abschnitts in Blöcke je Baustein; der freie Zusatz ist ein eigener Block. */
function bloecke(tokens: Token[]): { bausteinId: string | null; tokens: Token[] }[] {
  const aus: { bausteinId: string | null; tokens: Token[] }[] = [];
  for (const t of tokens) {
    const id = t.art === "zusatz" || t.art === "manuell" ? null : (t.bausteinId ?? null);
    const letzter = aus[aus.length - 1];
    if (!letzter || letzter.bausteinId !== id) aus.push({ bausteinId: id, tokens: [t] });
    else letzter.tokens.push(t);
  }
  // Der Zeilenumbruch zwischen Bausteinen wird durch den Blockabstand ersetzt.
  for (const b of aus) {
    const erster = b.tokens[0];
    if (erster && erster.art === "fix" && erster.t.startsWith("\n")) b.tokens[0] = { ...erster, t: erster.t.replace(/^\n+/, "") };
    const letzter = b.tokens[b.tokens.length - 1];
    if (letzter && letzter.art === "fix" && letzter.t.endsWith("\n")) b.tokens[b.tokens.length - 1] = { ...letzter, t: letzter.t.replace(/\n+$/, "") };
  }
  return aus.filter((b) => b.tokens.some((t) => t.t.length > 0));
}

/** Nimmt einen Satz oder eine Angabe in den Brief auf, der bisher nicht darin steht. */
function einschalten(e: AusEintrag, abschnitt: AbschnittId) {
  switch (e.art) {
    case "option":
      // Der Arzt wählt den Satz selbst: Er ist damit seine Aussage, kein Vorschlag.
      aendere((f) => mitOption(f, e.key, true));
      // Fehlt dem Satz noch eine Angabe, öffnet sich gleich das Fenster dazu, im selben Ereignis: Eine vorausgetippte
      // Ziffer gehört dann ihm (PS-K06). Der Stand kommt aus dem Brief, nicht aus der noch nicht gezeichneten Seite.
      if (stellenZustand(e.key) !== "gesetzt") {
        oeffneFeld({ key: e.key, art: "option", abschnitt });
        break;
      }
      // Der Satz steht nach einem Klick schwarz im Brief. Damit ein Fehlklick auffällt, blitzt er auf,
      // und die Meldung nennt seinen ganzen Wortlaut mit einem Weg zurück.
      hebeHervor([e.key]);
      nachDemZeichnen(() => {
        const el = document.querySelector<HTMLElement>(`[data-key="${CSS.escape(e.key)}"]`);
        el?.scrollIntoView({ block: "nearest" });
        el?.focus({ preventScroll: true });
        if (el) melde({ text: `Eingefügt: „${(el.textContent ?? "").trim()}“`, art: "ok", fallId: aktiverFall.peek()?.id, aktion: { label: "Rückgängig", ausfuehren: () => void zurueck() } });
      });
      break;
    case "befund":
    case "messwert":
      // Weggelassene Befunde werden in der Befundliste aufgenommen, nicht durch einen Klick behauptet.
      oeffneFeld({ key: e.key, art: e.art, abschnitt });
      break;
    case "auswahl":
      aendere((f) => mitAuswahl(f, e.key, undefined));
      oeffneFeld({ key: e.key, art: "auswahl", abschnitt });
      break;
    case "feld":
      // Leere freiwillige Felder haben keine Textstelle; ihr Fenster hängt am Knopf.
      oeffneFeld({ key: e.key, art: "feld", abschnitt });
      break;
  }
}

function BausteinWahl({ abschnitt, onFertig }: { abschnitt: AbschnittId; onFertig: () => void }) {
  const [frage, setFrage] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => ref.current?.focus(), []);
  const fall = aktiverFall.value!;
  katalogStand.value;
  const vorhanden = new Set(Object.values(fall.bausteine).flat());
  const q = normalisiere(frage);
  const gruppen = INDEX.katalog.regionen
    .map((r) => ({
      region: r,
      bausteine: r.bausteine.filter((b) => abschnittVon(b) === abschnitt && (!q || normalisiere(`${b.titel} ${r.name}`).includes(q))),
    }))
    .filter((g) => g.bausteine.length > 0);
  const waehle = (b: Baustein) => {
    aendere((f) => mitBaustein(f, b.id, INDEX, abschnitt));
    onFertig();
  };
  return (
    <div class="bausteinwahl" data-haelt-feld onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onFertig())}>
      <input
        spellcheck={false}
        autocomplete="off"
        ref={ref}
        class="ff-eingabe"
        type="search"
        placeholder="Baustein suchen …"
        aria-label="Baustein suchen"
        value={frage}
        onInput={(e) => setFrage((e.target as HTMLInputElement).value)}
      />
      <div class="bw-liste">
        {gruppen.length === 0 && <p class="ff-hinweis">Kein Baustein für diesen Abschnitt gefunden.</p>}
        {gruppen.map((g) => (
          <div>
            <div class="bw-region">{g.region.name}</div>
            {g.bausteine.map((b) => (
              <button type="button" class="ff-option" disabled={vorhanden.has(b.id)} onClick={() => waehle(b)}>
                <span>{b.titel}</span>
                {vorhanden.has(b.id) ? <span class="bw-da">im Brief</span> : b.status === "hausstandard" ? null : <span class="bw-da">{b.status === "eigen" ? "eigen" : b.status === "geprueft" ? "geprüft" : "Entwurf"}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <button type="button" class="link" onClick={onFertig}>
        schließen
      </button>
    </div>
  );
}

function Zusatz({ a }: { a: AbschnittAnsicht }) {
  const fall = aktiverFall.value!;
  const wert = fall.zusatz[a.id] ?? "";
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (offen) ref.current?.focus();
  }, [offen]);
  if (!offen) {
    return (
      <button type="button" class="zusatz-knopf" ref={knopf} onClick={() => setOffen(true)}>
        {wert ? "Ergänzung bearbeiten" : "+ frei ergänzen"}
      </button>
    );
  }
  return (
    <div class="zusatz">
      <textarea
        spellcheck={false}
        ref={ref}
        class="ff-eingabe"
        rows={Math.min(10, Math.max(2, wert.split("\n").length + 1))}
        value={wert}
        aria-label={`Freie Ergänzung zu ${a.titel}`}
        placeholder="Freier Text, erscheint am Ende des Abschnitts. Keine Namen, keine Geburtsdaten."
        onInput={(e) => aendere((f) => mitZusatz(f, a.id, (e.target as HTMLTextAreaElement).value), `zusatz:${a.id}`)}
        onKeyDown={(e) => {
          if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            e.stopPropagation();
            setOffen(false);
          }
        }}
        onBlur={() => setOffen(false)}
      />
      <div class="ff-tipp">Strg+Enter oder Esc: fertig</div>
    </div>
  );
}

function Handtext({ a }: { a: AbschnittAnsicht }) {
  const fall = aktiverFall.value!;
  const wert = fall.manuell[a.id] ?? "";
  return (
    <div class="handtext">
      <textarea
        spellcheck={false}
        class="ff-eingabe"
        rows={Math.min(24, Math.max(4, wert.split("\n").length + Math.floor(wert.length / 90) + 1))}
        value={wert}
        aria-label={`${a.titel} von Hand bearbeiten`}
        onInput={(e) => aendere((f) => mitManuell(f, a.id, (e.target as HTMLTextAreaElement).value), `manuell:${a.id}`)}
      />
      <div class="handtext-fuss">
        <span>Von Hand bearbeitet. Seite und Person folgen hier nicht mehr dem Fallkopf.</span>
        <button type="button" class="link" onClick={() => aendere((f) => mitManuell(f, a.id, undefined))}>
          zurück zu den Bausteinen
        </button>
      </div>
    </div>
  );
}

function hatBefunde(b: Baustein | undefined): boolean {
  return !!b && b.segmente.some((s) => s.art === "befund" || s.art === "messwert");
}

function Block({ a, block }: { a: AbschnittAnsicht; block: { bausteinId: string | null; tokens: Token[] } }) {
  const b = block.bausteinId ? INDEX.bausteine.get(block.bausteinId) : undefined;
  const befunde = hatBefunde(b);
  const grau = block.tokens.filter((t) => t.zustand === "vorschlag" && t.key);
  const graueBefunde = grau.filter((t) => t.art === "befund");
  const graueSaetze = grau.filter((t) => t.art !== "befund").map((t) => t.key!);
  const offeneBefunde = block.tokens.filter((t) => (t.art === "befund" || t.art === "messwert") && t.zustand === "offen").length;
  const offen = offeneListe.value?.bausteinId === block.bausteinId;
  const mitKopf = b && (graueSaetze.length > 0 || graueBefunde.length > 0 || offeneBefunde > 0 || offen || b.status === "eigen");
  const fall = aktiverFall.value!;
  const sammel = b?.sammelangabe ? sammelSchritte(fall, b.id, INDEX) : [];
  // Nach dem Klick hält eine Zeile den Platz des Knopfs, damit ein zweiter Klick nichts trifft.
  const erledigt = sammelErledigt.value;
  const bestaetigt = b && sammel.length === 0 && erledigt?.fallId === fall.id && erledigt.bausteinId === b.id && erledigt.stand === bausteinStand(fall, b.id) ? erledigt.aussagen : null;
  // Mit Meldung, was übernommen wurde, und „Rückgängig“ (E-44 Satz 2, PS-N02).
  const uebernehmen = () => {
    uebernimmMitMeldung(graueSaetze, `${graueSaetze.length} ${graueSaetze.length === 1 ? "Satz" : "Sätze"} in „${b?.titel ?? "Block"}“`);
    naechsteStelle();
  };
  // Halt im Durchlauf: Der Block selbst hat den Fokus, nicht „Übernehmen ✓“ (E-43, Grundsatz 3). Übernommen wird mit Ü
  // oder einem Klick; Enter auf dem Block übernimmt nichts (PS-K01, CR-K02). Ü wirkt erst nach der Schreckzeit und ohne
  // Sperre; anderer Text sperrt wie an jedem Halt (E-44, CR-TS01).
  const taste = (e: KeyboardEvent) => {
    const ziel = e.target as HTMLElement;
    if (ziel !== e.currentTarget && !ziel.hasAttribute("data-uebernehmen")) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key.length === 1 && e.key !== " ") {
      e.preventDefault();
      if (zugErlaubt(e, graueSaetze.length > 0 ? "ü" : "")) uebernehmen();
    } else if (ziel === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      if (graueSaetze.length > 0) melde({ text: "Enter übernimmt nicht. Ü übernimmt die grauen Sätze, F2 geht weiter.", art: "ok" });
    }
  };
  return (
    <div
      class={`block${block.bausteinId ? "" : " block-zusatz"}${grau.length > 0 ? " mit-vorschlag" : ""}`}
      data-block={block.bausteinId ?? undefined}
      tabIndex={block.bausteinId ? -1 : undefined}
      role={graueSaetze.length > 0 ? "group" : undefined}
      aria-label={graueSaetze.length > 0 && b ? `${b.titel}: Vorschlag der Vorlage, noch nicht übernommen. Ü übernimmt.` : undefined}
      onKeyDown={taste}
    >
      {mitKopf && (
        <div class="block-kopf">
          {b.status === "eigen" && <span class="block-etikett">Text dieses Arbeitsplatzes, ungeprüft</span>}
          {graueSaetze.length > 0 && (
            <>
              <span class="block-etikett">{b.status === "eigen" ? "noch nicht übernommen · grau wird nicht kopiert" : "Vorschlag der Vorlage · grau wird nicht kopiert"}</span>
              <button type="button" class="knopf klein" data-uebernehmen aria-keyshortcuts="Ü" onClick={uebernehmen} title="Die grauen Sätze dieses Blocks gelesen und als eigene Aussage übernehmen (Ü)">
                <kbd class="taste">Ü</kbd> {graueSaetze.length === 1 ? "Übernehmen ✓" : `${graueSaetze.length} übernehmen ✓`}
              </button>
            </>
          )}
          {befunde && (graueBefunde.length > 0 || offeneBefunde > 0) && <span class="block-etikett">{[offeneBefunde > 0 ? `${offeneBefunde} zu entscheiden` : "", graueBefunde.length > 0 ? `${graueBefunde.length} ${graueBefunde.length === 1 ? "Normalbefund" : "Normalbefunde"} vorgeschlagen` : ""].filter(Boolean).join(" · ")}</span>}
          {befunde && !offen && (
            <button type="button" class="knopf klein" data-pruefen onClick={() => (offeneListe.value = { bausteinId: b.id })}>
              Befunde prüfen
            </button>
          )}
        </div>
      )}
      <p>
        {block.tokens.map((t) => (
          <TokenAnsicht t={t} abschnitt={a.id} />
        ))}
      </p>
      {b && sammel.length > 0 && (
        <div class="block-sammel">
          <button type="button" class="knopf klein sammel-knopf" data-sammel={b.id} onClick={() => sammelangabeSetzen(b.id)}>
            {`Eintragen: ${sammelAussagen(sammel)}`}
          </button>
        </div>
      )}
      {b && bestaetigt && (
        <div class="block-sammel">
          <span class="sammel-erledigt" tabIndex={-1} data-sammel-erledigt={b.id}>
            <span aria-hidden="true">✓ </span>
            {`Eingetragen: ${bestaetigt}`}
          </span>
        </div>
      )}
      {offen && b && <Befundliste b={b} a={a} />}
    </div>
  );
}

function KopierKnopf({ a }: { a: AbschnittAnsicht }) {
  // Ein einziger Knopf, dessen Aufschrift wechselt: So bleibt der Tastaturfokus erhalten.
  if (!a.leer && !a.fertig) {
    const teile = [a.offen > 0 ? `● ${a.offen} offen` : "", a.vorschlag > 0 ? `○ ${a.vorschlag} ${a.vorschlag === 1 ? "Vorschlag" : "Vorschläge"}` : ""].filter(Boolean);
    return (
      <button type="button" class="knopf kopieren offen" onClick={() => klaere(a)} title="Noch nicht kopierbar. Führt zur ersten Stelle, die zu klären ist.">
        {teile.join(" · ")} · klären
      </button>
    );
  }
  let klasse = "";
  let text = "Kopieren";
  if (a.geaendertSeitKopie) {
    klasse = "geaendert";
    text = "seit Kopie geändert · neu kopieren";
  } else if (a.kopiert) {
    klasse = "kopiert";
    text = `✓ kopiert ${a.kopiertUm ? uhrzeit(a.kopiertUm) : ""}`;
  }
  return (
    <button type="button" class={`knopf kopieren ${klasse}`} disabled={a.leer} onClick={() => kopiereAbschnitt(a)} title={`${a.titel} in die Zwischenablage kopieren`}>
      {text}
    </button>
  );
}

/**
 * Speichert einen Text als wiederverwendbaren eigenen Baustein. Vorbelegt wird
 * der Abschnitt ohne die Eingaben zu diesem Patienten: Felder erscheinen als
 * Lücken und müssen ersetzt oder gelöscht werden, bevor gespeichert wird.
 */
function EigenSpeichern({ a, onFertig }: { a: AbschnittAnsicht; onFertig: () => void }) {
  const fall = aktiverFall.value!;
  const [titel, setTitel] = useState("");
  const [text, setText] = useState(() => entwurfEigenerBaustein(fall, a.id, a.titel, INDEX, { listen: einstellungen.value.listen }));
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    ref.current?.closest(".bausteinwahl")?.scrollIntoView({ block: "center" });
    ref.current?.focus({ preventScroll: true });
  }, []);
  const luecken = text.includes("‹") || text.includes("›");
  const gueltig = titel.trim() !== "" && text.trim() !== "" && !luecken;
  const speichern = () => {
    if (!gueltig) return;
    const ok = eigenenBausteinSpeichern(titel, a.id, text);
    melde(
      ok
        ? { text: `Eigener Baustein „${titel.trim()}“ gespeichert. Zu finden unter „+ Baustein“.`, art: "ok" }
        : { text: "Der Browser hat das Speichern verweigert. Der Baustein gilt nur, bis das Fenster geschlossen wird.", art: "fehler" },
    );
    onFertig();
  };
  return (
    <div class="bausteinwahl" data-haelt-feld onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onFertig())}>
      <div class="ff-label">Name des Bausteins</div>
      <input spellcheck={false} autocomplete="off" ref={ref} class="ff-eingabe" type="text" maxLength={60} value={titel} placeholder="z. B. Procedere Gips Arm, mein Standard" onInput={(e) => setTitel((e.target as HTMLInputElement).value)} />
      <div class="ff-label" style={{ marginTop: "8px" }}>
        Text
      </div>
      <textarea spellcheck={false} class="ff-eingabe" rows={Math.min(12, Math.max(3, text.split("\n").length + 1))} value={text} aria-label="Text des Bausteins" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <p class="ff-hinweis">
        Der Baustein bleibt dauerhaft auf diesem Rechner und steht allen zur Verfügung, die ihn benutzen. Er darf nichts enthalten, was nur zu einem Patienten gehört. {"{seite}"} wird in jedem Fall durch dessen Seite ersetzt. In
        jedem Brief erscheint der Baustein zuerst grau als Vorschlag.
      </p>
      {luecken && <p class="fehlertext">Der Text enthält noch Lücken (‹…›). Bitte durch allgemeinen Wortlaut ersetzen oder löschen.</p>}
      <div class="ff-fuss">
        <button type="button" class="link" onClick={onFertig}>
          abbrechen
        </button>
        <button type="button" class="knopf primaer" disabled={!gueltig} onClick={speichern}>
          Speichern
        </button>
      </div>
    </div>
  );
}

function Abschnitt({ a }: { a: AbschnittAnsicht }) {
  const [wahl, setWahl] = useState(false);
  const [menue, setMenue] = useState(false);
  const [eigen, setEigen] = useState(false);
  const menueRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menue) return;
    const zu = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menueRef.current?.contains(e.target as Node)) {
        setMenue(false);
        if (e instanceof KeyboardEvent) menueRef.current?.querySelector<HTMLElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", zu);
    document.addEventListener("keydown", zu);
    return () => {
      document.removeEventListener("mousedown", zu);
      document.removeEventListener("keydown", zu);
    };
  }, [menue]);
  const fall = aktiverFall.value!;
  const kopierStand = a.leer ? "" : a.geaendertSeitKopie ? "geaendert" : a.kopiert ? "kopiert" : "";

  if (a.ausgeblendet) {
    return (
      <section class="abschnitt ausgeblendet" data-abschnitt={a.id}>
        <header>
          <h2>{a.titel}</h2>
          <span class="ab-hinweis">nicht im Brief{a.kopiert ? ` · wurde um ${a.kopiertUm ? uhrzeit(a.kopiertUm) : "?"} kopiert: im KIS löschen` : ""}</span>
          <button type="button" class="link" onClick={() => aendere((f) => mitAusgeblendet(f, a.id, false))}>
            wieder aufnehmen
          </button>
        </header>
      </section>
    );
  }

  return (
    <section class={`abschnitt ${kopierStand}`} data-abschnitt={a.id}>
      <header>
        <h2>{a.titel}</h2>
        <div class="ab-aktionen">
          <button type="button" class="knopf leise klein" aria-expanded={wahl} onClick={() => setWahl(!wahl)} title="Baustein in diesen Abschnitt einfügen">
            + Baustein
          </button>
          <div class="menue-anker" ref={menueRef}>
            <button type="button" class="knopf leise klein" aria-label={`Weitere Aktionen für ${a.titel}`} aria-haspopup="menu" aria-expanded={menue} onClick={() => setMenue(!menue)}>
              ⋯
            </button>
            {menue && (
              <div class="menue" role="menu" data-haelt-feld>
                {!a.manuell && (
                  <button
                    type="button"
                    disabled={!a.fertig}
                    title={a.fertig ? "Den fertigen Text als freien Text weiterbearbeiten" : "Erst Lücken und Vorschläge klären: Von Hand bearbeitet wird nur fertiger Text"}
                    onClick={() => (aendere((f) => mitManuell(f, a.id, a.text)), setMenue(false))}
                  >
                    Von Hand bearbeiten{a.fertig ? "" : " (erst klären)"}
                  </button>
                )}
                {a.bausteine.map((b) => (
                  <button type="button" onClick={() => (aendere((f) => ohneBaustein(f, b.id)), setMenue(false))}>
                    „{b.titel}" entfernen
                  </button>
                ))}
                {a.fehlend.map((id) => (
                  <button type="button" onClick={() => (aendere((f) => ohneBaustein(f, id)), setMenue(false))}>
                    Fehlenden Baustein „{id}" entfernen
                  </button>
                ))}
                {!a.leer && (
                  <button type="button" onClick={() => (setEigen(true), setMenue(false))}>
                    Als eigenen Baustein speichern …
                  </button>
                )}
                <button type="button" onClick={() => (aendere((f) => mitAusgeblendet(f, a.id, true)), setMenue(false))}>
                  Abschnitt nicht in den Brief
                </button>
              </div>
            )}
          </div>
          <KopierKnopf a={a} />
        </div>
      </header>

      {wahl && <BausteinWahl abschnitt={a.id} onFertig={() => setWahl(false)} />}
      {eigen && <EigenSpeichern a={a} onFertig={() => setEigen(false)} />}
      {a.seitenkonflikt && (
        <p class="ab-warnung" role="alert">
          Im frei geschriebenen Text steht „{a.seitenkonflikt}", die Seite des Falls ist {fall.seite}. Bitte prüfen.
        </p>
      )}
      {abgleich.value
        .filter((h) => h.abschnitte[1] === a.id)
        .map((h) => (
          <p class="ab-warnung" role="alert">
            Bitte abgleichen. {h.text}
          </p>
        ))}
      {a.leer && a.kopiert && <p class="ab-warnung">Dieser Abschnitt wurde um {a.kopiertUm ? uhrzeit(a.kopiertUm) : "?"} kopiert und ist jetzt leer. Im KIS steht noch der alte Text.</p>}

      {a.manuell ? (
        <Handtext a={a} />
      ) : (
        <>
          {a.leer && a.bausteine.length === 0 && !wahl && <p class="ab-leer">Noch leer. Baustein einfügen oder frei schreiben.</p>}
          <div class="ab-text">
            {bloecke(a.tokens).map((b) => (
              <Block a={a} block={b} />
            ))}
            {a.bausteine
              .filter((b) => offeneListe.value?.bausteinId === b.id && !a.tokens.some((t) => t.bausteinId === b.id))
              .map((b) => (
                <div class="block" data-block={b.id}>
                  <Befundliste b={b} a={a} />
                </div>
              ))}
          </div>
          {a.aus.length > 0 && (
            <div class="ab-aus" aria-label="Weitere Sätze und Angaben">
              {a.aus.map((e) => (
                <button type="button" class="aus-knopf" data-key={e.art === "feld" ? e.key : undefined} onClick={() => einschalten(e, a.id)} title={e.vorschau ? `Fügt ein: „${e.vorschau}“` : "In den Brief aufnehmen"}>
                  + {e.label}
                </button>
              ))}
            </div>
          )}
          <Zusatz a={a} />
        </>
      )}
    </section>
  );
}

export function Brief() {
  const b = brief.value;
  if (!b) return null;
  return (
    <div class="brief" onCopy={beiKopieAusBrief}>
      {b.abschnitte.map((a) => (
        <Abschnitt a={a} key={a.id} />
      ))}
    </div>
  );
}
