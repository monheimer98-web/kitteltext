import { useLayoutEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";
import { lueckeImText } from "../engine/text.ts";
import { verschiebung } from "../engine/bildlauf.ts";

/**
 * Merkt, wo der Fokus war, als sich ein Dialog oder die Suche öffnete, und gibt
 * ihn beim Schließen dorthin zurück. Ohne das landet er auf der Seite, und die
 * nächste Taste wirkt auf nichts. Gibt es die alte Stelle nicht mehr, bekommt
 * ihn der Knopf, mit dem es im Brief weitergeht.
 *
 * Gemerkt wird beim Zeichnen, nicht im Layout-Effekt: Preact führt die
 * Layout-Effekte der Kinder vor denen der Eltern aus. Setzt der Dialog den
 * Fokus in sein Feld, läse ein Effekt hier schon das Feld (CR-R6-12).
 */
export function useFokusZurueck(offen = true) {
  const vorher = useRef<HTMLElement | null>(null);
  const warOffen = useRef(false);
  if (offen && !warOffen.current) vorher.current = document.activeElement as HTMLElement | null;
  warOffen.current = offen;
  useLayoutEffect(() => {
    if (!offen) return;
    const ziel = vorher.current;
    return () => {
      window.setTimeout(() => fokusSichern(ziel), 0);
    };
  }, [offen]);
}

/** Liegt der Fokus nirgends mehr, bekommt ihn `vorher` oder der Knopf, mit dem es im Brief weitergeht. */
export function fokusSichern(vorher: HTMLElement | null = null) {
  const jetzt = document.activeElement;
  if (jetzt && jetzt !== document.body && jetzt.isConnected) return;
  const ziel = vorher && vorher !== document.body && vorher.isConnected ? vorher : document.querySelector<HTMLElement>(".f2:not([disabled]), [data-naechste-kopie]:not([disabled])");
  ziel?.focus({ preventScroll: true });
}

/**
 * Führt `fn` aus, sobald Preact die eben geänderten Signale gezeichnet hat, aber noch im selben Ereignis:
 * Preact zeichnet in einer Mikroaufgabe, und Mikroaufgaben laufen vor der nächsten Taste. Ein Fokus, der so
 * gesetzt wird, steht, bevor eine vorausgetippte Taste ankommt (E-43, Grundsatz 3). `setTimeout` dagegen läuft
 * erst nach bereits wartenden Tasten; die träfen dann noch das alte Ziel (PS-K04, PS-K06, PS-K07).
 */
export function nachDemZeichnen(fn: () => void) {
  void Promise.resolve()
    .then(() => Promise.resolve())
    .then(fn);
}

/**
 * F2 im freien Text (R5-02): wählt im mehrzeiligen Feld die nächste Lücke ‹…› hinter der Auswahl aus, rückwärts die
 * vorige. `true`, wenn es eine gab; sonst geht F2 wie überall zum nächsten Halt. Ein neues Ziel `vonVorn` (Sprung des
 * Durchlaufs ins Feld) nimmt die erste Lücke, rückwärts die letzte.
 */
export function waehleLuecke(ziel: EventTarget | null, rueckwaerts: boolean, vonVorn = false): boolean {
  if (!(ziel instanceof HTMLTextAreaElement) || ziel.readOnly || ziel.disabled) return false;
  const v = ziel.value;
  const l = vonVorn ? lueckeImText(v, rueckwaerts ? v.length + 1 : 0, rueckwaerts ? v.length + 1 : -1, rueckwaerts) : lueckeImText(v, ziel.selectionStart, ziel.selectionEnd, rueckwaerts);
  if (!l) return false;
  ziel.setSelectionRange(l.anfang, l.ende, rueckwaerts ? "backward" : "forward");
  zeigeAuswahl(ziel);
  return true;
}

/** Was der Spiegel vom Textfeld übernimmt, damit der Text dort genauso umbricht. */
const SPIEGEL = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "wordSpacing", "lineHeight", "textTransform", "textIndent", "tabSize", "wordBreak", "overflowWrap", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const;

/**
 * Wo die Auswahl im Inhalt des Textfelds steht, in Pixeln ab seiner Innenkante (bei `scrollTop` 0). Das Feld selbst sagt
 * es nicht; ein unsichtbarer Spiegel mit gleicher Schrift und Breite bricht den Text ebenso um und misst es.
 */
function auswahlLage(ta: HTMLTextAreaElement): { oben: number; unten: number } {
  const s = getComputedStyle(ta);
  const spiegel = document.createElement("div");
  for (const p of SPIEGEL) spiegel.style[p] = s[p];
  Object.assign(spiegel.style, {
    position: "absolute",
    visibility: "hidden",
    top: "0",
    left: "-10000px",
    boxSizing: "content-box",
    border: "0",
    whiteSpace: "pre-wrap",
    width: `${ta.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)}px`,
  });
  spiegel.textContent = ta.value.slice(0, ta.selectionStart);
  const marke = document.createElement("span");
  marke.textContent = ta.value.slice(ta.selectionStart, ta.selectionEnd) || "\u200b";
  spiegel.append(marke);
  document.body.append(spiegel);
  const oben = marke.offsetTop;
  const unten = oben + marke.offsetHeight;
  spiegel.remove();
  return { oben, unten };
}

/**
 * Holt die Auswahl ins Bild (CR-R6F-03, PS-R6F-5): erst im Textfeld, dann im Brief unter den stehenden Kopf, je mit einer
 * Zeile Rand. `setSelectionRange` rollt nicht; ohne das stand eine ausgewählte Lücke im langen Text außer Sicht, und ein
 * getipptes Zeichen ersetzte sie ungesehen.
 */
export function zeigeAuswahl(ta: HTMLTextAreaElement) {
  const lage = auswahlLage(ta);
  const s = getComputedStyle(ta);
  const zeile = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.45;
  const imFeld = verschiebung({ oben: ta.scrollTop, unten: ta.scrollTop + ta.clientHeight }, lage, zeile);
  if (imFeld) ta.scrollTop += imFeld;
  const rahmen = ta.closest<HTMLElement>(".papier-rahmen");
  if (!rahmen) return;
  const r = rahmen.getBoundingClientRect();
  const kopf = stehenderKopf(rahmen)?.getBoundingClientRect().bottom ?? r.top;
  const innen = ta.getBoundingClientRect().top + ta.clientTop - ta.scrollTop;
  const sicht = { oben: Math.max(r.top, kopf), unten: Math.min(r.top + rahmen.clientTop + rahmen.clientHeight, window.innerHeight) };
  const imBrief = verschiebung(sicht, { oben: innen + lage.oben, unten: innen + lage.unten }, zeile);
  if (imBrief) rahmen.scrollTop += imBrief;
}

/**
 * Der Teil des Fallkopfs, der beim Bildlauf stehen bleibt: im breiten Fenster der ganze Kopf, im schmalen oder niedrigen
 * nur die Titelzeile. Der Kopf behält dort `position: sticky`, hat aber mit `display: contents` keinen eigenen Kasten.
 */
export function stehenderKopf(rahmen: ParentNode): HTMLElement | undefined {
  return [...rahmen.querySelectorAll<HTMLElement>(".fallkopf, .fk-titel")].find((e) => {
    const s = getComputedStyle(e);
    return s.position === "sticky" && s.display !== "contents";
  });
}

/**
 * Setzt `--kopf-stehend` am Brief auf die Höhe des stehenden Kopfs (QA-40, QA-45). Daraus rechnet das Stylesheet den
 * Abstand, mit dem Sprünge und Bildlauf ein Ziel unter den Kopf legen statt dahinter. Gemessen statt fest: Die Höhe
 * wechselt mit Falldaten, Behalten-Zeile, Umbruch und Fensterhöhe.
 */
export function messeKopf(rahmen: HTMLElement | null | undefined) {
  if (!rahmen) return;
  const h = Math.ceil(stehenderKopf(rahmen)?.getBoundingClientRect().height ?? 0);
  if (rahmen.style.getPropertyValue("--kopf-stehend") !== `${h}px`) rahmen.style.setProperty("--kopf-stehend", `${h}px`);
}

/** Misst den Kopf beim Zeichnen und bei jeder Größenänderung, auch beim Wechsel in den kompakten Kopf. */
export function useKopfhoehe(kopf: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const el = kopf.current;
    const rahmen = el?.closest<HTMLElement>(".papier-rahmen") ?? null;
    if (!el || !rahmen) return;
    const miss = () => messeKopf(rahmen);
    miss();
    const beobachter = new ResizeObserver(miss);
    beobachter.observe(el);
    const titel = el.querySelector(".fk-titel");
    if (titel) beobachter.observe(titel);
    window.addEventListener("resize", miss);
    return () => {
      beobachter.disconnect();
      window.removeEventListener("resize", miss);
    };
  }, []);
}
