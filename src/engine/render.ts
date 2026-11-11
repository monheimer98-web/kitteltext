// Fall + Katalog -> Brief. Die Engine setzt nur zusammen: Sie rechnet nicht,
// leitet nichts ab und kennt keine Diagnosen.
//
// Grundregel: Was die Vorlage über den Patienten aussagt, ist ein Vorschlag.
// Zur Aussage des Arztes wird es erst, wenn er es übernimmt, wählt oder
// einträgt. Vorgaben einer Vorlage werden nie in den Fall geschrieben, sondern
// hier beim Zusammensetzen gelesen.

import type {
  AbschnittId,
  Baustein,
  BefundSlot,
  Brieftyp,
  Fall,
  FalldatumArt,
  Katalog,
  Katalogregeln,
  Platzhalter,
  Protokoll,
  Seite,
  Vorlage,
} from "../model/types.ts";
import { abschnittVon, schluessel, wahlSchluessel } from "../model/types.ts";
import { personText } from "./person.ts";
import { stelleLeer, stelleVor, weggelasseneStellen } from "./vorlage.ts";
import { ersetzteStellen, protokollBaustein } from "./protokoll.ts";
import { LUECKE, glaetten, kisPlatzhalter, luecke, mitVorschlag, tokensZuText } from "./text.ts";
import { falldatumZuordnung, mehrdeutigeAnker, mitFristen } from "./falldaten.ts";
import { folgeangabenVon, uebertragungen, widersprueche } from "./kopplung.ts";
import type { Uebertragung, Widerspruch } from "./kopplung.ts";
import type { Token } from "./text.ts";
import { istLeer, leseMedikation, medText, medZellen } from "./medikation.ts";

export interface KatalogIndex {
  katalog: Katalog;
  bausteine: Map<string, Baustein>;
  vorlagen: Map<string, Vorlage>;
  brieftypen: Map<string, Brieftyp>;
  /** Baustein-ID -> Region-ID */
  regionVon: Map<string, string>;
  /** Standardprotokolle nach ID; ihre Bausteine stehen in `bausteine` (Region „protokolle“) */
  protokolle: Map<string, Protokoll>;
}

export function indexiere(katalog: Katalog): KatalogIndex {
  const bausteine = new Map<string, Baustein>();
  const regionVon = new Map<string, string>();
  for (const r of katalog.regionen) {
    for (const b of r.bausteine) {
      bausteine.set(b.id, b);
      regionVon.set(b.id, r.id);
    }
  }
  // Protokolle stehen in keiner Region: So erscheinen sie nicht unter „+ Baustein“, sondern nur im Kasten des Procedere.
  const protokolle = new Map<string, Protokoll>();
  for (const p of katalog.protokolle ?? []) {
    if (bausteine.has(p.id)) continue;
    protokolle.set(p.id, p);
    bausteine.set(p.id, protokollBaustein(p));
    regionVon.set(p.id, "protokolle");
  }
  return {
    katalog,
    bausteine,
    regionVon,
    protokolle,
    vorlagen: new Map(katalog.vorlagen.map((v) => [v.id, v])),
    brieftypen: new Map(katalog.brieftypen.map((b) => [b.id, b])),
  };
}

export interface RenderOptionen {
  /** Listenpunkte als Spiegelstriche oder zu Fließtext zusammengezogen */
  listen: "striche" | "fliesstext";
}

export const STANDARD_OPTIONEN: RenderOptionen = { listen: "striche" };

/** Etwas, das gerade nicht im Text steht, aber hinzugefügt werden kann. */
export interface AusEintrag {
  key: string;
  label: string;
  bausteinId: string;
  art: "option" | "befund" | "feld" | "auswahl" | "messwert";
  gruppe?: string;
  /** Wortlaut, den ein Klick in den Brief setzt; Angaben, die noch zu wählen sind, als „…". */
  vorschau?: string;
}

export interface KisPlatzhalter {
  key: string;
  label: string;
  abschnitt: AbschnittId;
}

export interface AbschnittAnsicht {
  id: AbschnittId;
  titel: string;
  tokens: Token[];
  text: string;
  bausteine: Baustein[];
  /** Bausteine, auf die der Fall verweist, die es im Katalog aber nicht mehr gibt */
  fehlend: string[];
  /** fehlende Pflichtangaben einschließlich Seite und Person */
  offen: number;
  /** Aussagen der Vorlage, die der Arzt noch nicht übernommen hat */
  vorschlag: number;
  auffaellig: number;
  seiteFehlt: boolean;
  personFehlt: boolean;
  /** Seitenwort in frei geschriebenem Text, das der Seite des Falls widerspricht */
  seitenkonflikt: string | null;
  /** Platzhalter, die erst im KIS ausgefüllt werden */
  spaeter: KisPlatzhalter[];
  aus: AusEintrag[];
  manuell: boolean;
  ausgeblendet: boolean;
  leer: boolean;
  /** nichts mehr offen, nichts mehr nur vorgeschlagen: darf kopiert werden */
  fertig: boolean;
  kopiert: boolean;
  kopiertUm?: number;
  geaendertSeitKopie: boolean;
}

export interface BriefAnsicht {
  abschnitte: AbschnittAnsicht[];
  offen: number;
  vorschlag: number;
  seiteFehlt: boolean;
  personFehlt: boolean;
  /** irgendeine Stelle des Briefs verwendet die Seite bzw. die Person */
  brauchtSeite: boolean;
  brauchtPerson: boolean;
  spaeter: KisPlatzhalter[];
  /**
   * Antworten, die Stellen ohne eigene Antwort von einer anderen Stelle bekommen (E-60), je Schlüssel der Zielstelle;
   * dieselben, die das Rendern einsetzt. Das Feldfenster zeigt sie an (QA-38).
   */
  uebertragen?: ReadonlyMap<string, Uebertragung>;
  /** Gekoppelte Stellen mit verschiedener eigener Antwort (E-92); der Abgleich meldet sie. */
  widersprueche?: readonly Widerspruch[];
}

export const SEITE_KEY = "__seite";
export const PERSON_KEY = "__person";

