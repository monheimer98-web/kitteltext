// Entwurf für einen eigenen Baustein aus einem Abschnitt des laufenden Falls.

import type { AbschnittId, Fall } from "../model/types.ts";
import { wahlSchluessel } from "../model/types.ts";
import { renderAbschnitt } from "./render.ts";
import type { KatalogIndex, RenderOptionen } from "./render.ts";

/**
 * Text, mit dem das Formular „Als eigenen Baustein speichern" vorbelegt wird.
 * Er enthält den Aufbau des Abschnitts, nicht den Patienten: keine Befunde und
 * Messwerte dieses Falls, keine getippten Werte, kein eigener Wortlaut, keine
 * freie Ergänzung. Normalbefunde stehen in ihrer allgemeinen Form da, zu
 * entscheidende Befunde entfallen, Pflichtfelder bleiben als Lücke stehen und
 * müssen vor dem Speichern ersetzt oder gelöscht werden. Die Seite des Falls
 * wird zu `{seite}`.
 */
export function entwurfEigenerBaustein(fall: Fall, abschnitt: AbschnittId, titel: string, index: KatalogIndex, opt?: RenderOptionen): string {
  const zumBefund = (key: string) => {
    const [bausteinId, id] = key.split("/");
    return index.bausteine.get(bausteinId)?.segmente.some((s) => "id" in s && s.id === id && (s.art === "befund" || s.art === "messwert")) ?? false;
  };
  const slots = Object.fromEntries(Object.entries(fall.slots).filter(([key]) => !zumBefund(key)));
  // Die Frage einer offenen Entweder-oder-Stelle gehört nicht in den eigenen Text. Ganz weggelassen statt aus dem Text gestrichen,
  // bleibt an ihrem Platz auch keine Leerzeile, wenn sie mitten im Abschnitt steht.
  const vorlage = fall.vorlageId ? index.vorlagen.get(fall.vorlageId) : undefined;
  const ohneStellen = Object.fromEntries((vorlage?.wahl ?? []).map((w, nr) => [wahlSchluessel(w.abschnitt, nr), true]));
  const ohnePatient: Fall = { ...fall, befund: {}, slots, werte: {}, eigen: {}, zusatz: {}, manuell: {}, spaeter: {}, versteckt: ohneStellen, alter: "", seiteBaustein: {} };
  const text = renderAbschnitt(abschnitt, titel, ohnePatient, index, opt).text.replace(/‹[^›]*\?›[ ]?/g, "");
  const seite = fall.seite && fall.seite !== "ohne" ? fall.seite : null;
  return seite ? text.replace(new RegExp(`\\b${seite}\\b`, "g"), "{seite}") : text;
}
