import type { Geschlecht, PersonForm } from "../model/types.ts";

type Fall4 = "nom" | "gen" | "dat" | "akk";
type Genus = "m" | "w" | "k";

const ARTIKEL: Record<Genus, Record<Fall4, string>> = {
  m: { nom: "der", gen: "des", dat: "dem", akk: "den" },
  w: { nom: "die", gen: "der", dat: "der", akk: "die" },
  k: { nom: "das", gen: "des", dat: "dem", akk: "das" },
};

const NOMEN: Record<Genus, Record<Fall4, string>> = {
  m: { nom: "Patient", gen: "Patienten", dat: "Patienten", akk: "Patienten" },
  w: { nom: "Patientin", gen: "Patientin", dat: "Patientin", akk: "Patientin" },
  k: { nom: "Kind", gen: "Kindes", dat: "Kind", akk: "Kind" },
};

const PRONOMEN: Record<Genus, Record<Fall4, string>> = {
  m: { nom: "er", gen: "seiner", dat: "ihm", akk: "ihn" },
  w: { nom: "sie", gen: "ihrer", dat: "ihr", akk: "sie" },
  k: { nom: "es", gen: "seiner", dat: "ihm", akk: "es" },
};

/** Endung des Adjektivs nach bestimmtem Artikel: -e im Nominativ sowie im Akkusativ außer beim Maskulinum, sonst -en. */
function schwach(g: Genus, f: Fall4): string {
  if (f === "nom") return "e";
  if (f === "akk" && g !== "m") return "e";
  return "en";
}

function altersangabe(alter: string, g: Genus, f: Fall4): string {
  const a = alter.trim();
  if (!a) return "";
  // Zahl, auch mit Vorsatz ("ca. 80"), gilt als Jahre; alles andere ("8 Monate") wird ausgeschrieben.
  const jahre = /^((?:ca\.?|etwa|ungefähr|rund)\s*)?(\d{1,3})$/i.exec(a);
  if (jahre) return `${jahre[1] ? "ca. " : ""}${jahre[2]}-jährig${schwach(g, f)} `;
  return `${a} alt${schwach(g, f)} `;
}

function gross(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function alterKurz(alter: string): string {
  const a = alter.trim();
  return /^((?:ca\.?|etwa|ungefähr|rund)\s*)?\d{1,3}$/i.test(a) ? `${a} J.` : a;
}

/**
 * Bezug auf den Patienten im verlangten Fall. Ohne gewählte Person gibt es
 * keinen Text; der Aufrufer zeigt dann eine offene Stelle.
 */
export function personText(
  form: PersonForm,
  geschlecht: Geschlecht | null,
  alter: string,
  opt: { gross?: boolean; alter?: boolean } = {},
): string | null {
  if (!geschlecht) return null;
  const istPronomen = form.startsWith("pron-");
  const f = (istPronomen ? form.slice(5) : form) as Fall4;

  if (geschlecht === "n") {
    // „Pat." bleibt in allen Fällen gleich und kommt ohne Artikel aus.
    return opt.alter && alter.trim() && !istPronomen ? `Pat. (${alterKurz(alter)})` : "Pat.";
  }
  const text = istPronomen
    ? PRONOMEN[geschlecht][f]
    : `${ARTIKEL[geschlecht][f]} ${opt.alter ? altersangabe(alter, geschlecht, f) : ""}${NOMEN[geschlecht][f]}`;
  return opt.gross ? gross(text) : text;
}