interface Sammler {
  offen: number;
  vorschlag: number;
  auffaellig: number;
  seiteFehlt: boolean;
  personFehlt: boolean;
  brauchtSeite: boolean;
  brauchtPerson: boolean;
  spaeter: { key: string; label: string }[];
  aus: AusEintrag[];
  /** Befunde, die die Vorlage nicht als normal vorschlägt */
  entscheiden: Set<string>;
  ohne: Set<string>;
  /** Sätze, die die Vorlage in diesem Fall gar nicht anbietet */
  weg: Set<string>;
  /** Sätze und Auswahlen, an deren Stelle ein Standardprotokoll im Fall steht (E-52) */
  ersetzt: Set<string>;
  /** Sätze, die zur Region der Vorlage nicht passen: kein „+ …“ */
  nichtAnbieten: Set<string>;
  an: Set<string>;
  nichtAn: Set<string>;
  slotVorgabe: Record<string, number>;
  auswahlVorgabe: Record<string, number>;
  regeln: Katalogregeln | undefined;
  /** Antworten, die Stellen ohne eigene Antwort von einer anderen Stelle bekommen (E-60) */
  uebertragen: Map<string, Uebertragung>;
  /** Datum des Fallkopfs je gebundenem Datumsfeld (`baustein/feld`); `null`: kein Datum mehr frei, gewöhnliches Feld */
  falldaten: ReadonlyMap<string, FalldatumArt | null>;
  /** Anker ohne errechnetes Datum, weil „nach der Operation“ zwei Operationen meinen kann */
  mehrdeutig: ReadonlySet<FalldatumArt>;
}

/** Stellen, die in Befund- und Optionstexten ohne eigenen Slot erlaubt sind. */
export const BEZUG: Record<string, { form: "nom" | "gen" | "dat" | "akk" | "pron-nom" | "pron-dat" | "pron-akk"; gross?: boolean } | "seite"> = {
  seite: "seite",
  person: { form: "nom" },
  Person: { form: "nom", gross: true },
  "person-gen": { form: "gen" },
  "person-dat": { form: "dat" },
  "person-akk": { form: "akk" },
  er: { form: "pron-nom" },
  Er: { form: "pron-nom", gross: true },
  ihm: { form: "pron-dat" },
  ihn: { form: "pron-akk" },
};

export function seiteVon(fall: Fall, bausteinId: string): Seite | null {
  return fall.seiteBaustein[bausteinId] ?? fall.seite;
}

/** Wie die Seite im Text steht. "ohne" ergibt keinen Text. */
function seiteText(seite: Seite): string {
  return seite === "ohne" ? "" : seite;
}

/** Setzt Seite und Personenbezug in einen Befund- oder Optionstext ein. */
function setzeBezug(text: string, b: Baustein, fall: Fall, s: Sammler): string {
  if (!text.includes("{")) return text;
  return text.replace(/\{([A-Za-z-]+)\}/g, (ganz, name: string) => {
    const bezug = BEZUG[name];
    if (!bezug) return ganz;
    if (bezug === "seite") {
      s.brauchtSeite = true;
      const seite = seiteVon(fall, b.id);
      if (seite) return seiteText(seite);
      s.seiteFehlt = true;
      s.offen++;
      return luecke("Seite");
    }
    s.brauchtPerson = true;
    const t = personText(bezug.form, fall.geschlecht, fall.alter, { gross: bezug.gross });
    if (t !== null) return t;
    s.personFehlt = true;
    s.offen++;
    return luecke("Patient/Patientin");
  });
}

export function gueltigerIndex(roh: unknown, anzahl: number): number | undefined {
  const n = typeof roh === "number" ? roh : typeof roh === "string" && /^\d+$/.test(roh) ? Number(roh) : NaN;
  return Number.isInteger(n) && n >= 0 && n < anzahl ? n : undefined;
}

interface Gefuellt {
  text: string;
  offen: boolean;
  /** enthält eine Angabe, die aus der Vorlage stammt und nicht vom Arzt */
  vorschlag: boolean;
  /** Bausteine, von denen eine Angabe übertragen ist (E-60) */
  uebertragen?: string[];
}

/** Vorgabe eines Feldes aus dem Hausstandard; leer, wenn es keine gibt oder sie auf keine Option zeigt. */
function hausstandard(def: Platzhalter): string {
  const vorgabe = (def.default ?? "").trim();
  if (def.typ === "auswahl" && def.optionen && /^\d+$/.test(vorgabe)) return (def.optionen[Number(vorgabe)] ?? "").trim();
  return vorgabe;
}

function fuelleSlots(
  roh: string,
  slots: BefundSlot[] | undefined,
  b: Baustein,
  segId: string,
  segLabel: string,
  fall: Fall,
  s: Sammler,
  auffaellig = false,
  folge: ReadonlySet<string> = new Set(),
): Gefuellt {
  const vorher = s.offen;
  let t = setzeBezug(roh, b, fall, s);
  let vorschlag = false;
  const uebertragen: string[] = [];
  const werte = new Map<string, string>();
  const getippt = new Set<string>();
  for (const slot of slots ?? []) {
    const key = schluessel(b.id, segId, slot.id);
    const wert = fall.slots[key];
    let val = "";
    const offen = () => {
      s.offen++;
      return luecke(segLabel === slot.label ? slot.label : `${segLabel}: ${slot.label}`);
    };
    // Antwort von einer anderen Stelle (E-60): vor jeder Vorgabe der Vorlage, nie vor einer eigenen Antwort.
    const ueber = wert === undefined && !auffaellig ? s.uebertragen.get(key) : undefined;
    const uebertragenIndex = ueber && slot.art === "auswahl" ? gueltigerIndex(ueber.wert, slot.optionen.length) : undefined;
    if (ueber && ((slot.art === "auswahl" && uebertragenIndex !== undefined) || slot.art === "detail")) {
      val = slot.art === "auswahl" && uebertragenIndex !== undefined ? slot.optionen[uebertragenIndex] : ueber.wert;
      if (!ueber.aussage) vorschlag = true;
      uebertragen.push(ueber.quelle);
    } else if (slot.art === "auswahl") {
      const gewaehlt = gueltigerIndex(wert, slot.optionen.length);
      const vorgabe = gueltigerIndex(s.slotVorgabe[key], slot.optionen.length);
      if (gewaehlt !== undefined) {
        val = slot.optionen[gewaehlt];
        // Die leere Option einer Pflichtangabe ist keine Antwort.
        if (val === "" && slot.required) val = offen();
      } else {
        // Vorgabe der Vorlage, sonst die des Bausteins (Hausstandard). Beides ist nur ein Vorschlag.
        const hausstandard = gueltigerIndex(slot.default, slot.optionen.length);
        val = slot.optionen[vorgabe ?? hausstandard ?? (slot.required ? -1 : 0)] ?? "";
        if (val.trim() === "") {
          if (slot.required) val = offen();
        } else if (auffaellig) {
          // Art, Ort und Ausmaß eines auffälligen Befunds legt nie die Vorlage fest: Der Arzt wählt sie.
          val = offen();
        } else if (!folge.has(slot.id)) {
          // Eine Folgeangabe (M-24) gehört zum Satz, den der Arzt eben selbst ausgefüllt hat; alles andere bleibt Vorschlag.
          vorschlag = true;
        }
      }
    } else if (slot.art === "lokaleSeite") {
      if (wert) val = wert;
      else if (slot.required) val = offen();
    } else if (slot.art === "zahl") {
      const v = (wert ?? "").trim();
      if (v && !slot.einheit) getippt.add(slot.id);
      if (v) val = slot.einheit ? `${ohneDoppelteEinheit(v, slot.einheit)} ${slot.einheit}` : v;
      else if (slot.required) val = offen();
      else val = slot.leerMarker ?? "";
    } else {
      val = (wert ?? "").trim();
      if (!val && slot.required) val = offen();
    }
    werte.set(slot.id, val);
  }
  // In einem Durchgang: Was der Arzt getippt hat, wird nicht noch einmal nach Stellen durchsucht („{links}" bleibt stehen).
  // Eine Zahl ohne eigene Einheit, hinter der der Text die Einheit schreibt („{wert}°.“), steht ohne mitgetippte Einheit
  // da (CR-R4-03).
  if (slots?.length) t = t.replace(/\{([a-zA-Z0-9_-]+)\}/g, (ganz: string, id: string, stelle: number, alles: string) => {
    const w = werte.get(id) ?? "";
    return getippt.has(id) ? ohneDoppelteEinheit(w, einheitDahinter(alles.slice(stelle + ganz.length))) : w;
  });
  return { text: t, offen: s.offen > vorher, vorschlag, ...(uebertragen.length > 0 ? { uebertragen } : {}) };
}

