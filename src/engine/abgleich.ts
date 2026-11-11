// Abgleich zwischen Abschnitten: Dieselbe Tatsache steht im Brief oft mehrfach
// (Belastung in Verlauf, Entlassbefund und Procedere). Der Abgleich zeigt, wo
// sich zwei Abschnitte widersprechen können. Er ändert nichts und sperrt nichts;
// ob es ein Widerspruch ist, entscheidet der Arzt. Die Regeln sind Daten des
// Katalogs (`src/data/abgleich.ts`), die Engine kennt ihren Inhalt nicht.

import type { AbschnittId } from "../model/types.ts";
import type { BriefAnsicht } from "./render.ts";

/**
 * `kopplung`: Die Regel prüft dieselbe Sache wie die Kopplung dieses Namens (`data/kopplung.ts`). Meldet sie zwischen
 * denselben Abschnitten etwas, entfällt der Widerspruch der Kopplung, damit er nicht zweimal steht (E-92).
 */
export type Abgleichregel =
  | {
      /** Beide Abschnitte nennen dieselbe Sache mit verschiedenem Wert. `werte`: Bezeichnung → Muster. */
      art: "gleich";
      name: string;
      abschnitte: [AbschnittId, AbschnittId];
      werte: Record<string, RegExp>;
      kopplung?: string;
    }
  | {
      /** Zwei Aussagen, die nicht zusammenpassen: Muster `a` im ersten, Muster `b` im zweiten Abschnitt. */
      art: "nichtBeide";
      abschnitte: [AbschnittId, AbschnittId];
      a: RegExp;
      b: RegExp;
      /** Trifft dieses Muster im ersten Abschnitt zu, gilt die Regel nicht. */
      ausser?: RegExp;
      hinweis: string;
      kopplung?: string;
    }
  | {
      /** Eine Aussage verlangt eine zweite: Muster `a` steht im ersten Abschnitt, Muster `b` fehlt im zweiten. */
      art: "fehlt";
      abschnitte: [AbschnittId, AbschnittId];
      a: RegExp;
      b: RegExp;
      hinweis: string;
    };

export interface Abgleichhinweis {
  abschnitte: AbschnittId[];
  text: string;
}

/** Die früheste Fundstelle zählt: „schmerzadaptierte Vollbelastung" beginnt vor dem darin enthaltenen „Vollbelastung". */
function wertIn(text: string, werte: Record<string, RegExp>): string | null {
  let bester: { name: string; index: number } | null = null;
  for (const [name, muster] of Object.entries(werte)) {
    const m = muster.exec(text);
    if (m && (!bester || m.index < bester.index)) bester = { name, index: m.index };
  }
  return bester?.name ?? null;
}

export function findeAbgleichhinweise(brief: BriefAnsicht | null, regeln: Abgleichregel[]): Abgleichhinweis[] {
  if (!brief) return [];
  // Verglichen wird nur, was der Arzt schon zu seiner Aussage gemacht hat: keine Lücken, keine Vorschläge.
  const text = new Map<AbschnittId, { titel: string; text: string }>();
  for (const a of brief.abschnitte) {
    if (a.ausgeblendet || a.leer) continue;
    text.set(a.id, { titel: a.titel, text: a.tokens.filter((t) => t.zustand !== "offen" && t.zustand !== "vorschlag").map((t) => t.t).join("") });
  }
  const aus: Abgleichhinweis[] = [];
  /** Kopplung und Abschnittspaar, zu denen eine Regel schon etwas meldet */
  const gemeldet = new Set<string>();
  const paar = (name: string, a: AbschnittId, b: AbschnittId) => `${name}|${[a, b].sort().join("|")}`;
  for (const r of regeln) {
    const x = text.get(r.abschnitte[0]);
    const y = text.get(r.abschnitte[1]);
    if (!x || !y) continue;
    const vorher = aus.length;
    if (r.art === "gleich") {
      const wx = wertIn(x.text, r.werte);
      const wy = wertIn(y.text, r.werte);
      if (wx && wy && wx !== wy) aus.push({ abschnitte: [...r.abschnitte], text: `${r.name}: ${x.titel} nennt „${wx}“, ${y.titel} nennt „${wy}“.` });
    } else if (r.art === "fehlt") {
      if (r.a.test(x.text) && !r.b.test(y.text)) aus.push({ abschnitte: [...r.abschnitte], text: r.hinweis });
    } else if (r.a.test(x.text) && r.b.test(y.text) && !(r.ausser && r.ausser.test(x.text))) {
      aus.push({ abschnitte: [...r.abschnitte], text: r.hinweis });
    }
    if (r.art !== "fehlt" && r.kopplung && aus.length > vorher) gemeldet.add(paar(r.kopplung, ...r.abschnitte));
  }
  // Widersprüche gekoppelter Stellen (E-92): sofort, auch wenn ein Satz noch Lücken hat. Sie hängen an den Antworten
  // selbst, nicht am Text des Abschnitts; die Kopplung kennt beide.
  const titel = (id: AbschnittId) => brief.abschnitte.find((a) => a.id === id)?.titel ?? id;
  for (const w of brief.widersprueche ?? []) {
    const [x, y] = w.stellen;
    if (gemeldet.has(paar(w.kopplung, x.abschnitt, y.abschnitt))) continue;
    aus.push({ abschnitte: [x.abschnitt, y.abschnitt], text: `${w.kopplung}: ${titel(x.abschnitt)} nennt „${x.begriff}“, ${titel(y.abschnitt)} nennt „${y.begriff}“.` });
  }
  return aus;
}
