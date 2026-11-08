// Was eine Vorlage an gemeinsamen Bausteinen für ihre Diagnose ändert, ohne
// deren Wortlaut anzufassen. Die Vorlage legt das fest; die Engine liest es.

import type { AbschnittId, Baustein, Fall, Vorlage, Wahlstelle } from "../model/types.ts";
import { wahlSchluessel } from "../model/types.ts";
import type { KatalogIndex } from "./render.ts";
import { istKisSicher } from "./text.ts";

/**
 * Schnellwerte des Katalogs an einem Feld, wie diese Vorlage sie anbietet: ihre
 * eigene Liste, wenn sie eine hat, sonst die des Bausteins.
 */
export function schnellwerteVon(vorlage: Vorlage | undefined, key: string, katalogwerte: string[]): string[] {
  return vorlage?.schnellwerte?.[key] ?? katalogwerte;
}

/** Bausteine, die die Vorlage anbietet: fest in ihren Abschnitten oder an einer Entweder-oder-Stelle. */
export function bausteineDerVorlage(v: Vorlage): Set<string> {
  return new Set([...Object.values(v.abschnitte).flatMap((l) => l ?? []), ...(v.wahl ?? []).flatMap((w) => w.bausteine)]);
}

/**
 * Baustein des Falls, vor dem eine Entweder-oder-Stelle steht; `undefined`
 * heißt: am Ende des Abschnitts, wie ohne `vor`. `ids` sind die Bausteine des
 * Abschnitts im Fall in ihrer Reihenfolge. Hat der Arzt den Baustein aus `vor`
 * entfernt, steht die Stelle vor dem nächsten, der ihm in der Vorlage folgt;
 * fehlen auch diese, am Ende. Ein `vor`, das auf keinen festen Baustein des
 * Abschnitts zeigt (etwa aus einer eingefügten eigenen Vorlage), gilt nicht.
 */
export function stelleVor(v: Vorlage, w: Wahlstelle, ids: string[]): string | undefined {
  if (typeof w.vor !== "string") return undefined;
  const fest = v.abschnitte[w.abschnitt] ?? [];
  const ab = fest.indexOf(w.vor);
  if (ab === -1) return undefined;
  const anStellen = new Set((v.wahl ?? []).flatMap((x) => x.bausteine));
  const folgende = new Set(fest.slice(ab).filter((id) => !anStellen.has(id)));
  return ids.find((id) => folgende.has(id));
}

/** Verstöße einer Vorlage gegen die Regeln für den Platz ihrer Entweder-oder-Stellen (`vor`); leer, wenn alles stimmt. */
export function wahlPlatzFehler(v: Vorlage, index: KatalogIndex): string[] {
  const fehler: string[] = [];
  const anStellen = new Set((v.wahl ?? []).flatMap((x) => x.bausteine));
  for (const w of v.wahl ?? []) {
    if (w.vor === undefined) continue;
    const ort = `${v.id}: Wahlstelle „${w.label}“ vor ${JSON.stringify(w.vor)}`;
    if (typeof w.vor !== "string" || !w.vor) {
      fehler.push(`${ort}: keine Baustein-ID`);
      continue;
    }
    const vor = w.vor;
    if (!index.bausteine.has(vor)) fehler.push(`${ort}: Baustein fehlt im Katalog`);
    if ((v.abschnitte[w.abschnitt] ?? []).includes(vor)) continue;
    // Jede Abweichung heißt, dass die Stelle ins Leere zeigt; die Meldung sagt, wohin.
    const anderer = (Object.entries(v.abschnitte) as [AbschnittId, string[] | undefined][]).find(([, l]) => l?.includes(vor))?.[0];
    if (anStellen.has(vor)) fehler.push(`${ort}: Baustein einer Entweder-oder-Stelle; vor steht nur ein fester Baustein`);
    else if (anderer) fehler.push(`${ort}: steht im Abschnitt ${anderer}, nicht in ${w.abschnitt}`);
    else fehler.push(`${ort}: steht nicht in abschnitte.${w.abschnitt} der Vorlage`);
  }
  return fehler;
}

