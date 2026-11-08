// Aktionen, die mehrere Ansichten teilen: Feld öffnen, zur nächsten offenen
// Stelle oder zum nächsten Vorschlag springen, kopieren.

import { effect, signal, untracked } from "@preact/signals";
import type { AbschnittId, Fall, Geschlecht, Seite } from "../model/types.ts";
import type { TokenArt } from "../engine/text.ts";
import { fuerZwischenablage, unsichereZeichen } from "../engine/text.ts";
import { briefText, renderBrief, sichtbareAbschnitte } from "../engine/render.ts";
import type { AbschnittAnsicht, BriefAnsicht } from "../engine/render.ts";
import { alsKopiert, beendetZug, fallName, mitPerson, mitSeite, sicherZuruecknehmen, uebernehmen } from "../engine/fall.ts";
import {
  BILD_ERSATZ_MS,
  EBEN_MS,
  FREI,
  LOESENDE_TASTEN,
  SCHRECKZEIT_MS,
  bereit,
  blind,
  geloest,
  inSchreckzeit,
  mitBefehl,
  mitWirkung,
  nachSprung,
  nachTaste,
  nachText,
  nachUrteil,
  neueKette,
  tastenArt,
  urteil,
  verworfenWort,
} from "../engine/tippzug.ts";
import type { Kette, Urteil, Zug } from "../engine/tippzug.ts";
import { PERSON_WORT, aenderungJetzt, aufzaehlen, geaenderteStellen, gesetztText, kurz, zurueckgenommenText } from "../engine/aenderung.ts";
import { SPERRE } from "../data/tastatur.ts";
import { bausteinStand, mitSammelangabe, ohneSammelangabe, sammelAussagen } from "../engine/sammel.ts";
import type { SammelSetzung } from "../engine/sammel.ts";
import { INDEX, aendere, aendereFall, aktiverFall, aktivId, allesLoeschen, brief, einstellungen, faelle, setzeEinstellung, sucheOffen, verwerfeAbgelaufene, vermerke } from "../store.ts";
import { fokusSichern, nachDemZeichnen } from "./fokus.ts";
import { inZwischenablage, melde, meldung } from "./kopieren.ts";
import type { Meldung } from "./kopieren.ts";

export interface OffenesFeld {
  key: string;
  art: TokenArt;
  abschnitt: AbschnittId;
}

/** Textstelle, deren Bearbeitungsfenster offen ist. */
export const offenesFeld = signal<OffenesFeld | null>(null);

/** Baustein, dessen Befundliste aufgeklappt ist, und die Zeile darin, die den Fokus hat. */
export const offeneListe = signal<{ bausteinId: string; key?: string } | null>(null);

/** Textstellen, die sich eben ohne Zutun an dieser Stelle geändert haben (zugewählter Satz, Rückgängig): kurz hervorgehoben. */
export const frischeStellen = signal<ReadonlySet<string>>(new Set());

/** Nach dem Klick auf eine Sammelangabe: Was sie eingetragen hat, steht an der Stelle des Knopfs, solange der Block unverändert ist. */
export const sammelErledigt = signal<{ fallId: string; bausteinId: string; aussagen: string; stand: string } | null>(null);
let frischUhr = 0;

export function hebeHervor(keys: string[]) {
  if (keys.length === 0) return;
  window.clearTimeout(frischUhr);
  frischeStellen.value = new Set(keys);
  frischUhr = window.setTimeout(() => (frischeStellen.value = new Set()), 2200);
}

/**
 * Was ein Schritt zurück oder vor am Brief verändert hat, mit dem neuen Stand (MT-03): Die Meldung nennt die Stelle,
 * damit kein Befund unbemerkt kippt.
 */
export function unterschied(vorFall: Fall | null, vorBrief: BriefAnsicht | null): string {
  const { keys } = aenderungJetzt(vorFall, vorBrief, aktiverFall.value, brief.value);
  hebeHervor(keys);
  // Dieselbe Aufzählung wie nach einer Rücknahme: jede Stelle einmal, alle genannt (H-R3b-1).
  const art = { listen: einstellungen.peek().listen };
  return zurueckgenommenText(vorFall, aktiverFall.peek(), (f) => renderBrief(f, INDEX, art));
}

let letzterHalt: string | null = null;

/**
 * Wo der Durchlauf steht: die Stelle, an der der Arzt gerade ist, und die Halte, die beim Öffnen vor ihr lagen.
 * Weiter geht es beim ersten Halt, der damals nicht davor lag. So zählt nicht, wie viele Zeichen eine Entscheidung
 * dem Brief hinzufügt oder nimmt: Was hinter der Stelle stand oder durch die Entscheidung neu entsteht, kommt dran;
 * was davor lag, nicht (QA-02, CR-T1-01, CR-T1-02).
 */
interface Merkpunkt {
  /** Kennung des Halts an der Stelle selbst, solange es ihn gibt; null, wenn die Stelle kein Halt ist. */
  kennung: string | null;
  davor: ReadonlySet<string>;
}
let merkpunkt: Merkpunkt | null = null;

/** Merkt die Stelle mit dem Rang `rang`: Alle Halte mit kleinerem Rang liegen davor. */
function merke(kennung: string | null, rang: number) {
  const davor = new Set<string>();
  for (const h of halte()) if (h.rang < rang && haltKennung(h) !== kennung) davor.add(haltKennung(h));
  merkpunkt = { kennung, davor };
}

// Fenster, Befundliste und der Stand des Durchlaufs gehören zu einem Fall.
// Wechselt der Fall, darf nichts davon auf den anderen Brief wirken.
effect(() => {
  aktivId.value;
  sucheOffen.value;
  offenesFeld.value = null;
  offeneListe.value = null;
  sammelErledigt.value = null;
  letzterHalt = null;
  merkpunkt = null;
});

// Auch wer eine Stelle mit der Maus öffnet, setzt den Durchlauf dort fort.
effect(() => {
  const f = offenesFeld.value;
  const l = offeneListe.value;
  if (!f && !l) return;
  // Festgehalten wird beim Öffnen, was davor liegt: Verschwindet die Stelle durch die Eingabe aus dem Text, geht es trotzdem dahinter weiter.
  // Ohne Abhängigkeit vom Brief: Sonst liefe dieser Effekt nach jeder Eingabe erneut und vergäße, wo die Stelle stand.
  untracked(() => {
    const r = reihenfolge();
    if (f) {
      const rang = r.stelle.get(f.key);
      if (rang !== undefined) merke(f.key, rang);
      letzterHalt = f.key;
    } else if (l) {
      const block = blockVon(l.bausteinId);
      const rang = block ? (r.befundAnfang.get(block) ?? r.anfang.get(block)) : undefined;
      if (rang !== undefined) merke(`liste:${l.bausteinId}`, rang);
      letzterHalt = `liste:${l.bausteinId}`;
    }
  });
});

export function tokenElement(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
}

// Ohne Animation: Die Stelle steht sofort da, auch wenn das Fenster gerade im Hintergrund war.
function inSicht(el: Element | null | undefined) {
  el?.scrollIntoView({ block: "nearest" });
}

export function oeffneFeld(feld: OffenesFeld) {
  if (feld.art === "befund" || feld.art === "messwert") {
    offenesFeld.value = null;
    offeneListe.value = { bausteinId: feld.key.split("/")[0], key: feld.key };
    return;
  }
  offeneListe.value = null;
  offenesFeld.value = feld;
  inSicht(tokenElement(feld.key));
}

export function schliesseFeld(fokusZurueck = true) {
  const f = offenesFeld.value;
  offenesFeld.value = null;
  if (f && fokusZurueck) tokenElement(f.key)?.focus({ preventScroll: true });
}

/** Schließt die Befundliste; der Fokus geht zurück an den Block, aus dem sie geöffnet wurde. */
export function schliesseListe(fokusZurueck = true) {
  const l = offeneListe.value;
  offeneListe.value = null;
  if (l && fokusZurueck) {
    nachDemZeichnen(() => document.querySelector<HTMLElement>(`[data-block="${CSS.escape(l.bausteinId)}"] [data-pruefen]`)?.focus({ preventScroll: true }));
  }
}

/** Zustand einer Textstelle, wie ihn die Engine eben berechnet hat, nicht wie ihn die Seite noch zeigt; ohne Stelle undefined. */
export function stellenZustand(key: string): string | undefined {
  for (const a of brief.peek()?.abschnitte ?? []) {
    const t = a.tokens.find((x) => x.key === key);
    if (t) return t.zustand ?? "gesetzt";
  }
  return undefined;
}

const SEITE_WORT: Record<Seite, string> = { rechts: "rechts", links: "links", beidseits: "beidseits", ohne: "ohne Seite" };

