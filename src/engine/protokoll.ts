// Standardprotokolle der Nachbehandlung (Wunsch der Auftraggeberin vom 08.11.2026, E-49, E-52). Ein Protokoll steht
// als eigener Baustein im Procedere: je Zeile ein Satz (`z1`, `z2` …), je Zusatzzeile ein zuwählbarer Satz (`x1` …),
// Felder als Auswahl im Satz. Die Engine kennt keinen Inhalt; was ersetzt wird, steht in den Daten.
//
// Ersetzte Sätze werden nicht in den Fall geschrieben: Sie treten beim Zusammensetzen zurück, solange das Protokoll im
// Fall steht. Entfernt der Arzt das Protokoll, stehen sie genau so da wie vorher, auch eine eigene Wahl daran.

import type { AbschnittId, Baustein, BefundSlot, Fall, Protokoll, ProtokollFeld, Segment } from "../model/types.ts";
import type { KatalogIndex } from "./render.ts";
import { istKisSicher } from "./text.ts";
import type { Token } from "./text.ts";

export const PROTOKOLL_PRAEFIX = "Standardprotokoll: ";
export const PROTOKOLL_VERMERK = "ohne Leitlinie, Hausschema empfohlen";
const ID_MUSTER = /^proc-st-protokoll-[a-z0-9-]+$/;

/** Titel für den Kasten: Die Überschrift sagt schon „Standardprotokoll“. */
export function titelOhnePraefix(p: Protokoll): string {
  return p.titel.startsWith(PROTOKOLL_PRAEFIX) ? p.titel.slice(PROTOKOLL_PRAEFIX.length) : p.titel;
}

/** Felder eines Satzes in Lesereihenfolge, ohne `{seite}` (die Seite des Falls). */
export function feldnamen(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]).filter((n) => n !== "seite"))];
}

/** Kurzname einer Zeile für „+ …“, Fenstertitel und Meldungen: die Zeitangabe vor dem Doppelpunkt, sonst die ersten Wörter. */
export function zeilenName(text: string): string {
  const ohneFelder = text.replace(/\s*\{seite\}/g, "").replace(/\{[a-z]+\}/g, "…");
  const doppel = ohneFelder.indexOf(": ");
  if (doppel > 0 && doppel <= 50) return ohneFelder.slice(0, doppel);
  const woerter = ohneFelder.replace(/\.$/, "").split(/\s+/);
  return woerter.length > 5 ? `${woerter.slice(0, 5).join(" ")} …` : woerter.join(" ");
}

function slotFuer(name: string, f: ProtokollFeld): BefundSlot {
  // Ohne Vorwahl steht eine leere Option vorn: Die Stelle ist eine Lücke, bis der Arzt wählt.
  if (f.pflicht || f.vorwahl === undefined) return { art: "auswahl", id: name, label: f.label, optionen: ["", ...f.optionen], required: true };
  return { art: "auswahl", id: name, label: f.label, optionen: [...f.optionen], default: f.optionen.indexOf(f.vorwahl), required: true };
}

/**
 * Das Protokoll als Baustein des Procedere. Die Zeilen sind Sätze mit `an: true`: Steht das Protokoll ohne Übernahme im
 * Fall (eigene Vorlage), sind sie grau, ein Vorschlag. `mitProtokoll` schreibt sie als Aussage des Arztes in den Fall.
 */
export function protokollBaustein(p: Protokoll): Baustein {
  const segmente: Segment[] = [];
  const satz = (id: string, text: string, an: boolean) => {
    const slots = feldnamen(text)
      .filter((n) => p.felder[n])
      .map((n) => slotFuer(n, p.felder[n]));
    segmente.push({ art: "punkt" }, { art: "option", id, label: `Protokoll: ${zeilenName(text)}`, text, an, ...(slots.length > 0 ? { slots } : {}) });
  };
  p.zeilen.forEach((z, i) => satz(zeilenId(i), z, true));
  p.zusatz.forEach((z, i) => satz(zusatzId(i), z, false));
  return {
    id: p.id,
    titel: p.titel,
    typ: "procedere",
    abschnitt: "procedere",
    platzhalter: [],
    segmente,
    // Ärztlich freigegeben (E-49) heißt im Katalog „geprüft“; die Oberfläche nennt es „ärztlich geprüft“.
    status: p.pruefstatus === "freigegeben" ? "geprueft" : "entwurf",
  };
}

export function zeilenId(i: number): string {
  return `z${i + 1}`;
}