/** Verweise der Sammelangabe eines Bausteins: was sie setzt und was sie ausblendet (`feld` oder `satz/angabe`). */
function sammelVerweise(b: Baustein): string[] {
  const sa = b.sammelangabe;
  return sa ? [...sa.angaben.map((t) => t.ref), ...(sa.ausblendenBei ?? []).map((s) => s.ref)] : [];
}

function teile(key: string): [string, string] | undefined {
  const [bid, id, rest] = key.split("/");
  return bid && id && rest === undefined ? [bid, id] : undefined;
}

/** Ein Satz mit Pflichtangabe (Gerinnungshemmung: ‹welche?›) ist eine Frage an den Arzt. */
export function istFragesatz(key: string, index: KatalogIndex): boolean {
  const t = teile(key);
  const seg = t && index.bausteine.get(t[0])?.segmente.find((s) => "id" in s && s.id === t[1]);
  return seg?.art === "option" && (seg.slots ?? []).some((sl) => sl.required === true);
}

/** Schlägt der Baustein selbst diesen Satz vor (`an: true`)? */
export function imBausteinVorgeschlagen(key: string, index: KatalogIndex): boolean {
  const t = teile(key);
  const seg = t && index.bausteine.get(t[0])?.segmente.find((s) => "id" in s && s.id === t[1]);
  return seg?.art === "option" && seg.an === true;
}

/**
 * Warum dieser Satz in der Vorlage nicht wegfallen darf; `undefined`, wenn er
 * es darf. Wegfallen darf nur ein Satz, der ohne Klick nicht im Brief stünde
 * und auf den nichts anderes baut: Ein weggelassener Vorschlag oder eine
 * weggelassene Frage verschwände für den Arzt unsichtbar.
 */
export function satzNichtWeglassbar(v: Vorlage, key: string, index: KatalogIndex): string | undefined {
  const t = teile(key);
  if (!t) return "Schlüssel braucht zwei Teile";
  const [bid, id] = t;
  const b = index.bausteine.get(bid);
  if (!b || !bausteineDerVorlage(v).has(bid)) return "Baustein gehört nicht zur Vorlage";
  const seg = b.segmente.find((s) => "id" in s && s.id === id);
  if (seg?.art !== "option") return "kein Satz; weglassen gilt nur für Sätze";
  if (seg.an) return "Satz ist im Baustein vorgeschlagen (an: true)";
  if ((v.vorgaben?.an ?? []).includes(key)) return "Satz steht in vorgaben.an";
  if ((v.entscheiden ?? []).includes(key)) return "Satz steht in entscheiden";
  if (sammelVerweise(b).some((r) => r.split("/")[0] === id)) return "Satz gehört zu einer Sammelangabe";
  return undefined;
}

/**
 * Warum `stelle` für den Satz `satz` keine Ersatzstelle ist; `undefined`, wenn
 * sie es ist. Eine Ersatzstelle ist eine Pflichtauswahl in einem anderen
 * Baustein der Vorlage: Steht er im Brief, muss der Arzt dort ohnehin wählen.
 */
export function keineErsatzstelle(v: Vorlage, satz: string, stelle: string, index: KatalogIndex): string | undefined {
  const t = teile(stelle);
  if (!t) return "Schlüssel braucht zwei Teile";
  const [bid, id] = t;
  if (bid === satz.split("/")[0]) return "liegt im Baustein des Satzes selbst";
  const b = index.bausteine.get(bid);
  if (!b || !bausteineDerVorlage(v).has(bid)) return "Baustein gehört nicht zur Vorlage";
  const seg = b.segmente.find((s) => "id" in s && s.id === id);
  if (seg?.art !== "auswahl") return "keine Auswahl";
  if (seg.default !== undefined || seg.variante) return "keine Pflichtauswahl";
  return undefined;
}

