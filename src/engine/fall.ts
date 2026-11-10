// Operationen auf einem Fall. Alle Funktionen geben einen neuen Fall zurück.

import type {
  AbschnittId,
  BefundStatus,
  Brieftyp,
  Fall,
  FalldatumArt,
  Geschlecht,
  Seite,
  Setting,
  Vorlage,
} from "../model/types.ts";
import { FALLDATUM_ARTEN, abschnittVon, schluessel } from "../model/types.ts";
import { STELLUNG, gueltigerIndex } from "./render.ts";
import { istDatum } from "./datum.ts";
import { fristDatum, leseFristSchluessel } from "./falldaten.ts";
import { uebertragungen } from "./kopplung.ts";
import type { BriefAnsicht, KatalogIndex } from "./render.ts";
import { weggelasseneStellen } from "./vorlage.ts";
import { ersetzteStellen } from "./protokoll.ts";

function neueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function brieftypFuer(index: KatalogIndex, setting: Setting): Brieftyp {
  const typ = index.katalog.brieftypen.find((b) => b.setting === setting);
  if (!typ) throw new Error(`Kein Brieftyp für ${setting}`);
  return typ;
}

export function neuerFall(setting: Setting, index: KatalogIndex, nr = 1, jetzt = Date.now()): Fall {
  return {
    id: neueId(),
    nr,
    katalog: index.katalog.version,
    erstellt: jetzt,
    geaendert: jetzt,
    etikett: "",
    setting,
    brieftypId: brieftypFuer(index, setting).id,
    vorlageId: null,
    geschlecht: null,
    alter: "",
    seite: null,
    seiteBaustein: {},
    bausteine: {},
    ausgeblendet: {},
    befund: {},
    slots: {},
    werte: {},
    auswahl: {},
    versteckt: {},
    optionen: {},
    eigen: {},
    spaeter: {},
    daten: {},
    fristen: {},
    zusatz: {},
    manuell: {},
    kopiert: {},
    kopiertUm: {},
  };
}

/**
 * Bringt einen gespeicherten Fall auf den heutigen Aufbau. Fehlende Felder
 * werden ergänzt; was kein Fall ist, ergibt null. `format` ist der Formatstand,
 * mit dem die Sitzung geschrieben wurde (`SITZUNG_FORMAT`); ohne Angabe der heutige.
 */
export function ergaenzt(roh: unknown, index: KatalogIndex, format?: number): Fall | null {
  const f = roh as Partial<Fall> | null;
  if (!f || typeof f !== "object" || typeof f.id !== "string") return null;
  if (f.setting !== "zna" && f.setting !== "station") return null;
  const leer = neuerFall(f.setting, index, typeof f.nr === "number" ? f.nr : 1, typeof f.erstellt === "number" ? f.erstellt : Date.now());
  const fall = { ...leer, ...f } as Fall;
  for (const k of Object.keys(leer) as (keyof Fall)[]) {
    const soll = leer[k];
    if (soll !== null && typeof soll === "object" && (fall[k] === null || typeof fall[k] !== "object")) {
      (fall as unknown as Record<string, unknown>)[k] = soll;
    }
  }
  if (!index.brieftypen.has(fall.brieftypId)) fall.brieftypId = leer.brieftypId;
  // Ein Fall ohne Katalogversion stammt aus einer älteren Fassung: Seine Auswahlen können auf anderen Wortlaut zeigen.
  if (typeof f.katalog !== "number") fall.katalog = 0;
  if (typeof fall.geaendert !== "number") fall.geaendert = fall.erstellt;
  if (typeof fall.alter !== "string") fall.alter = "";
  if (typeof fall.etikett !== "string") fall.etikett = "";
  // Falldaten gibt es seit Speicherformat 2 (E-58). Ein älterer Fall hat keine; was kein gültiges Datum ist, entfällt.
  const daten: Fall["daten"] = {};
  for (const art of FALLDATUM_ARTEN) if (istDatum(fall.daten[art])) daten[art] = fall.daten[art];
  fall.daten = daten;
  fall.fristen = Object.fromEntries(Object.entries(fall.fristen).filter(([k, v]) => leseFristSchluessel(k) && (v === "" || istDatum(v))));
  // Bis Format 1 war die Medikation freier Text; ein Tabulator darin (eingefügt aus einer Tabelle) würde heute als
  // Feldgrenze gelesen, die Felder verschöben sich still (CR-R5-03). Die Zeile bleibt frei, wie sie getippt war.
  if (format !== undefined && format < 2) fall.werte = ohneTabulatorInMedikation(fall.werte, index);
  return fall;
}

function ohneTabulatorInMedikation(werte: Record<string, string>, index: KatalogIndex): Record<string, string> {
  const aus: Record<string, string> = {};
  for (const [k, w] of Object.entries(werte)) {
    const [bid, pid] = k.split("/");
    const typ = index.bausteine.get(bid)?.platzhalter.find((p) => p.id === pid)?.typ;
    aus[k] =
      typ === "medikation" && typeof w === "string"
        ? w
            .split("\n")
            .map((z) => (z.includes("\t") ? z.replace(/[ \t]*\t[ \t]*/g, " ").trim() : z))
            .join("\n")
        : w;
  }
  return aus;
}