/**
 * Setzt die Seite des ganzen Briefs. Ändert das eine schon gesetzte Seite, nennt die Meldung alte und neue Seite und
 * bietet „Rückgängig“: Die Seite dreht jede Seitenangabe im Brief (PS-K08, E-43 Grundsatz 6). Die Bestätigung davor
 * holt die Ansicht ein.
 */
export function seiteDesBriefs(neu: Seite) {
  const fall = aktiverFall.peek();
  if (!fall || fall.seite === neu) return;
  const alt = fall.seite;
  aendere((f) => mitSeite(f, neu));
  if (alt) {
    melde(
      { text: `Seite des ganzen Briefs: ${SEITE_WORT[neu]} (vorher ${SEITE_WORT[alt]})`, art: "warnung", fallId: fall.id, aktion: { label: "Rückgängig", ausfuehren: () => aendereFall(fall.id, (f) => mitSeite(f, alt)) } },
      8000,
    );
  }
}

/** Wählt die Person. Ändert das eine schon gewählte Person, meldet es sich wie ein Wechsel der Seite (QA-34). */
export function personDesBriefs(neu: Geschlecht) {
  const fall = aktiverFall.peek();
  if (!fall || fall.geschlecht === neu) return;
  const alt = fall.geschlecht;
  aendere((f) => mitPerson(f, neu, f.alter));
  if (alt) {
    melde(
      { text: `Person: ${PERSON_WORT[neu]} (vorher ${PERSON_WORT[alt]})`, art: "warnung", fallId: fall.id, aktion: { label: "Rückgängig", ausfuehren: () => aendereFall(fall.id, (f) => mitPerson(f, alt, f.alter)) } },
      8000,
    );
  }
}

/** Macht die Vorschläge der genannten Textstellen zur Aussage des Arztes. */
export function uebernimm(keys: string[]) {
  if (keys.length > 0) aendere((f) => uebernehmen(f, keys, INDEX));
}

// --- Tipp-Zug (E-44, E-45) ---------------------------------------------------
//
// Nach jedem Sprung zu einem neuen Halt und nach jeder Bewegung, die ein Befehl auslöst (auch der Zeiger der
// Befundliste), wirken Ziffer, U, A, N, Ü und Enter auf einem Knopf erst, wenn der Halt die Schreckzeit lang zu sehen war.
// Was davor kommt, und Text an einem Halt sind verworfen, gemeldet und sperren den ganzen Tipp-Zug bis Pfeiltaste, Tab,
// F2 oder Klick. Verrät ein Zeichen, dass der Zug blind war (E-45), gehen alle seine Befehle zurück. Die Regeln stehen
// in `engine/tippzug.ts`; hier hängen Uhr, Anzeige, Rücknahme und Meldung.

let zug: Zug = FREI;
/** Anzeige: „wartet“ (Schreckzeit), „bereit“ oder „gesperrt“. Steht auch als `data-tippzug` an `<html>`. */
export const zugStand = signal<"bereit" | "wartet" | "gesperrt">("bereit");
let bildNr = 0;
let uhrNr = 0;
let ersatzNr = 0;

interface Befehl {
  /** Was der Befehl gesetzt hat, im Wortlaut des Briefs (MT-07, QA-29). */
  text: string;
  fallId: string;
  vorher: Fall;
  nachher: Fall;
  vorBrief: BriefAnsicht | null;
  nachBrief: BriefAnsicht | null;
  zeit: number;
}

let kette: Kette<Befehl> = neueKette(Number.NEGATIVE_INFINITY);
/** Befehle des eben durch eine Pause beendeten Zugs: Eine verworfene Taste kurz danach nennt sie als „eben gesetzt“. */
let vorige: readonly Befehl[] = [];
/** Übernahme per Taste mit eigener Meldung: Der Zug trägt sie unter ihrem Namen ein, nicht als zweiten Befehl. */
let letzteUebernahme: Befehl | null = null;

/** Was die Sperrmeldung nennt; entsteht mit der ersten verworfenen Taste und gilt bis zum Lösen. */
interface Sperre {
  grund: string;
  verworfen: string;
  /** Was zurückgenommen wurde, weil der Zug blind war. */
  zurueck: string;
  /** Zusätze des blinden Zugs, die stehen bleiben (PS-N13). */
  behalten: string;
  /** Befehle kurz vor der Sperre, die die Meldung mit „Rückgängig“ nennt. */
  eben: readonly Befehl[];
  /** Folge am Knopf („Fall bleibt offen“): „Enter verworfen, Fall bleibt offen.“ (MT-04). */
  folge: string;
  seit: number;
  fallId: string | null;
}
let sperre: Sperre | null = null;
/** Ein verworfenes Leerzeichen: Auch beim Loslassen löst es den Knopf nicht aus. */
let leerVerworfen = false;

/** Kopiermeldung, die noch steht. Eine Sperrmeldung ergänzt sie, statt sie zu ersetzen (MT-04, R2-07). */
interface Kopie {
  text: string;
  warnung: boolean;
  dauer: number;
  bis: number;
  /** Die stehende Meldung, die mit diesem Text beginnt; null, solange die Kopie erst nach der Sperre fertig wurde. */
  meldung: Meldung | null;
}
let kopie: Kopie | null = null;

const GRUND: Partial<Record<Urteil, string>> = {
  "zu-frueh": "zu früh nach dem Weiterspringen",
  sperrt: "hier wird gewählt, nicht geschrieben",
};

function jetztMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function zeigeZug() {
  const s = zug.gesperrt ? "gesperrt" : bereit(zug, jetztMs()) ? "bereit" : "wartet";
  zugStand.value = s;
  document.documentElement?.setAttribute?.("data-tippzug", s);
}

/**
 * Ein Sprung zu einem neuen Halt oder eine Bewegung nach einem Befehl. Die Schreckzeit beginnt mit dem Bild, das den
 * Halt zeigt, nicht mit dem Sprung. Kommt binnen `BILD_ERSATZ_MS` kein Bild, obwohl die Seite sichtbar ist, gilt der
 * Halt ab dann als zu sehen (CR-TS09); bei verborgener Seite bleibt er „wartet“.
 */
function zugSprung() {
  zug = nachSprung(zug);
  if (typeof requestAnimationFrame !== "function") {
    zug = { ...zug, sichtbarAb: jetztMs() };
    return;
  }
  zeigeZug();
  cancelAnimationFrame(bildNr);
  window.clearTimeout(uhrNr);
  window.clearTimeout(ersatzNr);
  const sichtbar = () => {
    if (zug.sichtbarAb !== null) return;
    zug = { ...zug, sichtbarAb: jetztMs() };
    window.clearTimeout(uhrNr);
    window.clearTimeout(ersatzNr);
    uhrNr = window.setTimeout(zeigeZug, SCHRECKZEIT_MS + 5);
  };
  // Das Bild vor dem Zeichnen: Fokus und Fenster stehen dann schon (nachDemZeichnen läuft vorher). Die Uhr danach
  // schaltet nur die Anzeige um; ob eine Taste wirkt, entscheidet ihr Zeitstempel.
  bildNr = requestAnimationFrame(sichtbar);
  ersatzNr = window.setTimeout(() => document.visibilityState === "visible" && sichtbar(), BILD_ERSATZ_MS);
}

/**
 * Der Knopf mit dem Fokus tut nach dem Kopieren etwas anderes: Aus „… kopieren“ wird „Alles kopiert · Fall schließen“.
 * Für Enter ist das ein neuer Halt; ein zweites Enter direkt nach dem Kopieren schließt den Fall nicht (R2-05).
 */
export function zugKnopfGewechselt() {
  zugSprung();
}

/**
 * Enter oder Tab in einem Textfeld geht weiter: ein Sprung, auch wenn der Fokus nur in Fenster oder Liste weiterrückt.
 * Der Zug bleibt der des Texts davor; ein älterer Befehl ist nicht mehr „eben gesetzt“.
 */
export function zugNachEingabe() {
  vorige = [];
  zugSprung();
}

/** Pfeiltaste, Tab, F2 oder Klick: Der Arzt sieht sich um. Gibt zurück, ob die Tasten gesperrt waren. */
function loeseZug(zeit = jetztMs()): boolean {
  offenerBefehl = null;
  kette = neueKette(zeit);
  vorige = [];
  letzteUebernahme = null;
  // Ein Bild, das nach dem Lösen noch kommt, darf die Schreckzeit nicht neu beginnen (CR-TS08).
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(bildNr);
  window.clearTimeout(ersatzNr);
  window.clearTimeout(uhrNr);
  const warGesperrt = zug.gesperrt;
  if (!zug.gesperrt && zug.sichtbarAb === FREI.sichtbarAb) return false;
  zug = geloest();
  sperre = null;
  leerVerworfen = false;
  zeigeZug();
  return warGesperrt;
}

