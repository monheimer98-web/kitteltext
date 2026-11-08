// Datenmodell. Inhalte sind Daten (src/data), die Engine (src/engine) setzt sie
// nur zusammen. Es gibt kein Feld für Name, Geburtsdatum oder Fallnummer.

/** "ohne": Der Arzt hat ausdrücklich gewählt, dass es keine Seite gibt (mittige oder unpaare Struktur). */
export type Seite = "rechts" | "links" | "beidseits" | "ohne";

/** Einsatzort. Bestimmt Brieftyp und Vorlagenauswahl. */
export type Setting = "zna" | "station";

export type AbschnittId =
  | "diagnose"
  | "therapie"
  | "anamnese"
  | "befund"
  | "diagnostik"
  | "verlauf"
  | "entlassbefund"
  | "procedere"
  | "medikation";

export const ALLE_ABSCHNITTE: AbschnittId[] = [
  "diagnose",
  "therapie",
  "anamnese",
  "befund",
  "diagnostik",
  "verlauf",
  "entlassbefund",
  "procedere",
  "medikation",
];

/** m/w/k (Kind) steuern Artikel und Endungen; "n" schreibt geschlechtsneutral „Pat.". */
export type Geschlecht = "m" | "w" | "k" | "n";

/**
 * Herkunft und Prüfstand eines Textes. "entwurf" heißt: von der Redaktion
 * geschrieben, von keinem Arzt freigegeben. Die Oberfläche zeigt das an.
 */
export type Pruefstatus = "hausstandard" | "geprueft" | "entwurf" | "eigen";

export type PlatzhalterTyp =
  | "zahl"
  | "rom" // Bewegungsausmaß nach Neutral-Null, Muster _/0/_
  | "zeitraum"
  | "auswahl"
  | "begriff" // kurze Angabe, einzeilig
  | "freitext" // längere Angabe, darf mehrzeilig sein
  | "datum";

export interface Platzhalter {
  id: string;
  typ: PlatzhalterTyp;
  label: string;
  /** steht im Text hinter dem Wert, z. B. "Wochen" */
  einheit?: string;
  /** nur für typ "auswahl" */
  optionen?: string[];
  /** Vorbelegung (Index als Text bei "auswahl", sonst der Wert) */
  default?: string;
  /** Pflichtangabe: leer erscheint sie im Brief als sichtbare Lücke */
  required?: boolean;
  /** was im Text steht, wenn ein nicht verpflichtendes Feld leer bleibt */
  leerMarker?: string;
  /** anklickbare Schnellwerte für Freitext und Begriff */
  vorschlaege?: string[];
}

export type BefundSlot =
  | {
      art: "auswahl";
      id: string;
      label: string;
      optionen: string[];
      default?: number;
      required?: boolean;
    }
  | {
      art: "zahl";
      id: string;
      label: string;
      einheit?: string;
      required?: boolean;
      leerMarker?: string;
    }
  // Seite einer paarigen Struktur, unabhängig von der Seite des Falls (z. B. Pupille)
  | { art: "lokaleSeite"; id: string; label: string; required?: boolean }
  // Kurzer freier Text. Mit `required` ist er eine Lücke, bis der Arzt etwas einträgt.
  // `vorschlaege` sind neutrale Formulierungen des Katalogs; dazu kommen die eigenen Schnellwerte des Arztes.
  | { art: "detail"; id: string; label: string; maxLen: number; required?: boolean; vorschlaege?: string[] };

export type PersonForm =
  | "nom"
  | "gen"
  | "dat"
  | "akk"
  | "pron-nom"
  | "pron-dat"
  | "pron-akk";