/**
 * Nach einer Änderung des Katalogs können gespeicherte Auswahlen auf einen
 * anderen Wortlaut zeigen. Sie werden deshalb verworfen und sind neu zu
 * treffen; eingetragene Werte und freier Text bleiben.
 */
export function nachKatalogwechsel(fall: Fall, index: KatalogIndex): Fall {
  if (fall.katalog === index.katalog.version) return fall;
  const segment = (key: string) => {
    const [bausteinId, id] = key.split("/");
    return index.bausteine.get(bausteinId)?.segmente.find((s) => "id" in s && s.id === id);
  };
  // Getippte Angaben in Sätzen (Zahl, kurzer Text, Seite einer Struktur) hängen an keinem Index und bleiben.
  const slots: Record<string, string> = {};
  for (const [key, wert] of Object.entries(fall.slots)) {
    const seg = segment(key);
    const slot = seg && "slots" in seg ? seg.slots?.find((x) => x.id === key.split("/")[2]) : undefined;
    if (slot && slot.art !== "auswahl") slots[key] = wert;
    // Die Ausgangsstellung eines Messwerts steht als Wortlaut da und bleibt, solange die neue Fassung sie anbietet (R4-D3).
    if (seg?.art === "messwert" && key.split("/")[2] === STELLUNG && seg.stellungen?.includes(wert)) slots[key] = wert;
  }
  // Eigener Wortlaut bleibt im Brief stehen: Der Satz bleibt gewählt, der Befund auffällig.
  const befund: Fall["befund"] = {};
  const optionen: Fall["optionen"] = {};
  for (const key of Object.keys(fall.eigen)) {
    const seg = segment(key);
    if (seg?.art === "befund" && fall.befund[key] === "abw") befund[key] = "abw";
    if (seg?.art === "option" && fall.optionen[key] === true) optionen[key] = true;
  }
  const eigen = Object.fromEntries(Object.entries(fall.eigen).filter(([key]) => segment(key)?.art !== "befund" || befund[key] === "abw"));
  return { ...fall, katalog: index.katalog.version, befund, slots, auswahl: {}, optionen, versteckt: {}, eigen };
}

function alleBausteinIds(fall: Fall): Set<string> {
  const ids = new Set<string>();
  for (const liste of Object.values(fall.bausteine)) for (const id of liste ?? []) ids.add(id);
  return ids;
}

/** Gehört der Schlüssel zu einem Baustein dieses Falls? Eingaben zu fremden Bausteinen werden nicht angenommen. */
function gehoert(fall: Fall, key: string): boolean {
  return alleBausteinIds(fall).has(key.split("/")[0]);
}

function nurVon<T>(rec: Record<string, T>, behalten: Set<string>): Record<string, T> {
  const aus: Record<string, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (behalten.has(k.split("/")[0])) aus[k] = v;
  }
  return aus;
}

/** Entfernt Zustände von Bausteinen, die nicht mehr im Fall sind. */
function bereinigt(fall: Fall): Fall {
  const ids = alleBausteinIds(fall);
  const seiteBaustein: Record<string, Seite> = {};
  for (const [k, v] of Object.entries(fall.seiteBaustein)) if (ids.has(k)) seiteBaustein[k] = v;
  return {
    ...fall,
    seiteBaustein,
    befund: nurVon(fall.befund, ids),
    slots: nurVon(fall.slots, ids),
    werte: nurVon(fall.werte, ids),
    auswahl: nurVon(fall.auswahl, ids),
    // Bewusst leer gelassene Entweder-oder-Stellen hängen an der Vorlage, nicht an einem Baustein.
    versteckt: { ...nurVon(fall.versteckt, ids), ...Object.fromEntries(Object.entries(fall.versteckt).filter(([k]) => k.startsWith("wahl/"))) },
    optionen: nurVon(fall.optionen, ids),
    eigen: nurVon(fall.eigen, ids),
    spaeter: nurVon(fall.spaeter, ids),
    fristen: nurVon(fall.fristen, ids),
  };
}

/**
 * Legt die Bausteine einer Vorlage in den Fall. Person, Alter, Seite, Merker,
 * freie Ergänzungen und Eingaben zu Bausteinen, die auch die neue Vorlage
 * enthält, bleiben. Vorgaben der Vorlage werden nicht in den Fall geschrieben.
 * Kopiervermerke bleiben stehen: Sie sagen, was schon ins KIS gegangen ist.
 */