const NUR_SONDERTASTE: ReadonlySet<string> = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "OS", "Fn", "Dead"]);

function istTextfeld(el: HTMLElement | null): boolean {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/** Textfeld an einem Halt: im Fenster oder in der Befundliste. Dort schreibt der Arzt, statt zu wählen. */
function haltFeld(el: HTMLElement | null): boolean {
  return istTextfeld(el) && !!el?.closest(".feldfenster, .befundliste");
}

/** Ein Zeichen, das geschrieben würde; AltGr (Strg+Alt unter Windows) zählt mit. */
function druckbar(e: KeyboardEvent): boolean {
  return e.key.length === 1 && !e.metaKey && e.ctrlKey === e.altKey;
}

/**
 * Knopf oder Textstelle an einem Halt, die Enter und Leertaste auslösen würden: Schnellwert, Möglichkeit, Zustandsknopf
 * der Befundliste, „Übernehmen ✓“, eine Stelle im Brief. Dort gilt der Tipp-Zug auch für Enter und Leertaste (PS-N05,
 * PS-N06): Wer blind weitertippt, löst keinen Knopf aus, den Pfeil oder Tab markiert haben.
 */
function geschuetzt(el: HTMLElement | null): boolean {
  if (!el || !el.closest(".feldfenster, .papier")) return false;
  return el.tagName === "BUTTON" || el.matches("[data-key].tok");
}

const ENTSPERRT = "Entsperrt: Tasten wirken wieder. Diese Taste hat nichts markiert.";

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  zeigeZug();
  // In der Einfangphase, vor jedem anderen Hörer: F2 löst erst, dann springt es (und die Schreckzeit beginnt neu).
  document.addEventListener(
    "keydown",
    (e) => {
      if (NUR_SONDERTASTE.has(e.key)) return;
      // Das „i“ der Normalwerte ist kein Halt (E-48 (10)): Seine Tasten gehören nicht zum Tippen im Brief.
      if ((e.target as HTMLElement | null)?.closest?.("[data-normwert]")) return;
      befehlAufgeloest(true);
      const zeit = e.timeStamp;
      const r = nachTaste(kette, zeit);
      if (r.beendet.length > 0) vorige = r.beendet;
      kette = r.kette;
      const ziel = e.target as HTMLElement | null;
      const imFeld = haltFeld(ziel);
      // Tab im Textfeld heißt weiter, wie Strg+Enter (E-45); es löst nichts und gehört dem Feld.
      if (LOESENDE_TASTEN.has(e.key) && !(imFeld && e.key === "Tab")) {
        const warGesperrt = loeseZug(zeit);
        // Die erste Pfeiltaste oder Tab nach einer Sperre löst nur und markiert nichts: Sonst setzte das Enter danach
        // aus Gewohnheit Option 1 oder „unauffällig“ (PS-N06).
        if (warGesperrt && e.key !== "F2" && !istTextfeld(ziel)) {
          e.preventDefault();
          e.stopPropagation();
          melde({ text: ENTSPERRT, art: "ok", fallId: aktivId.peek() ?? undefined }, 4000);
        }
        return;
      }
      if (imFeld) {
        const weiterTaste = (e.key === "Enter" && !e.altKey) || (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey);
        // Enter oder Tab so kurz nach einem Sprung galt dem vorigen Halt: still verworfen, im mehrzeiligen Feld auch keine
        // leere Zeile (QA-28). Kein Zeichen eines blinden Zugs: „Ziffer, Enter“ bleibt ohne Folgen.
        if (weiterTaste && inSchreckzeit(zug, zeit)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (druckbar(e)) {
          // Text in einem Feld, das ein Befehl eben geöffnet hat, verrät den blinden Zug (E-45, PS-N08): Das Feld
          // bleibt leer, die Befehle gehen zurück.
          if (blind(kette, "text", zeit, inSchreckzeit(zug, zeit))) {
            e.preventDefault();
            e.stopPropagation();
            zug = { ...zug, gesperrt: true };
            verwirf("zu-frueh", e.key, zeit, "", true);
            return;
          }
          kette = nachText(kette, zeit);
          vorige = [];
        }
        return;
      }
      // Eine Leertaste ohne Knopf darunter erscheint so in der Meldung; auf Knopf oder Stelle zählt sie `zugErlaubt` unten.
      if (e.key === " " && zug.gesperrt && !istTextfeld(ziel) && ziel?.tagName !== "BUTTON" && !geschuetzt(ziel) && sperre) sperre.verworfen += " ";
      // Enter und Leertaste auf einem Knopf an einem Halt sind Befehle (PS-N05, PS-N06).
      if ((e.key === "Enter" || e.key === " ") && !e.ctrlKey && !e.metaKey && !e.altKey && geschuetzt(ziel) && !zugErlaubt(e, "", true)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === " ") leerVerworfen = true;
      }
    },
    true,
  );
  // Die Leertaste löst einen Knopf beim Loslassen aus; war ihr Druck verworfen, auch das nicht.
  document.addEventListener(
    "keyup",
    (e) => {
      if (e.key !== " " || !leerVerworfen) return;
      leerVerworfen = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  // Ein Zeichen, das an einem Halt niemand ausgewertet hat (Stelle im Brief, „… kopieren“): bei gesperrten Tasten
  // verworfen und gemeldet; kurz nach einem Befehl ein Zeichen des blinden Zugs.
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || !druckbar(e) || e.key === " " || NUR_SONDERTASTE.has(e.key)) return;
    const ziel = e.target as HTMLElement | null;
    if (istTextfeld(ziel) || !ziel?.closest(".arbeit") || ziel.closest("[data-dialog]")) return;
    if (zug.gesperrt) verwirf("gesperrt", e.key, e.timeStamp);
    else blindesZeichen(e);
  });
  // Ein Knopf, den Enter oder die Leertaste ausgelöst hat, hat nach seinem Klick geändert, was er ändert.
  document.addEventListener("click", () => offenerBefehl && queueMicrotask(() => befehlAufgeloest(false)));
  document.addEventListener("pointerdown", () => void loeseZug(), true);
}

/**
 * Ein Zeichen, das an einem Halt nichts bedeutet (Stelle im Brief, „… kopieren“, „Weiter“ am Ende der Befundliste).
 * Kommt es binnen `KETTE_MS` nach einem Befehl, war der Zug blind (E-45 Satz 2): sperren, alle Befehle zurück, melden.
 * true, wenn so behandelt; sonst darf der Halt seinen eigenen Hinweis geben.
 */
export function blindesZeichen(e: KeyboardEvent): boolean {
  if (!blind(kette, "verworfen", e.timeStamp, false)) return false;
  const frueh = inSchreckzeit(zug, e.timeStamp);
  zug = { ...zug, gesperrt: true };
  verwirf(frueh ? "zu-frueh" : "gesperrt", e.key, e.timeStamp);
  return true;
}

/**
 * Eine Taste ist verworfen. Ist sie ein Zeichen (nicht Enter, nicht Leertaste) kurz nach einem Befehl, war der Zug blind:
 * alle seine Befehle zurück (E-45). Sonst nennt die Meldung, was eben gesetzt wurde, mit „Rückgängig“.
 */
function verwirf(u: Urteil, zeichen: string, zeit: number, folge = "", textImFeld = false) {
  zeigeZug();
  const neu = !sperre;
  if (!sperre) sperre = { grund: GRUND[u] ?? "", verworfen: "", zurueck: "", behalten: "", eben: [], folge, seit: zeit, fallId: aktivId.peek() };
  sperre.verworfen += zeichen;
  const verraet = zeichen.trim() !== "" && zeichen !== "↵";
  if (verraet && (textImFeld || blind(kette, "verworfen", zeit, false))) {
    const befehle = kette.befehle.filter((b) => b.fallId === aktivId.peek());
    kette = neueKette(zeit);
    vorige = [];
    letzteUebernahme = null;
    sperre.eben = [];
    if (befehle.length > 0) nimmKetteZurueck(befehle);
  } else if (neu) {
    sperre.eben = ebenGesetzt(zeit);
  }
  zeigeSperre();
}

/** Die Befehle des Zugs, der eben lief oder durch eine Pause endete, wenn der letzte weniger als `EBEN_MS` her ist. */
function ebenGesetzt(zeit: number): readonly Befehl[] {
  const liste = kette.befehle.length > 0 ? kette.befehle : vorige;
  const letzter = liste[liste.length - 1];
  if (!letzter || letzter.fallId !== aktivId.peek() || zeit - letzter.zeit >= EBEN_MS) return [];
  return liste.filter((b) => b.fallId === letzter.fallId);
}

