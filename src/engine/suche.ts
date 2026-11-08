// Vorlagensuche: tolerant gegen Umlaute, Tippfehler und Abkürzungen. Sie ordnet
// nur nach Übereinstimmung mit dem getippten Text, nie nach Befunden.

import type { Setting, Vorlage } from "../model/types.ts";

export function normalisiere(s: string): string {
  return s
    .toLowerCase()
    // Umlaute werden mit und ohne Punkte und als ae/oe/ue getippt: alles auf den Grundvokal.
    .replace(/ä|ae/g, "a")
    .replace(/ö|oe/g, "o")
    .replace(/ü|ue/g, "u")
    .replace(/ß/g, "ss")
    // Übliche Schreibvarianten medizinischer Begriffe: Skaphoid/Skafoid, Clavicula/Klavikula.
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/c(?=[aoulr])/g, "k")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Editierabstand mit Vertauschung benachbarter Buchstaben, abgebrochen ab `max`. */
export function abstand(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d.push([i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let zeilenMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + kosten);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
      if (v < zeilenMin) zeilenMin = v;
    }
    if (zeilenMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

interface Suchdaten {
  titel: string[];
  begriffe: string[];
  kuerzel: string[];
  initialen: string;
}

const cache = new WeakMap<Vorlage, Suchdaten>();

function daten(v: Vorlage): Suchdaten {
  let d = cache.get(v);
  if (!d) {
    const titel = normalisiere(v.titel).split(" ").filter(Boolean);
    d = {
      titel,
      begriffe: (v.suchbegriffe ?? []).flatMap((b) => normalisiere(b).split(" ")).filter(Boolean),
      kuerzel: (v.kuerzel ?? []).map(normalisiere),
      initialen: titel.map((w) => w[0]).join(""),
    };
    cache.set(v, d);
  }
  return d;
}

function wortPunkte(q: string, d: Suchdaten): number {
  let beste = 0;
  if (d.kuerzel.includes(q)) beste = 100;
  if (q.length >= 2 && d.initialen.startsWith(q)) beste = Math.max(beste, 70);
  d.titel.forEach((w, i) => {
    if (w.startsWith(q)) beste = Math.max(beste, i === 0 ? 80 : 60);
    else if (q.length >= 3 && w.includes(q)) beste = Math.max(beste, 40);
  });
  for (const w of d.begriffe) {
    if (w.startsWith(q)) beste = Math.max(beste, 45);
    else if (q.length >= 3 && w.includes(q)) beste = Math.max(beste, 30);
  }
  if (beste === 0 && q.length >= 4) {
    const max = q.length >= 8 ? 2 : 1;
    for (const w of [...d.titel, ...d.begriffe]) {
      // Der Nutzer tippt meist nur den Wortanfang; verglichen wird deshalb mit etwa gleich langen Präfixen.
      const laengen = w.length > q.length ? [q.length - 1, q.length, q.length + 1] : [w.length];
      if (laengen.some((l) => abstand(q, w.slice(0, l), max) <= max)) {
        beste = 20;
        break;
      }
    }
  }
  return beste;
}

export interface Treffer {
  vorlage: Vorlage;
  punkte: number;
}

/**
 * Sucht Vorlagen. Jedes getippte Wort muss passen. Vorlagen des gewählten
 * Einsatzorts stehen vor denen des anderen; `nutzung` (Anzahl bisheriger
 * Verwendungen) entscheidet nur bei Gleichstand.
 */
export function sucheVorlagen(
  vorlagen: Vorlage[],
  anfrage: string,
  setting?: Setting,
  nutzung: Record<string, number> = {},
): Treffer[] {
  const woerter = normalisiere(anfrage).split(" ").filter(Boolean);
  const treffer: Treffer[] = [];
  for (const v of vorlagen) {
    const d = daten(v);
    let punkte = 0;
    let passt = true;
    for (const q of woerter) {
      const p = wortPunkte(q, d);
      if (p === 0) {
        passt = false;
        break;
      }
      punkte += p;
    }
    if (!passt) continue;
    if (setting && v.setting === setting) punkte += 1000;
    treffer.push({ vorlage: v, punkte });
  }
  return treffer.sort(
    (a, b) =>
      b.punkte - a.punkte ||
      (nutzung[b.vorlage.id] ?? 0) - (nutzung[a.vorlage.id] ?? 0) ||
      a.vorlage.titel.localeCompare(b.vorlage.titel, "de"),
  );
}