export function mitVorlage(fall: Fall, vorlage: Vorlage, index: KatalogIndex): Fall {
  const typ = brieftypFuer(index, vorlage.setting);
  const bausteine: Partial<Record<AbschnittId, string[]>> = {};
  // Alle Eingaben hängen am Schlüssel des Bausteins: Er darf im Fall nur einmal stehen, das erste Vorkommen gilt.
  const gesehen = new Set<string>();
  for (const [abschnitt, ids] of Object.entries(vorlage.abschnitte) as [AbschnittId, string[]][]) {
    bausteine[abschnitt] = (ids ?? []).filter((id) => index.bausteine.has(id) && !gesehen.has(id) && (gesehen.add(id), true));
  }
  const neu = bereinigt({
    ...fall,
    setting: vorlage.setting,
    brieftypId: typ.id,
    vorlageId: vorlage.id,
    bausteine,
    manuell: {},
  });
  if (fall.vorlageId === vorlage.id) return neu;
  // Die Stellen sind je Vorlage durchgezählt: „nichts davon“ galt der Frage der alten Vorlage, nicht der gleichen Nummer der neuen (CR-02).
  return { ...neu, versteckt: Object.fromEntries(Object.entries(neu.versteckt).filter(([k]) => !k.startsWith("wahl/"))) };
}

export function mitBaustein(fall: Fall, bausteinId: string, index: KatalogIndex, abschnitt?: AbschnittId): Fall {
  const b = index.bausteine.get(bausteinId);
  if (!b) return fall;
  if (alleBausteinIds(fall).has(bausteinId)) return fall;
  const ziel = abschnitt ?? abschnittVon(b);
  return {
    ...fall,
    bausteine: { ...fall.bausteine, [ziel]: [...(fall.bausteine[ziel] ?? []), bausteinId] },
  };
}

/**
 * Entscheidet eine Entweder-oder-Stelle der Vorlage: nimmt den gewählten Baustein
 * in den Abschnitt auf oder lässt die Stelle bewusst leer (`null`).
 */
export function mitWahl(fall: Fall, key: string, bausteinId: string | null, index: KatalogIndex): Fall {
  const [art, abschnitt, nr] = key.split("/");
  if (art !== "wahl" || !abschnitt) return fall;
  if (bausteinId === null) {
    if (index.vorlagen.get(fall.vorlageId ?? "")?.wahl?.[Number(nr)]?.pflicht) return fall;
    return { ...fall, versteckt: { ...fall.versteckt, [key]: true } };
  }
  return mitBaustein(fall, bausteinId, index, abschnitt as AbschnittId);
}

export function ohneBaustein(fall: Fall, bausteinId: string): Fall {
  const bausteine: Partial<Record<AbschnittId, string[]>> = {};
  for (const [abschnitt, ids] of Object.entries(fall.bausteine) as [AbschnittId, string[]][]) {
    bausteine[abschnitt] = ids.filter((id) => id !== bausteinId);
  }
  return bereinigt({ ...fall, bausteine });
}

/**
 * Setzt die Seite des Falls oder, mit Baustein, die abweichende Seite dieses
 * Bausteins. Abweichende Seiten bleiben stehen, bis sie am Baustein
 * aufgehoben werden (Seite `null` mit Baustein).
 */
export function mitSeite(fall: Fall, seite: Seite | null, bausteinId?: string): Fall {
  if (!bausteinId) return fall.seite === seite ? fall : { ...fall, seite };
  if (!alleBausteinIds(fall).has(bausteinId)) return fall;
  const seiteBaustein = { ...fall.seiteBaustein };
  if (seite) seiteBaustein[bausteinId] = seite;
  else delete seiteBaustein[bausteinId];
  return { ...fall, seiteBaustein };
}

export function mitPerson(fall: Fall, geschlecht: Geschlecht | null, alter: string): Fall {
  return { ...fall, geschlecht, alter };
}

function mitEintrag<T>(rec: Record<string, T>, key: string, wert: T | undefined): Record<string, T> {
  const neu = { ...rec };
  if (wert === undefined) delete neu[key];
  else neu[key] = wert;
  return neu;
}

export function mitBefund(fall: Fall, key: string, status: BefundStatus | undefined): Fall {
  if (!gehoert(fall, key)) return fall;
  const neu = { ...fall, befund: mitEintrag(fall.befund, key, status) };
  // Eigener Wortlaut gehört zur Abweichung und verfällt mit ihr.
  if (status !== "abw" && key in fall.eigen) neu.eigen = mitEintrag(fall.eigen, key, undefined);
  return neu;
}

/**
 * Macht Vorschläge der Vorlage zur Aussage des Arztes: Normalbefunde gelten
 * als erhoben und unauffällig, vorgeschlagene Sätze und Werte als gewählt.
 * `keys` sind die Schlüssel der betroffenen Textstellen.
 */