/**
 * Was nach dem Zurücknehmen eines Zugs im Brief steht, jede Stelle einmal: Stand vor gegen Stand nach der Rücknahme,
 * nicht Befehl für Befehl, sonst nennte die Meldung Zwischenstände (QA-31, MT-03). Beide Stände frisch gerendert, damit
 * es auch für einen Fall stimmt, der gerade nicht zu sehen ist.
 */
function zurueckText(befehle: readonly Befehl[], vorher: Fall, nachher: Fall): string {
  const art = { listen: einstellungen.peek().listen };
  const text = zurueckgenommenText(vorher, nachher, (f) => renderBrief(f, INDEX, art));
  return text || aufzaehlen(befehle.map((b) => b.text));
}

/**
 * Nimmt die Befehle eines blinden Zugs zurück, nur in die sichere Richtung (E-48): Eine Stelle, die vorher eine Aussage
 * trug, wird offen oder grau; ein angefügter Zusatz bleibt und wird genannt. Hält fest, was die Meldung nennt.
 */
function nimmKetteZurueck(befehle: readonly Befehl[]) {
  const fallId = befehle[0].fallId;
  const jetzt = faelle.peek().find((f) => f.id === fallId);
  if (!jetzt || !sperre) return;
  const art = { listen: einstellungen.peek().listen };
  const { fall: zurueck, behalten } = sicherZuruecknehmen(jetzt, befehle, (f) => renderBrief(f, INDEX, art));
  sperre.behalten = aufzaehlen(behalten.map((name) => `„${name}“`), Infinity);
  if (zurueck === jetzt) return;
  const vorBrief = brief.peek();
  aendereFall(fallId, () => zurueck);
  sperre.zurueck = zurueckText(befehle, jetzt, zurueck);
  fokusNachRuecknahme(jetzt, vorBrief);
}

/**
 * Nach einer Rücknahme steht der Fokus an der ersten wieder offenen Stelle: in der offenen Befundliste auf ihrer Zeile,
 * sonst auf der Stelle im Brief, bei Seite und Person im Fallkopf. F2 geht von dort weiter.
 */
function fokusNachRuecknahme(jetzt: Fall, vorBrief: BriefAnsicht | null) {
  if (aktivId.peek() !== jetzt.id) return;
  const nach = aktiverFall.peek();
  const keys = geaenderteStellen(vorBrief, brief.peek());
  hebeHervor(keys);
  const liste = offeneListe.peek();
  const zeile = liste ? keys.find((k) => k.startsWith(`${liste.bausteinId}/`) && document.querySelector(`[data-zeile="${CSS.escape(k)}"]`)) : undefined;
  if (liste && zeile) {
    offenesFeld.value = null;
    nachDemZeichnen(() => {
      const z = document.querySelector<HTMLElement>(`[data-zeile="${CSS.escape(zeile)}"]`);
      z?.focus({ preventScroll: true });
      z?.scrollIntoView({ block: "nearest" });
    });
    return;
  }
  offenesFeld.value = null;
  offeneListe.value = null;
  letzterHalt = null;
  const r = reihenfolge();
  const raenge = keys.map((k) => r.stelle.get(k)).filter((x): x is number => x !== undefined);
  const kopf = jetzt.seite !== nach?.seite ? "[data-seitenwahl] [role=radiogroup]" : jetzt.geschlecht !== nach?.geschlecht ? "[data-personwahl] [role=radiogroup]" : null;
  if (kopf) merkpunkt = null;
  else if (raenge.length > 0) merke(null, Math.min(...raenge));
  nachDemZeichnen(() => {
    const el = kopf ? document.querySelector<HTMLElement>(kopf) : (keys.map(tokenElement).find((x) => x !== null) ?? null);
    if (!el) return fokusSichern();
    inSicht(el);
    el.focus({ preventScroll: true });
  });
}

/** Die Sperrmeldung aus Kopie, Rücknahme, verworfenen Zeichen, Sperrsatz und „eben gesetzt“, in dieser Reihenfolge. */
function zeigeSperre() {
  const s = sperre;
  if (!s) return;
  const k = kopie && jetztMs() < kopie.bis && (kopie.meldung === null || meldung.peek() === kopie.meldung) ? kopie : null;
  const zeichen = verworfenWort(s.verworfen);
  const verworfen = s.folge ? `${zeichen} verworfen, ${s.folge}.` : `Verworfen: ${zeichen}${s.grund ? ` (${s.grund})` : ""}.`;
  const eben = s.eben.length > 0 ? ` Eben gesetzt: ${aufzaehlen(s.eben.map((b) => b.text))}.` : "";
  const zurueck = s.zurueck ? `Zurückgenommen, weil gleich weitergetippt: ${s.zurueck}. ` : "";
  const behalten = s.behalten ? `Im Brief geblieben: ${s.behalten} (angefügt, bitte prüfen). ` : "";
  const text = `${k ? `${k.text} · ` : ""}${zurueck}${behalten}${verworfen} ${SPERRE}${eben}`;
  const befehle = s.eben;
  const m: Meldung = {
    text,
    art: "warnung",
    fallId: s.fallId ?? undefined,
    aktion: befehle.length > 0 ? { label: "Rückgängig", ausfuehren: () => nimmZurueck(befehle) } : undefined,
  };
  melde(m, k ? Math.max(k.dauer, 7000) : 8000);
  if (k) k.meldung = m;
}

/** Ein zugelassener Befehl, dessen Wirkung noch aussteht: Stand davor und Zeitpunkt. */
let offenerBefehl: { vorFall: Fall; vorBrief: BriefAnsicht | null; zeit: number } | null = null;

/**
 * Hält fest, was der eben zugelassene Befehl setzt. Die Wirkung kommt je nach Taste zu verschiedenen Zeitpunkten: Eine
 * Ziffer setzt im Handler, der gefragt hat; Enter auf einem Knopf löst ihn erst nach allen Tastenhörern aus, die
 * Leertaste beim Loslassen. Deshalb wird nachgesehen, sobald etwas geändert sein kann (Mikroaufgabe, Klick), und
 * spätestens vor der nächsten Taste endgültig.
 */
function merkeBefehl(zeit: number) {
  befehlAufgeloest(true);
  const vorFall = aktiverFall.peek();
  if (!vorFall) return;
  offenerBefehl = { vorFall, vorBrief: brief.peek(), zeit };
  queueMicrotask(() => befehlAufgeloest(false));
}

/** Hat der offene Befehl etwas geändert, gehört er zum Zug. `endgueltig`: Ohne Änderung bis jetzt zählt er nicht mehr. */
function befehlAufgeloest(endgueltig: boolean) {
  const o = offenerBefehl;
  if (!o) return;
  const nachFall = aktiverFall.peek();
  if (!nachFall || nachFall.id !== o.vorFall.id) {
    offenerBefehl = null;
    return;
  }
  if (nachFall === o.vorFall) {
    if (endgueltig) offenerBefehl = null;
    return;
  }
  offenerBefehl = null;
  const u = letzteUebernahme;
  const nachBrief = brief.peek();
  const b: Befehl =
    u && u.nachher === nachFall ? u : { text: gesetztText(o.vorFall, o.vorBrief, nachFall, nachBrief) || "eine Angabe", fallId: o.vorFall.id, vorher: o.vorFall, nachher: nachFall, vorBrief: o.vorBrief, nachBrief, zeit: o.zeit };
  kette = mitWirkung(kette, b);
  // Ein Wechsel von Seite oder Person beendet den Zug wie das Kopieren (PS-N11): Keine automatische Rücknahme stellt
  // die eben verworfene Seite oder Person wieder her. Wie nach einer Pause nennt eine verworfene Taste den Zug noch als
  // „eben gesetzt“; zurück geht er nur über „Rückgängig“.
  if (beendetZug(o.vorFall, nachFall)) {
    vorige = kette.befehle;
    kette = neueKette(o.zeit);
    letzteUebernahme = null;
  }
}

/**
 * „Rückgängig“ in einer Meldung: nimmt genau diese Befehle zurück, alle eines Zugs zusammen (E-45). Die Meldung danach
 * nennt den neuen Stand (MT-03); der Durchlauf geht an der wieder offenen Stelle weiter.
 */