export function zusatzId(i: number): string {
  return `x${i + 1}`;
}

function bausteineImFall(fall: Fall): Set<string> {
  return new Set(Object.values(fall.bausteine).flatMap((l) => l ?? []));
}

/** Das Protokoll, das im Fall steht; höchstens eines (`mitProtokoll` ersetzt ein anderes). */
export function protokollImFall(fall: Fall, index: KatalogIndex): Protokoll | undefined {
  const ids = bausteineImFall(fall);
  return (index.katalog.protokolle ?? []).find((p) => ids.has(p.id));
}

/**
 * Protokolle, die der Kasten anbietet: die zur Vorlage des Falls und, für eine eigene Vorlage mit vorbelegtem Protokoll,
 * die zur Vorlage dieses Protokolls. Ohne Vorlage keine.
 */
export function protokolleFuer(fall: Fall, index: KatalogIndex): Protokoll[] {
  const alle = index.katalog.protokolle ?? [];
  const vorlagen = new Set<string>();
  if (fall.vorlageId) vorlagen.add(fall.vorlageId);
  const drin = protokollImFall(fall, index);
  if (drin) vorlagen.add(drin.vorlage);
  return alle.filter((p) => vorlagen.has(p.vorlage));
}

/**
 * Sätze und Auswahlen, die zurücktreten, weil ein Protokoll im Fall steht. Gilt nur, solange der Abschnitt des
 * Protokolls zählt: Ist er ausgeblendet oder von Hand überschrieben, steht das Protokoll nicht im Brief.
 */
export function ersetzteStellen(fall: Fall, index: KatalogIndex): Set<string> {
  const aus = new Set<string>();
  const alle = index.katalog.protokolle;
  if (!alle?.length) return aus;
  for (const [abschnitt, ids] of Object.entries(fall.bausteine) as [AbschnittId, string[]][]) {
    if (fall.ausgeblendet[abschnitt] || fall.manuell[abschnitt] !== undefined) continue;
    for (const p of alle) if ((ids ?? []).includes(p.id)) for (const k of p.ersetzt) aus.add(k);
  }
  return aus;
}

/** Nimmt das Protokoll samt allen Eingaben an ihm aus dem Fall. Ohne Protokoll im Fall kommt der Fall selbst zurück. */
export function ohneProtokoll(fall: Fall, id: string): Fall {
  if (!bausteineImFall(fall).has(id)) return fall;
  const praefix = `${id}/`;
  const ohne = <T>(rec: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith(praefix)));
  const bausteine: Fall["bausteine"] = {};
  for (const [a, l] of Object.entries(fall.bausteine) as [AbschnittId, string[]][]) bausteine[a] = (l ?? []).filter((x) => x !== id);
  const seiteBaustein = { ...fall.seiteBaustein };
  delete seiteBaustein[id];
  return {
    ...fall,
    bausteine,
    seiteBaustein,
    befund: ohne(fall.befund),
    slots: ohne(fall.slots),
    werte: ohne(fall.werte),
    auswahl: ohne(fall.auswahl),
    versteckt: ohne(fall.versteckt),
    optionen: ohne(fall.optionen),
    eigen: ohne(fall.eigen),
    spaeter: ohne(fall.spaeter),
  };
}

type OptionSeg = Extract<Segment, { art: "option" }>;

function saetze(b: Baustein): OptionSeg[] {
  return b.segmente.filter((s): s is OptionSeg => s.art === "option");
}

/** Was der Arzt an Feldern eines Protokolls gewählt hat, als Wortlaut je Feld (für den Wechsel der Variante). */
function antworten(fall: Fall, b: Baustein): Map<string, string> {
  const aus = new Map<string, string>();
  for (const seg of saetze(b)) {
    for (const slot of seg.slots ?? []) {
      if (slot.art !== "auswahl" || aus.has(slot.id)) continue;
      const roh = fall.slots[`${b.id}/${seg.id}/${slot.id}`];
      const i = roh !== undefined && /^\d+$/.test(roh) ? Number(roh) : -1;
      const text = slot.optionen[i];
      if (text) aus.set(slot.id, text);
    }
  }
  return aus;
}

