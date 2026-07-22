// ============================================================================
// Kitteltext – Zustandscode
// ----------------------------------------------------------------------------
// Kodiert einen Fall in einen kurzen, abtippbaren Code, den der PC-Zwilling
// wieder zu identischem Text rendert. Enthaelt NUR Indizes/Werte des Falls –
// keine Patientendaten (es gibt keine).
//
// Sicherheit: Versionsfeld + Pruefziffer. Bei Versions- oder Pruefziffer-
// Mismatch gibt der Decoder einen FEHLER zurueck, niemals stillen Falschtext
// (der still falsch dekodierte Befund – z.B. rechts statt links – waere der
// gefaehrlichste Fall).
// ============================================================================

import { Baustein, Fall, Katalog, Seite } from "../model/types.ts";

const SEITE_CODE: Record<Seite, number> = {
  rechts: 1,
  links: 2,
  beidseits: 3,
};
const CODE_SEITE: Record<number, Seite> = {
  1: "rechts",
  2: "links",
  3: "beidseits",
};

// Kompaktes, index-basiertes Nutzlast-Format (Arrays statt Objekt-Keys):
// [ version, fingerprint, seiteCode, [ [gIdx, [befundIdx...], [[auswIdx,choice]...], [[phIdx,wert]...] ], ... ] ]
// fingerprint = strukturelle Signatur des Katalogs. Weicht der Katalog des
// PC-Zwillings strukturell ab (z.B. weil er bearbeitet wurde), passt der
// Fingerprint nicht -> Fehler statt stillem Falschtext.
type BausteinPayload = [
  number, // globaler Baustein-Index
  number[], // aktive befund-Indizes (lokal)
  Array<[number, number]>, // auswahl: [lokalIdx, gewaehlt]
  Array<[number, string]>, // werte: [lokalPhIdx, Wert]
  Array<[number, number, string]>?, // messwerte: [lokalIdx, versteckt(0/1), Wert]
];
type Payload = [number, string, number, BausteinPayload[]];

// ---------- Katalog-Indexierung (deterministisch, beide Seiten identisch) ----

function alleBausteine(katalog: Katalog): Baustein[] {
  const out: Baustein[] = [];
  for (const r of katalog.regionen) out.push(...r.bausteine);
  return out;
}

function befundIds(b: Baustein): string[] {
  return b.segmente.filter((s) => s.art === "befund").map((s: any) => s.id);
}
function auswahlIds(b: Baustein): string[] {
  return b.segmente.filter((s) => s.art === "auswahl").map((s: any) => s.id);
}
function messwertSegs(b: Baustein): Array<{ id: string; normal?: string }> {
  return b.segmente
    .filter((s) => s.art === "messwert")
    .map((s: any) => ({ id: s.id, normal: s.normal }));
}

/**
 * Struktureller Fingerprint des Katalogs: haengt an der Reihenfolge/IDs aller
 * Bausteine, Befunde, Auswahlen und Platzhalter – also genau an dem, worauf
 * sich die Indizes im Code beziehen. Weicht er ab, ist der Code nicht sicher
 * dekodierbar.
 */
export function fingerprint(katalog: Katalog): string {
  const teile: string[] = [];
  for (const b of alleBausteine(katalog)) {
    teile.push(b.id);
    teile.push("f:" + befundIds(b).join(","));
    teile.push("a:" + auswahlIds(b).join(","));
    teile.push("p:" + b.platzhalter.map((p) => p.id).join(","));
    teile.push("m:" + messwertSegs(b).map((m) => m.id).join(","));
  }
  const sig = teile.join("|");
  // 6-stelliger Base36-Rolling-Hash
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < sig.length; i++) {
    h1 = (h1 * 31 + sig.charCodeAt(i)) % 2176782336; // 36^6
    h2 = (h2 * 131 + sig.charCodeAt(i)) % 2176782336;
  }
  const b36 = (n: number) => n.toString(36).padStart(6, "0").slice(-6);
  return (b36(h1) + b36(h2)).toUpperCase();
}

// ---------- Base64url (kompakt, ASCII-sicher) ----------