function nimmZurueck(befehle: readonly Befehl[]) {
  const fallId = befehle[0]?.fallId;
  const jetzt = faelle.peek().find((f) => f.id === fallId);
  if (!fallId || !jetzt) return melde({ text: "Nichts zurückzunehmen: Der Fall ist geschlossen.", art: "ok" });
  // Auch hier nur in die sichere Richtung (E-48); einen Zusatz entfernt dieses Rückgängig, weil der Arzt es verlangt.
  const zurueck = sicherZuruecknehmen(jetzt, befehle).fall;
  if (zurueck === jetzt) return melde({ text: "Nichts zurückzunehmen: Die Stelle ist inzwischen geändert.", art: "ok" });
  const vorBrief = brief.peek();
  aendereFall(fallId, () => zurueck);
  kette = neueKette(jetztMs());
  vorige = [];
  const imFall = aktivId.peek() === fallId ? "" : ` in Fall ${jetzt.nr}`;
  melde({ text: `Zurückgenommen${imFall}: ${zurueckText(befehle, jetzt, zurueck)}`, art: "ok", fallId });
  fokusNachRuecknahme(jetzt, vorBrief);
}

/**
 * Prüft eine Taste an einem Halt (Fenster, Befundliste, Block, Gruppe im Fallkopf, Knopf), E-44. `befehle`: die Zeichen,
 * die dort etwas setzen. `aktivierung`: Enter und Leertaste lösen dort einen Knopf aus und zählen als Befehl; `folge`
 * nennt dann, was ausbleibt („Fall bleibt offen“). true: Die Taste darf wirken (auch jede neutrale Taste). false:
 * verworfen und gemeldet, oder eine Wiederholung. Je Tastendruck gilt das erste Urteil, auch wenn mehrere Hörer fragen.
 * `gueltig`: die Zeichen aus `befehle`, die hier gerade etwas bewirken (Ziffern bis zur Zahl der Knöpfe, U nur mit
 * Normalbefund). Eine andere Befehlstaste verrät einen blinden Zug wie ein Zeichen ohne Bedeutung (CR-TS15); sonst
 * darf der Halt seinen Hinweis geben, und sie zählt nicht als Befehl.
 */
export function zugErlaubt(e: KeyboardEvent, befehle: string, aktivierung = false, folge = "", gueltig?: string): boolean {
  const alt = urteile.get(e);
  if (alt !== undefined) return alt;
  const ok = pruefeTaste(e, befehle, aktivierung, folge, gueltig);
  urteile.set(e, ok);
  return ok;
}
const urteile = new WeakMap<Event, boolean>();

function pruefeTaste(e: KeyboardEvent, befehle: string, aktivierung: boolean, folge: string, gueltig?: string): boolean {
  const sonder = e.ctrlKey || e.metaKey || e.altKey;
  // Ü ohne deutsche Tastenbelegung liefert an derselben Taste „[“ (PS-N04): nichts setzen, nichts sperren, Grund nennen.
  if (!sonder && befehle.includes("ü") && e.code === "BracketLeft" && e.key.toLowerCase() !== "ü") {
    melde({ text: `Ü nicht erkannt: Die Taste lieferte „${e.key}“, die Tastatur ist nicht auf Deutsch gestellt. Übernehmen per Klick auf den Knopf mit „Ü“.`, art: "warnung" }, 8000);
    return false;
  }
  const knopf = aktivierung && !sonder && (e.key === "Enter" || e.key === " ");
  const art = knopf ? "befehl" : tastenArt(e.key, befehle, sonder);
  if (art === "neutral") return true;
  if (e.repeat) return false;
  const u = urteil(zug, art, e.timeStamp);
  if (u === "wirkt" && art === "befehl" && !knopf && gueltig !== undefined && !gueltig.includes(e.key.toLowerCase())) {
    if (blindesZeichen(e)) return false;
    return true;
  }
  if (u === "wirkt") {
    kette = mitBefehl(kette, null, e.timeStamp);
    merkeBefehl(e.timeStamp);
    // Jede Bewegung, die ein Befehl auslöst, ist ein Sprung: auch der Zeiger der Befundliste und die Nummernreihe (E-45).
    zugSprung();
    return true;
  }
  zug = nachUrteil(zug, u);
  window.clearTimeout(uhrNr);
  if (e.key === " ") leerVerworfen = true;
  verwirf(u, e.key === "Enter" ? "↵" : e.key, e.timeStamp, knopf ? folge : "");
  return false;
}

/**
 * Übernimmt die grauen Sätze eines Blocks oder die Normalbefunde einer Gruppe und meldet, was, mit „Rückgängig“
 * (E-44 Satz 2): Ein Ü, das dem vorigen Fenster galt, fällt so auf und lässt sich genau zurücknehmen (PS-N02).
 */
export function uebernimmMitMeldung(keys: string[], was: string) {
  const vorher = aktiverFall.peek();
  const vorBrief = brief.peek();
  if (!vorher || keys.length === 0) return;
  uebernimm(keys);
  const nachher = aktiverFall.peek();
  if (!nachher || nachher === vorher) return;
  const nachBrief = brief.peek();
  hebeHervor(geaenderteStellen(vorBrief, nachBrief));
  const b: Befehl = { text: was, fallId: vorher.id, vorher, nachher, vorBrief, nachBrief, zeit: jetztMs() };
  letzteUebernahme = b;
  melde({ text: `Übernommen: ${was}`, art: "ok", fallId: vorher.id, aktion: { label: "Rückgängig", ausfuehren: () => nimmZurueck([b]) } }, 8000);
}

/**
 * Ein Schnellwert oder „heute“ hat getippten Text ersetzt: mit beiden Wortlauten und „Rückgängig“ (PS-N05).
 * `noch`: Steht an der Stelle noch genau der Schnellwert? Nur dann stellt „Rückgängig“ den alten Text her; hat der Arzt
 * die Stelle seither neu geschrieben, bliebe sonst seine neue Eingabe auf der Strecke (PS-N10).
 */
export function meldeErsetzt(label: string, alt: string, neu: string, noch: (f: Fall) => boolean, zurueck: (f: Fall) => Fall) {
  const fall = aktiverFall.peek();
  if (!fall || !alt.trim() || alt.trim() === neu.trim()) return;
  const fallId = fall.id;
  const ausfuehren = () => {
    const jetzt = faelle.peek().find((f) => f.id === fallId);
    if (!jetzt) return melde({ text: "Nichts zurückzunehmen: Der Fall ist geschlossen.", art: "ok" });
    if (!noch(jetzt)) return melde({ text: "Nichts zurückzunehmen: Die Stelle ist inzwischen geändert.", art: "ok", fallId });
    aendereFall(fallId, zurueck);
  };
  melde({ text: `Ersetzt: ${label} „${kurz(alt)}“ → „${kurz(neu)}“`, art: "warnung", fallId, aktion: { label: "Rückgängig", ausfuehren } }, 8000);
}

// Eine Meldung mit „Rückgängig“ gilt dem Fall, in dem sie entstand: Sobald sein Brief nicht mehr zu sehen ist (anderer
// Fall, Vorlagensuche für einen neuen Fall), verschwindet sie (PS-N09).
// Sperre und Sperrmeldung enden mit dem Fallwechsel (CR-TS17): Ein neuer Fall ist ein bewusster Schritt, und die
// Meldung nennte sonst im neuen Fall, was im alten zurückgenommen wurde.
let gezeigterFall: string | null = null;
effect(() => {
  const id = aktivId.value;
  const suche = sucheOffen.value;
  const m = meldung.peek();
  if (m?.fallId && (m.fallId !== id || suche === "neu")) meldung.value = null;
  if (id !== gezeigterFall) {
    const vorher = gezeigterFall;
    gezeigterFall = id;
    if (vorher !== null && (sperre || zug.gesperrt)) untracked(() => loeseZug());
  }
});

type Halt = { rang: number } & (
  | { art: "seite" }
  | { art: "person" }
  | { art: "feld"; feld: OffenesFeld }
  | { art: "liste"; bausteinId: string; key: string; abschnitt: AbschnittId }
  | { art: "block"; bausteinId: string; abschnitt: AbschnittId }
  // Lücke ohne eigene Textstelle: Lückenzeichen in freiem Text oder ein Baustein, den es nicht mehr gibt.
  | { art: "abschnitt"; abschnitt: AbschnittId }
);

/** Laufende Nummern der Textstellen in Lesereihenfolge: je Stelle sowie Anfang, erster Befund und Ende jedes Bausteins. */
function reihenfolge() {
  const stelle = new Map<string, number>();
  const anfang = new Map<string, number>();
  const befundAnfang = new Map<string, number>();
  const ende = new Map<string, number>();
  const abschnittEnde = new Map<string, number>();
  let n = 0;
  for (const a of brief.peek()?.abschnitte ?? []) {
    if (a.ausgeblendet) continue;
    abschnittEnde.set(a.id, n + a.tokens.length);
    for (const t of a.tokens) {
      n++;
      if (t.key && !stelle.has(t.key)) stelle.set(t.key, n);
      if (!t.bausteinId) continue;
      const block = `${a.id}:${t.bausteinId}`;
      if (!anfang.has(block)) anfang.set(block, n);
      if ((t.art === "befund" || t.art === "messwert") && !befundAnfang.has(block)) befundAnfang.set(block, n);
      ende.set(block, n);
    }
  }
  return { stelle, anfang, befundAnfang, ende, abschnittEnde };
}

