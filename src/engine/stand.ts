// Stand je Abschnitt (PS-R6-3, E-86): an welchem Tag sich der Text eines Abschnitts zuletzt geändert hat. Ein behaltener
// Fall läuft bis zu drei Tage; was am Montag „bei Entlassung“ geschrieben wurde, kann am Donnerstag falsch sein. Der Fall
// allein sagt nur, dass er alt ist, nicht welcher Abschnitt seitdem nicht angefasst wurde. Rein rechnerisch aus dem
// gerenderten Brief vor und nach einer Eingabe.

import type { AbschnittId, Fall } from "../model/types.ts";
import type { BriefAnsicht } from "./render.ts";
import { tageBis, tagText } from "./behalten.ts";

export type AbschnittStand = Fall["abschnittStand"];

/**
 * Setzt den Stand jedes Abschnitts, dessen Text sich zwischen `vor` und `nach` geändert hat, auf `jetzt`. Verglichen wird
 * der Text, wie er kopiert würde: Was den Wortlaut nicht ändert (Kopiervermerk, Aufklappen), ändert auch den Stand nicht.
 * Ist nichts geändert, kommt dasselbe Objekt zurück.
 */
export function neuerStand(stand: AbschnittStand, vor: BriefAnsicht | null, nach: BriefAnsicht | null, jetzt: number): AbschnittStand {
  if (!nach) return stand;
  const alt = new Map((vor?.abschnitte ?? []).map((a) => [a.id, a.text]));
  let neu = stand;
  for (const a of nach.abschnitte) {
    if (alt.get(a.id) === a.text) continue;
    if (neu === stand) neu = { ...stand };
    neu[a.id] = jetzt;
  }
  return neu;
}

/** Zeitpunkt der letzten Änderung eines Abschnitts; ohne eigenen Stand der Beginn des Falls. */
export function standVon(fall: Pick<Fall, "abschnittStand" | "erstellt">, id: AbschnittId): number {
  return fall.abschnittStand[id] ?? fall.erstellt;
}

/**
 * „Stand gestern“, „Stand Mo 09.11.“, wenn der Text zuletzt an einem früheren Kalendertag geändert wurde; sonst leer. Für
 * mehrere Abschnitte (ganzer Brief) der früheste Tag, mit „teils“, wenn nicht alle so alt sind: „Stand teils gestern“.
 */
export function standText(fall: Pick<Fall, "abschnittStand" | "erstellt">, ids: AbschnittId[], jetzt: number): string {
  const alt = ids.map((id) => standVon(fall, id)).filter((ms) => tageBis(ms, jetzt) < 0);
  if (alt.length === 0) return "";
  const fruehester = Math.min(...alt);
  return `Stand ${alt.length < ids.length ? "teils " : ""}${tagText(fruehester, jetzt)}`;
}
