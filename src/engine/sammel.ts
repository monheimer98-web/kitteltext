// Sammelangabe: die ganz leere Vorgeschichte in einem Klick. Jede Angabe wird
// auf einen Wert gesetzt, den der Katalog an ihr schon als Schnellwert anbietet.
// Welche Angaben, mit welchem Wert und unter welcher Bezeichnung, steht im
// Baustein; die Engine kennt keine Diagnose.
//
// Der Klick ist eine Eingabe des Arztes: Die Werte stehen danach so im Fall,
// als hätte er sie einzeln gewählt. Deshalb gibt es den Knopf nur, solange alle
// seine Angaben leer sind. Er füllt nie auf: Wer schon etwas eingetragen hat,
// hat einen Patienten mit Vorgeschichte, und dort folgt aus einer leeren Angabe
// nichts für die anderen (Prüfbericht Patientensicherheit vom 03.11.2026, B-1).

import type { AbschnittId, Baustein, Fall, SammelSperre, Vorlage } from "../model/types.ts";
import { schluessel } from "../model/types.ts";
import { mitWert } from "./fall.ts";
import { gueltigerIndex } from "./render.ts";
import type { KatalogIndex } from "./render.ts";

/** Eine Angabe, die der Knopf setzt. */
export interface SammelSchritt {
  /** Schlüssel des Feldes im Fall (`baustein/feld`) */
  key: string;
  /** Bezeichnung der Angabe, wie sie die Lücke trägt */
  label: string;
  /** Wortlaut, der danach im Brief steht */
  wert: string;
  /** Aussage für die Beschriftung des Knopfs */
  aussage: string;
}

/** Was der Knopf gesetzt hat und was vorher dort stand; genug, um genau das zurückzunehmen. */
export interface SammelSetzung {
  schritt: SammelSchritt;
  vorher?: string;
}

function abschnittDes(fall: Fall, bausteinId: string): AbschnittId | undefined {
  return (Object.entries(fall.bausteine) as [AbschnittId, string[] | undefined][]).find(([, ids]) => ids?.includes(bausteinId))?.[0];
}

/**
 * Nennt der Arzt an dieser Stelle etwas außer den Leerwerten? Ein eigener
 * Wortlaut des Satzes und ein Platzhalter fürs KIS zählen als Nennung: Was
 * darin steht, sieht die Engine nicht. Ein Satz, der nicht im Brief steht,
 * nennt nichts; ein Vorschlag der Vorlage ist keine Nennung des Arztes.
 */
function nenntEtwas(fall: Fall, b: Baustein, sperre: SammelSperre, vorlage: Vorlage | undefined): boolean {
  const leer = new Set(["", ...(sperre.ausser ?? [])].map((w) => w.trim()));
  const [id, slotId] = sperre.ref.split("/");
  if (slotId === undefined) {
    const key = schluessel(b.id, id);
    return !!fall.spaeter[key] || !leer.has((fall.werte[key] ?? "").trim());
  }
  const seg = b.segmente.find((s) => s.art === "option" && s.id === id);
  if (seg?.art !== "option") return false;
  const stelle = schluessel(b.id, id);
  const key = schluessel(b.id, id, slotId);
  const imBrief = fall.optionen[stelle] ?? ((vorlage?.vorgaben?.an ?? []).includes(stelle) ? true : (vorlage?.vorgaben?.aus ?? []).includes(stelle) ? false : (seg.an ?? false));
  // Weglassen kann diese Stelle nicht: Was die Sammelangabe ausblendet, lässt `weggelasseneStellen` stehen.
  if (!imBrief) return false;
  if ((fall.eigen[stelle] ?? "").trim() || fall.spaeter[key]) return true;
  const slot = seg.slots?.find((s) => s.id === slotId);
  const roh = fall.slots[key];
  if (slot?.art !== "auswahl" || roh === undefined) return !!(roh ?? "").trim();
  const nr = gueltigerIndex(roh, slot.optionen.length);
  return nr !== undefined && !leer.has(slot.optionen[nr].trim());
}

/**
 * Alle Angaben der Sammelangabe, wenn jede davon im Brief eine leere Lücke ist;
 * sonst keine. Leer heißt: nichts getippt oder gewählt, nicht als Platzhalter
 * fürs KIS stehen gelassen, kein grauer Vorschlag. Eine Angabe, die das nicht
 * sein kann (keine Pflicht, Vorbelegung, Ersatztext, Wert ohne Schnellwert),
 * schaltet den Knopf ganz ab, statt dass er weniger sagt. Ebenso jede Stelle
 * aus `ausblendenBei`, an der der Arzt etwas außer den Leerwerten nennt.
 */
