// Normalwerte für das „i“ an Messfeldern (E-48 (10)). Inhalt in `normwerte.json`; nur Anzeige, nie im Brief.
import daten from "./normwerte.json" with { type: "json" };
import type { Normwerte } from "../engine/normwerte.ts";

export const NORMWERTE = daten as Normwerte;