/**
 * Alle Stellen in Lesereihenfolge, an denen noch etwas fehlt oder nur
 * vorgeschlagen ist. Ein Befundblock und ein Block mit Vorschlägen sind je ein
 * Halt, egal wie viele Sätze darin stehen. Die Vorschläge eines Blocks kommen
 * nach seinen Lücken an die Reihe: erst ausfüllen, dann den Block im Ganzen lesen.
 */
function halte(nur?: AbschnittAnsicht): Halt[] {
  // peek: Wer Halte sucht, will den Brief jetzt, und kein Effekt soll davon abhängen.
  const b = brief.peek();
  if (!b) return [];
  const r = reihenfolge();
  const aus: Halt[] = [];
  const gesehen = new Set<string>();
  const einmal = (id: string) => (gesehen.has(id) ? false : (gesehen.add(id), true));
  for (const a of nur ? [nur] : b.abschnitte) {
    if (a.ausgeblendet) continue;
    // Seite und Person werden im Fallkopf gewählt, auch wenn die Lücke mitten in einem Satz steht.
    if (a.seiteFehlt && einmal("seite")) aus.push({ art: "seite", rang: -2 });
    if (a.personFehlt && einmal("person")) aus.push({ art: "person", rang: -1 });
    for (const t of a.tokens) {
      // Eine Entweder-oder-Stelle der Vorlage gehört zu keinem Baustein und ist ein eigener Halt.
      if (t.art === "wahl" && t.key && t.zustand === "offen") {
        if (einmal(t.key)) aus.push({ art: "feld", feld: { key: t.key, art: "wahl", abschnitt: a.id }, rang: r.stelle.get(t.key) ?? 0 });
        continue;
      }
      if (!t.key || !t.bausteinId || t.art === "seite" || t.art === "person") continue;
      if (t.zustand !== "offen" && t.zustand !== "vorschlag") continue;
      const block = `${a.id}:${t.bausteinId}`;
      // Ein verlangter Messwert steht in derselben Liste wie die Befunde seines Bausteins.
      if (t.art === "befund" || t.art === "messwert") {
        // Rang des ersten Befunds, nicht des Blockanfangs: Eine Angabe vor den Befunden („betroffener Finger“) kommt vorher
        // dran, und die Liste hat nie denselben Rang wie sie (QA-02).
        if (einmal(`liste:${t.bausteinId}`)) aus.push({ art: "liste", bausteinId: t.bausteinId, key: t.key, abschnitt: a.id, rang: r.befundAnfang.get(block) ?? r.anfang.get(block) ?? 0 });
      } else if (t.zustand === "offen") {
        // Eine Lücke, die nur aus fehlender Seite oder Person besteht, ist oben schon erfasst.
        const nurBezug = t.t.replace(/‹(Seite|Patient\/Patientin)›/g, "").indexOf("‹") === -1 && t.art === "option";
        if (nurBezug && (a.seiteFehlt || a.personFehlt)) continue;
        if (einmal(t.key)) aus.push({ art: "feld", feld: { key: t.key, art: t.art, abschnitt: a.id }, rang: r.stelle.get(t.key) ?? 0 });
      } else if (einmal(`block:${block}`)) {
        // Halbe Nummer: hinter der letzten Stelle des Blocks, vor der ersten des nächsten.
        aus.push({ art: "block", bausteinId: t.bausteinId, abschnitt: a.id, rang: (r.ende.get(block) ?? 0) + 0.5 });
      }
    }
    // Auch eine Lücke ohne anklickbare Stelle braucht einen Halt, sonst meldet F2 „nichts mehr zu klären“, während der Abschnitt gesperrt ist.
    const freieLuecke = a.fehlend.length > 0 || a.tokens.some((t) => t.frei && !t.key && t.t.includes("‹"));
    if (freieLuecke) aus.push({ art: "abschnitt", abschnitt: a.id, rang: (r.abschnittEnde.get(a.id) ?? 0) + 0.7 });
  }
  return aus.sort((x, y) => x.rang - y.rang);
}

function haltKennung(h: Halt): string {
  switch (h.art) {
    case "feld":
      return h.feld.key;
    case "liste":
      return `liste:${h.bausteinId}`;
    case "block":
      return `block:${h.abschnitt}:${h.bausteinId}`;
    case "abschnitt":
      return `abschnitt:${h.abschnitt}`;
    default:
      return h.art;
  }
}

/** Abschnitt und Baustein als ein Schlüssel; ein Baustein steht in genau einem Abschnitt des Briefs. */
function blockVon(bausteinId: string): string | undefined {
  for (const a of brief.peek()?.abschnitte ?? []) {
    if (!a.ausgeblendet && a.tokens.some((t) => t.bausteinId === bausteinId)) return `${a.id}:${bausteinId}`;
  }
  return undefined;
}

/** Kennung der Stelle, an der der Arzt gerade ist: offenes Fenster, offene Liste oder zuletzt angesprungener Halt. */
function aktuelleKennung(): string | null {
  return offenesFeld.value?.key ?? (offeneListe.value ? `liste:${offeneListe.value.bausteinId}` : letzterHalt);
}

/**
 * Der nächste Halt nach dem Merkpunkt: der erste, der beim Öffnen der Stelle nicht davor lag, außer der Stelle selbst.
 * Rückwärts der letzte, der davor lag. Gibt es in der Richtung keinen mehr, geht es am anderen Ende weiter.
 */
function folgender(liste: Halt[], rueckwaerts: boolean): Halt {
  const m = merkpunkt;
  const jetzt = m?.kennung ?? aktuelleKennung();
  const andere = liste.filter((h) => haltKennung(h) !== jetzt);
  if (andere.length === 0) return liste[0];
  if (!m) return rueckwaerts ? andere[andere.length - 1] : andere[0];
  if (rueckwaerts) {
    const vorher = andere.filter((h) => m.davor.has(haltKennung(h)));
    return vorher[vorher.length - 1] ?? andere[andere.length - 1];
  }
  return andere.find((h) => !m.davor.has(haltKennung(h))) ?? andere[0];
}

function geheZu(h: Halt) {
  zugSprung();
  letzterHalt = haltKennung(h);
  merke(letzterHalt, h.rang);
  offenesFeld.value = null;
  if (h.art === "liste") {
    offeneListe.value = { bausteinId: h.bausteinId, key: h.key };
    return;
  }
  offeneListe.value = null;
  if (h.art === "feld") {
    oeffneFeld(h.feld);
    return;
  }
  // Der Fokus geht erst nach dem Neuzeichnen, aber im selben Ereignis (E-43, Grundsatz 3): auf das Ganze, nie auf
  // „Übernehmen ✓“ oder die erste Seite. Erst eine eigene Taste (Ü, Ziffer) setzt dort etwas.
  nachDemZeichnen(() => {
    if (h.art === "abschnitt") {
      // Handtext oder freie Ergänzung mit Lückenzeichen, sonst das Menü des Abschnitts (dort lässt sich ein fehlender Baustein entfernen).
      const in_ = (s: string) => document.querySelector<HTMLElement>(`[data-abschnitt="${h.abschnitt}"] ${s}`);
      const ziel = in_(".handtext textarea") ?? in_(".zusatz textarea") ?? in_(".zusatz-knopf") ?? in_("[aria-haspopup='menu']");
      inSicht(ziel ?? document.querySelector(`[data-abschnitt="${h.abschnitt}"]`));
      ziel?.focus({ preventScroll: true });
      return;
    }
    const el =
      h.art === "block"
        ? document.querySelector<HTMLElement>(`[data-abschnitt="${h.abschnitt}"] [data-block="${CSS.escape(h.bausteinId)}"]`)
        : document.querySelector<HTMLElement>(h.art === "seite" ? "[data-seitenwahl] [role=radiogroup]" : "[data-personwahl] [role=radiogroup]");
    inSicht(el);
    el?.focus({ preventScroll: true });
  });
}

/** Alles geklärt: Der nächste Schritt ist das Kopieren. Der Knopf ist erst nach dem Neuzeichnen freigegeben (QA-06, E-24). */
function amEnde() {
  zugSprung();
  offenesFeld.value = null;
  offeneListe.value = null;
  letzterHalt = null;
  merkpunkt = null;
  nachDemZeichnen(() => {
    const knopf = document.querySelector<HTMLElement>("[data-naechste-kopie]");
    inSicht(knopf);
    knopf?.focus({ preventScroll: true });
  });
}

