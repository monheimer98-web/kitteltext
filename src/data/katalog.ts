// Führt alle Katalogdateien zusammen. Inhalte stehen ausschließlich in den
// JSON-Dateien; hier wird nichts Fachliches formuliert.

import type { Baustein, Brieftyp, Katalog, Protokoll, Region, Vorlage } from "../model/types.ts";
import { KATALOG_STAND, KORPUS_DATEIEN, VORLAGEN_DATEIEN } from "./dateien.ts";
import PROTOKOLLE from "./protokolle.json" with { type: "json" };
import { FALLDATUM_FELDER, FRISTEN, FRIST_ABSCHNITTE } from "./falldaten.ts";
import { FOLGEANGABEN, KOPPLUNGEN } from "./kopplung.ts";

interface KorpusDatei {
  regionen: Region[];
}

const KORPUS = KORPUS_DATEIEN as KorpusDatei[];

// Von Kopf bis Fuß; allgemeine Regionen zuerst.
const REGION_REIHENFOLGE = [
  "allgemeinbefund",
  "body-check",
  "sht",
  "hws",
  "wirbelsaeule",
  "thorax",
  "schulter",
  "oberarm",
  "ellenbogen",
  "unterarm",
  "handgelenk",
  "mittelhand",
  "finger",
  "becken",
  "huefte",
  "knie",
  "unterschenkel",
  "osg",
  "achillessehne",
  "fuss",
  "mittelfuss",
  "zehen",
  "gelenke",
  "wunden",
  "weichteile",
  "wiedervorstellung",
  "brief-zna",
  "brief-station",
];

function rang(id: string): number {
  const i = REGION_REIHENFOLGE.indexOf(id);
  return i === -1 ? 999 : i;
}

/** Ein Baustein ohne Angabe gilt als Entwurf: Ein vergessenes Feld darf nichts zum Hausstandard machen. */
function mitStatus(b: Baustein): Baustein {
  return b.status ? b : { ...b, status: "entwurf" };
}

// Mehrere Dateien dürfen Bausteine zur selben Region beisteuern.
const jeRegion = new Map<string, Region>();
for (const r of KORPUS.flatMap((k) => k.regionen)) {
  const da = jeRegion.get(r.id);
  if (da) da.bausteine.push(...r.bausteine.map(mitStatus));
  else jeRegion.set(r.id, { ...r, bausteine: r.bausteine.map(mitStatus) });
}
const regionen: Region[] = [...jeRegion.values()].sort((a, b) => rang(a.id) - rang(b.id));

export const BRIEFTYPEN: Brieftyp[] = [
  {
    id: "zna-ambulant",
    name: "Ambulanzbrief Notaufnahme",
    setting: "zna",
    abschnitte: [
      { id: "diagnose", titel: "Diagnose" },
      { id: "anamnese", titel: "Anamnese" },
      { id: "befund", titel: "Befund" },
      { id: "diagnostik", titel: "Diagnostik" },
      { id: "therapie", titel: "Therapie" },
      { id: "procedere", titel: "Procedere" },
      { id: "medikation", titel: "Medikation" },
    ],
  },
  {
    id: "station-entlass",
    name: "Entlassbrief Station",
    setting: "station",
    abschnitte: [
      { id: "diagnose", titel: "Diagnosen" },
      { id: "therapie", titel: "Therapie" },
      { id: "anamnese", titel: "Anamnese" },
      { id: "befund", titel: "Aufnahmebefund" },
      { id: "diagnostik", titel: "Diagnostik" },
      { id: "verlauf", titel: "Verlauf" },
      { id: "entlassbefund", titel: "Entlassbefund" },
      { id: "procedere", titel: "Procedere" },
      { id: "medikation", titel: "Medikation bei Entlassung" },
    ],
  },
];

export const KATALOG: Katalog = {
  // Prüfsumme über alle Katalogdateien. Ändert sich der Katalog, setzen offene Fälle ihre Auswahlen zurück,
  // weil gespeicherte Indizes dann auf anderen Wortlaut zeigen können.
  version: KATALOG_STAND,
  regionen,
  vorlagen: (VORLAGEN_DATEIEN as { vorlagen: Vorlage[] }[]).flatMap((d) => d.vorlagen),
  brieftypen: BRIEFTYPEN,
  // Standardprotokolle der Nachbehandlung, ärztlich freigegeben am 08.11.2026 (E-49).
  protokolle: (PROTOKOLLE as { protokolle: Protokoll[] }).protokolle,
  regeln: { falldatumFelder: FALLDATUM_FELDER, fristAbschnitte: FRIST_ABSCHNITTE, fristen: FRISTEN, kopplungen: KOPPLUNGEN, folgeangaben: FOLGEANGABEN },
};