export function uebernehmen(fall: Fall, keys: string[], index: KatalogIndex): Fall {
  const vorlage = fall.vorlageId ? index.vorlagen.get(fall.vorlageId) : undefined;
  const slotVorgabe = vorlage?.vorgaben?.slots ?? {};
  const entscheiden = new Set(vorlage?.entscheiden ?? []);
  const ohne = new Set(vorlage?.ohne ?? []);
  const vorgabeAn = new Set(vorlage?.vorgaben?.an ?? []);
  const vorgabeAus = new Set(vorlage?.vorgaben?.aus ?? []);
  // Was die Vorlage nicht anbietet, war kein Vorschlag, gleich was der Aufrufer übergibt.
  const weg = weggelasseneStellen(fall, vorlage, index);
  // Was ein Standardprotokoll ersetzt, steht nicht im Brief und war also auch kein Vorschlag (E-52).
  for (const k of ersetzteStellen(fall, index)) weg.add(k);
  // Antworten anderer Stellen (E-60) stehen grau im Brief; übernommen wird, was der Arzt sieht.
  const ueber = uebertragungen(fall, index, undefined, weg);
  const neu = { ...fall, befund: { ...fall.befund }, optionen: { ...fall.optionen }, slots: { ...fall.slots }, werte: { ...fall.werte }, auswahl: { ...fall.auswahl } };
  for (const key of keys) {
    if (!gehoert(fall, key)) continue;
    // Ein errechnetes Datum in Klammern (E-59): übernommen wird der Wert, den die App gerade ausrechnet.
    if (leseFristSchluessel(key)) {
      const datum = fristDatum(fall, key);
      if (datum) neu.fristen = { ...neu.fristen, [key]: datum };
      continue;
    }
    const [bausteinId, id] = key.split("/");
    const b = index.bausteine.get(bausteinId);
    if (!b) continue;
    const def = b.platzhalter.find((p) => p.id === id);
    if (def) {
      const u = ueber.get(key);
      if (neu.werte[key] === undefined && u && !neu.spaeter[key]) {
        neu.werte[key] = u.wert;
      } else if (neu.werte[key] === undefined && def.default?.trim()) {
        let wert = def.default.trim();
        if (def.typ === "auswahl" && def.optionen && /^\d+$/.test(wert)) wert = def.optionen[Number(wert)] ?? "";
        neu.werte[key] = wert;
      }
      continue;
    }
    const seg = b.segmente.find((s) => "id" in s && s.id === id);
    if (!seg || weg.has(key)) continue;
    if (seg.art === "befund") {
      // Nur was als Normalbefund vorgeschlagen war. Zu entscheidende und selten erhobene Befunde übernimmt niemand im Paket,
      // gleich was der Aufrufer übergibt.
      if (neu.befund[key] === undefined && seg.normal.trim() && !seg.selten && !entscheiden.has(key) && !ohne.has(key)) neu.befund[key] = "ok";
    } else if (seg.art === "option") {
      // Ein Satz, den weder Vorlage noch Arzt eingeschaltet haben, war kein Vorschlag.
      const vorgeschlagen = neu.optionen[key] ?? (vorgabeAn.has(key) ? true : vorgabeAus.has(key) ? false : (seg.an ?? false));
      if (!vorgeschlagen) continue;
      neu.optionen[key] = true;
      for (const slot of seg.slots ?? []) {
        const k = schluessel(bausteinId, id, slot.id);
        const u = neu.slots[k] === undefined ? ueber.get(k) : undefined;
        if (slot.art === "detail" && u) neu.slots[k] = u.wert;
        if (slot.art !== "auswahl") continue;
        if (gueltigerIndex(neu.slots[k], slot.optionen.length) !== undefined) continue;
        const wahl = gueltigerIndex(u?.wert, slot.optionen.length) ?? gueltigerIndex(slotVorgabe[k], slot.optionen.length) ?? gueltigerIndex(slot.default, slot.optionen.length) ?? (slot.required ? undefined : 0);
        if (wahl !== undefined && !(slot.required && slot.optionen[wahl] === "")) neu.slots[k] = String(wahl);
      }
    } else if (seg.art === "auswahl") {
      const wahl = gueltigerIndex(ueber.get(key)?.wert, seg.optionen.length) ?? gueltigerIndex(vorlage?.vorgaben?.auswahl?.[key], seg.optionen.length) ?? gueltigerIndex(seg.default, seg.optionen.length);
      if (neu.auswahl[key] === undefined && wahl !== undefined) neu.auswahl[key] = wahl;
    }
  }
  return neu;
}

/**
 * Datum des Fallkopfs (E-58); `undefined` oder leer löscht es. Nimmt nur ein gültiges Datum TT.MM.JJJJ an: Was der Arzt
 * tippt, liest vorher `leseDatum`.
 */
export function mitFalldatum(fall: Fall, art: FalldatumArt, datum: string | undefined): Fall {
  if (datum !== undefined && datum !== "" && !istDatum(datum)) return fall;
  if ((fall.daten[art] ?? "") === (datum ?? "")) return fall;
  return { ...fall, daten: mitEintrag(fall.daten, art, datum ? datum : undefined) };
}

/** Errechnetes Datum in Klammern übernehmen (Wert), weglassen ("") oder wieder zum Vorschlag machen (`undefined`). */
export function mitFrist(fall: Fall, key: string, wert: string | undefined): Fall {
  if (!gehoert(fall, key) || !leseFristSchluessel(key)) return fall;
  if (wert !== undefined && wert !== "" && !istDatum(wert)) return fall;
  return { ...fall, fristen: mitEintrag(fall.fristen, key, wert) };
}

export function mitSlot(fall: Fall, key: string, wert: string | undefined): Fall {
  if (!gehoert(fall, key)) return fall;
  return { ...fall, slots: mitEintrag(fall.slots, key, wert) };
}

