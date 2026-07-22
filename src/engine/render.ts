// ============================================================================
// Kitteltext – Render-Engine
// ----------------------------------------------------------------------------
// Rein deterministisch: Fall + Katalog -> Text. Kein Ableiten, kein Rechnen,
// kein Vorsortieren. Die Engine FORMATIERT nur – sie schliesst nichts.
// Genau eine Textquelle fuer iPhone-Vorschau und (spaeter) PC-Zwilling.
// ============================================================================

import {
  Baustein,
  Fall,
  Katalog,
  Platzhalter,
  SEITE_TEXT,
  Segment,
} from "../model/types.ts";

/** Ein noch nicht aufgeloester Pflicht-Platzhalter (blockiert den Export). */
export interface OffenerPunkt {
  bausteinId: string;
  bausteinTitel: string;
  /** eindeutige ID (platzhalter.id oder "__seite__") */
  id: string;
  label: string;
}

export interface RenderErgebnis {
  /** fertiger Klartext (Bausteine durch Leerzeile getrennt) */
  text: string;
  /** offene Pflichtangaben – solange nicht leer, ist Export gesperrt */
  offene: OffenerPunkt[];
  /** true, wenn mind. ein Baustein eine Seite braucht, aber keine gesetzt ist */
  seiteFehlt: boolean;
}

/** Sichtbarer Marker fuer eine unaufgeloeste Pflichtangabe im Vorschautext. */
export const MARKER_OFFEN = "‹…›";

function platzhalterDef(
  baustein: Baustein,
  ref: string,
): Platzhalter | undefined {
  return baustein.platzhalter.find((p) => p.id === ref);
}

/** Braucht dieser Baustein eine Koerperseite? (enthaelt ein "seite"-Segment) */
export function bausteinBrauchtSeite(baustein: Baustein): boolean {
  return baustein.segmente.some((s) => s.art === "seite");
}

type BefundSeg = Extract<Segment, { art: "befund" }>;

/**
 * Rendert einen einzelnen Befund: Normalbefund (offen/bestaetigt) oder die
 * per Slots aufgeloeste Abweichung ("abw"). Sammelt offene Pflicht-Slots.
 * Wird von der Engine UND der Composer-Zeilenvorschau genutzt.
 */
export function befundText(
  seg: BefundSeg,
  fall: Fall,
  baustein?: Baustein,
  offene?: OffenerPunkt[],
): string {
  if (fall.befundStatus[seg.id] !== "abw") return seg.normal;
  if (!seg.slots || seg.slots.length === 0) return seg.abweichung;

  let t = seg.abweichung;
  for (const slot of seg.slots) {
    const key = `${seg.id}.${slot.id}`;
    const roh = fall.befundSlots[key];
    let val = "";
    const markiereOffen = () => {
      offene?.push({
        bausteinId: baustein?.id ?? "",
        bausteinTitel: baustein?.titel ?? "",
        id: key,
        label: `${seg.chip}: ${slot.label}`,
      });
      return MARKER_OFFEN;
    };
    if (slot.art === "auswahl") {
      const idx = roh != null && roh !== "" ? Number(roh) : slot.default ?? 0;
      val = slot.optionen[idx] ?? slot.optionen[0] ?? "";
      if (val === "" && slot.required) val = markiereOffen();
    } else if (slot.art === "lokaleSeite") {
      if (roh) val = roh;
      else if (slot.required) val = markiereOffen();
    } else if (slot.art === "zahl") {
      const v = (roh ?? "").trim();
      if (v) val = slot.einheit ? `${v} ${slot.einheit}` : v;
      else if (slot.required) val = markiereOffen();
      else val = slot.leerMarker ?? "";
    } else {
      val = (roh ?? "").trim();
    }
    t = t.split(`{${slot.id}}`).join(val);
  }
  return t.replace(/\{[^}]+\}/g, "").replace(/\s{2,}/g, " ");
}

function findeBaustein(katalog: Katalog, id: string): Baustein | undefined {
  for (const region of katalog.regionen) {
    const b = region.bausteine.find((x) => x.id === id);
    if (b) return b;
  }
  return undefined;
}

/** Rendert einen einzelnen Baustein und sammelt dessen offene Pflichtangaben. */
export function renderBaustein(
  baustein: Baustein,
  fall: Fall,
): { text: string; offene: OffenerPunkt[]; seiteFehlt: boolean } {
  const offene: OffenerPunkt[] = [];
  let seiteFehlt = false;
  let out = "";

  for (const seg of baustein.segmente) {
    switch (seg.art) {
      case "text":
        out += seg.text;
        break;

      case "seite": {
        if (fall.seite) {
          out += SEITE_TEXT[fall.seite];
        } else {
          out += MARKER_OFFEN;
          seiteFehlt = true;
        }
        break;
      }

      case "platzhalter": {
        const def = platzhalterDef(baustein, seg.ref);
        if (!def) {
          out += MARKER_OFFEN;
          break;
        }
        const wert = (fall.werte[def.id] ?? "").trim();
        if (wert) {
          out += def.einheit ? `${wert} ${def.einheit}` : wert;
        } else if (def.required) {
          out += MARKER_OFFEN;
          offene.push({
            bausteinId: baustein.id,
            bausteinTitel: baustein.titel,
            id: def.id,
            label: def.label,
          });
        } else {
          out += def.leerMarker ?? "";
        }
        break;
      }

      case "auswahl": {
        const idx = fall.auswahl[seg.id] ?? seg.default ?? 0;
        out += seg.optionen[idx] ?? seg.optionen[0] ?? "";
        break;
      }

      case "befund": {
        const lokal: OffenerPunkt[] = [];
        out += befundText(seg, fall, baustein, lokal);
        offene.push(...lokal);
        break;
      }

      case "messwert": {
        // ausgeblendet -> gar nichts (nie ein Showstopper)
        if (fall.versteckt[seg.id]) break;
        const roh = (fall.werte[seg.id] ?? seg.normal ?? "").trim();
        const wert = roh || seg.leer || "…";
        out += seg.vorlage.replace("{w}", wert);
        break;
      }
    }
  }

  // Whitespace glaetten: doppelte Leerzeichen, Leerzeichen vor Satzzeichen
  const text = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:])/g, "$1")
    .trim();

  return { text, offene, seiteFehlt };
}

/** Rendert den kompletten Fall (alle Bausteine in Reihenfolge). */
export function renderFall(fall: Fall, katalog: Katalog): RenderErgebnis {
  const teile: string[] = [];
  const offene: OffenerPunkt[] = [];
  let seiteFehlt = false;

  for (const id of fall.bausteinIds) {
    const baustein = findeBaustein(katalog, id);
    if (!baustein) continue;
    const r = renderBaustein(baustein, fall);
    teile.push(r.text);
    offene.push(...r.offene);
    if (r.seiteFehlt) seiteFehlt = true;
  }

  return {
    text: teile.join("\n\n"),
    offene,
    seiteFehlt,
  };
}

/** Braucht der aktuelle Fall (irgendein Baustein) eine Seite? */
export function fallBrauchtSeite(fall: Fall, katalog: Katalog): boolean {
  return fall.bausteinIds.some((id) => {
    const b = findeBaustein(katalog, id);
    return b ? bausteinBrauchtSeite(b) : false;
  });
}

/** Ist der Export erlaubt? (keine offenen Pflichtangaben, Seite gesetzt falls noetig) */
export function exportErlaubt(erg: RenderErgebnis): boolean {
  return erg.offene.length === 0 && !erg.seiteFehlt;
}