/**
 * Übernimmt ein Protokoll als Ganzes (ausdrückliche Handlung des Arztes): Es steht zuoberst im Procedere, jede Zeile als
 * seine Aussage, jedes Feld mit Vorwahl auf der Vorwahl; Felder ohne Vorwahl bleiben Lücken. `zusatz`: Nummern der
 * Zusatzzeilen (ab 0), die gleich mitkommen. Steht schon ein anderes Protokoll im Fall, tritt es an dessen Stelle
 * (Wechsel der Variante): Gewählte Felder und gleichlautende Zusatzzeilen gehen mit, eigener Wortlaut nicht.
 */
export function mitProtokoll(fall: Fall, id: string, index: KatalogIndex, zusatz: readonly number[] = []): Fall {
  const p = index.protokolle.get(id);
  const b = index.bausteine.get(id);
  if (!p || !b) return fall;
  const alt = protokollImFall(fall, index);
  if (alt?.id === id) return fall;
  const altBaustein = alt ? index.bausteine.get(alt.id) : undefined;
  const mit = altBaustein ? antworten(fall, altBaustein) : new Map<string, string>();
  const zusatzVorher = new Set(
    altBaustein
      ? saetze(altBaustein)
          .filter((s) => /^x\d+$/.test(s.id) && fall.optionen[`${altBaustein.id}/${s.id}`] === true)
          .map((s) => s.text)
      : [],
  );
  const basis = alt ? ohneProtokoll(fall, alt.id) : fall;
  const optionen = { ...basis.optionen };
  const slots = { ...basis.slots };
  const zusatzIds = new Set(zusatz.map(zusatzId));
  for (const seg of saetze(b)) {
    const key = `${id}/${seg.id}`;
    const an = seg.an === true || zusatzIds.has(seg.id) || zusatzVorher.has(seg.text);
    if (!an) continue;
    optionen[key] = true;
    for (const slot of seg.slots ?? []) {
      if (slot.art !== "auswahl") continue;
      const vorher = mit.get(slot.id);
      let i = vorher !== undefined ? slot.optionen.indexOf(vorher) : -1;
      if (i < 0 && slot.default !== undefined) i = slot.default;
      if (i >= 0 && slot.optionen[i] !== "") slots[`${key}/${slot.id}`] = String(i);
    }
  }
  return { ...basis, bausteine: { ...basis.bausteine, procedere: [id, ...(basis.bausteine.procedere ?? [])] }, optionen, slots };
}

/** Wählt eine Zusatzzeile des Protokolls im Fall zu oder ab. */
export function mitZusatzzeile(fall: Fall, id: string, nr: number, an: boolean): Fall {
  if (!bausteineImFall(fall).has(id)) return fall;
  const key = `${id}/${zusatzId(nr)}`;
  const optionen = { ...fall.optionen };
  // Abgewählt heißt ausdrücklich aus: Auch eine eigene Vorlage, die die Zeile vorschlägt, setzt sie dann nicht.
  optionen[key] = an;
  return { ...fall, optionen };
}

/** Vorschau einer Zeile im Kasten: Seite des Falls, Vorwahl der Felder, Felder ohne Vorwahl als Lücke „‹Gehhilfe›“. */
export function vorschauZeile(p: Protokoll, text: string, fall: Fall): string {
  const seite = fall.seiteBaustein[p.id] ?? fall.seite;
  return text
    .replace(/\{seite\}/g, seite === null ? "‹Seite›" : seite === "ohne" ? "" : seite)
    .replace(/\{([a-z]+)\}/g, (ganz, name: string) => {
      const f = p.felder[name];
      return f ? (f.vorwahl ?? `‹${f.label}›`) : ganz;
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,:;])/g, "$1");
}

/** Felder, die nach der Übernahme noch zu wählen sind, als Bezeichnung („Gehhilfe“). */
export function offeneFelder(p: Protokoll): string[] {
  const genutzt = new Set(p.zeilen.flatMap(feldnamen));
  return Object.entries(p.felder)
    .filter(([n, f]) => genutzt.has(n) && (f.pflicht || f.vorwahl === undefined))
    .map(([, f]) => f.label);
}

/**
 * Was ein Schritt am Protokoll aus dem Brief nimmt (G-103): Stellen, die vorher zu sehen waren und danach ein Protokoll
 * ersetzt, mit ihrem Namen, je einmal, in Lesereihenfolge. `tokensVorher`: der Brief vor dem Schritt.
 */