/** Eigener Wortlaut des Arztes; leer gilt als nicht vorhanden. */
function eigenerText(fall: Fall, key: string): string | undefined {
  const t = fall.eigen[key];
  return t !== undefined && t.trim() !== "" ? t : undefined;
}

/**
 * Der Leser sucht das Auffällige. Innerhalb einer Untersuchungsgruppe rücken
 * auffällige Befunde deshalb vor die Normalbefunde. Umgestellt wird nur in
 * einer ununterbrochenen Folge von Befunden derselben Gruppe; fester Text,
 * Felder und Messwerte sind Grenzen, die kein Befund überschreitet.
 */
/**
 * Wahlbefund: kein Normaltext, der Satz besteht nur aus einer Angabe, die der Arzt wählt
 * („Seitenbänder stabil" ebenso wie „mediale Aufklappbarkeit"). Er gilt im Brief nicht als auffällig.
 */
export function istWahlbefund(seg: { normal: string; abweichung: string }): boolean {
  return !seg.normal.trim() && /^\s*\{[a-zA-Z0-9_-]+\}[.\s]*$/.test(seg.abweichung);
}

function auffaelligesZuerst(tokens: Token[]): Token[] {
  const aus: Token[] = [];
  let lauf: Token[] = [];
  const schliesse = () => {
    aus.push(...lauf.filter((t) => t.zustand === "abw"), ...lauf.filter((t) => t.zustand !== "abw"));
    lauf = [];
  };
  for (const t of tokens) {
    const inGruppe = t.art === "befund" && !!t.gruppe;
    if (inGruppe && (lauf.length === 0 || lauf[0].gruppe === t.gruppe)) {
      lauf.push(t);
      continue;
    }
    schliesse();
    if (inGruppe) lauf.push(t);
    else aus.push(t);
  }
  schliesse();
  return aus;
}

/** Zeichen eines Unterpunkts: eigene Zeile, mit Leerzeichen eingerückt (kein Tabulator, den manche KIS-Felder schlucken). */
export const UNTERPUNKT = "\n  - ";

/** Listen- oder Unterpunktzeichen, mit dem ein Punkt beginnt; mehrzeiliger Freitext darin wird je Zeile ein Punkt (M-06). */
function istPunktzeichen(praefix: string): boolean {
  return /^\n *- $/.test(praefix);
}

/**
 * Ein Unterpunkt steht für sich: Komma, Semikolon und Leerzeichen am Anfang (aus dem Satzbau der Zeile darüber)
 * entfallen, ebenso Klammern, die den ganzen Punkt umschließen („ (AO 2R3A2)“ → „AO 2R3A2“).
 */
function alsUnterpunkt(tokens: Token[]): Token[] {
  const aus = tokens.map((t) => ({ ...t }));
  const erster = aus.findIndex((t) => t.t.trim().length > 0);
  if (erster < 0) return aus;
  aus[erster].t = aus[erster].t.replace(/^[\s,;]+/, "");
  let letzter = aus.length - 1;
  while (letzter > erster && aus[letzter].t.trim().length === 0) letzter--;
  const ganz = tokensZuText(aus.slice(erster, letzter + 1)).trim();
  const innen = ganz.slice(1, -1);
  if (ganz.startsWith("(") && ganz.endsWith(")") && !/[()]/.test(innen.replace(/\([^()]*\)/g, ""))) {
    aus[erster].t = aus[erster].t.replace(/^\(/, "");
    aus[letzter].t = aus[letzter].t.replace(/\)(\s*)$/, "$1");
  }
  return aus;
}

