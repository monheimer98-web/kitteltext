// ============================================================================
// Kitteltext – Textkorpus (content-as-data)
// ----------------------------------------------------------------------------
// Hand-modelliert aus dem Standardtexte-ZNA-Dokument. Bewusst bereinigt:
//  - Tippfehler korrigiert (Wibelsäule, Duckschmerz, Proedere, AchaABweichung …)
//  - Klinik-Interna entfernt (Stationsnamen ZN31/ZOM II, Personennamen)
//  - veraltete Daten entfernt (konkrete Termine wie 07.02.2022)
// Nur schematisierbare Bausteine. Alles Individuelle (Diagnose, Zahlen, Termine)
// bleibt Platzhalter, den der Arzt setzt.
//
// version: erhoehen, sobald sich IDs/Struktur aendern (geht in Zustandscode ein).
// ============================================================================

import { Katalog, Region, Stapel } from "../model/types.ts";
import allgemein from "./corpus/allgemein.json";
import rumpf from "./corpus/rumpf.json";
import schulterEllenbogen from "./corpus/schulter-ellenbogen.json";
import hand from "./corpus/hand.json";
import untere from "./corpus/untere.json";

// Die 4 handgepflegten Kern-Regionen (OSG, Knie, HWS, SHT) – der Referenz-Stil.
const CORE: Katalog = {
  version: 1,
  regionen: [
    // ----------------------------------------------------------------- OSG
    {
      id: "osg",
      name: "OSG",
      kuerzel: "🦶",
      bausteine: [
        {
          id: "osg-untersuchung",
          titel: "OSG – Untersuchung",
          typ: "untersuchung",
          platzhalter: [],
          segmente: [
            { art: "text", text: "Oberes Sprunggelenk " },
            { art: "seite" },
            { art: "text", text: ": Reizlos geschlossene Weichteile. " },
            {
              art: "befund",
              id: "osg_schwellung",
              chip: "Schwellung/Hämatom lateral",
              gruppe: "Inspektion",
              normal: "Keine Weichteilschwellung, keine Hämatome. ",
              abweichung:
                "Weichteilschwellung und Hämatom im Bereich des lateralen Außenknöchels. ",
            },
            {
              art: "befund",
              id: "osg_ds_aussen",
              chip: "DS Außenknöchel",
              gruppe: "Palpation",
              normal: "Kein Druckschmerz über dem Außenknöchel. ",
              abweichung: "Druckschmerz über dem Außenknöchel. ",
            },
            {
              art: "befund",
              id: "osg_ds_innen",
              chip: "DS Innenknöchel",
              gruppe: "Palpation",
              normal: "Kein Druckschmerz über dem Innenknöchel. ",
              abweichung: "Druckschmerz über dem Innenknöchel. ",
            },
            {
              art: "befund",
              id: "osg_ds_fibulotalar",
              chip: "DS Außenband",
              gruppe: "Palpation",
              normal:
                "Kein Druckschmerz über dem fibulotalaren Bandapparat. ",
              abweichung:
                "Druckschmerz über dem fibulotalaren Bandapparat. ",
            },
            {
              art: "befund",
              id: "osg_ds_mt5",
              chip: "DS Os metatarsale V",
              gruppe: "Palpation (Ottawa)",
              normal:
                "Kein Druckschmerz über der Basis des Os metatarsale V. ",
              abweichung:
                "Druckschmerz über der Basis des Os metatarsale V. ",
            },
            {
              art: "befund",
              id: "osg_gabel",
              chip: "Gabelkompression",
              gruppe: "Palpation",
              normal: "Kein Gabelkompressionsschmerz. ",
              abweichung: "Gabelkompressionsschmerz. ",
            },
            {
              art: "text",
              text:
                "Endständige Dorsalextension und Plantarflexion ohne Schmerzen ausführbar. ",
            },
            {
              art: "befund",
              id: "osg_aufklappbar",
              chip: "laterale Aufklappbarkeit",
              gruppe: "Stabilität",
              normal:
                "Kein Talusvorschub, keine vermehrte laterale oder mediale Aufklappbarkeit. ",
              abweichung:
                "Vermehrte laterale Aufklappbarkeit, kein sicherer Talusvorschub. ",
            },
            {
              art: "text",
              text:
                "A. tibialis posterior und A. dorsalis pedis kräftig tastbar. Sensibilität und Motorik intakt. Kein Hinweis auf ein Kompartmentsyndrom. ",
            },
            {
              art: "befund",
              id: "osg_geh",
              chip: "Schonhinken",
              gruppe: "Funktion",
              normal: "Patient ist geh- und stehfähig, mehr als vier Schritte.",
              abweichung:
                "Patient ist unter Schonhinken geh- und stehfähig, mehr als vier Schritte.",
            },
          ],
        },
        {
          id: "osg-procedere",
          titel: "OSG-Distorsion – Procedere",
          typ: "procedere",
          platzhalter: [
            {
              id: "osg_sport_wochen",
              typ: "zeitraum",
              label: "Sportkarenz",
              einheit: "Wochen",
              default: "4",
              required: true,
            },
          ],
          segmente: [
            {
              art: "auswahl",
              id: "osg_roentgen",
              label: "Bildgebung",
              default: 0,
              optionen: [
                "In Einklang mit den Ottawa-Ankle-Rules wurde auf eine radiologische Bildgebung verzichtet; dies entspricht dem Patientenwunsch. ",
                "Röntgen OSG in zwei Ebenen: kein Anhalt für eine frische ossäre Läsion. ",
              ],
            },
            {
              art: "text",
              text:
                "Befundkontrolle, regelmäßige Hochlagerung und Kühlung. Initiale Entlastung an Unterarmgehstützen für maximal 5–7 Tage. ",
            },
            {
              art: "auswahl",
              id: "osg_thrombose",
              label: "Thromboseprophylaxe",
              default: 0,
              optionen: [
                "Thromboseprophylaxe mittels niedermolekularem Heparin bis zum Erreichen der freien Mobilität. ",
                "",
              ],
            },
            {
              art: "text",
              text:
                "Anschließend schmerzadaptierter Belastungsaufbau in Aircast-Schiene. Aircast-Schiene zwei Wochen konsequent Tag und Nacht, danach zwei weitere Wochen nur zur Nacht. Sportkarenz für ",
            },
            { art: "platzhalter", ref: "osg_sport_wochen" },
            {
              art: "text",
              text:
                ", hiernach langsamer Belastungsaufbau. Sprunggelenksstabilisierende Übungen wurden gezeigt. Klinische Befundkontrolle bei einem niedergelassenen Kollegen. Bei Persistenz oder Progredienz ggf. weiterführende Diagnostik. Bedarfsgerechte Analgesie.",
            },
          ],
        },
      ],
    },

    // ----------------------------------------------------------------- Knie
    {
      id: "knie",
      name: "Knie",
      kuerzel: "🦵",
      bausteine: [
        {
          id: "knie-untersuchung",
          titel: "Knie – Untersuchung",
          typ: "untersuchung",
          platzhalter: [
            {
              id: "knie_flex",
              typ: "zahl",
              label: "Flexion Knie (E/F 0/0/…)",
              einheit: "°",
              required: true,
            },
          ],
          segmente: [
            { art: "text", text: "Knie " },
            { art: "seite" },
            {
              art: "text",
              text: ": Reizlos geschlossene Weichteile, keine Wunde. ",
            },
            {
              art: "befund",
              id: "knie_erguss",
              chip: "Gelenkerguss",
              gruppe: "Inspektion",
              normal: "Kein tastbarer Gelenkerguss. ",
              abweichung: "Tastbarer Gelenkerguss. ",
            },
            {
              art: "befund",
              id: "knie_ds_medial",
              chip: "DS medialer Gelenkspalt",
              gruppe: "Palpation",
              normal: "Kein Druckschmerz über dem medialen Gelenkspalt. ",
              abweichung: "Druckschmerz über dem medialen Gelenkspalt. ",
            },
            {
              art: "befund",
              id: "knie_ds_lateral",
              chip: "DS lateraler Gelenkspalt",
              gruppe: "Palpation",
              normal: "Kein Druckschmerz über dem lateralen Gelenkspalt. ",
              abweichung: "Druckschmerz über dem lateralen Gelenkspalt. ",
            },
            {
              art: "befund",
              id: "knie_ds_patella",
              chip: "DS Patella",
              gruppe: "Palpation",
              normal: "Kein Druckschmerz über der Patella. ",
              abweichung: "Druckschmerz über der Patella. ",
            },
            {
              art: "befund",
              id: "knie_baender",
              chip: "Bandinstabilität",
              gruppe: "Stabilität",
              normal:
                "Innen- und Außenbandführung stabil. Kreuzbänder stabil. ",
              abweichung:
                "Aufklappbarkeit bei Varus-/Valgus-Stress, Bandführung vermindert. ",
            },
            {
              art: "befund",
              id: "knie_lachmann",
              chip: "Lachmann positiv",
              gruppe: "Stabilität",
              normal: "Lachmann-I-Zeichen negativ. ",
              abweichung: "Lachmann-I-Zeichen positiv. ",
            },
            {
              art: "befund",
              id: "knie_apley",
              chip: "Apley positiv",
              gruppe: "Meniskus",
              normal: "Apley-Grinding-Zeichen negativ. ",
              abweichung:
                "Apley-Grinding-Zeichen positiv bei Außenrotation. ",
            },
            { art: "text", text: "Bewegung Extension/Flexion 0/0/" },
            { art: "platzhalter", ref: "knie_flex" },
            {
              art: "text",
              text:
                ". Periphere Durchblutung, Motorik und Sensibilität intakt. Patient ist steh- und gehfähig.",
            },
          ],
        },
        {
          id: "knie-procedere",
          titel: "Kniedistorsion – Procedere",
          typ: "procedere",
          platzhalter: [],
          segmente: [
            {
              art: "text",
              text:
                "Befundkontrolle, regelmäßige Hochlagerung und Kühlung. Initiale Entlastung an Unterarmgehstützen. Thromboseprophylaxe mittels niedermolekularem Heparin unter Thrombozytenkontrollen bis zum Erreichen der freien Mobilität. Bei Beschwerdepersistenz Wiedervorstellung in unserer Gelenksprechstunde mit Überweisung nach Terminvereinbarung. Ggf. weiterführende Diagnostik bei Persistenz oder Progredienz. Bedarfsgerechte Analgesie.",
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------------------ HWS
    {
      id: "hws",
      name: "HWS",
      kuerzel: "🧣",
      bausteine: [
        {
          id: "hws-untersuchung",
          titel: "HWS-Distorsion – Untersuchung",
          typ: "untersuchung",
          platzhalter: [],
          segmente: [
            { art: "text", text: "Tastbarer muskulärer Hartspann " },
            {
              art: "auswahl",
              id: "hws_region",
              label: "Lokalisation Hartspann",
              default: 0,
              optionen: [
                "zervikal beidseits",
                "zervikal rechts betont",
                "zervikal links betont",
                "zervikothorakal",
              ],
            },
            { art: "text", text: " mit regionalem Druckschmerz. " },
            {
              art: "befund",
              id: "hws_beweglichkeit",
              chip: "Bewegungseinschränkung",
              gruppe: "Beweglichkeit",
              normal: "Freie Beweglichkeit der HWS. ",
              abweichung:
                "Schmerzabhängige Bewegungseinschränkung der HWS. ",
            },
            {
              art: "text",
              text:
                "Kein Stauchungsschmerz der HWS. Keine Paresen. Kraftgrade der oberen Extremität beidseits 5/5. Fingerstreckung, Fingerspreizung und Faustschluss uneingeschränkt. Keine Sensibilitätsminderung. Keine Schluckbeschwerden, keine Sehstörungen, kein Schwindel.",
            },
          ],
        },
        {
          id: "hws-procedere",
          titel: "HWS-Distorsion – Procedere",
          typ: "procedere",
          platzhalter: [],
          segmente: [
            {
              art: "text",
              text:
                "Tägliche Bewegungsübungen des Schulter- und Nackenbereiches. Bei Bedarf physiotherapeutische Beübung zur Lösung der muskulären Verspannungen, ergänzt durch Wärmeanwendungen oder Massagen. Bedarfsadaptierte Analgesie für eine Woche, Auftragen schmerzlindernder Salben. Klinische Befundkontrolle bei einem niedergelassenen Kollegen. Bei Beschwerdepersistenz oder -progredienz weiterführende Diagnostik. Sofortige Wiedervorstellung im nächstgelegenen Krankenhaus bei Neuauftreten akuter neurologischer Symptome (z. B. Lähmungserscheinungen, Sensibilitätsstörungen).",
            },
          ],
        },
      ],
    },

    // ------------------------------------------------------- Schädel-Hirn-Trauma
    {
      id: "sht",
      name: "SHT",
      kuerzel: "🧠",
      bausteine: [
        {
          id: "sht-anamnese",
          titel: "Schädel-Hirn-Trauma – Anamnese",
          typ: "anamnese",
          platzhalter: [],
          segmente: [
            {
              art: "befund",
              id: "sht_bewusstlos",
              chip: "Bewusstlosigkeit",
              gruppe: "Verlauf",
              normal: "Keine Bewusstlosigkeit. ",
              abweichung: "Kurzzeitige Bewusstlosigkeit angegeben. ",
            },
            {
              art: "befund",
              id: "sht_amnesie",
              chip: "Amnesie",
              gruppe: "Verlauf",
              normal: "Keine Amnesie zum Ereignis. ",
              abweichung: "Anterograde Amnesie zum Ereignis. ",
            },
            {
              art: "befund",
              id: "sht_erbrechen",
              chip: "Übelkeit/Erbrechen",
              gruppe: "Symptome",
              normal: "Keine Übelkeit, kein Erbrechen. ",
              abweichung: "Übelkeit und Erbrechen. ",
            },
            {
              art: "text",
              text:
                "Kein posttraumatischer Anfall. Keine Kopfschmerzen, keine Sehstörungen. ",
            },
            {
              art: "befund",
              id: "sht_antikoag",
              chip: "Antikoagulation",
              gruppe: "Risiko",
              normal:
                "Keine Einnahme von Antikoagulantien oder Thrombozytenaggregationshemmern.",
              abweichung:
                "Einnahme von Antikoagulantien / Thrombozytenaggregationshemmern.",
            },
          ],
        },
        {
          id: "sht-untersuchung",
          titel: "Schädel-Hirn-Trauma – Untersuchung",
          typ: "untersuchung",
          platzhalter: [],
          segmente: [
            {
              art: "text",
              text:
                "Patient wach, ansprechbar und zu allen vier Qualitäten orientiert. GCS 15. ",
            },
            {
              art: "befund",
              id: "sht_pupillen",
              chip: "Anisokorie/Pupillenstörung",
              gruppe: "Neurologie",
              normal: "Pupillen isokor und seitengleich lichtreagibel. ",
              abweichung:
                "Anisokorie / entrundete bzw. verzögert lichtreagible Pupille. ",
            },
            {
              art: "befund",
              id: "sht_wunde",
              chip: "Platzwunde",
              gruppe: "Schädel",
              normal:
                "Keine Riss- oder Platzwunden, Prellmarken oder Hämatome des Schädels. ",
              abweichung: "Riss-Quetsch-Wunde am Schädel. ",
            },
            {
              art: "text",
              text:
                "Keine Deformitäten oder tastbaren Stufen des Schädels. Kein Flüssigkeitsaustritt aus Mund, Nase oder Ohren. HWS ohne Druck- oder Bewegungsschmerz. Periphere Durchblutung, Motorik und Sensibilität intakt.",
            },
          ],
        },
        {
          id: "sht-procedere",
          titel: "Schädel-Hirn-Trauma – Procedere",
          typ: "procedere",
          platzhalter: [],
          segmente: [
            {
              art: "text",
              text:
                "Körperliche Schonung für mindestens 24–72 Stunden. Bedarfsgerechte Analgesie. Ausführliche Aufklärung über Risiken und Komplikationen einer Kopfverletzung; Verhaltensmaßregeln wurden aufgezeigt. Bei Auftreten neurologischer Symptome (Übelkeit, Erbrechen, Schwindel, Sehstörungen) sofortige Wiedervorstellung im nächstgelegenen Krankenhaus. Engmaschige Überwachung durch Angehörige für mindestens 24 Stunden. Ambulante Kontrolle innerhalb von 14 Tagen.",
            },
          ],
        },
      ],
    },
  ],

  // Mitgelieferte Beispiel-Stapel (Ein-Tap-Kombinationen). Der Nutzer kann
  // eigene anlegen – das ist bewusst KEINE Diagnose->Procedere-Automatik.
  stapel: [
    {
      id: "stapel-osg",
      name: "OSG-Distorsion",
      bausteinIds: ["osg-untersuchung", "osg-procedere"],
    },
    {
      id: "stapel-knie",
      name: "Kniedistorsion",
      bausteinIds: ["knie-untersuchung", "knie-procedere"],
    },
    {
      id: "stapel-hws",
      name: "HWS-Distorsion",
      bausteinIds: ["hws-untersuchung", "hws-procedere"],
    },
    {
      id: "stapel-sht",
      name: "Schädel-Hirn-Trauma",
      bausteinIds: ["sht-anamnese", "sht-untersuchung", "sht-procedere"],
    },
  ],
};

// Die per Modellierungs-Team aus dem Standardtexte-Dokument erzeugten Regionen.
// (JSON wird als any importiert und hier auf die Typen festgelegt – die Struktur
// ist per scripts/validate-corpus.mjs geprüft.)
interface KorpusDatei {
  regionen: Region[];
  stapel?: Stapel[];
}
const KORPUS: KorpusDatei[] = [
  allgemein as unknown as KorpusDatei,
  rumpf as unknown as KorpusDatei,
  schulterEllenbogen as unknown as KorpusDatei,
  hand as unknown as KorpusDatei,
  untere as unknown as KorpusDatei,
];

// Reihenfolge der Regionen im Home-Raster: erst Ganzkörper/Rumpf, dann von
// oben nach unten. CORE (OSG/Knie/HWS/SHT) wird nach Regions-ID einsortiert.
const REGION_REIHENFOLGE = [
  "allgemeinbefund",
  "allgemein",
  "body-check",
  "sht",
  "hws",
  "wirbelsaeule",
  "wirbelsäule",
  "thorax",
  "schulterguertel",
  "schultergürtel",
  "schulter",
  "ellenbogen",
  "handgelenk",
  "mittelhand",
  "finger",
  "huefte",
  "hüfte",
  "huefte-oberschenkel",
  "knie",
  "unterschenkel",
  "osg",
  "achillessehne",
  "achilles",
  "fuss",
  "fuß",
  "mittelfuss",
  "mittelfuß",
  "zehen",
];

function reihenfolgeIndex(id: string): number {
  const i = REGION_REIHENFOLGE.indexOf(id);
  return i === -1 ? 999 : i;
}

const alleRegionen: Region[] = [
  ...CORE.regionen,
  ...KORPUS.flatMap((k) => k.regionen),
].sort((a, b) => reihenfolgeIndex(a.id) - reihenfolgeIndex(b.id));

const alleStapel: Stapel[] = [
  ...CORE.stapel,
  ...KORPUS.flatMap((k) => k.stapel ?? []),
];

export const KATALOG: Katalog = {
  version: CORE.version,
  regionen: alleRegionen,
  stapel: alleStapel,
};
