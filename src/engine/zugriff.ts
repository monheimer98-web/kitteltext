// Findet zu einem Zustandsschlüssel die Definition im Katalog.

import type { Baustein, Platzhalter, Segment } from "../model/types.ts";
import type { KatalogIndex } from "./render.ts";

export type SegmentMitId = Extract<Segment, { id: string }>;

export interface Fundstelle {
  baustein: Baustein;
  segment?: SegmentMitId;
  platzhalter?: Platzhalter;
}

export function fundstelle(index: KatalogIndex, key: string): Fundstelle | null {
  const [bausteinId, id] = key.split("/");
  const baustein = index.bausteine.get(bausteinId);
  if (!baustein) return null;
  const segment = baustein.segmente.find((s): s is SegmentMitId => "id" in s && s.id === id);
  const platzhalter = baustein.platzhalter.find((p) => p.id === id);
  return { baustein, segment, platzhalter };
}