function utf8ToBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlToUtf8(code: string): string {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------- Pruefziffer (eine Base36-Stelle ueber den Codepoints) ----------

const PRUEF_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function pruefziffer(s: string): string {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum = (sum * 31 + s.charCodeAt(i)) % 36;
  return PRUEF_ALPHABET[sum];
}

const PRAEFIX = "KT";

export interface DecodeFehler {
  ok: false;
  grund: "format" | "pruefziffer" | "version";
  meldung: string;
}
export interface DecodeErfolg {
  ok: true;
  fall: Fall;
}
export type DecodeErgebnis = DecodeErfolg | DecodeFehler;

/** Kodiert einen Fall in einen abtippbaren Code (Praefix + Base64url + Pruefziffer). */
export function encode(fall: Fall, katalog: Katalog): string {
  const bausteine = alleBausteine(katalog);
  const indexVon = new Map(bausteine.map((b, i) => [b.id, i]));

  const bp: BausteinPayload[] = [];
  for (const id of fall.bausteinIds) {
    const g = indexVon.get(id);
    if (g == null) continue;
    const b = bausteine[g];

    const bIds = befundIds(b);
    const aktiveBefunde: number[] = [];
    bIds.forEach((bid, i) => {
      if (fall.befunde[bid]) aktiveBefunde.push(i);
    });

    const aIds = auswahlIds(b);
    const auswahl: Array<[number, number]> = [];
    aIds.forEach((aid, i) => {
      const wahl = fall.auswahl[aid];
      if (wahl != null) auswahl.push([i, wahl]);
    });

    const werte: Array<[number, string]> = [];
    b.platzhalter.forEach((p, i) => {
      const w = fall.werte[p.id];
      if (w != null && w !== "") werte.push([i, w]);
    });

    // Messwerte nur kodieren, wenn vom Normwert abweichend oder ausgeblendet
    const messwerte: Array<[number, number, string]> = [];
    messwertSegs(b).forEach((m, i) => {
      const versteckt = fall.versteckt[m.id] ? 1 : 0;
      const cur = fall.werte[m.id] ?? m.normal ?? "";
      const abweichend = cur !== (m.normal ?? "");
      if (versteckt || abweichend) {
        messwerte.push([i, versteckt, versteckt ? "" : cur]);
      }
    });

    bp.push([g, aktiveBefunde, auswahl, werte, messwerte]);
  }

  const payload: Payload = [
    katalog.version,
    fingerprint(katalog),
    fall.seite ? SEITE_CODE[fall.seite] : 0,
    bp,
  ];

  const roh = utf8ToBase64Url(JSON.stringify(payload));
  return PRAEFIX + roh + pruefziffer(roh);
}

/** Dekodiert einen Code zurueck zu einem Fall – oder gibt einen Fehler zurueck. */
export function decode(codeRaw: string, katalog: Katalog): DecodeErgebnis {
  const code = codeRaw.trim().replace(/\s+/g, "");
  if (!code.startsWith(PRAEFIX) || code.length < PRAEFIX.length + 2) {
    return { ok: false, grund: "format", meldung: "Kein gültiger Code." };
  }
  const ohnePraefix = code.slice(PRAEFIX.length);
  const roh = ohnePraefix.slice(0, -1);
  const pz = ohnePraefix.slice(-1);
  if (pruefziffer(roh) !== pz.toUpperCase()) {
    return {
      ok: false,
      grund: "pruefziffer",
      meldung: "Prüfziffer stimmt nicht – bitte Code erneut eingeben.",
    };
  }

  let payload: Payload;
  try {
    payload = JSON.parse(base64UrlToUtf8(roh));
  } catch {
    return { ok: false, grund: "format", meldung: "Code beschädigt." };
  }

  const [version, fp, seiteCode, bp] = payload;
  if (version !== katalog.version) {
    return {
      ok: false,
      grund: "version",
      meldung: `Katalog-Version passt nicht (Code v${version}, App v${katalog.version}). Bitte gleiche Version verwenden.`,
    };
  }
  if (fp !== fingerprint(katalog)) {
    return {
      ok: false,
      grund: "version",
      meldung:
        "Katalog stimmt nicht mit dem Code überein (Bausteine wurden geändert). Kein Text erzeugt – bitte identischen Katalog verwenden.",
    };
  }

  const bausteine = alleBausteine(katalog);
  const fall: Fall = {
    bausteinIds: [],
    seite: seiteCode ? CODE_SEITE[seiteCode] ?? null : null,
    befunde: {},
    werte: {},
    auswahl: {},
    versteckt: {},
  };

  for (const [g, aktiveBefunde, auswahl, werte, messwerte] of bp) {
    const b = bausteine[g];
    if (!b) return { ok: false, grund: "format", meldung: "Unbekannter Baustein im Code." };
    fall.bausteinIds.push(b.id);

    const bIds = befundIds(b);
    for (const i of aktiveBefunde) if (bIds[i]) fall.befunde[bIds[i]] = true;

    const aIds = auswahlIds(b);
    for (const [i, wahl] of auswahl) if (aIds[i]) fall.auswahl[aIds[i]] = wahl;

    for (const [i, wert] of werte) if (b.platzhalter[i]) fall.werte[b.platzhalter[i].id] = wert;

    const mSegs = messwertSegs(b);
    for (const [i, versteckt, wert] of messwerte ?? []) {
      const m = mSegs[i];
      if (!m) continue;
      if (versteckt) fall.versteckt[m.id] = true;
      else if (wert !== "") fall.werte[m.id] = wert;
    }
  }

  return { ok: true, fall };
}

/** Zerlegt den Code in Gruppen zu 5 Zeichen fuer leichteres Abtippen/Lesen. */
export function gruppiere(code: string): string {
  return code.replace(/(.{5})/g, "$1 ").trim();
}
