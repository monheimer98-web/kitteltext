// Kurze Texte, die nur angezeigt und nie kopiert werden (Design-Review 10.11.2026): was in einer gelben Stelle steht,
// ob sie beisammen bleibt, und die Kurzform von Seite und Person im kompakten Fallkopf. Rein rechnerisch, ohne DOM.

import type { Geschlecht, Seite } from "../model/types.ts";
import { PERSON_WORT } from "./aenderung.ts";
import { behaltenAnzeige, tagText } from "./behalten.ts";

/** Bis zu dieser Länge bleibt eine offene Stelle in einer Zeile; längere brechen um wie Text, statt aus dem Brief zu laufen. */
export const KURZE_STELLE = 30;

/**
 * Was an einer offenen Stelle steht: die Bezeichnung der Lücke oder der Satz mit Auslassungspunkten. Beginnt der Satz mit
 * der Lücke, sagt erst die Bezeichnung, worum es geht. Ein Punkt nach den Auslassungspunkten entfällt wie im Satz
 * („Arbeitsunfall: …“ statt „….“); Komma und Doppelpunkt bleiben.
 */
export function offeneAnzeige(kern: string, label: string | undefined): string {
  const einzeln = /^‹([^›]*)›[.,;:!?]?$/.exec(kern);
  if (einzeln) return einzeln[1];
  const mitPunkten = kern
    .replace(/‹[^›]*›/g, "…")
    .replace(/…(\s*…)+/g, "…")
    .replace(/…\./g, "…");
  return kern.startsWith("‹") && label ? `${label}: ${mitPunkten}` : mitPunkten;
}

/** Text der gelben Stelle: Punkt und Anzeige, mit geschütztem Leerzeichen, damit der Punkt nie allein am Zeilenende steht. */
export function offeneMarke(kern: string, label: string | undefined): string {
  return `●\u00a0${offeneAnzeige(kern, label)}`;
}

/** Ob eine offene Stelle beisammen bleibt (kein Umbruch in ihr). */
export function istKurzeStelle(marke: string): boolean {
  return [...marke].length <= KURZE_STELLE;
}

export interface KopfTeil {
  text: string;
  /** Noch zu wählen: gelb und mit ●. */
  fehlt: boolean;
  /**
   * Behaltener Fall: „kurz“ ist die Kurzbezeichnung, „warnung“ der frühere Tag des Beginns oder die nahe Löschzeit. Beides
   * hervorgehoben, aber nicht gelb: Gelb heißt „fehlt noch“ (E-69, E-82).
   */
  art?: "kurz" | "warnung";
}

/** Was die Titelzeile von einem behaltenen Fall braucht. */
export interface KopfBehalten {
  kurz: string;
  erstellt: number;
  geaendert: number;
  loeschenAb: number;
}

/**
 * Seite und Person für die Titelzeile des kompakten Fallkopfs (Fensterhöhe bis 720 px). Dort scrollen die Felder mit;
 * was gewählt ist oder fehlt, bleibt trotzdem stehen (Entscheidung Lead (a): Schutz gegen falschen Patienten und falsche
 * Seite). Die gewählte Seite steht schon im Titel und wird hier nicht wiederholt.
 *
 * Ein behaltener Fall bringt seine Kurzbezeichnung vorn mit, dazu „begonnen gestern“, wenn er nicht von heute ist, und die
 * Löschzeit, sobald sie nah ist (PS-R6-2, DS-R6-3, E-82): Am Klinik-PC scrollt die Zeile darunter mit dem Brief weg.
 */
export function kopfKurz(
  p: { brauchtSeite: boolean; seite: Seite | null; brauchtPerson: boolean; geschlecht: Geschlecht | null; alter: string },
  behalten?: KopfBehalten,
  jetzt = 0,
): KopfTeil[] {
  const teile: KopfTeil[] = [];
  if (behalten) teile.push({ text: `„${behalten.kurz}“`, fehlt: false, art: "kurz" });
  if (p.brauchtSeite && !p.seite) teile.push({ text: "● Seite wählen", fehlt: true });
  if (p.brauchtPerson) {
    if (!p.geschlecht) teile.push({ text: "● Person wählen", fehlt: true });
    else teile.push({ text: personKurz(p.geschlecht, p.alter), fehlt: false });
  }
  if (behalten) {
    const a = behaltenAnzeige(behalten, jetzt);
    if (a.alt) teile.push({ text: `begonnen ${tagText(behalten.erstellt, jetzt)}`, fehlt: false, art: "warnung" });
    if (a.bald) teile.push({ text: a.loeschen, fehlt: false, art: "warnung" });
  }
  return teile;
}

/**
 * Wie weit die Reiterleiste seitlich zu schieben ist, damit der aktive Reiter ganz zu sehen ist (QA-44, DS-R6-6). `links` und
 * `rechts` sind die Kanten des Reiters, `sichtLinks` und `sichtRechts` die des freien Bereichs der Leiste (ohne den
 * angehefteten Knopf „+ Neuer Fall“), alles im selben Koordinatensystem. Positiv heißt nach rechts schieben. Passt der Reiter
 * nicht ganz hinein, steht sein Anfang links.
 */
export function reiterVersatz(p: { links: number; rechts: number; sichtLinks: number; sichtRechts: number }): number {
  if (p.links < p.sichtLinks || p.rechts - p.links > p.sichtRechts - p.sichtLinks) return p.links - p.sichtLinks;
  if (p.rechts > p.sichtRechts) return p.rechts - p.sichtRechts;
  return 0;
}

/** „Patientin, 34 J.“; eine Zahl allein gilt als Jahre, sonst steht das Alter, wie es eingetragen ist („8 Monate“). */
export function personKurz(geschlecht: Geschlecht, alter: string): string {
  const a = alter.trim();
  if (!a) return PERSON_WORT[geschlecht];
  return `${PERSON_WORT[geschlecht]}, ${/^\d{1,3}$/.test(a) ? `${a} J.` : a}`;
}