export type Segment =
  | { art: "text"; text: string }
  // Seite des Falls bzw. des Bausteins, immer ausgeschrieben
  | { art: "seite" }
  | { art: "platzhalter"; ref: string }
  | {
      art: "auswahl";
      id: string;
      label: string;
      optionen: string[];
      /** Hausstandard: Diese Option erscheint als Vorschlag, den der Arzt übernimmt oder ändert */
      default?: number;
      /** Der Arzt muss wählen. Gilt auch ohne das Kennzeichen, solange weder `default` noch `variante` gesetzt ist. */
      pflicht?: boolean;
      /** reine Formulierungsvariante ohne klinischen Gehalt: die erste Option gilt ohne Rückfrage */
      variante?: boolean;
    }
  // Befund mit Normaltext und Abweichung. Normal ist die Ausgangslage, der
  // Arzt bestätigt sie, stellt auf auffällig oder lässt den Satz weg.
  | {
      art: "befund";
      id: string;
      chip: string;
      normal: string;
      /** Vorlage mit {slotId}-Stellen */
      abweichung: string;
      gruppe?: string;
      /** selten erhoben: steht erst im Brief, wenn der Arzt „unauffällig" oder „auffällig" wählt */
      selten?: boolean;
      slots?: BefundSlot[];
    }
  | {
      art: "messwert";
      id: string;
      label: string;
      /** Vorlage mit {w} für den Wert */
      vorlage: string;
      normal?: string;
      leer?: string;
      gruppe?: string;
    }
  // Bezug auf den Patienten: "Der 34-jährige Patient", "der Patientin", "Pat."
  | { art: "person"; form: PersonForm; gross?: boolean; alter?: boolean }
  // Satz oder Listenpunkt, der an- und abgewählt werden kann
  | {
      art: "option";
      id: string;
      label: string;
      /** Vorlage mit {slotId}-Stellen */
      text: string;
      /** Ausgangslage; fehlt die Angabe, ist die Option aus */
      an?: boolean;
      gruppe?: string;
      slots?: BefundSlot[];
    }
  // Beginn eines Listenpunkts
  | { art: "punkt" }
  | { art: "absatz" };

/** Einteilung der ersten Fassung; bestimmt den Abschnitt, wenn keiner angegeben ist. */
export type BausteinTyp =
  | "diagnose"
  | "anamnese"
  | "untersuchung"
  | "befund"
  | "diagnostik"
  | "therapie"
  | "verlauf"
  | "procedere"
  | "medikation"
  | "anordnung";

/**
 * Mehrere Angaben eines Bausteins in einem Klick, jede auf einen Wert, den der
 * Katalog an ihr schon anbietet (leere Vorgeschichte: „keine bekannt“, „keine“).
 * Der Knopf gibt es nur, solange alle Angaben leer sind; er füllt nie auf. Seine
 * Beschriftung nennt jede Aussage, die er setzt.
 */
export interface Sammelangabe {
  angaben: SammelTeil[];
  /**
   * Angaben desselben Bausteins, neben denen der Knopf nicht erscheint, sobald
   * der Arzt dort etwas anderes gewählt oder geschrieben hat als einen der
   * Werte in `ausser` (Gerinnungshemmung: alles außer „keine“).
   */
  ausblendenBei?: SammelSperre[];
}

export interface SammelSperre {
  /** Platzhalter (`feld`) oder Auswahl in einem Satz (`satz/auswahl`) desselben Bausteins */
  ref: string;
  /** Werte, die nichts nennen und den Knopf stehen lassen; leer gilt immer als nichts */
  ausser?: string[];
}

export interface SammelTeil {
  /** Pflicht-Platzhalter des Bausteins (`vorerkrankungen`) ohne Vorbelegung */
  ref: string;
  /** gesetzter Wert: ein Schnellwert dieses Platzhalters */
  wert: string;
  /** Aussage für die Beschriftung, klein beginnend („keine Vorerkrankungen“); der Knopf reiht sie mit Kommas */
  aussage: string;
}

export interface Baustein {
  id: string;
  titel: string;
  typ: BausteinTyp;
  /** Abschnitt des Briefs; ohne Angabe aus `typ` abgeleitet */
  abschnitt?: AbschnittId;
  platzhalter: Platzhalter[];
  segmente: Segment[];
  status?: Pruefstatus;
  sammelangabe?: Sammelangabe;
}

export interface Region {
  id: string;
  name: string;
  kuerzel: string;
  bausteine: Baustein[];
}