/**
 * Sätze, die die Vorlage in diesem Fall nicht anbietet. Ein Satz aus
 * `weglassen` fällt nur weg, solange der Arzt dieselbe Aussage an einer
 * Ersatzstelle macht: Ein Baustein mit einer Ersatzstelle steht im Fall, oder
 * eine noch unentschiedene Entweder-oder-Stelle bietet einen an. Nach „nichts
 * davon“ oder dem Entfernen des Bausteins steht der Satz wieder unter „+ …“.
 * Hat der Arzt den Satz selbst an- oder abgewählt oder umformuliert, bleibt er
 * sichtbar: Was er ausdrücklich gewählt hat, verschwindet nicht still aus dem
 * Brief (G-55). Schlüssel, die die Regeln oben nicht erfüllen (etwa aus einer
 * eingefügten eigenen Vorlage), gelten nicht. Ein ausgeblendeter oder von Hand
 * überschriebener Abschnitt zählt nicht als Ersatz: Seine Auswahl steht nicht im
 * Brief (CR-12, PS-07).
 */
export function weggelasseneStellen(fall: Fall, vorlage: Vorlage | undefined, index: KatalogIndex): Set<string> {
  const weg = new Set<string>();
  const liste = vorlage?.weglassen;
  if (!vorlage || !liste) return weg;
  const zaehlt = (a: string) => !fall.ausgeblendet[a as AbschnittId] && fall.manuell[a as AbschnittId] === undefined;
  const imFall = new Set(Object.entries(fall.bausteine).flatMap(([a, l]) => (zaehlt(a) ? (l ?? []) : [])));
  for (const [satz, ersatz] of Object.entries(liste)) {
    if (fall.optionen[satz] !== undefined || fall.eigen[satz] !== undefined) continue;
    if (!Array.isArray(ersatz) || satzNichtWeglassbar(vorlage, satz, index)) continue;
    const traeger = new Set(ersatz.filter((e) => !keineErsatzstelle(vorlage, satz, e, index)).map((e) => e.split("/")[0]));
    const offeneStelle = (vorlage.wahl ?? []).some(
      (w, nr) =>
        zaehlt(w.abschnitt) && !fall.versteckt[wahlSchluessel(w.abschnitt, nr)] && !w.bausteine.some((bid) => (fall.bausteine[w.abschnitt] ?? []).includes(bid)) && w.bausteine.some((bid) => traeger.has(bid)),
    );
    if (offeneStelle || [...traeger].some((bid) => imFall.has(bid))) weg.add(satz);
  }
  return weg;
}

/** Verstöße einer Vorlage gegen die Regeln für `weglassen` (Vorlagenformat); leer, wenn alles stimmt. */
export function weglassenFehler(v: Vorlage, index: KatalogIndex): string[] {
  if (v.weglassen === undefined) return [];
  if (!v.weglassen || typeof v.weglassen !== "object" || Array.isArray(v.weglassen)) return [`${v.id}: weglassen ist keine Zuordnung Satz → Ersatzstellen`];
  const fehler: string[] = [];
  for (const [satz, ersatz] of Object.entries(v.weglassen)) {
    const ort = `${v.id}: weglassen ${satz}`;
    const grund = satzNichtWeglassbar(v, satz, index);
    if (grund) fehler.push(`${ort}: ${grund}`);
    if ((v.vorgaben?.aus ?? []).includes(satz)) fehler.push(`${ort}: steht auch in vorgaben.aus`);
    for (const s of Object.keys(v.vorgaben?.slots ?? {})) if (s.startsWith(`${satz}/`)) fehler.push(`${ort}: steht auch in vorgaben.slots (${s})`);
    if (!Array.isArray(ersatz) || ersatz.length === 0) {
      fehler.push(`${ort}: braucht mindestens eine Ersatzstelle`);
      continue;
    }
    for (const e of ersatz.filter((e, i) => ersatz.indexOf(e) !== i)) fehler.push(`${ort}: Ersatzstelle ${e} doppelt`);
    for (const e of ersatz) {
      const f = typeof e === "string" ? keineErsatzstelle(v, satz, e, index) : "kein Text";
      if (f) fehler.push(`${ort}: Ersatzstelle ${e}: ${f}`);
    }
  }
  return fehler;
}