export function verdraengteStellen(tokensVorher: readonly Token[], vorher: Fall, nachher: Fall, index: KatalogIndex): string[] {
  const alt = ersetzteStellen(vorher, index);
  const neu = ersetzteStellen(nachher, index);
  const namen: string[] = [];
  for (const t of tokensVorher) {
    if (!t.key || alt.has(t.key) || !neu.has(t.key)) continue;
    const name = t.label ?? t.t.replace(/\s+/g, " ").trim();
    if (name && !namen.includes(name)) namen.push(name);
  }
  return namen;
}

/**
 * Die erste Lücke eines Protokolls im Brief, die der Arzt im Fenster füllt (Gehhilfe, Region); ohne Lücken undefined.
 * Eine Lücke nur aus fehlender Seite oder Person zählt nicht: Die wählt der Arzt im Fallkopf.
 */
export function ersteProtokollLuecke(tokens: readonly Token[], id: string): string | undefined {
  return tokens.find((t) => t.bausteinId === id && t.key && t.zustand === "offen" && t.t.replace(/‹(Seite|Patient\/Patientin)›/g, "").includes("‹"))?.key;
}

/**
 * Verstöße der Protokolldaten gegen das Vorlagenformat (Abschnitt „Standardprotokolle“); leer, wenn alles stimmt.
 * Geprüft wird gegen den Katalog: Vorlage, ersetzte Stellen und Felder.
 */