/**
 * Eine Vorlage ist ein vom Arzt gewählter Briefentwurf zu einer Diagnose.
 * Sie legt fest, welche Bausteine in welchem Abschnitt stehen. Die App wählt
 * nie selbst eine Vorlage aus Befunden aus.
 */
export interface Vorlage {
  id: string;
  titel: string;
  /** weitere Namen, unter denen Ärzte danach suchen */
  suchbegriffe?: string[];
  /** Kürzel für die Schnellsuche, z. B. "drf" */
  kuerzel?: string[];
  region: string;
  setting: Setting;
  abschnitte: Partial<Record<AbschnittId, string[]>>;
  /**
   * Befunde (Schlüssel `bausteinId/befundId`), die bei dieser Diagnose meist
   * auffällig sind. Sie sind nicht als normal vorbelegt, der Arzt muss sie
   * entscheiden.
   */
  entscheiden?: string[];
  /**
   * Schlüssel `bausteinId/befundId` der Befunde, die diese Vorlage nicht als
   * Normalbefund vorschlägt, weil er bei dieser Diagnose nicht zu erwarten oder
   * selten geprüft ist. Sie bleiben zuwählbar. Nötig, wenn eine Vorlage den
   * Untersuchungsbaustein einer anderen Lage wiederverwendet (Distorsion für
   * die Fraktur): Sonst widerspräche ein Vorschlag der Diagnose.
   */
  ohne?: string[];
  /**
   * Ausgangslage gemeinsamer Bausteine für diese Diagnose: welche Sätze
   * vorgeschlagen werden und welche Auswahl in einem Satz. Schlüssel wie im
   * Fall (`bausteinId/id`, Slots `bausteinId/id/slotId`). Vorgaben werden nie
   * in den Fall geschrieben; im Brief erscheinen sie als Vorschlag.
   */
  vorgaben?: {
    an?: string[];
    aus?: string[];
    /** vorgeschlagene Option einer Auswahl (Index) */
    auswahl?: Record<string, number>;
    /** vorgeschlagene Option einer Auswahl innerhalb eines Satzes (Index) */
    slots?: Record<string, number>;
  };
  /**
   * Sätze (`option`, Schlüssel `bausteinId/id`) gemeinsamer Bausteine, die
   * diese Vorlage nicht anbietet, solange der Arzt dieselbe Aussage an einer
   * Ersatzstelle macht. Wert: die Ersatzstellen, Pflichtauswahlen
   * (`bausteinId/auswahlId`) in anderen Bausteinen der Vorlage. Der Satz fehlt
   * in Brief, „+ …“ und Übernahme, solange ein Baustein einer Ersatzstelle im
   * Fall steht oder eine unentschiedene Entweder-oder-Stelle einen anbietet.
   * Hat der Fall zu dem Satz eine ausdrückliche Angabe des Arztes, gilt er
   * nicht als weggelassen.
   */
  weglassen?: Record<string, string[]>;
  /**
   * Schnellwerte gemeinsamer Felder für diese Diagnose. Schlüssel wie im Fall:
   * `bausteinId/platzhalterId` (Freitext, Begriff) oder
   * `bausteinId/segmentId/slotId` (Angabe `detail`). Der Wert ersetzt die
   * Schnellwerte des Katalogs an diesem Feld; eine leere Liste zeigt keine.
   * Die eigenen Schnellwerte des Arztes kommen wie überall dazu.
   */
  schnellwerte?: Record<string, string[]>;
  /**
   * Entweder-oder-Stellen: Bausteine, von denen der Arzt einen wählt (Röntgen
   * oder Verzicht darauf). Keiner steht vorab im Brief; bis zur Wahl zeigt der
   * Abschnitt eine Lücke mit dieser Bezeichnung. Die Bausteine stehen nicht in
   * `abschnitte`.
   */
  wahl?: Wahlstelle[];
  status: Pruefstatus;
  /** woher der Text stammt, z. B. "Standardtexte ZNA 04/2026" */
  quelle?: string;
}