/**
 * Angabe in einem Satz (Option). Wer in einem vorgeschlagenen Satz selbst etwas
 * wählt oder tippt, hat ihn gelesen und macht ihn damit zu seiner Aussage;
 * weitere Angaben der Vorlage im selben Satz bleiben Vorschlag.
 */
export function mitAngabe(fall: Fall, optionKey: string, slotKey: string, wert: string | undefined): Fall {
  return mitOption(mitSlot(fall, slotKey, wert), optionKey, true);
}

export function mitWert(fall: Fall, key: string, wert: string | undefined): Fall {
  if (!gehoert(fall, key)) return fall;
  // Wer einen Wert einträgt, füllt das Feld doch hier aus.
  return { ...fall, werte: mitEintrag(fall.werte, key, wert), spaeter: mitEintrag(fall.spaeter, key, undefined) };
}

/** Lässt ein Feld bewusst als Platzhalter fürs KIS stehen. */
export function mitSpaeter(fall: Fall, key: string, spaeter: boolean): Fall {
  if (!gehoert(fall, key)) return fall;
  return {
    ...fall,
    spaeter: mitEintrag(fall.spaeter, key, spaeter ? true : undefined),
    werte: spaeter ? mitEintrag(fall.werte, key, undefined) : fall.werte,
  };
}

export function mitAuswahl(fall: Fall, key: string, index: number | undefined): Fall {
  if (!gehoert(fall, key)) return fall;
  return {
    ...fall,
    auswahl: mitEintrag(fall.auswahl, key, index),
    eigen: mitEintrag(fall.eigen, key, undefined),
  };
}

/** Eigener Wortlaut; leerer Text hebt ihn auf, dann gilt wieder der Text des Bausteins. */
export function mitEigenemText(fall: Fall, key: string, text: string | undefined): Fall {
  if (!gehoert(fall, key)) return fall;
  return { ...fall, eigen: mitEintrag(fall.eigen, key, text !== undefined && text.trim() !== "" ? text : undefined) };
}

export function mitOption(fall: Fall, key: string, an: boolean | undefined): Fall {
  if (!gehoert(fall, key)) return fall;
  return { ...fall, optionen: mitEintrag(fall.optionen, key, an) };
}

export function mitVersteckt(fall: Fall, key: string, versteckt: boolean): Fall {
  if (!gehoert(fall, key)) return fall;
  return { ...fall, versteckt: mitEintrag(fall.versteckt, key, versteckt ? true : undefined) };
}

export function mitZusatz(fall: Fall, abschnitt: AbschnittId, text: string): Fall {
  return { ...fall, zusatz: { ...fall.zusatz, [abschnitt]: text } };
}

export function mitManuell(fall: Fall, abschnitt: AbschnittId, text: string | undefined): Fall {
  const manuell = { ...fall.manuell };
  if (text === undefined) delete manuell[abschnitt];
  else manuell[abschnitt] = text;
  return { ...fall, manuell };
}

export function mitAusgeblendet(fall: Fall, abschnitt: AbschnittId, aus: boolean): Fall {
  return { ...fall, ausgeblendet: { ...fall.ausgeblendet, [abschnitt]: aus } };
}

export function alsKopiert(fall: Fall, abschnitte: { id: AbschnittId; text: string }[], jetzt = Date.now()): Fall {
  const kopiert = { ...fall.kopiert };
  const kopiertUm = { ...fall.kopiertUm };
  for (const a of abschnitte) {
    kopiert[a.id] = a.text;
    kopiertUm[a.id] = jetzt;
  }
  return { ...fall, kopiert, kopiertUm };
}

const SEITE_KURZ: Record<Seite, string> = { rechts: "re.", links: "li.", beidseits: "bds.", ohne: "" };

/** Kurzbezeichnung eines Falls für die Fallreiter. */
export function fallName(fall: Fall, index: KatalogIndex): string {
  const vorlage = fall.vorlageId ? index.vorlagen.get(fall.vorlageId) : undefined;
  const teile = [vorlage?.titel ?? (fall.setting === "station" ? "Freier Entlassbrief" : "Freier Brief")];
  if (fall.seite && SEITE_KURZ[fall.seite]) teile.push(SEITE_KURZ[fall.seite]);
  return teile.join(" ");
}

// Felder, deren Einträge ein Schritt einzeln setzt; „Rückgängig“ in einer Meldung nimmt genau diese zurück.
const SCHRITT_FELDER = ["befund", "slots", "werte", "auswahl", "versteckt", "optionen", "eigen", "spaeter", "daten", "fristen", "seiteBaustein", "bausteine", "ausgeblendet", "zusatz", "manuell"] as const;
const SCHRITT_WERTE = ["geschlecht", "alter", "seite"] as const;