const SEITENWORT = /\b(recht|link)(s|e|er|en|em|es|sseitig\w*)\b|\bbeidseit\w*/i;

/** Verstöße einer Vorlage gegen die Regeln für `schnellwerte` (Vorlagenformat); leer, wenn alles stimmt. */
export function schnellwerteFehler(v: Vorlage, index: KatalogIndex): string[] {
  if (v.schnellwerte === undefined) return [];
  if (!v.schnellwerte || typeof v.schnellwerte !== "object" || Array.isArray(v.schnellwerte)) return [`${v.id}: schnellwerte ist keine Zuordnung Feld → Liste`];
  const fehler: string[] = [];
  const eigene = bausteineDerVorlage(v);
  for (const [key, liste] of Object.entries(v.schnellwerte)) {
    const ort = `${v.id}: schnellwerte ${key}`;
    const [bid, id, slotId, rest] = key.split("/");
    const b = index.bausteine.get(bid);
    if (!b || !eigene.has(bid) || !id) {
      fehler.push(`${ort}: Baustein gehört nicht zur Vorlage`);
      continue;
    }
    if (rest !== undefined) fehler.push(`${ort}: Schlüssel hat zu viele Teile`);
    else if (slotId === undefined) {
      const def = b.platzhalter.find((p) => p.id === id);
      if (!def || !b.segmente.some((s) => s.art === "platzhalter" && s.ref === id)) fehler.push(`${ort}: kein Feld im Text des Bausteins`);
      // Zahlen und Zeiträume je Diagnose wären Behandlungsvorgaben, kein Wortlaut (E-40).
      else if (def.typ !== "freitext" && def.typ !== "begriff") fehler.push(`${ort}: Feld vom Typ ${def.typ}, Schnellwerte nur für Freitext und Begriff`);
    } else {
      const seg = b.segmente.find((s) => "id" in s && s.id === id);
      const slot = seg && "slots" in seg ? seg.slots?.find((s) => s.id === slotId) : undefined;
      if (slot?.art !== "detail") fehler.push(`${ort}: keine Angabe vom Typ detail`);
    }
    // Ihr Wert ist ein Schnellwert des Katalogs; ersetzte die Vorlage die Liste, verschwände der Knopf still oder setzte, was das Feld nicht anbietet.
    if (sammelVerweise(b).includes(slotId === undefined ? id : `${id}/${slotId}`)) fehler.push(`${ort}: Feld gehört zu einer Sammelangabe`);
    if (!Array.isArray(liste)) {
      fehler.push(`${ort}: keine Liste`);
      continue;
    }
    for (const w of liste) {
      if (typeof w !== "string" || !w.trim()) fehler.push(`${ort}: leerer Eintrag`);
      else if (w !== w.trim()) fehler.push(`${ort}: Leerraum am Rand in „${w}“`);
      else if (!istKisSicher(w) || /[‹›]/.test(w)) fehler.push(`${ort}: Zeichen außerhalb des sicheren Vorrats in „${w}“`);
      else if (/\bPatient(in|en|innen)?\b|\bPat\./.test(w)) fehler.push(`${ort}: festes „Patient“ in „${w}“`);
      // Die Seite setzt die App aus dem Fall; ein Klick auf einen Wert mit Seitenwort schriebe sie ein zweites Mal, womöglich falsch.
      else if (SEITENWORT.test(w)) fehler.push(`${ort}: Seitenwort in „${w}“`);
    }
    for (const w of liste.filter((w, i) => liste.indexOf(w) !== i)) fehler.push(`${ort}: „${w}“ doppelt`);
  }
  return fehler;
}