/**
 * Springt zur nächsten offenen Stelle oder zum nächsten Vorschlag (F2). Gibt
 * false zurück, wenn nichts mehr zu klären ist; dann hat „… kopieren“ den Fokus.
 */
export function naechsteStelle(rueckwaerts = false): boolean {
  const liste = halte();
  if (liste.length === 0) {
    amEnde();
    return false;
  }
  geheZu(folgender(liste, rueckwaerts));
  return true;
}

/**
 * Nach einer Eingabe: weiter zur nächsten Stelle dahinter, gleich ob Lücke,
 * Befundblock oder Vorschlag. So wird ein Abschnitt nach dem anderen fertig.
 * Liegt dahinter nichts mehr, geht es zur ersten Stelle, die noch offen ist;
 * ist alles geklärt, hat „… kopieren“ den Fokus.
 */
export function weiter() {
  offenesFeld.value = null;
  naechsteStelle();
}

/**
 * Knopf einer Sammelangabe (leere Vorgeschichte): setzt alle Angaben in einem
 * Rückgängig-Schritt und nennt jede in der Meldung, mit dem Fall. An die Stelle
 * des Knopfs tritt eine Zeile, die nichts auslöst, und der Fokus bleibt dort:
 * Ein zweiter Klick oder ein zweites Enter trifft nichts, und kein Fenster legt
 * sich über die Stelle. F2 geht hinter der ersten gesetzten Angabe weiter.
 */
export function sammelangabeSetzen(bausteinId: string): SammelSetzung[] {
  const fall = aktiverFall.value;
  if (!fall) return [];
  const { fall: neu, gesetzt } = mitSammelangabe(fall, bausteinId, INDEX);
  if (gesetzt.length === 0) return [];
  aendereFall(fall.id, () => neu);
  const keys = gesetzt.map((g) => g.schritt.key);
  hebeHervor(keys);
  sammelErledigt.value = { fallId: fall.id, bausteinId, aussagen: sammelAussagen(gesetzt.map((g) => g.schritt)), stand: bausteinStand(neu, bausteinId) };
  melde({
    text: `Eingefügt in Fall ${fall.nr}: ${gesetzt.map((g) => `${g.schritt.label}: ${g.schritt.wert}`).join(" · ")}`,
    art: "ok",
    aktion: { label: "Rückgängig", ausfuehren: () => void sammelangabeZuruecknehmen(fall.id, gesetzt) },
  });
  offenesFeld.value = null;
  offeneListe.value = null;
  const r = reihenfolge();
  letzterHalt = null;
  merke(null, Math.min(...keys.map((k) => r.stelle.get(k) ?? Infinity)));
  nachDemZeichnen(() => document.querySelector<HTMLElement>(`[data-sammel-erledigt="${CSS.escape(bausteinId)}"]`)?.focus({ preventScroll: true }));
  return gesetzt;
}

/**
 * „Rückgängig“ in der Meldung: nimmt genau diese Eingaben zurück, auch wenn
 * inzwischen anderes geändert oder der Fall gewechselt wurde, und nennt den
 * Fall. Der Fokus geht auf die erste wieder offene Angabe, nicht auf den
 * wieder erscheinenden Knopf: Ein Enter öffnet dort das Feld, statt die
 * Aussagen erneut zu setzen. Gibt false zurück, wenn nichts zurückzunehmen war.
 */
export function sammelangabeZuruecknehmen(fallId: string, gesetzt: SammelSetzung[]): boolean {
  const vorher = faelle.peek().find((f) => f.id === fallId);
  const nachher = vorher ? ohneSammelangabe(vorher, gesetzt) : undefined;
  if (!vorher || !nachher || nachher === vorher) {
    melde({ text: vorher ? `Nichts zurückzunehmen: Die Angaben in Fall ${vorher.nr} sind inzwischen geändert.` : "Nichts zurückzunehmen: Der Fall ist geschlossen.", art: "ok" });
    nachDemZeichnen(() => fokusSichern());
    return false;
  }
  const zurueck = gesetzt.filter((g) => vorher.werte[g.schritt.key] === g.schritt.wert).map((g) => g.schritt);
  aendereFall(fallId, () => nachher);
  melde({ text: `Zurückgenommen in Fall ${vorher.nr}: ${zurueck.map((s) => s.label).join(", ")}`, art: "ok" });
  if (aktivId.peek() !== fallId) {
    nachDemZeichnen(() => fokusSichern());
    return true;
  }
  offenesFeld.value = null;
  offeneListe.value = null;
  const keys = zurueck.map((s) => s.key);
  hebeHervor(keys);
  // F2 öffnet als Nächstes genau die Angabe, auf der der Fokus liegt.
  letzterHalt = null;
  merke(null, reihenfolge().stelle.get(keys[0]) ?? 0);
  nachDemZeichnen(() => {
    const el = tokenElement(keys[0]);
    if (!el) return fokusSichern();
    inSicht(el);
    el.focus({ preventScroll: true });
  });
  return true;
}

/** Führt zur ersten Stelle eines Abschnitts, die das Kopieren verhindert. */
export function klaere(a: AbschnittAnsicht) {
  const h = halte(a)[0];
  if (h) geheZu(h);
  else inSicht(document.querySelector(`[data-abschnitt="${a.id}"]`));
}

function format() {
  const e = einstellungen.value;
  return { zeilenende: e.zeilenende, zeichen: e.zeichen };
}

export function fallKennung(f: Fall): string {
  return `Fall ${f.nr} · ${fallName(f, INDEX)}${f.etikett.trim() ? ` · ${f.etikett.trim()}` : ""}`;
}

export interface LetzteKopie {
  fallId: string;
  /** Abschnitt oder "alles" */
  abschnitt: AbschnittId | "alles";
  was: string;
  fall: string;
  um: number;
  zeichen: number;
  anfang: string;
  platzhalter: number;
}

/** Was zuletzt kopiert wurde. Die App weiß nicht, ob und wo es eingefügt wurde. */
export const letzteKopie = signal<LetzteKopie | null>(null);

/** Text, den der Browser nicht in die Zwischenablage schreiben ließ; wird zum Kopieren von Hand angezeigt. */
export const handkopie = signal<{ was: string; text: string } | null>(null);

// Ob der Arzt das Fenster seit dem letzten Kopieren verlassen hat, also vermutlich ins KIS gewechselt ist.
let fensterVerlassen = true;
window.addEventListener?.("blur", () => (fensterVerlassen = true));

const NICHT_KOPIERT = "[Kitteltext: nichts kopiert, der Abschnitt ist noch nicht fertig]";

/**
 * Ein Kopierbefehl, der nichts kopiert, darf den alten Inhalt der
 * Zwischenablage nicht stehen lassen: Sonst fügt Strg+V den Text des vorigen
 * Abschnitts oder des vorigen Patienten ein.
 */
function entwerteZwischenablage() {
  void inZwischenablage(NICHT_KOPIERT);
}

/**
 * Ein Kopierbefehl über die Tastatur, der nichts kopiert, öffnet nichts (QA-01): Ein Fenster, das sich dabei öffnet,
 * liegt oft außer Sicht und nähme die nächste Ziffer. Der Fokus geht auf „… klären“ des Abschnitts; erst Enter oder
 * ein Klick dort führt zur Stelle.
 */
function nichtKopiert(a: AbschnittAnsicht) {
  entwerteZwischenablage();
  const gruende = [a.offen > 0 ? `${a.offen} offen` : "", a.vorschlag > 0 ? `${a.vorschlag} ${a.vorschlag === 1 ? "Vorschlag" : "Vorschläge"} nicht übernommen` : ""].filter(Boolean);
  melde({ text: `Nicht kopiert: ${a.titel} ist noch nicht fertig (${gruende.join(", ")}).`, art: "warnung" }, 5000);
  offenesFeld.value = null;
  offeneListe.value = null;
  nachDemZeichnen(() => {
    const knopf = document.querySelector<HTMLElement>(`[data-abschnitt="${a.id}"] .kopieren`);
    inSicht(document.querySelector(`[data-abschnitt="${a.id}"]`));
    knopf?.focus({ preventScroll: true });
  });
}