function gleich(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Nimmt genau einen Schritt (`vorher` → `nachher`) im Fall `jetzt` zurück: Jeder Eintrag, den der Schritt geändert hat
 * und der seitdem unverändert ist, bekommt seinen Wert von vorher; was danach anders geändert wurde, bleibt. So kann
 * „Rückgängig“ in einer Meldung auch dann genau diese Eingabe zurücknehmen, wenn inzwischen anderes geschah. Ist nichts
 * mehr zurückzunehmen, kommt `jetzt` selbst zurück.
 */
export function schrittZuruecknehmen(jetzt: Fall, vorher: Fall, nachher: Fall): Fall {
  if (jetzt.id !== vorher.id) return jetzt;
  let aus: Fall = jetzt;
  for (const feld of SCHRITT_FELDER) {
    const v = vorher[feld] as Record<string, unknown>;
    const n = nachher[feld] as Record<string, unknown>;
    const j = jetzt[feld] as Record<string, unknown>;
    let neu: Record<string, unknown> | null = null;
    for (const k of new Set([...Object.keys(v), ...Object.keys(n)])) {
      if (gleich(v[k], n[k]) || !gleich(j[k], n[k])) continue;
      // Ein Satz gilt als später geändert, wenn der Arzt seither eine seiner Angaben oder seinen Wortlaut geändert hat:
      // `mitAngabe` setzt den Satz dabei erneut auf denselben Wert, und ohne diese Prüfung würde die eigene Wahl wieder
      // grau (CR-TS10).
      if (feld === "optionen" && satzSeitherGeaendert(k, nachher, jetzt)) continue;
      neu ??= { ...j };
      if (v[k] === undefined) delete neu[k];
      else neu[k] = v[k];
    }
    if (neu) aus = { ...aus, [feld]: neu };
  }
  for (const feld of SCHRITT_WERTE) {
    if (vorher[feld] !== nachher[feld] && jetzt[feld] === nachher[feld]) aus = { ...aus, [feld]: vorher[feld] };
  }
  return aus;
}

function satzSeitherGeaendert(key: string, nachher: Fall, jetzt: Fall): boolean {
  if (!gleich(nachher.eigen[key], jetzt.eigen[key])) return true;
  const praefix = `${key}/`;
  for (const k of new Set([...Object.keys(nachher.slots), ...Object.keys(jetzt.slots)])) {
    if (k.startsWith(praefix) && nachher.slots[k] !== jetzt.slots[k]) return true;
  }
  return false;
}

/**
 * Nimmt mehrere Schritte zurück, den letzten zuerst (E-45: alle Befehle eines blinden Tipp-Zugs). Jeder Schritt gilt
 * wie bei `schrittZuruecknehmen`: Was seither anders geändert wurde, bleibt.
 */
export function schritteZuruecknehmen(jetzt: Fall, schritte: readonly { vorher: Fall; nachher: Fall }[]): Fall {
  let aus = jetzt;
  for (let i = schritte.length - 1; i >= 0; i--) aus = schrittZuruecknehmen(aus, schritte[i].vorher, schritte[i].nachher);
  return aus;
}

// Felder, deren Einträge eine Aussage des Arztes tragen. Fehlt der Eintrag, ist die Stelle offen oder grau. Eigener
// Wortlaut gehört dazu (PS-R4-1): Ohne ihn gilt wieder die Auswahl oder der Befund, die mit zurückgehen. Ebenso die
// Daten des Fallkopfs und übernommene Daten in Klammern (E-58, E-59).
const AUSSAGE_FELDER = ["befund", "slots", "werte", "auswahl", "versteckt", "optionen", "spaeter", "eigen", "daten", "fristen"] as const;

export interface SichereRuecknahme {
  fall: Fall;
  /** Zusätze des Zugs, die stehen bleiben, mit Namen oder Wortlaut (PS-N13). */
  behalten: string[];
  /** Sätze, die der Arzt vor dem Zug im Brief hatte und die der Zug entfernt hat; sie kommen nicht wieder (CR-R4-02). */
  entfernt: string[];
  /** Getippter Wortlaut von vor dem Zug, der nicht zurückkommt: Name der Stelle und Wortlaut (Hinweis des Code-Reviews). */
  geleert: { name: string; vorher: string }[];
  /** Seiten einzelner Bausteine, die stehen bleiben statt auf die alte Seite zurückzugehen: Name und Seite (PS-R4-1). */
  seiteBleibt: { name: string; seite: string }[];
}

/** Seite, die ein Baustein im Brief trägt: seine eigene, sonst die des Briefs. */
function seiteDes(fall: Fall, bausteinId: string): Seite | null {
  return fall.seiteBaustein[bausteinId] ?? fall.seite;
}

const SEITE_NAME: Record<Seite, string> = { rechts: "rechts", links: "links", beidseits: "beidseits", ohne: "ohne Seite" };

/**
 * Nimmt Schritte nur in die sichere Richtung zurück (E-48, CR-TS13): Eine Stelle, die vor dem Schritt eine Aussage trug,
 * wird offen oder grau statt wieder diese Aussage. Sonst käme eine Aussage schwarz und kopierbar zurück, die der Arzt
 * eben verworfen hatte. Was vorher offen oder grau war, geht wie bei `schritteZuruecknehmen` zurück. Das gilt auch für
 * eigenen Wortlaut, den freien Zusatz eines Abschnitts und das Alter (PS-R4-1): Sie werden leer statt wieder der alte
 * Text; der alte Text steht in `geleert`, damit die Meldung ihn nennt. Die Seite eines Bausteins hat keinen offenen
 * Stand neben der Seite des Briefs: Trug der Baustein vorher eine Seite, bleibt die jetzige stehen und wird genannt.
 * Mit `brief` bleibt ein angefügter Zusatz stehen und wird genannt, statt still zu verschwinden: ein Satz („+ …“), der
 * vor dem Zug nicht im Brief stand, durch die Rücknahme wieder verschwände und mit dem Vermerk tatsächlich im Brief
 * steht; ein Satz, dessen Baustein mit der Rücknahme geht, bleibt nicht (CR-R4-01). Seine offenen Angaben bleiben offen
 * und halten das Kopieren auf. Die Wahl an einer Entweder-oder-Stelle ist kein Zusatz, sondern eine Aussage: Sie geht
 * zurück. `zusaetze: false` („Rückgängig“, das der Arzt verlangt) entfernt auch Zusätze.
 */
export function sicherZuruecknehmen(
  jetzt: Fall,
  schritte: readonly { vorher: Fall; nachher: Fall }[],
  brief?: (f: Fall) => BriefAnsicht | null,
  zusaetze = true,
): SichereRuecknahme {
  const leer: SichereRuecknahme = { fall: jetzt, behalten: [], entfernt: [], geleert: [], seiteBleibt: [] };
  const normal = schritteZuruecknehmen(jetzt, schritte);
  if (normal === jetzt) return leer;
  const geleert: { key: string; vorher: string }[] = [];
  const getippt = (v: unknown) => typeof v === "string" && v.trim() !== "" && !/^\d+$/.test(v.trim());
  let aus = normal;
  for (const feld of AUSSAGE_FELDER) {
    const n = normal[feld] as Record<string, unknown>;
    const j = jetzt[feld] as Record<string, unknown>;
    const zurueck = Object.keys(n).filter((k) => !gleich(n[k], j[k]));
    if (zurueck.length === 0) continue;
    const neu = { ...n };
    for (const k of zurueck) {
      delete neu[k];
      if ((feld === "werte" || feld === "eigen" || feld === "slots") && getippt(n[k])) geleert.push({ key: k, vorher: String(n[k]).trim() });
    }
    aus = { ...aus, [feld]: neu };
  }
  // Freier Zusatz: leer statt alter Text.
  for (const id of Object.keys(normal.zusatz) as AbschnittId[]) {
    const vorher = normal.zusatz[id] ?? "";
    if (vorher !== (jetzt.zusatz[id] ?? "") && vorher.trim()) {
      aus = { ...aus, zusatz: { ...aus.zusatz, [id]: "" } };
      geleert.push({ key: `zusatz:${id}`, vorher: vorher.trim() });
    }
  }
  for (const feld of ["seite", "geschlecht"] as const) {
    if (normal[feld] !== jetzt[feld] && normal[feld] !== null) aus = { ...aus, [feld]: null };
  }
  if (normal.alter !== jetzt.alter && normal.alter.trim()) {
    aus = { ...aus, alter: "" };
    geleert.push({ key: "alter", vorher: normal.alter.trim() });
  }
  // Seite eines Bausteins: Trug er vorher eine Seite (eigene oder die des Briefs), bleibt die jetzige.
  const seiteBleibtIds: string[] = [];
  for (const k of new Set([...Object.keys(normal.seiteBaustein), ...Object.keys(jetzt.seiteBaustein)])) {
    if (normal.seiteBaustein[k] === jetzt.seiteBaustein[k]) continue;
    if (seiteDes(normal, k) === null || !alleBausteinIds(aus).has(k)) continue;
    const seiteBaustein = { ...aus.seiteBaustein };
    const j = jetzt.seiteBaustein[k];
    if (j === undefined) delete seiteBaustein[k];
    else seiteBaustein[k] = j;
    aus = { ...aus, seiteBaustein };
    seiteBleibtIds.push(k);
  }
  const behalten: string[] = [];
  const entfernt: string[] = [];
  let namen = new Map<string, string>();
  if (brief) {
    const tokens = (b: BriefAnsicht | null) => b?.abschnitte.flatMap((a) => a.tokens) ?? [];
    const vorherBrief = brief(jetzt);
    const davorBrief = brief(normal);
    namen = new Map([...tokens(davorBrief), ...tokens(vorherBrief)].filter((t) => t.key && t.label).map((t) => [t.key!, t.label!]));
    for (const a of [...(davorBrief?.abschnitte ?? []), ...(vorherBrief?.abschnitte ?? [])]) {
      namen.set(`zusatz:${a.id}`, `Ergänzung ${a.titel}`);
      for (const b of a.bausteine) namen.set(`baustein:${b.id}`, b.titel);
    }
    const nachherBrief = brief(aus);
    const danach = new Set(tokens(nachherBrief).map((t) => t.key).filter(Boolean));
    if (zusaetze) {
      // Ist der Baustein selbst zurückgenommen (etwa ein eben übernommenes Standardprotokoll), bleibt sein Satz nicht
      // stehen: Er stünde nirgends, und die Meldung nennte ihn als im Brief geblieben (r5-protokolle).
      const imFall = alleBausteinIds(aus);
      const kandidaten = Object.keys(jetzt.optionen).filter(
        (k) => jetzt.optionen[k] === true && normal.optionen[k] !== true && !danach.has(k) && imFall.has(k.slice(0, k.indexOf("/"))) && tokens(vorherBrief).some((x) => x.key === k),
      );
      if (kandidaten.length > 0) {
        // Nur was mit dem Vermerk wirklich im Brief steht: Geht der Baustein des Satzes mit zurück, bleibt nichts.
        const versuch = { ...aus, optionen: { ...aus.optionen, ...Object.fromEntries(kandidaten.map((k) => [k, true])) } };
        const imBrief = new Set(tokens(brief(versuch)).map((t) => t.key).filter(Boolean));
        const optionen = { ...aus.optionen };
        for (const k of kandidaten) {
          if (!imBrief.has(k)) continue;
          optionen[k] = true;
          const t = tokens(vorherBrief).find((x) => x.key === k)!;
          behalten.push(t.label ?? kurzerText(t.t));
        }
        aus = { ...aus, optionen };
      }
    }
    // Ein Satz, den der Arzt vor dem Zug ausdrücklich im Brief hatte und den der Zug entfernt hat, kommt nicht schwarz
    // zurück; die Meldung nennt ihn (CR-R4-02).
    const amEnde = new Set(tokens(brief(aus)).map((t) => t.key).filter(Boolean));
    for (const k of Object.keys(normal.optionen)) {
      if (normal.optionen[k] !== true || jetzt.optionen[k] === true || amEnde.has(k)) continue;
      const t = tokens(davorBrief).find((x) => x.key === k);
      if (t) entfernt.push(t.label ?? kurzerText(t.t));
    }
  }
  const name = (key: string) => (key === "alter" ? "Alter" : (namen.get(key) ?? namen.get(key.split("/").slice(0, 2).join("/")) ?? key));
  const fall = gleich(aus, jetzt) ? jetzt : aus;
  return {
    fall,
    behalten,
    entfernt,
    geleert: geleert.map((g) => ({ name: name(g.key), vorher: g.vorher })),
    seiteBleibt: seiteBleibtIds.map((k) => ({ name: namen.get(`baustein:${k}`) ?? k, seite: SEITE_NAME[seiteDes(fall, k) ?? "ohne"] })),
  };
}

function kurzerText(t: string, max = 60): string {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Ändert der Schritt eine schon gewählte Seite des ganzen Briefs, eines einzelnen Bausteins oder die Person? Dann
 * beendet er den Tipp-Zug wie das Kopieren (PS-N11, PS-R4-1): Eine spätere Rücknahme des Zugs stellte sonst genau die
 * Seite oder Person wieder her, die der Arzt eben verworfen hat, schwarz und kopierbar. Bei einem Baustein zählt die
 * Seite, die er im Brief trug, auch wenn es die des Briefs war. Die erste Wahl zählt nicht; ihre Rücknahme führt zu
 * „offen“.
 */
export function beendetZug(vorher: Fall, nachher: Fall): boolean {
  if ((vorher.seite !== null && nachher.seite !== vorher.seite) || (vorher.geschlecht !== null && nachher.geschlecht !== vorher.geschlecht)) return true;
  const ids = alleBausteinIds(nachher);
  return [...new Set([...Object.keys(vorher.seiteBaustein), ...Object.keys(nachher.seiteBaustein)])].some(
    (k) => ids.has(k) && vorher.seiteBaustein[k] !== nachher.seiteBaustein[k] && seiteDes(vorher, k) !== null && seiteDes(nachher, k) !== seiteDes(vorher, k),
  );
}

/** Bausteine, deren Seite im Brief der Schritt geändert hat, mit Seite davor und danach (Meldung, PS-R4-1). */
export function geaenderteBausteinSeiten(vorher: Fall, nachher: Fall): { bausteinId: string; vorher: Seite | null; nachher: Seite | null }[] {
  const ids = alleBausteinIds(nachher);
  return [...new Set([...Object.keys(vorher.seiteBaustein), ...Object.keys(nachher.seiteBaustein)])]
    .filter((k) => ids.has(k) && vorher.seiteBaustein[k] !== nachher.seiteBaustein[k] && seiteDes(nachher, k) !== seiteDes(vorher, k))
    .map((k) => ({ bausteinId: k, vorher: seiteDes(vorher, k), nachher: seiteDes(nachher, k) }));
}

/**
 * Steht an der Stelle noch genau dieser Wert? `wert`: Feld des Falls (`werte`), `angabe`: Angabe in einem Satz
 * (`slots`). „Rückgängig“ nach „Ersetzt“ gilt nur, solange niemand die Stelle seither geändert hat (PS-N10).
 */
export function enthaeltNoch(fall: Fall, ort: "wert" | "angabe", key: string, wert: string): boolean {
  return (ort === "wert" ? fall.werte[key] : fall.slots[key]) === wert;
}
