// ============================================================================
// Kitteltext – Datenmodell
// ----------------------------------------------------------------------------
// Grundprinzip: content-as-data. Der Katalog (katalog.ts) ist reine Daten,
// die Engine (render.ts) konsumiert ihn nur. Kein Baustein "weiss" etwas ueber
// einen Patienten – es gibt keinerlei Feld fuer Name/Geburtsdatum/Fallnummer.
// ============================================================================

/** Koerperseite. Wird pro Fall genau EINMAL gesetzt (Seiten-Gate), kein Default. */
export type Seite = "rechts" | "links" | "beidseits";

/** Immer ausgeschrieben – nie abgekuerzt (Wrong-Site-Vermeidung). */
export const SEITE_TEXT: Record<Seite, string> = {
  rechts: "rechts",
  links: "links",
  beidseits: "beidseits",
};

/** Typ eines Freitext-/Wert-Platzhalters. Bestimmt Tastatur + Validierung. */
export type PlatzhalterTyp =
  | "zahl" // reine Zahl, z.B. Temperatur, HF
  | "rom" // Bewegungsausmass nach Neutral-Null, Muster _/0/_
  | "zeitraum" // Anzahl Tage/Wochen
  | "auswahl" // eine aus festen Optionen (Slash-Varianten im Original)
  | "begriff"; // kurzer, laengenbegrenzter klinischer Begriff (Zeichenklasse!)

export interface Platzhalter {
  /** stabile ID – geht in den Zustandscode ein, darf sich nie aendern */
  id: string;
  typ: PlatzhalterTyp;
  /** Beschriftung im Composer */
  label: string;
  /** Einheit, die im Ausgabetext hinter dem Wert steht (z.B. "Tage", "cm") */
  einheit?: string;
  /** nur fuer typ "auswahl" */
  optionen?: string[];
  /** Vorbelegung (Index bei auswahl, sonst Textwert) */
  default?: string;
  /**
   * Muss vor Export gefuellt sein? Wenn true und leer -> Export gesperrt.
   * Werte, die der Arzt zwingend individuell entscheidet, sind required.
   */
  required?: boolean;
  /** Platzhalter, der im leeren, NICHT-required Fall stehen bleibt (z.B. "___") */
  leerMarker?: string;
}

/**
 * Ein Segment ist der kleinste Baustein eines Textes. Ein Untersuchungs-Baustein
 * ist eine Sequenz von Segmenten. So bildet sich der Negativ-Default ab:
 * "befund"-Segmente stehen per Default auf ihrem Normalbefund; der Arzt tippt
 * nur die Abweichungen an.
 */
export type Segment =
  // fixer Text, immer im Output
  | { art: "text"; text: string }
  // globale Koerperseite – rendert SEITE_TEXT[fall.seite]
  | { art: "seite" }
  // Wert-/Freitext-Platzhalter (Verweis auf Baustein.platzhalter[].id)
  | { art: "platzhalter"; ref: string }
  // Auswahl (Slash-Variante), inline definiert
  | {
      art: "auswahl";
      id: string;
      label: string;
      optionen: string[];
      default?: number;
    }
  // Negativ-Default-Befund: normal (Default) <-> abweichung (angetippt)
  | {
      art: "befund";
      id: string;
      /** Kurzlabel des Chips im Composer, z.B. "Druckschmerz Außenknöchel" */
      chip: string;
      /** Text im Normalzustand (Default, Befund unauffaellig) */
      normal: string;
      /** Text bei Abweichung (Chip aktiv) */
      abweichung: string;
      /** optische Gruppierung der Chips im Composer */
      gruppe?: string;
    }
  // Messwert (z.B. Bewegungsausmass nach Neutral-Null): mit physiologischem
  // Normwert vorbelegt und per Kaestchen ausblendbar. Blockiert NIE den Export –
  // wer keinen Wert misst, blendet ihn aus oder laesst den Normwert stehen.
  | {
      art: "messwert";
      id: string;
      /** Beschriftung im Composer, z.B. "Extension/Flexion" */
      label: string;
      /** Textvorlage mit {w} als Platz fuer den Wert, z.B. "Extension/Flexion {w}. " */
      vorlage: string;
      /** physiologischer Normwert, vorbelegt (z.B. "0/0/150") */
      normal?: string;
      /** Anzeige, wenn sichtbar aber leer (Default "…") */
      leer?: string;
      /** optische Gruppierung im Composer */
      gruppe?: string;
    };

export type BausteinTyp =
  | "anamnese"
  | "untersuchung"
  | "befund"
  | "procedere"
  | "anordnung";

export const BAUSTEIN_TYP_LABEL: Record<BausteinTyp, string> = {
  anamnese: "Anamnese",
  untersuchung: "Untersuchung",
  befund: "Befund",
  procedere: "Procedere",
  anordnung: "Anordnung",
};

export interface Baustein {
  /** stabile ID – geht in den Zustandscode ein */
  id: string;
  /** Anzeigename im Composer/Review, z.B. "OSG – Untersuchung" */
  titel: string;
  typ: BausteinTyp;
  /** Wert-/Freitext-Platzhalter dieses Bausteins */
  platzhalter: Platzhalter[];
  /** Textkoerper als Segment-Sequenz */
  segmente: Segment[];
}

/** Eine Koerperregion mit ihren Bausteinen (Home-Kachel). */
export interface Region {
  id: string;
  name: string;
  /** kurzes Emoji/Kuerzel fuer die Kachel */
  kuerzel: string;
  bausteine: Baustein[];
}

/**
 * Ein Stapel = nutzer-angelegte Kombination von Bausteinen (z.B. eigene
 * "OSG-Distorsion" = Untersuchung + Procedere), die mit einem Tap laedt.
 * WICHTIG: immer vom Nutzer selbst erstellt – NIE eine software-seitige
 * Diagnose->Procedere-Zuordnung (das waere die MDR-Grenze).
 */
export interface Stapel {
  id: string;
  name: string;
  bausteinIds: string[];
}

/** Der komplette Katalog (versioniert – Version geht in den Zustandscode ein). */
export interface Katalog {
  version: number;
  regionen: Region[];
  /** mitgelieferte Beispiel-Stapel; Nutzer kann eigene anlegen */
  stapel: Stapel[];
}

// ---------------------------------------------------------------------------
// Laufender Fall (fluechtig, nur zur Unterbrechungsfestigkeit persistiert).
// Enthaelt NIEMALS Patientendaten, nur Baustein-Auswahl + Werte + Seite.
// ---------------------------------------------------------------------------
export interface Fall {
  /** geordnete Bausteine dieses Falls */
  bausteinIds: string[];
  seite: Seite | null;
  /** segmentId -> Abweichung aktiv? (Negativ-Default: fehlend = normal) */
  befunde: Record<string, boolean>;
  /** platzhalter-/messwert-Id -> eingegebener Wert */
  werte: Record<string, string>;
  /** auswahl-Segment-id -> gewaehlter Index */
  auswahl: Record<string, number>;
  /** messwert-Id -> ausgeblendet? (fehlend = sichtbar) */
  versteckt: Record<string, boolean>;
}

export function leererFall(): Fall {
  return {
    bausteinIds: [],
    seite: null,
    befunde: {},
    werte: {},
    auswahl: {},
    versteckt: {},
  };
}
