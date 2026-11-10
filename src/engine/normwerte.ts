// Normalwerte am Messfeld (E-48 (10)): reine Anzeige zum Nachschlagen, nie im Brief. Die Zuordnung läuft über die
// Fundstellen der Tabelle (Baustein-ID und Feld-ID), nicht über das Label: „Extension/Flexion“ steht an Knie, Hüfte und
// Ellenbogen.

export interface NormFundstelle {
  datei: string;
  baustein: string;
  segment: string;
  slot?: string;
}

export interface Normstellung {
  stellung: string;
  normal: string;
}

export interface Normeintrag {
  schluessel: string;
  gelenk: string;
  bewegung: string;
  /** Ein Wert; bei Rotationen von Schulter und Hüfte stattdessen je Ausgangsstellung einer (`stellungen`). */
  normal?: string;
  stellungen?: Normstellung[];
  hinweis: string;
  fundstellen: NormFundstelle[];
}

export interface Normwerte {
  freigegeben: boolean;
  quelle: string;
  eintraege: Normeintrag[];
  /** Felder für ein beliebiges Gelenk: Sie zeigen die ganze Tabelle, nach Gelenk gruppiert. */
  tabelle: NormFundstelle[];
}

export interface Normgruppe {
  gelenk: string;
  eintraege: Normeintrag[];
}

export type NormAnzeige = { art: "einzeln"; eintraege: Normeintrag[] } | { art: "tabelle"; gruppen: Normgruppe[] };

/** Schlüssel des Feldes im Brief, an dem das „i“ steht: Baustein und Segment; ein Slot hängt am Segment, das ihn trägt. */
export function feldSchluessel(f: NormFundstelle): string {
  return `${f.baustein}/${f.segment}`;
}

/** Einträge nach Gelenk, in der Reihenfolge der Tabelle. */
export function nachGelenk(eintraege: readonly Normeintrag[]): Normgruppe[] {
  const gruppen: Normgruppe[] = [];
  for (const e of eintraege) {
    const g = gruppen.find((x) => x.gelenk === e.gelenk);
    if (g) g.eintraege.push(e);
    else gruppen.push({ gelenk: e.gelenk, eintraege: [e] });
  }
  return gruppen;
}

/** Was das „i“ an welchem Feld zeigt. Felder ohne Eintrag fehlen in der Karte und bekommen kein „i“. */
export function normwertKarte(n: Normwerte): Map<string, NormAnzeige> {
  const karte = new Map<string, NormAnzeige>();
  for (const e of n.eintraege) {
    for (const f of e.fundstellen) {
      const k = feldSchluessel(f);
      const da = karte.get(k);
      if (da?.art === "einzeln") {
        if (!da.eintraege.includes(e)) da.eintraege.push(e);
      } else karte.set(k, { art: "einzeln", eintraege: [e] });
    }
  }
  const alle = nachGelenk(n.eintraege);
  for (const f of n.tabelle) karte.set(feldSchluessel(f), { art: "tabelle", gruppen: alle });
  return karte;
}

/** „Extension/Flexion 0–10/0/140–150°“; mit Ausgangsstellungen „Außenrotation/Innenrotation: Oberarm anliegend …; in 90° Abduktion …“. */
export function normZeile(e: Normeintrag): string {
  if (e.stellungen?.length) return `${e.bewegung}: ${e.stellungen.map((s) => `${s.stellung} ${s.normal}`).join("; ")}`;
  return `${e.bewegung} ${e.normal ?? ""}`.trim();
}

/** Überschrift der Box: „(Neutral-Null)“ nur, wenn alle Werte so notiert sind; Abstände in cm sind es nicht. */
export function normTitel(eintraege: readonly Normeintrag[]): string {
  const werte = eintraege.flatMap((e) => (e.stellungen?.length ? e.stellungen.map((s) => s.normal) : [e.normal ?? ""]));
  return werte.every((w) => w.includes("/0/")) ? "Normalwerte (Neutral-Null)" : "Normalwerte";
}

/**
 * Was das „i“ zeigt, wenn am Feld eine Ausgangsstellung gewählt ist: bei Einträgen mit Stellungen nur deren Normalwert
 * (R4-D3). Ohne Wahl, oder gibt es die Stellung im Eintrag nicht, bleibt die Anzeige, wie sie ist.
 */
export function fuerStellung(anzeige: NormAnzeige, stellung: string | undefined): NormAnzeige {
  if (!stellung || anzeige.art !== "einzeln") return anzeige;
  return {
    art: "einzeln",
    eintraege: anzeige.eintraege.map((e) => {
      const passend = e.stellungen?.filter((s) => s.stellung === stellung) ?? [];
      return passend.length ? { ...e, stellungen: passend } : e;
    }),
  };
}