async function kopiere(fall: Fall, abschnitt: AbschnittId | "alles", was: string, text: string, teile: AbschnittAnsicht[]): Promise<boolean> {
  // Fall und Bezeichnung stehen fest, bevor auf die Zwischenablage gewartet wird: Wechselt der Arzt inzwischen den Fall, gilt der Vermerk trotzdem dem richtigen.
  const kennung = fallKennung(fall);
  const start = jetztMs();
  // Wer kopiert, hat den Text vor sich: Der Zug davor ist beendet. Eine verworfene Taste danach nimmt nichts zurück, was
  // schon im KIS stehen kann, und bietet es auch nicht als „eben gesetzt“ an (E-45).
  kette = neueKette(start);
  vorige = [];
  letzteUebernahme = null;
  offenerBefehl = null;
  const ablage = fuerZwischenablage(text, format());
  const ok = await inZwischenablage(ablage);
  if (!ok) {
    handkopie.value = { was: `${was} · ${kennung}`, text: ablage };
    return false;
  }
  const platzhalter = teile.reduce((n, a) => n + a.spaeter.length, 0);
  vermerke(fall.id, (f) => alsKopiert(f, teile.map((a) => ({ id: a.id, text: a.text }))));
  fensterVerlassen = false;
  // Wer einmal kopiert hat, braucht die Kurzanleitung über dem Brief nicht mehr.
  if (!einstellungen.value.tippGesehen) setzeEinstellung("tippGesehen", true);
  letzteKopie.value = { fallId: fall.id, abschnitt, was, fall: kennung, um: Date.now(), zeichen: ablage.length, anfang: text.replace(/\s+/g, " ").slice(0, 90), platzhalter };
  const unsicher = format().zeichen === "einfach" ? unsichereZeichen(text) : [];
  const hinweise = [
    platzhalter > 0 ? `${platzhalter} Platzhalter im KIS ergänzen` : "",
    unsicher.length > 0 ? `Zeichen, die das KIS verfälschen kann: ${unsicher.join(" ")}` : "",
    teile.some((a) => a.seitenkonflikt) ? "Seitenangabe im freien Text prüfen" : "",
  ].filter(Boolean);
  const satz = `${was} kopiert · ${kennung}${hinweise.length ? ` · ${hinweise.join(" · ")}` : ""}`;
  const warnung = hinweise.length > 0;
  const dauer = warnung ? 7000 : 3500;
  // Kam inzwischen eine verworfene Taste, ergänzt die Sperrmeldung die Kopiermeldung, Kopie zuerst (MT-04).
  const m: Meldung = { text: satz, art: warnung ? "warnung" : "ok" };
  const nachSperre = sperre !== null && sperre.seit >= start;
  kopie = { text: satz, warnung, dauer, bis: jetztMs() + dauer, meldung: nachSperre ? null : m };
  if (nachSperre) zeigeSperre();
  else melde(m, dauer);
  return true;
}

/** Kopiert einen Abschnitt, wenn er fertig ist. Sonst führt der Aufruf zur ersten Stelle, die noch zu klären ist. */
export async function kopiereAbschnitt(a: AbschnittAnsicht): Promise<boolean> {
  const fall = aktiverFall.value;
  if (!fall || a.leer) return false;
  if (!a.fertig) {
    klaere(a);
    return false;
  }
  return kopiere(fall, a.id, a.titel, a.text, [a]);
}

/** Der Brief ist nur zu sehen, wenn ein Fall aktiv ist und die Vorlagensuche ihn nicht verdeckt. */
function sichtbarerBrief(): BriefAnsicht | null {
  return sucheOffen.value === null ? brief.value : null;
}

export async function kopiereAlles(): Promise<boolean> {
  const b = sichtbarerBrief();
  const fall = aktiverFall.value;
  if (!b || !fall) return false;
  const teile = sichtbareAbschnitte(b);
  if (teile.length === 0) return false;
  // Auch ein zweites Kopieren mit dem Fokus schon auf dem Knopf schützt das Enter danach (QA-27).
  zugSprung();
  const unfertig = teile.find((a) => !a.fertig);
  if (unfertig) {
    nichtKopiert(unfertig);
    return false;
  }
  return kopiere(fall, "alles", "Ganzer Brief", briefText(b, einstellungen.value.ueberschriften), teile);
}

/** Abschnitte, die noch nicht kopiert oder seit dem Kopieren geändert wurden. */
export function ausstehend(b: BriefAnsicht | null = brief.value): AbschnittAnsicht[] {
  if (!b) return [];
  return sichtbareAbschnitte(b).filter((a) => !a.kopiert || a.geaendertSeitKopie);
}

/** Abschnitte, die kopiert wurden, jetzt aber leer oder aus dem Brief genommen sind: Im KIS steht noch der alte Text. */
export function verwaist(b: BriefAnsicht | null = brief.value): AbschnittAnsicht[] {
  if (!b) return [];
  return b.abschnitte.filter((a) => a.kopiert && (a.leer || a.ausgeblendet));
}

/**
 * Kopiert den nächsten Abschnitt der Reihe (Strg+Enter). Hat der Arzt das
 * Fenster seit dem letzten Kopieren nicht verlassen, liegt der letzte
 * Abschnitt noch ungenutzt in der Zwischenablage; dann wird er erneut kopiert
 * statt übersprungen.
 */
export async function kopiereNaechsten(): Promise<void> {
  const b = sichtbarerBrief();
  const fall = aktiverFall.value;
  if (!b || !fall) return;
  zugSprung();
  const letzte = letzteKopie.value;
  if (!fensterVerlassen && letzte && letzte.fallId === fall.id && letzte.abschnitt !== "alles") {
    const derselbe = sichtbareAbschnitte(b).find((a) => a.id === letzte.abschnitt && a.kopiert && !a.geaendertSeitKopie);
    if (derselbe) {
      await kopiere(fall, derselbe.id, `${derselbe.titel} (erneut, noch nicht ins KIS gewechselt)`, derselbe.text, [derselbe]);
      return;
    }
  }
  const offen = ausstehend(b);
  if (offen.length === 0) {
    melde({ text: "Alle Abschnitte sind bereits kopiert.", art: "ok" });
    return;
  }
  inSicht(document.querySelector(`[data-abschnitt="${offen[0].id}"]`));
  if (!offen[0].fertig) nichtKopiert(offen[0]);
  else await kopiere(fall, offen[0].id, offen[0].titel, offen[0].text, [offen[0]]);
}

/**
 * Verwirft Fälle nach langer Ruhe. Mit dem Fall verschwindet auch der Auszug „Zuletzt kopiert“, wie beim Räumen des
 * Arbeitsplatzes (QA-16); sonst stünde Brieftext eines verworfenen Falls weiter in der Seitenleiste.
 */
export function verwerfeAlte(jetzt = Date.now()): number {
  const n = verwerfeAbgelaufene(jetzt);
  const k = letzteKopie.value;
  if (n > 0 && k && !faelle.value.some((f) => f.id === k.fallId)) letzteKopie.value = null;
  return n;
}

/** Räumt den Arbeitsplatz: alle Fälle, die Anzeige „Zuletzt kopiert" und die Zwischenablage. */
export function raeumeArbeitsplatz() {
  allesLoeschen();
  letzteKopie.value = null;
  handkopie.value = null;
  void inZwischenablage(" ");
}

/**
 * Markiert der Arzt Text im Brief und drückt Strg+C, gelten dieselben Regeln
 * wie beim Kopierknopf. Berührt die Markierung eine offene Stelle oder einen
 * Vorschlag, wird nichts kopiert: Der markierte Text hätte dort stille Löcher
 * („Handgelenk rechts: .“). Sonst geht der Text wie eingestellt umgeschrieben
 * in die Zwischenablage.
 */
export function beiKopieAusBrief(e: ClipboardEvent) {
  const sel = window.getSelection?.();
  const auswahl = sel?.toString() ?? "";
  if (!sel || !auswahl.trim() || !e.clipboardData) return;
  const wurzel = e.currentTarget as HTMLElement | null;
  const unfertig = [...(wurzel?.querySelectorAll<HTMLElement>(".tok.z-offen, .tok.z-vorschlag") ?? [])].filter((el) => sel.containsNode(el, true));
  e.preventDefault();
  if (unfertig.length > 0) {
    e.clipboardData.setData("text/plain", NICHT_KOPIERT);
    melde({ text: "Nicht kopiert: Die Markierung enthält offene Stellen oder Vorschläge. Erst klären, oder nur fertigen Text markieren.", art: "warnung" }, 6000);
    return;
  }
  e.clipboardData.setData("text/plain", fuerZwischenablage(auswahl, format()));
}

export function uhrzeit(ms: number): string {
  return new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** Alter eines Falls in Worten, sobald es für die Unterscheidung zählt (ab zwei Stunden). */
export function alterInWorten(f: Fall, jetzt = Date.now()): string {
  const stunden = Math.floor((jetzt - f.erstellt) / 3600_000);
  if (stunden < 2) return "";
  const tag = new Date(f.erstellt).toDateString() === new Date(jetzt).toDateString();
  return tag ? `vor ${stunden} Std.` : `seit ${new Date(f.erstellt).toLocaleDateString("de-DE", { weekday: "short" })} ${uhrzeit(f.erstellt)}`;
}