export function sammelSchritte(fall: Fall, bausteinId: string, index: KatalogIndex): SammelSchritt[] {
  const b = index.bausteine.get(bausteinId);
  const abschnitt = abschnittDes(fall, bausteinId);
  if (!b?.sammelangabe || abschnitt === undefined) return [];
  // Ein von Hand bearbeiteter Abschnitt zeigt keine Bausteine mehr; dort setzt der Knopf nichts Unsichtbares.
  if (fall.manuell[abschnitt] !== undefined) return [];
  // Nennt der Block schon ein Medikament (Gerinnungshemmung), ist die Vorgeschichte nicht leer (Nachprüfung, N-1).
  const vorlage = fall.vorlageId ? index.vorlagen.get(fall.vorlageId) : undefined;
  if ((b.sammelangabe.ausblendenBei ?? []).some((s) => nenntEtwas(fall, b, s, vorlage))) return [];
  const schritte: SammelSchritt[] = [];
  for (const teil of b.sammelangabe.angaben) {
    const def = b.platzhalter.find((p) => p.id === teil.ref);
    if (!def || !b.segmente.some((s) => s.art === "platzhalter" && s.ref === def.id)) return [];
    if (!def.required || def.default !== undefined || def.leerMarker !== undefined) return [];
    if (!(def.vorschlaege ?? []).includes(teil.wert)) return [];
    const key = schluessel(b.id, def.id);
    if (fall.spaeter[key] || (fall.werte[key] ?? "").trim()) return [];
    schritte.push({ key, label: def.label, wert: teil.wert, aussage: teil.aussage });
  }
  // Für eine einzelne Angabe gibt es den Schnellwert am Feld.
  return schritte.length >= 2 ? schritte : [];
}

/** Die Aussagen, die der Knopf setzt, mit Kommas gereiht („keine Vorerkrankungen, keine Allergien“). */
export function sammelAussagen(schritte: { aussage: string }[]): string {
  return schritte
    .map((s) => s.aussage.trim())
    .filter(Boolean)
    .join(", ");
}

/** Setzt alle Angaben der Sammelangabe, wenn alle leer sind. Sonst kommt derselbe Fall zurück. */
export function mitSammelangabe(fall: Fall, bausteinId: string, index: KatalogIndex): { fall: Fall; gesetzt: SammelSetzung[] } {
  let neu = fall;
  const gesetzt: SammelSetzung[] = [];
  for (const s of sammelSchritte(fall, bausteinId, index)) {
    gesetzt.push({ schritt: s, vorher: neu.werte[s.key] });
    neu = mitWert(neu, s.key, s.wert);
  }
  return { fall: neu, gesetzt };
}

/**
 * Nimmt genau die Eingaben des Knopfs zurück. Was der Arzt danach an einer
 * dieser Stellen selbst geändert hat, bleibt. Ist nichts mehr zurückzunehmen,
 * kommt derselbe Fall zurück.
 */
export function ohneSammelangabe(fall: Fall, gesetzt: SammelSetzung[]): Fall {
  let neu = fall;
  for (const { schritt: s, vorher } of gesetzt) {
    if (neu.werte[s.key] === s.wert) neu = mitWert(neu, s.key, vorher);
  }
  return neu;
}

/**
 * Stand aller Eingaben eines Bausteins im Fall als Text. Gleicher Text heißt:
 * Im Block hat sich nichts geändert. Die Oberfläche hält damit die Bestätigung
 * an der Stelle des Knopfs, bis der Arzt im Block weiterarbeitet.
 */
export function bausteinStand(fall: Fall, bausteinId: string): string {
  const gehoert = (k: string) => k === bausteinId || k.startsWith(`${bausteinId}/`);
  const felder = { seite: fall.seiteBaustein, befund: fall.befund, slots: fall.slots, werte: fall.werte, auswahl: fall.auswahl, versteckt: fall.versteckt, optionen: fall.optionen, eigen: fall.eigen, spaeter: fall.spaeter };
  return Object.entries(felder)
    .flatMap(([art, werte]) =>
      Object.keys(werte ?? {})
        .filter(gehoert)
        .sort()
        .map((k) => `${art}:${k}=${JSON.stringify((werte as Record<string, unknown>)[k])}`),
    )
    .join("\n");
}