export function protokollFehler(index: KatalogIndex): string[] {
  const fehler: string[] = [];
  const alle = index.katalog.protokolle ?? [];
  const katalogIds = new Set(index.katalog.regionen.flatMap((r) => r.bausteine.map((b) => b.id)));
  const gesehen = new Set<string>();
  const BEKANNT = new Set(["id", "nr", "vorlage", "variante", "titel", "zeilen", "zusatz", "felder", "ersetzt", "ohneLeitlinie", "vermerk", "pruefstatus", "quelle"]);
  for (const p of alle) {
    const ort = `${p.id ?? "?"} (Nr. ${p.nr})`;
    for (const k of Object.keys(p)) if (!BEKANNT.has(k)) fehler.push(`${ort}: unbekanntes Feld „${k}“`);
    if (typeof p.id !== "string" || !ID_MUSTER.test(p.id)) fehler.push(`${ort}: ID muss mit „proc-st-protokoll-“ beginnen und nur a-z, 0-9, Bindestrich enthalten`);
    if (gesehen.has(p.id)) fehler.push(`${ort}: ID doppelt`);
    gesehen.add(p.id);
    if (katalogIds.has(p.id)) fehler.push(`${ort}: ID gibt es schon als Baustein`);
    const v = index.vorlagen.get(p.vorlage);
    if (!v) fehler.push(`${ort}: Vorlage „${p.vorlage}“ gibt es nicht`);
    else if (v.setting !== "station") fehler.push(`${ort}: Standardprotokolle gehören zu Stationsvorlagen`);
    if (!p.variante?.trim()) fehler.push(`${ort}: Variante fehlt`);
    if (!p.titel?.startsWith(PROTOKOLL_PRAEFIX) || !titelOhnePraefix(p).trim()) fehler.push(`${ort}: Titel beginnt nicht mit „${PROTOKOLL_PRAEFIX}“`);
    if (!Array.isArray(p.zeilen) || p.zeilen.length === 0) fehler.push(`${ort}: keine Zeilen`);
    if (!Array.isArray(p.zusatz)) fehler.push(`${ort}: zusatz ist keine Liste`);
    const texte = [...(p.zeilen ?? []), ...(p.zusatz ?? [])];
    for (const t of texte) {
      if (!t.trim().endsWith(".")) fehler.push(`${ort}: Zeile ohne Schlusspunkt: „${t}“`);
      if (!istKisSicher(t)) fehler.push(`${ort}: Zeichen, die im KIS verfälscht ankämen: „${t}“`);
      if (/\s{2,}|\s[.,;:]/.test(t)) fehler.push(`${ort}: doppeltes Leerzeichen oder Leerzeichen vor Satzzeichen: „${t}“`);
      for (const m of t.matchAll(/\{([^}]*)\}/g)) if (m[1] !== "seite" && !p.felder?.[m[1]]) fehler.push(`${ort}: Feld {${m[1]}} ist nicht definiert`);
    }
    const genutzt = new Set(texte.flatMap(feldnamen));
    for (const [name, f] of Object.entries(p.felder ?? {})) {
      if (!/^[a-z]+$/.test(name) || name === "seite") fehler.push(`${ort}: Feldname „${name}“ ungültig`);
      if (!genutzt.has(name)) fehler.push(`${ort}: Feld {${name}} kommt in keiner Zeile vor`);
      if (!f.label?.trim()) fehler.push(`${ort}: Feld {${name}} ohne Bezeichnung`);
      if (!Array.isArray(f.optionen) || f.optionen.length < 2) fehler.push(`${ort}: Feld {${name}} braucht mindestens zwei Optionen`);
      else {
        if (f.optionen.some((o) => !o.trim())) fehler.push(`${ort}: Feld {${name}} hat eine leere Option`);
        if (new Set(f.optionen).size !== f.optionen.length) fehler.push(`${ort}: Feld {${name}} hat doppelte Optionen`);
        for (const o of f.optionen) if (!istKisSicher(o)) fehler.push(`${ort}: Feld {${name}}: Zeichen, die im KIS verfälscht ankämen: „${o}“`);
      }
      const mitVorwahl = f.vorwahl !== undefined;
      if (mitVorwahl === (f.pflicht === true)) fehler.push(`${ort}: Feld {${name}} braucht genau eines von „vorwahl“ und „pflicht“`);
      if (mitVorwahl && !f.optionen?.includes(f.vorwahl!)) fehler.push(`${ort}: Vorwahl von {${name}} ist keine der Optionen`);
    }
    if (new Set(p.ersetzt ?? []).size !== (p.ersetzt ?? []).length) fehler.push(`${ort}: ersetzt nennt eine Stelle doppelt`);
    const inVorlage = new Set(v ? [...(v.abschnitte.procedere ?? []), ...(v.wahl ?? []).filter((w) => w.abschnitt === "procedere").flatMap((w) => w.bausteine)] : []);
    for (const k of p.ersetzt ?? []) {
      const [bid, sid, rest] = k.split("/");
      const b = index.bausteine.get(bid);
      const seg = b?.segmente.find((s) => "id" in s && s.id === sid);
      if (!b || !seg || rest !== undefined) fehler.push(`${ort}: ersetzt „${k}“ gibt es nicht`);
      else if (seg.art !== "option" && seg.art !== "auswahl") fehler.push(`${ort}: ersetzt „${k}“ ist weder Satz noch Auswahl`);
      else if (v && !inVorlage.has(bid)) fehler.push(`${ort}: ersetzt „${k}“ steht nicht im Procedere der Vorlage`);
      else if (seg.art === "auswahl" && !alleinImPunkt(b, sid)) fehler.push(`${ort}: ersetzt „${k}“: Die Auswahl teilt ihren Listenpunkt mit einem anderen Satz`);
    }
    // Der Vermerk steht im Titel; so ist er überall sichtbar, wo das Protokoll genannt wird (E-49).
    const vermerkDa = p.vermerk === PROTOKOLL_VERMERK;
    if (p.ohneLeitlinie !== vermerkDa) fehler.push(`${ort}: ohneLeitlinie und Vermerk passen nicht zusammen`);
    if (p.vermerk !== null && !vermerkDa) fehler.push(`${ort}: unbekannter Vermerk „${p.vermerk}“`);
    if (vermerkDa && !p.titel.includes(`(${PROTOKOLL_VERMERK})`)) fehler.push(`${ort}: Vermerk fehlt im Titel`);
    if (!vermerkDa && p.titel.includes(PROTOKOLL_VERMERK)) fehler.push(`${ort}: Titel nennt einen Vermerk, den das Protokoll nicht trägt`);
    if (p.pruefstatus !== "freigegeben" && p.pruefstatus !== "entwurf") fehler.push(`${ort}: Prüfstatus „${p.pruefstatus}“ unbekannt`);
    if (!p.quelle?.trim()) fehler.push(`${ort}: Quelle fehlt`);
  }
  return fehler;
}

/**
 * Steht die Auswahl allein in ihrem Listenpunkt (neben festem Text, Seite und Person)? Nur dann kann der Punkt ganz
 * zurücktreten, ohne einen anderen Satz mitzunehmen.
 */
function alleinImPunkt(b: Baustein, id: string): boolean {
  let punkt: Segment[] = [];
  const punkte: Segment[][] = [punkt];
  for (const s of b.segmente) {
    if (s.art === "punkt" || s.art === "absatz") punkte.push((punkt = []));
    else punkt.push(s);
  }
  const hier = punkte.find((p) => p.some((s) => "id" in s && s.id === id));
  return !!hier && hier.every((s) => s.art === "text" || s.art === "seite" || s.art === "person" || ("id" in s && s.id === id));
}