export interface Wahlstelle {
  abschnitt: AbschnittId;
  /** Bezeichnung der Lücke, z. B. "Röntgen oder Verzicht?" */
  label: string;
  bausteine: string[];
  /**
   * Platz im Abschnitt: Lücke und gewählter Baustein stehen unmittelbar vor
   * diesem Baustein aus `abschnitte` desselben Abschnitts. Ohne Angabe stehen
   * sie am Ende des Abschnitts.
   */
  vor?: string;
  /**
   * Die Stelle verlangt einen der Bausteine: kein „nichts davon“. Für Stellen, deren
   * Bausteine Stammangaben fragen (Gerinnungshemmung, Allergien), PS-T1-01.
   */
  pflicht?: boolean;
}

/** Zustandsschlüssel einer Entweder-oder-Stelle; steht in `Fall.versteckt`, wenn der Arzt die Stelle bewusst leer lässt. */
export function wahlSchluessel(abschnitt: AbschnittId, nr: number): string {
  return `wahl/${abschnitt}/${nr}`;
}

export interface BriefAbschnitt {
  id: AbschnittId;
  titel: string;
}

export interface Brieftyp {
  id: string;
  name: string;
  setting: Setting;
  abschnitte: BriefAbschnitt[];
}

export interface Katalog {
  version: number;
  regionen: Region[];
  vorlagen: Vorlage[];
  brieftypen: Brieftyp[];
}

export type BefundStatus = "ok" | "abw" | "weg";

/**
 * Ein Fall ist ein Brief in Arbeit. Er enthält Auswahl, Werte und freien
 * klinischen Text, aber keine Identitätsdaten.
 */
export interface Fall {
  id: string;
  /** laufende Nummer in der Sitzung; bleibt, auch wenn andere Fälle geschlossen werden */
  nr: number;
  /** Version des Katalogs, mit der der Fall angelegt wurde */
  katalog: number;
  erstellt: number;
  geaendert: number;
  /** eigenes Kurzetikett zum Wiederfinden, z. B. "Kabine 3" */
  etikett: string;
  setting: Setting;
  brieftypId: string;
  vorlageId: string | null;
  geschlecht: Geschlecht | null;
  alter: string;
  seite: Seite | null;
  /** abweichende Seite einzelner Bausteine (Mehrfachverletzung) */
  seiteBaustein: Record<string, Seite>;
  bausteine: Partial<Record<AbschnittId, string[]>>;
  /** Abschnitte, die nicht in den Brief sollen */
  ausgeblendet: Partial<Record<AbschnittId, boolean>>;
  // Zustände je Feld. Schlüssel: `${bausteinId}/${id}`, Slots zusätzlich `/${slotId}`.
  befund: Record<string, BefundStatus>;
  slots: Record<string, string>;
  werte: Record<string, string>;
  auswahl: Record<string, number>;
  versteckt: Record<string, boolean>;
  optionen: Record<string, boolean>;
  /** eigener Wortlaut anstelle einer Auswahl oder eines auffälligen Befunds */
  eigen: Record<string, string>;
  /** Felder, die bewusst erst im KIS ausgefüllt werden; im Text steht dann [BEZEICHNUNG] */
  spaeter: Record<string, boolean>;
  /** freie Ergänzung am Ende eines Abschnitts */
  zusatz: Partial<Record<AbschnittId, string>>;
  /** vollständig von Hand überschriebener Abschnitt */
  manuell: Partial<Record<AbschnittId, string>>;
  /** Text des Abschnitts beim letzten Kopieren, um Änderungen danach zu erkennen */
  kopiert: Partial<Record<AbschnittId, string>>;
  kopiertUm: Partial<Record<AbschnittId, number>>;
}

export function abschnittVon(b: Baustein): AbschnittId {
  if (b.abschnitt) return b.abschnitt;
  switch (b.typ) {
    case "untersuchung":
    case "befund":
      return "befund";
    case "anordnung":
      return "procedere";
    default:
      return b.typ;
  }
}

export function schluessel(bausteinId: string, id: string, slotId?: string): string {
  return slotId ? `${bausteinId}/${id}/${slotId}` : `${bausteinId}/${id}`;
}