function bausteinTokens(b: Baustein, fall: Fall, opt: RenderOptionen, s: Sammler): { tokens: Token[]; liste: boolean } {
  const aus: Token[] = [];
  let aktuell: Token[] = [];
  let praefix = "";
  let beginntMitListe: boolean | null = null;
  // Ein Listenpunkt, dessen Auswahl ein Standardprotokoll ersetzt, tritt ganz zurück, samt Regionskopf und Seite davor;
  // was er schon gezählt hat, gilt dann nicht.
  let verwerfen = false;
  const schnappschuss = () => ({ zahlen: { offen: s.offen, vorschlag: s.vorschlag, auffaellig: s.auffaellig, seiteFehlt: s.seiteFehlt, personFehlt: s.personFehlt, brauchtSeite: s.brauchtSeite, brauchtPerson: s.brauchtPerson }, aus: s.aus.length, spaeter: s.spaeter.length });
  let stand = schnappschuss();

  const flush = () => {
    if (verwerfen) {
      Object.assign(s, stand.zahlen);
      s.aus.length = stand.aus;
      s.spaeter.length = stand.spaeter;
      aktuell = [];
      verwerfen = false;
    }
    if (tokensZuText(aktuell).trim().length > 0) {
      if (beginntMitListe === null) beginntMitListe = praefix.startsWith("\n-");
      if (praefix === UNTERPUNKT) {
        aus.push({ t: praefix, art: "gliederung" });
        aus.push(...alsUnterpunkt(aktuell));
      } else {
        if (praefix) aus.push({ t: praefix, art: "fix" });
        aus.push(...auffaelligesZuerst(aktuell));
      }
    }
    aktuell = [];
    stand = schnappschuss();
  };

  for (const seg of b.segmente) {
    switch (seg.art) {
      case "punkt":
        flush();
        praefix = opt.listen === "striche" ? "\n- " : " ";
        break;

      case "unterpunkt":
        // Unterpunkte bleiben auch bei „Fließtext“ eigene Zeilen: Die Einstellung gilt für Maßnahmen und Procedere.
        flush();
        praefix = UNTERPUNKT;
        break;

      case "absatz":
        flush();
        praefix = "\n\n";
        break;

      case "text":
        aktuell.push({ t: seg.text, art: "fix" });
        break;

      case "seite": {
        s.brauchtSeite = true;
        const seite = seiteVon(fall, b.id);
        const key = schluessel(b.id, SEITE_KEY);
        if (seite) {
          aktuell.push({ t: seiteText(seite), art: "seite", key, zustand: "gesetzt", label: "Seite" });
        } else {
          s.seiteFehlt = true;
          s.offen++;
          aktuell.push({ t: luecke("Seite"), art: "seite", key, zustand: "offen", label: "Seite" });
        }
        break;
      }

      case "person": {
        s.brauchtPerson = true;
        const t = personText(seg.form, fall.geschlecht, fall.alter, { gross: seg.gross, alter: seg.alter });
        const key = schluessel(b.id, PERSON_KEY);
        if (t === null) {
          s.personFehlt = true;
          s.offen++;
          aktuell.push({ t: luecke("Patient/Patientin"), art: "person", key, zustand: "offen", label: "Patient/Patientin" });
        } else {
          aktuell.push({ t, art: "person", key, zustand: "gesetzt", label: "Patient/Patientin" });
        }
        break;
      }

      case "platzhalter": {
        const def = b.platzhalter.find((p) => p.id === seg.ref);
        if (!def) break;
        const key = schluessel(b.id, def.id);
        const mitEinheit = (w: string) => (def.einheit ? `${ohneDoppelteEinheit(w, def.einheit)} ${def.einheit}` : w);
        // Datum des Fallkopfs (E-58): Ein hier eingetragener Wert geht vor (bewusste Abweichung, Fall von vorher).
        const falldatum = s.falldaten.get(key) ?? undefined;
        // Ein Datum, das der Arzt im Fallkopf nachträgt, ersetzt auch einen Platzhalter fürs KIS an dieser Stelle.
        if (fall.spaeter[key] && !(falldatum && fall.daten[falldatum] && !(fall.werte[key] ?? "").trim())) {
          s.spaeter.push({ key, label: def.label });
          aktuell.push({ t: kisPlatzhalter(def.label), art: "feld", key, zustand: "spaeter", label: def.label, falldatum });
          break;
        }
        const roh = fall.werte[key];
        if (def.typ === "medikation") {
          const eintraege = leseMedikation(roh).filter((e) => !istLeer(e));
          if (eintraege.length > 0) {
            // Jeder Eintrag ist ein eigener Punkt der Liste; nur strukturierte Zeilen tragen Zellen für die Tabelle.
            const trenner = istPunktzeichen(praefix) ? praefix : praefix === " " ? " " : "\n";
            eintraege.forEach((e, i) => {
              const { text, offen } = e.art === "frei" ? { text: e.text.trim(), offen: e.text.includes("‹") } : medText(e);
              if (offen) s.offen++;
              if (i > 0) aktuell.push({ t: trenner, art: "fix" });
              aktuell.push({ t: text, art: "feld", key, zustand: offen ? "offen" : "gesetzt", label: def.label, frei: true, zellen: e.art === "zeile" ? medZellen(e) : undefined });
            });
            break;
          }
        }
        const wert = def.typ === "medikation" ? "" : (roh ?? "").trim();
        if (wert) {
          const offen = wert.includes("‹");
          if (offen) s.offen++;
          // Mehrzeiliger Freitext in einem Listenpunkt: jede Zeile ein eigener Punkt (M-06).
          const zeilen = istPunktzeichen(praefix) ? wert.split("\n").map((z) => z.trim()).filter(Boolean).join(praefix) : wert;
          aktuell.push({ t: mitEinheit(zeilen), art: "feld", key, zustand: offen ? "offen" : "gesetzt", label: def.label, frei: true, falldatum });
        } else if (falldatum) {
          const datum = fall.daten[falldatum];
          if (datum) {
            aktuell.push({ t: datum, art: "feld", key, zustand: "gesetzt", label: def.label, falldatum });
          } else {
            // Fehlt das Datum, steht an genau dieser Stelle der Platzhalter fürs KIS: sichtbar, nachgehalten, ohne Sperre.
            s.spaeter.push({ key, label: def.label });
            aktuell.push({ t: kisPlatzhalter(def.label), art: "feld", key, zustand: "spaeter", label: def.label, falldatum });
          }
        } else if (s.uebertragen.has(key)) {
          // Auch ein geleertes Feld: `uebertragungen` lässt nur Stellen ohne eigenen Wortlaut zu (PS-R6F-2).
          // Antwort von einer anderen Stelle (E-60), vor dem Hausstandard.
          const u = s.uebertragen.get(key)!;
          if (!u.aussage) s.vorschlag++;
          aktuell.push({ t: mitEinheit(u.wert), art: "feld", key, zustand: u.aussage ? "gesetzt" : "vorschlag", label: def.label, uebertragen: [u.quelle] });
        } else if (roh === undefined && hausstandard(def)) {
          // Wert aus dem Hausstandard: ein Vorschlag, bis der Arzt ihn übernimmt.
          const vorgabe = hausstandard(def);
          s.vorschlag++;
          aktuell.push({ t: mitEinheit(vorgabe), art: "feld", key, zustand: "vorschlag", label: def.label });
        } else if (def.required) {
          s.offen++;
          aktuell.push({ t: luecke(def.label), art: "feld", key, zustand: "offen", label: def.label });
        } else if (def.leerMarker) {
          aktuell.push({ t: def.leerMarker, art: "feld", key, zustand: "gesetzt", label: def.label });
        } else {
          s.aus.push({ key, label: def.label, bausteinId: b.id, art: "feld" });
        }
        break;
      }

      case "auswahl": {
        const key = schluessel(b.id, seg.id);
        if (s.ersetzt.has(key)) {
          verwerfen = true;
          break;
        }
        const eigen = eigenerText(fall, key);
        const gewaehlt = gueltigerIndex(fall.auswahl[key], seg.optionen.length);
        // Vorgabe der Vorlage, sonst die des Bausteins (Hausstandard). Beides ist nur ein Vorschlag.
        const vorgabe = gueltigerIndex(s.auswahlVorgabe[key], seg.optionen.length) ?? gueltigerIndex(seg.default, seg.optionen.length);
        let t: string;
        let zustand: Token["zustand"] = "gesetzt";
        const ueber = eigen === undefined && gewaehlt === undefined ? s.uebertragen.get(key) : undefined;
        const uebertragenIndex = ueber ? gueltigerIndex(ueber.wert, seg.optionen.length) : undefined;
        if (eigen !== undefined) t = eigen;
        else if (gewaehlt !== undefined) t = seg.optionen[gewaehlt];
        else if (ueber && uebertragenIndex !== undefined) {
          t = seg.optionen[uebertragenIndex];
          if (!ueber.aussage) zustand = "vorschlag";
        } else if (seg.variante) t = seg.optionen[vorgabe ?? 0] ?? "";
        else if (vorgabe === undefined) {
          s.offen++;
          aktuell.push({ t: luecke(seg.label), art: "auswahl", key, zustand: "offen", label: seg.label });
          break;
        } else {
          t = seg.optionen[vorgabe];
          zustand = "vorschlag";
        }
        if (!t.trim()) {
          s.aus.push({ key, label: seg.label, bausteinId: b.id, art: "auswahl" });
          break;
        }
        if (t.includes("‹")) zustand = "offen";
        if (zustand === "vorschlag") s.vorschlag++;
        if (zustand === "offen") s.offen++;
        aktuell.push({ t, art: "auswahl", key, zustand, label: seg.label, frei: eigen !== undefined, ...(ueber && uebertragenIndex !== undefined ? { uebertragen: [ueber.quelle] } : {}) });
        break;
      }

      case "befund": {
        const key = schluessel(b.id, seg.id);
        const status = fall.befund[key];
        const weg = () => s.aus.push({ key, label: seg.chip, bausteinId: b.id, art: "befund", gruppe: seg.gruppe });
        if (status === "weg") {
          weg();
          break;
        }
        // Ein Wahlbefund (Stabilitätstest, Bewegungsausmaß) hat kein „normal": Was der Arzt wählt, kann unauffällig oder auffällig sein.
        const wahl = istWahlbefund(seg);
        if (status === "abw") {
          if (!wahl) s.auffaellig++;
          const eigen = eigenerText(fall, key);
          const g = eigen !== undefined ? { text: setzeBezug(eigen, b, fall, s), offen: false } : fuelleSlots(seg.abweichung, seg.slots, b, seg.id, seg.chip, fall, s, true);
          const offen = g.offen || g.text.includes("‹");
          if (offen && !g.offen) s.offen++;
          aktuell.push({ t: g.text, art: "befund", key, zustand: offen ? "offen" : wahl ? "gesetzt" : "abw", label: seg.chip, gruppe: seg.gruppe, frei: eigen !== undefined });
          break;
        }
        const hatNormal = seg.normal.trim() !== "";
        if (status === "ok" && hatNormal) {
          // Fehlt dem Satz noch Seite oder Person, ist die Stelle offen, auch wenn der Befund bestätigt ist.
          const t = setzeBezug(seg.normal, b, fall, s);
          aktuell.push({ t, art: "befund", key, zustand: t.includes("‹") ? "offen" : "ok", label: seg.chip, gruppe: seg.gruppe });
          break;
        }
        // Die Vorlage geht vor: Was sie entscheiden lässt, ist eine Lücke, auch wenn der Befund sonst selten erhoben wird
        // oder keinen Normaltext hat. Bei dieser Diagnose soll der Brief nicht stillschweigend darüber hinweggehen.
        if (status === undefined && s.entscheiden.has(key)) {
          s.offen++;
          aktuell.push({ t: luecke(`${seg.chip}?`), art: "befund", key, zustand: "offen", label: seg.chip, gruppe: seg.gruppe });
          break;
        }
        if (!hatNormal || seg.selten || s.ohne.has(key)) {
          // Ohne Normaltext, selten erhoben oder bei dieser Diagnose nicht zu erwarten: ohne ausdrückliche Wahl steht nichts im Brief.
          weg();
          break;
        }
        const normal = setzeBezug(seg.normal, b, fall, s);
        if (normal.includes("‹")) {
          aktuell.push({ t: normal, art: "befund", key, zustand: "offen", label: seg.chip, gruppe: seg.gruppe });
          break;
        }
        s.vorschlag++;
        aktuell.push({ t: normal, art: "befund", key, zustand: "vorschlag", label: seg.chip, gruppe: seg.gruppe });
        break;
      }

      case "messwert": {
        // Messwerte sind nie vorbelegt: Ohne eingetragenen Wert steht nichts im Brief.
        const key = schluessel(b.id, seg.id);
        const wert = (fall.werte[key] ?? "").trim();
        if (fall.versteckt[key] || !wert) {
          // Verlangt die Vorlage den Wert, bleibt er eine Lücke, bis er eingetragen oder als nicht gemessen gekennzeichnet ist.
          if (!fall.versteckt[key] && s.entscheiden.has(key)) {
            s.offen++;
            aktuell.push({ t: luecke(`${seg.label}?`), art: "messwert", key, zustand: "offen", label: seg.label, gruppe: seg.gruppe });
            break;
          }
          s.aus.push({ key, label: seg.label, bausteinId: b.id, art: "messwert", gruppe: seg.gruppe });
          break;
        }
        const [vor, nach = ""] = seg.vorlage.split("{w}");
        aktuell.push({ t: vor, art: "fix" });
        // Die Einheit steht in der Vorlage hinter dem Wert („Wunde von {w} cm Länge.“, „{w}°.“, „{w}/min.“); getippt mit
        // Einheit nicht doppelt, auch ohne Leerzeichen davor (CR-R4-03).
        const w = ohneDoppelteEinheit(wert, einheitDahinter(nach));
        const stellung = stellungVon(fall, key, seg);
        if (stellung) {
          // Die gewählte Ausgangsstellung steht hinter der Einheit in Klammern, in derselben Stelle wie der Wert: Ein
          // Wert ohne seine Stellung wäre eine andere Aussage (R4-D3).
          const einheit = /^\s*[^\s.,;:{]+/.exec(nach)?.[0] ?? "";
          aktuell.push({ t: `${w}${einheit} (${stellung})`, art: "messwert", key, zustand: "gesetzt", label: seg.label, frei: true });
          aktuell.push({ t: nach.slice(einheit.length), art: "fix" });
          break;
        }
        aktuell.push({ t: w, art: "messwert", key, zustand: "gesetzt", label: seg.label, frei: true });
        aktuell.push({ t: nach, art: "fix" });
        break;
      }

      case "option": {
        const key = schluessel(b.id, seg.id);
        // Weggelassen oder durch ein Standardprotokoll ersetzt: weder im Brief noch unter „+ …“.
        if (s.weg.has(key) || s.ersetzt.has(key)) break;
        const gewaehlt = fall.optionen[key];
        const vorgabe = s.an.has(key) ? true : s.nichtAn.has(key) ? false : (seg.an ?? false);
        if (!(gewaehlt ?? vorgabe)) {
          if (s.nichtAnbieten.has(key)) break;
          const vorschau = seg.text.replace(/\{seite\}/g, seiteVon(fall, b.id) ?? "…").replace(/\{[a-zA-Z0-9_-]+\}/g, "…").replace(/\s+/g, " ").trim();
          s.aus.push({ key, label: seg.label, bausteinId: b.id, art: "option", gruppe: seg.gruppe, vorschau });
          break;
        }
        const eigen = eigenerText(fall, key);
        const g: Gefuellt =
          eigen !== undefined
            ? { text: setzeBezug(eigen, b, fall, s), offen: false, vorschlag: false }
            : fuelleSlots(seg.text, seg.slots, b, seg.id, seg.label, fall, s, false, folgeangabenVon(b, seg.id, fall, s.regeln));
        // Ein Satz, der nur aus einer leeren Angabe besteht, behauptet nichts und ist nicht zu übernehmen.
        if (g.text.trim() === "") break;
        const offen = g.offen || g.text.includes("‹");
        if (offen && !g.offen) s.offen++;
        // Ein Satz, den nur die Vorlage eingeschaltet hat oder der eine Angabe der Vorlage enthält, ist ein Vorschlag.
        // Wer den Satz selbst formuliert, hat ihn sich zu eigen gemacht.
        const vorschlag = !offen && eigen === undefined && (gewaehlt !== true || g.vorschlag);
        if (vorschlag) s.vorschlag++;
        aktuell.push({
          t: g.text,
          art: "option",
          key,
          zustand: offen ? "offen" : vorschlag ? "vorschlag" : "gesetzt",
          label: seg.label,
          gruppe: seg.gruppe,
          frei: eigen !== undefined,
          ...(g.uebertragen ? { uebertragen: g.uebertragen } : {}),
        });
        break;
      }
    }
  }
  flush();
  // Die Überschrift steht nur über einem Baustein mit Text, auf eigener Zeile.
  if (b.ueberschrift && aus.some((t) => t.t.trim().length > 0)) {
    aus.unshift({ t: b.ueberschrift, art: "titel" }, ...(aus[0].t.startsWith("\n") ? [] : [{ t: "\n", art: "fix" as const }]));
  }
  // Auch fester Text weiß, zu welchem Baustein er gehört, damit die Oberfläche Bausteine als Block zeigen kann.
  return { tokens: aus.map((t) => ({ ...t, bausteinId: b.id })), liste: beginntMitListe === true };
}

// Auch die im Dienst üblichen Kurzformen „re." und „li.".
const RECHTS = /\brecht(s|e[nrms]?)\b|\bre\./i;
const LINKS = /\blink(s|e[nrms]?)\b|\bli\./i;

/** Seitenwort in frei geschriebenem Text, das der Seite des Falls bzw. des Bausteins widerspricht. */
function findeSeitenkonflikt(tokens: Token[], fall: Fall): string | null {
  for (const t of tokens) {
    if (!t.frei) continue;
    const seite = t.bausteinId ? seiteVon(fall, t.bausteinId) : fall.seite;
    const gegen = seite === "rechts" ? LINKS : seite === "links" ? RECHTS : null;
    const treffer = gegen?.exec(t.t);
    if (treffer) return treffer[0];
  }
  return null;
}

function neuerSammler(fall: Fall, index: KatalogIndex, uebertragen: Map<string, Uebertragung> = uebertragungenImFall(fall, index)): Sammler {
  const vorlage = fall.vorlageId ? index.vorlagen.get(fall.vorlageId) : undefined;
  const weg = weggelasseneStellen(fall, vorlage, index);
  const ersetzt = ersetzteStellen(fall, index);
  const falldaten = falldatumZuordnung(fall, bausteineImBrief(fall, index), index.katalog.regeln);
  return {
    offen: 0,
    vorschlag: 0,
    auffaellig: 0,
    seiteFehlt: false,
    personFehlt: false,
    brauchtSeite: false,
    brauchtPerson: false,
    spaeter: [],
    aus: [],
    entscheiden: new Set(vorlage?.entscheiden ?? []),
    ohne: new Set(vorlage?.ohne ?? []),
    weg,
    ersetzt,
    nichtAnbieten: new Set(vorlage?.nichtAnbieten ?? []),
    an: new Set(vorlage?.vorgaben?.an ?? []),
    nichtAn: new Set(vorlage?.vorgaben?.aus ?? []),
    slotVorgabe: vorlage?.vorgaben?.slots ?? {},
    auswahlVorgabe: vorlage?.vorgaben?.auswahl ?? {},
    regeln: index.katalog.regeln,
    // Dieselbe Quelle wie das Feldfenster (CR-R6F-07).
    uebertragen,
    falldaten,
    mehrdeutig: mehrdeutigeAnker(fall, falldaten),
  };
}

/** Bausteine des Falls in der Reihenfolge des Briefs: Abschnitte wie im Brieftyp, darin wie im Fall. */
function bausteineImBrief(fall: Fall, index: KatalogIndex): Baustein[] {
  const reihe = index.brieftypen.get(fall.brieftypId)?.abschnitte.map((a) => a.id) ?? [];
  const ids = [...reihe, ...(Object.keys(fall.bausteine) as AbschnittId[]).filter((a) => !reihe.includes(a))].flatMap((a) => fall.bausteine[a] ?? []);
  return ids.map((bid) => index.bausteine.get(bid)).filter((b): b is Baustein => b !== undefined);
}

interface AbschnittIntern extends AbschnittAnsicht {
  brauchtSeite: boolean;
  brauchtPerson: boolean;
}

/** Platzhalter fürs KIS in frei geschriebenem Text („[OP-DATUM]") bleiben in der Liste „Im KIS zu ergänzen". */
function merkePlatzhalter(text: string, abschnitt: AbschnittId, s: Sammler) {
  for (const m of text.match(/\[[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 .:\/-]{1,58}\]/g) ?? []) {
    s.spaeter.push({ key: `frei:${abschnitt}:${m}`, label: m.slice(1, -1) });
  }
}

interface OffeneStelle {
  key: string;
  label: string;
}

/**
 * Reihenfolge eines Abschnitts: Bausteine des Falls und offene
 * Entweder-oder-Stellen. Grundlage ist die Reihenfolge im Fall. Eine Stelle mit
 * `vor` steht vor diesem Baustein, offen als Lücke, entschieden mit ihren
 * Bausteinen, gleich auf welchem Weg sie in den Fall kamen. Offene Stellen ohne
 * Platz, und solche, deren Platz im Fall fehlt, stehen in `amEnde`; ihre
 * gewählten Bausteine bleiben, wo der Fall sie hat (angehängt bei der Wahl).
 */
function anordnung(
  id: AbschnittId,
  ids: string[],
  bausteine: Baustein[],
  fall: Fall,
  vorlage: Vorlage | undefined,
): { folge: ({ b: Baustein } | OffeneStelle)[]; amEnde: OffeneStelle[] } {
  let folge: ({ b: Baustein } | OffeneStelle)[] = bausteine.map((b) => ({ b }));
  const amEnde: OffeneStelle[] = [];
  const vorhanden = bausteine.map((b) => b.id);
  (vorlage?.wahl ?? []).forEach((w, nr) => {
    if (w.abschnitt !== id) return;
    const key = wahlSchluessel(id, nr);
    // Solange keiner der Bausteine im Abschnitt steht und der Arzt die Stelle nicht leer gelassen hat, bleibt dort eine Lücke.
    const offen = !stelleLeer(fall, w, key) && !w.bausteine.some((bid) => ids.includes(bid));
    const vor = vorlage ? stelleVor(vorlage, w, vorhanden) : undefined;
    const eigene = folge.filter((t) => "b" in t && w.bausteine.includes(t.b.id));
    const rest = folge.filter((t) => !eigene.includes(t));
    const ziel = rest.findIndex((t) => "b" in t && t.b.id === vor);
    // `ziel === -1` ist nur ein Schutz: `vor` kommt aus `vorhanden` und ist nie Baustein einer Stelle (`stelleVor`), steht
    // also immer in `rest`. Fehlte er doch, steht die Stelle wie ohne Platzangabe am Ende (CR-T1-07).
    if (vor === undefined || ziel === -1) {
      if (offen) amEnde.push({ key, label: w.label });
      return;
    }
    rest.splice(ziel, 0, ...(offen ? [{ key, label: w.label }] : eigene));
    folge = rest;
  });
  return { folge, amEnde };
}

function renderIntern(id: AbschnittId, titel: string, fall: Fall, index: KatalogIndex, opt: RenderOptionen, uebertragen?: Map<string, Uebertragung>): AbschnittIntern {
  const s = neuerSammler(fall, index, uebertragen);
  const ids = fall.bausteine[id] ?? [];
  const fehlend = ids.filter((bid) => !index.bausteine.has(bid));
  const vorlage = fall.vorlageId ? index.vorlagen.get(fall.vorlageId) : undefined;
  const { folge, amEnde } = anordnung(
    id,
    ids,
    ids.map((bid) => index.bausteine.get(bid)).filter((b): b is Baustein => b !== undefined),
    fall,
    vorlage,
  );
  const bausteine = folge.flatMap((t) => ("b" in t ? [t.b] : []));

  let roh: Token[] = [];
  const manuell = fall.manuell[id];
  if (manuell !== undefined) {
    roh = [{ t: manuell, art: "manuell", frei: true }];
    // Auch von Hand übernommener Text darf keine Lücke ins KIS tragen.
    s.offen += (manuell.match(LUECKE) ?? []).length;
    merkePlatzhalter(manuell, id, s);
  } else {
    const wahlLuecke = (st: OffeneStelle) => {
      s.offen++;
      if (roh.length > 0) roh.push({ t: "\n", art: "fix" });
      roh.push({ t: luecke(st.label), art: "wahl", key: st.key, zustand: "offen", label: st.label });
    };
    let vorherListe = false;
    for (const teil of folge) {
      if (!("b" in teil)) {
        wahlLuecke(teil);
        vorherListe = false;
        continue;
      }
      const { tokens: t, liste } = bausteinTokens(teil.b, fall, opt, s);
      if (t.length === 0) continue;
      if (roh.length > 0) {
        // Zwei Listen hintereinander bilden eine Liste; sonst beginnt ein neuer Absatz.
        const nahtlos = vorherListe && liste && t[0].art === "fix" && t[0].t.startsWith("\n");
        if (!nahtlos) roh.push({ t: "\n", art: "fix" });
      }
      roh.push(...t);
      vorherListe = liste;
    }
    for (const bid of fehlend) {
      s.offen++;
      if (roh.length > 0) roh.push({ t: "\n", art: "fix" });
      roh.push({ t: luecke(`Baustein „${bid}“ gibt es nicht mehr`), art: "fix" });
    }
    // Offene Stellen ohne Platzangabe stehen wie bisher hinter allem anderen.
    for (const st of amEnde) wahlLuecke(st);
    const zusatz = (fall.zusatz[id] ?? "").trim();
    if (zusatz) {
      if (roh.length > 0) roh.push({ t: "\n", art: "fix" });
      roh.push({ t: zusatz, art: "zusatz", frei: true });
      s.offen += (zusatz.match(LUECKE) ?? []).length;
      merkePlatzhalter(zusatz, id, s);
    }
  }

  const tokens = manuell === undefined ? mitFristen(glaetten(roh), id, fall, s.regeln, s.mehrdeutig) : glaetten(roh);
  const text = tokensZuText(tokens);
  const kopie = fall.kopiert[id];
  const leer = text.length === 0;
  // Gezählt werden Stellen, nicht Angaben: Ein Satz mit drei fehlenden Angaben ist eine offene Stelle und ein Halt.
  // Der Sammler zählt jede fehlende Angabe; er bleibt die Sperre und hält die Zahl über null, falls keine Stelle sie trägt.
  const freieLuecken = tokens.reduce((n, t) => n + (t.frei && !t.key ? (t.t.match(LUECKE) ?? []).length : 0), 0);
  const offen = Math.max(tokens.filter((t) => t.zustand === "offen").length + freieLuecken + fehlend.length, s.offen > 0 ? 1 : 0);
  const vorschlag = Math.max(tokens.filter(mitVorschlag).length, s.vorschlag > 0 ? 1 : 0);
  return {
    id,
    titel,
    tokens,
    text,
    bausteine,
    fehlend,
    offen,
    vorschlag,
    auffaellig: s.auffaellig,
    seiteFehlt: s.seiteFehlt,
    personFehlt: s.personFehlt,
    brauchtSeite: s.brauchtSeite,
    brauchtPerson: s.brauchtPerson,
    seitenkonflikt: findeSeitenkonflikt(tokens, fall),
    spaeter: s.spaeter.map((p) => ({ ...p, abschnitt: id })),
    aus: manuell !== undefined ? [] : s.aus,
    manuell: manuell !== undefined,
    ausgeblendet: !!fall.ausgeblendet[id],
    leer,
    fertig: !leer && offen === 0 && vorschlag === 0,
    kopiert: kopie !== undefined,
    kopiertUm: fall.kopiertUm[id],
    geaendertSeitKopie: kopie !== undefined && kopie !== text,
  };
}

export function renderAbschnitt(
  id: AbschnittId,
  titel: string,
  fall: Fall,
  index: KatalogIndex,
  opt: RenderOptionen = STANDARD_OPTIONEN,
): AbschnittAnsicht {
  return renderIntern(id, titel, fall, index, opt);
}

export function renderBrief(fall: Fall, index: KatalogIndex, opt: RenderOptionen = STANDARD_OPTIONEN): BriefAnsicht {
  const typ = index.brieftypen.get(fall.brieftypId);
  const nicht = nichtImBrief(fall, index);
  const uebertragen = uebertragungen(fall, index, index.katalog.regeln, nicht);
  const abschnitte = (typ?.abschnitte ?? []).map((a) => renderIntern(a.id, a.titel, fall, index, opt, uebertragen));
  const zaehlen = abschnitte.filter((a) => !a.ausgeblendet);
  return {
    abschnitte,
    offen: zaehlen.reduce((n, a) => n + a.offen, 0),
    vorschlag: zaehlen.reduce((n, a) => n + a.vorschlag, 0),
    seiteFehlt: zaehlen.some((a) => a.seiteFehlt),
    personFehlt: zaehlen.some((a) => a.personFehlt),
    brauchtSeite: abschnitte.some((a) => a.brauchtSeite),
    brauchtPerson: abschnitte.some((a) => a.brauchtPerson),
    spaeter: zaehlen.flatMap((a) => a.spaeter),
    uebertragen,
    widersprueche: widersprueche(fall, index, index.katalog.regeln, nicht),
  };
}

/** Sätze und Auswahlen, die in diesem Fall nicht im Brief stehen: weggelassen oder durch ein Protokoll ersetzt (E-60). */
function nichtImBrief(fall: Fall, index: KatalogIndex): Set<string> {
  const vorlage = fall.vorlageId ? index.vorlagen.get(fall.vorlageId) : undefined;
  return new Set([...weggelasseneStellen(fall, vorlage, index), ...ersetzteStellen(fall, index)]);
}

/** Übertragungen, wie sie das Rendern dieses Falls einsetzt: ohne weggelassene und durch ein Protokoll ersetzte Stellen. */
export function uebertragungenImFall(fall: Fall, index: KatalogIndex): Map<string, Uebertragung> {
  return uebertragungen(fall, index, index.katalog.regeln, nichtImBrief(fall, index));
}

/** Abschnitte, die in den Gesamtbrief gehören: nicht ausgeblendet und nicht leer. */
export function sichtbareAbschnitte(brief: BriefAnsicht): AbschnittAnsicht[] {
  return brief.abschnitte.filter((a) => !a.ausgeblendet && !a.leer);
}

export function briefText(brief: BriefAnsicht, ueberschriften = true): string {
  return sichtbareAbschnitte(brief)
    .map((a) => (ueberschriften ? `${a.titel}:\n${a.text}` : a.text))
    .join("\n\n");
}

/** Abschnitt eines Bausteins, wie er im Brief einsortiert wird. */
export { abschnittVon };

/**
 * Ein Wert, den der Arzt mit Einheit getippt hat („3 cm“), obwohl der Text die Einheit selbst dahinter schreibt: ohne
 * die Einheit, sonst stünde „3 cm cm“ im Brief (H-R3-1). Nur wenn vor der Einheit eine Zahl steht.
 */
/**
 * Die Einheit, die ein Text unmittelbar hinter einem Wert schreibt: „°“ in „°. “, „/min“ in „/min. “, „cm“ in
 * „ cm Länge.“; mit oder ohne Leerzeichen davor. Ein Satzzeichen oder eine neue Stelle ist keine Einheit.
 */
export function einheitDahinter(text: string): string | undefined {
  return /^\s*([^\s.,;:{]+)/.exec(text)?.[1];
}

/** Angabe eines Messfelds, unter der die gewählte Ausgangsstellung steht: `bausteinId/segId/stellung`. */
export const STELLUNG = "stellung";

/**
 * Gewählte Ausgangsstellung eines Messfelds, nur wenn die Vorlage sie anbietet. Gespeichert ist der Wortlaut, nicht die
 * Nummer: Er übersteht eine neue Katalogfassung, solange es die Stellung dort noch gibt.
 */
export function stellungVon(fall: Fall, key: string, seg: { stellungen?: string[] }): string | undefined {
  const s = fall.slots[`${key}/${STELLUNG}`];
  return s !== undefined && seg.stellungen?.includes(s) ? s : undefined;
}

export function ohneDoppelteEinheit(wert: string, einheit: string | undefined): string {
  if (!einheit) return wert;
  const e = einheit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(.*\\d)\\s*${e}\\.?\\s*$`, "iu").exec(wert)?.[1] ?? wert;
}
