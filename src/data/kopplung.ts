// Einmal eingeben (M-14, E-60) und Folgeangaben (M-24, E-60). Was hier steht, hängt an Kennungen und Wortlaut des
// Katalogs: Wer Bausteine umbenennt oder Möglichkeiten umformuliert, prüft diese Listen mit. Der Test
// `tests/kopplung.test.ts` meldet jede Kennung, die es im Katalog nicht gibt, und jede Möglichkeit, die zu keinem
// Begriff passt.

import type { AbschnittId, Folgeangabe, Kopplung } from "../model/types.ts";

/** Woher eine übertragene Antwort kommt, als Satzteil der Meldung „Abweichend von „…“ aus dem Entlassbefund gesetzt.“ (E-92). */
export const AUS_ABSCHNITT: Record<AbschnittId, string> = {
  diagnose: "aus den Diagnosen",
  therapie: "aus der Therapie",
  anamnese: "aus der Anamnese",
  befund: "aus dem Befund",
  diagnostik: "aus der Diagnostik",
  verlauf: "aus dem Verlauf",
  entlassbefund: "aus dem Entlassbefund",
  procedere: "aus dem Procedere",
  medikation: "aus der Medikation",
};

/**
 * Angaben, die mehrere Bausteine abfragen. Die Reihenfolge der Bezüge ist die Zeitachse des Aufenthalts: Fehlt einer
 * Stelle die Antwort, nimmt sie die des nächstgelegenen Bezugs (Procedere die des Entlassbefunds, nicht die des
 * Verlaufs). Widersprechen sich zwei gleich nahe Antworten, bleibt die Stelle, wie sie ist.
 */
export const KOPPLUNGEN: readonly Kopplung[] = [
  {
    name: "Gehhilfe",
    glieder: [
      ...[
        "verl-st-operativ/mobilisation/hilfsmittel",
        "verl-st-konservativ/mobilisation/hilfsmittel",
        "verl-st-kyphoplastie/mobilisation/hilfsmittel",
        "verl-st-beckenring-konservativ/mobilisation/hilfsmittel",
        "verl-st-knie-arthroskopie/mobilisation/hilfsmittel",
        "verl-st-tibiakopf-konservativ/mobilisation/hilfsmittel",
        "verl-st-unterschenkel-operativ/mobilisation/hilfsmittel",
        "verl-st-humerus-konservativ/mobilisation/hilfsmittel",
      ].map((key) => ({ key, bezug: "verlauf" })),
      ...["eb-st-mobilitaet/gehen/hilfsmittel", "eb-st-gehen-bein/gehen/hilfsmittel", "eb-st-gehen-armfraktur/gehen/hilfsmittel"].map((key) => ({ key, bezug: "entlassbefund" })),
      ...[
        "proc-st-belastung/hilfsmittel/womit",
        "proc-st-periprothetisch-belastung/gehhilfe/womit",
        "proc-st-metall-belastung/gehhilfe/womit",
        "proc-st-beckenring-konservativ/belastung/gehhilfe",
        "proc-st-meniskus-resektion/belastung/gehhilfe",
        "proc-st-meniskus-naht/belastung/gehhilfe",
        "proc-st-vkb-plastik/belastung/gehhilfe",
        "proc-st-tibiakopf-osteosynthese/belastung/gehhilfe",
        "proc-st-tibiakopf-konservativ/belastung/gehhilfe",
        "proc-st-unterschenkel-marknagel/belastung/gehhilfe",
      ].map((key) => ({ key, bezug: "procedere" })),
    ],
    begriffe: {
      Unterarmgehstützen: /Unterarmgehstützen/i,
      Rollator: /Rollator/i,
      Gehwagen: /Gehwagen/i,
      Gehstock: /Gehstock/i,
      "ohne Gehhilfe": /\bohne (Hilfsmittel|Gehhilfen?)$/i,
    },
  },
  {
    // Allergien sind nicht nur Arzneimittel (Latex, Pflaster), Unverträglichkeiten nicht nur Allergien: anderer Bezug,
    // die Antwort erscheint als Vorschlag.
    name: "Allergien und Unverträglichkeiten",
    glieder: [
      ...["ana-st-elektiv/allergien", "ana-st-unfall/allergien", "ana-st-beschwerden/allergien", "ana-st-commotio/allergien"].map((key) => ({ key, bezug: "anamnese" })),
      ...["med-st-entlassung/unvertraeglich", "med-st-entlassung-dauer-procedere/unvertraeglich"].map((key) => ({ key, bezug: "medikation" })),
    ],
  },
  {
    // Befund bei Entlassung und Empfehlung: Nur „noch nicht entfernt“ entspricht dem Material, das entfernt werden soll.
    name: "Naht- oder Klammermaterial",
    glieder: [
      { key: "eb-st-wunde/naht", bezug: "entlassbefund" },
      { key: "eb-st-commotio/wunde/material", bezug: "entlassbefund" },
      { key: "proc-st-wunde/naht/material", bezug: "procedere" },
      { key: "proc-st-commotio/faeden/material", bezug: "procedere" },
    ],
    begriffe: {
      Klammern: /^(der Hautklammern|Hautklammern noch nicht entfernt\.|, Klammern fest|der Klammern)$/,
      Nähte: /^(der Hautnähte|Hautnähte noch nicht entfernt\.|, Nähte fest|der Fäden)$/,
    },
  },
  {
    // Dieselbe Überwachung in Therapie und Verlauf: gleicher Bezug, die Antwort gilt als Aussage.
    name: "Dauer der Überwachung",
    glieder: [
      { key: "th-st-commotio/dauer", bezug: "ueberwachung" },
      { key: "verl-st-commotio/ueberwachung/dauer", bezug: "ueberwachung" },
    ],
  },
];

/**
 * Vorbelegte Angaben, die mit den Pflichtangaben ihres Satzes zur Aussage des Arztes werden: Er sieht sie im selben
 * Satz, während er ihn ausfüllt. Bewusst nicht hier: was einen eigenen klinischen Sachverhalt behauptet und nicht direkt
 * am getippten Wert hängt (Ursache „nach der Operation“, Sauerstoffgabe, Betäubung, Sturzmechanismus, wer kontrolliert).
 */
export const FOLGEANGABEN: readonly Folgeangabe[] = [
  // Einheit hinter dem getippten Laborwert (g/dl, mg/l, mg/dl, mg).
  { key: "einheit" },
  // Beginn der Mobilisation im Satz, in dem der Arzt Hilfsmittel und Belastung wählt.
  { key: "verl-st-operativ/mobilisation/ab" },
  // Zeitpunkt vor dem Befund, den der Arzt wählt („Röntgen Thorax bei Aufnahme: …“).
  { key: "verl-st-konservativ/roentgen/wann" },
  { key: "dgn-st-weitere/thorax/wann" },
  { key: "dgn-st-weitere/ekg/wann" },
  { key: "dgn-st-weitere/erreger/wann" },
  // „entließen“ oder „verlegten“ im Satz, in dem der Arzt das Ziel wählt.
  { key: "verl-st-entlassung/entlassung/verb" },
];
