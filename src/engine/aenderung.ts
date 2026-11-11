// Was ein Schritt am Brief geändert hat, als kurzer Text für Meldungen: nach Strg+Z und „Rückgängig“ der neue Stand
// (MT-03), für „Eben gesetzt“ und zurückgenommene Befehle die Wahl im Wortlaut des Briefs (MT-07, QA-29). Rein
// rechnerisch aus Fall und gerendertem Brief.

import type { Fall, Geschlecht, Seite } from "../model/types.ts";
import type { BriefAnsicht } from "./render.ts";

/** Die Person, wie die Knöpfe im Fallkopf sie nennen; Meldungen nennen sie genauso (E-44 Satz 2). */
export const PERSON_WORT: Record<Geschlecht, string> = { m: "Patient", w: "Patientin", k: "Kind", n: "neutral" };

const SEITE_WORT: Record<Seite, string> = { rechts: "rechts", links: "links", beidseits: "beidseits", ohne: "ohne Seite" };

/** Neuer Stand einer Stelle nach dem Schritt; gleiches Wort für Grau wie in der Oberfläche („wieder Vorschlag“). */
const STAND_WORT: Record<string, string> = { offen: "wieder offen", vorschlag: "wieder Vorschlag", ok: "unauffällig", abw: "auffällig", spaeter: "Platzhalter fürs KIS" };

interface Stelle {
  zustand: string;
  text: string;
  label: string;
  bausteinId?: string;
}

/**
 * Name einer Stelle für Meldungen. Die Seitenangabe eines Bausteins nennt den Baustein: „Seite (Distorsion …)“ liest
 * sich sonst als Seite des ganzen Briefs (PS-R4-1).
 */
function stellenName(t: BriefAnsicht["abschnitte"][number]["tokens"][number], a: BriefAnsicht["abschnitte"][number]): string {
  const titel = t.art === "seite" && t.bausteinId ? a.bausteine.find((b) => b.id === t.bausteinId)?.titel : undefined;
  return titel ? `Seite (${titel})` : (t.label ?? a.titel);
}

function stellen(b: BriefAnsicht | null): Map<string, Stelle> {
  const aus = new Map<string, Stelle>();
  for (const a of b?.abschnitte ?? []) {
    for (const t of a.tokens) if (t.key) aus.set(t.key, { zustand: t.zustand ?? "gesetzt", text: t.t, label: stellenName(t, a), bausteinId: t.bausteinId });
    if (a.manuell) aus.set(`hand:${a.id}`, { zustand: "gesetzt", text: a.text, label: `${a.titel} (von Hand)` });
  }
  return aus;
}

/** Text gekürzt für eine Meldung: Leerraum zusammengezogen, höchstens `max` Zeichen. */
export function kurz(text: string, max = 70): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Geänderte Stellen: erst die, die es danach gibt, in Lesereihenfolge, dann die, die aus dem Brief verschwunden sind.
 * So nennt eine Meldung zuerst, was der Arzt jetzt sieht.
 */
function geaendert(alt: Map<string, Stelle>, neu: Map<string, Stelle>): string[] {
  const gleich = (k: string) => alt.get(k)?.zustand === neu.get(k)?.zustand && alt.get(k)?.text === neu.get(k)?.text;
  return [...[...neu.keys()].filter((k) => !gleich(k)), ...[...alt.keys()].filter((k) => !neu.has(k))];
}

/** Stellen, die ein Schritt geändert hat und die es danach noch gibt, in Lesereihenfolge (Hervorheben, Fokus). */
export function geaenderteStellen(vorBrief: BriefAnsicht | null, nachBrief: BriefAnsicht | null): string[] {
  const neu = stellen(nachBrief);
  return geaendert(stellen(vorBrief), neu).filter((k) => neu.has(k));
}

export interface Aenderung {
  text: string;
  /** Geänderte Stellen, die es danach noch gibt (zum Hervorheben und für den Fokus). */
  keys: string[];
}

/** Fallkopf: Seite, Person oder Alter, als Bezeichnung und Wert; null, wenn keiner davon sich geändert hat. */
function kopf(vor: Fall, nach: Fall): { label: string; wert: string | null } | null {
  if (vor.seite !== nach.seite) return { label: "Seite", wert: nach.seite ? SEITE_WORT[nach.seite] : null };
  if (vor.geschlecht !== nach.geschlecht) return { label: "Person", wert: nach.geschlecht ? PERSON_WORT[nach.geschlecht] : null };
  if (vor.alter !== nach.alter) return { label: "Alter", wert: nach.alter.trim() || null };
  return null;
}

/**
 * Was ein Schritt geändert hat, mit dem neuen Stand: „Kontrolle (jetzt: wieder offen) und 2 weitere“. Für Strg+Z,
 * Wiederholen und jede Meldung nach dem Zurücknehmen (MT-03): Sie nennt, was jetzt im Brief steht, nie den alten Stand.
 */
export function aenderungJetzt(vorFall: Fall | null, vorBrief: BriefAnsicht | null, nachFall: Fall | null, nachBrief: BriefAnsicht | null): Aenderung {
  if (!vorFall || !nachFall || vorFall.id !== nachFall.id) return { text: "", keys: [] };
  if (vorFall.vorlageId !== nachFall.vorlageId) return { text: "Vorlage", keys: [] };
  const k = kopf(vorFall, nachFall);
  if (k) return { text: `${k.label} (jetzt: ${k.wert ?? (k.label === "Alter" ? "leer" : "nicht gewählt")})`, keys: [] };
  const alt = stellen(vorBrief);
  const neu = stellen(nachBrief);
  const keys = geaendert(alt, neu);
  if (keys.length === 0) return { text: "", keys: [] };
  const erste = keys[0];
  const jetzt = neu.get(erste);
  const stand = !jetzt ? "nicht mehr im Brief" : (STAND_WORT[jetzt.zustand] ?? `„${kurz(jetzt.text)}“`);
  const label = (jetzt ?? alt.get(erste))!.label;
  return { text: `${label} (jetzt: ${stand})${keys.length > 1 ? ` und ${keys.length - 1} weitere` : ""}`, keys: keys.filter((x) => neu.has(x)) };
}

/** Stelle, die man im Brief nicht sieht: gesetzt und ohne Text außer Leerraum. */
function unsichtbar(s: Stelle | undefined): boolean {
  return !s || (s.zustand === "gesetzt" && s.text.trim() === "");
}

/** „A“, „A und B“, „A, B und C“: alle Namen, keiner verschwindet in einer Zahl (QA-32). */
function alleNamen(namen: readonly string[]): string {
  return namen.length <= 1 ? (namen[0] ?? "") : `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}

/**
 * Was eine Rücknahme geändert hat, für die Meldung danach (QA-31, QA-32, PS-N14): aus dem Vergleich des ganzen Stands
 * vor der Rücknahme mit dem danach, nicht Befehl für Befehl. So steht jede Stelle genau einmal da, mit dem Stand, der
 * jetzt im Brief steht, auch wenn mehrere Befehle sie geändert hatten. Stellen mit gleichem Stand stehen zusammen
 * („Rötung und Schwellung (jetzt: wieder offen)“), verschiedene Stände durch Semikolon getrennt; ab vier Stellen steht
 * die Zahl davor. Jede Stelle wird genannt, nichts verschwindet in „und N weitere“. Was sich nur im Leerraum
 * unterscheidet, fällt weg. Seite, Person und Alter stehen einmal als Fallkopf da, nicht noch einmal mit jeder
 * Seitenangabe oder Anrede im Brief, die nur ihretwegen anders aussieht. `brief` rendert einen Fall.
 */
export function zurueckgenommenText(vorFall: Fall | null, nachFall: Fall | null, brief: (f: Fall) => BriefAnsicht | null): string {
  if (!vorFall || !nachFall || vorFall.id !== nachFall.id) return "";
  if (vorFall.vorlageId !== nachFall.vorlageId) return "Vorlage";
  // `zitat`: Name einer Stelle aus dem Katalog; Seite, Person und Alter sind Wörter der Oberfläche.
  const eintraege: { name: string; stand: string; zitat?: true }[] = [];
  if (vorFall.seite !== nachFall.seite) eintraege.push({ name: "Seite", stand: nachFall.seite ? SEITE_WORT[nachFall.seite] : "nicht gewählt" });
  if (vorFall.geschlecht !== nachFall.geschlecht) eintraege.push({ name: "Person", stand: nachFall.geschlecht ? PERSON_WORT[nachFall.geschlecht] : "nicht gewählt" });
  if (vorFall.alter !== nachFall.alter) eintraege.push({ name: "Alter", stand: nachFall.alter.trim() || "leer" });
  // Welche Stellen sich selbst geändert haben, zeigt der Stand danach mit dem Fallkopf von vorher; wie sie jetzt
  // aussehen, der echte Stand danach.
  const alt = stellen(brief(vorFall));
  const ohneKopf = stellen(brief({ ...nachFall, seite: vorFall.seite, geschlecht: vorFall.geschlecht, alter: vorFall.alter }));
  const neu = stellen(brief(nachFall));
  const sichtbarGleich = (k: string) => {
    const a = alt.get(k);
    const n = ohneKopf.get(k);
    if (unsichtbar(a) && unsichtbar(n)) return true;
    return !!a && !!n && a.zustand === n.zustand && kurz(a.text, Infinity) === kurz(n.text, Infinity);
  };
  for (const k of geaendert(alt, ohneKopf)) {
    if (sichtbarGleich(k)) continue;
    const jetzt = neu.get(k);
    const stand = !jetzt ? "nicht mehr im Brief" : (STAND_WORT[jetzt.zustand] ?? `„${kurz(jetzt.text)}“`);
    const name = (jetzt ?? ohneKopf.get(k) ?? alt.get(k))!.label;
    if (!eintraege.some((e) => e.name === name && e.stand === stand)) eintraege.push({ name, stand, zitat: true });
  }
  const staende = [...new Set(eintraege.map((e) => e.stand))];
  // Namen der Stellen in Anführungszeichen: Viele enthalten selbst ein Komma oder „und“ (CR-TS20).
  const text = staende.map((s) => `${alleNamen(eintraege.filter((e) => e.stand === s).map((e) => (e.zitat ? `„${e.name}“` : e.name)))} (jetzt: ${s})`).join("; ");
  return eintraege.length >= 4 ? `${eintraege.length} Stellen: ${text}` : text;
}

/**
 * Was ein Befehl gesetzt hat, im Wortlaut des Briefs (MT-07, QA-29): „Person „Patient““, „DS Außenband „unauffällig““,
 * „Röntgen oder Verzicht? „Röntgen oberes Sprunggelenk links …““. Fügt die Wahl einen Baustein ein, steht sein Text da,
 * nicht der Name der Lücke, die verschwunden ist.
 */
export function gesetztText(vorFall: Fall | null, vorBrief: BriefAnsicht | null, nachFall: Fall | null, nachBrief: BriefAnsicht | null): string {
  if (!vorFall || !nachFall || vorFall.id !== nachFall.id) return "";
  const k = kopf(vorFall, nachFall);
  if (k) return k.wert ? `${k.label} „${k.wert}“` : `${k.label} (nicht gewählt)`;
  const alt = stellen(vorBrief);
  const neu = stellen(nachBrief);
  const keys = geaendert(alt, neu);
  if (keys.length === 0) return "";
  // Neuer Baustein (Entweder-oder-Stelle entschieden): sein Text, unter dem Namen der Lücke, die er füllt.
  const vorher = new Set(vorBrief?.abschnitte.flatMap((a) => a.tokens.map((t) => t.bausteinId)) ?? []);
  const neuerBaustein = nachBrief?.abschnitte.flatMap((a) => a.tokens).filter((t) => t.bausteinId && !vorher.has(t.bausteinId)) ?? [];
  if (neuerBaustein.length > 0) {
    const weg = keys.find((x) => !neu.has(x));
    const label = (weg ? alt.get(weg)?.label : undefined) ?? neuerBaustein.find((t) => t.label)?.label ?? "Wahl";
    return `${label} „${kurz(neuerBaustein.map((t) => t.t).join(""))}“`;
  }
  const aussage = keys.find((x) => ["gesetzt", "ok", "abw", "spaeter"].includes(neu.get(x)?.zustand ?? "")) ?? keys[0];
  const s = neu.get(aussage);
  if (!s) return `${alt.get(aussage)!.label} (nicht mehr im Brief)`;
  if (s.zustand === "ok") return `${s.label} „unauffällig“`;
  if (s.zustand === "spaeter") return `${s.label} (Platzhalter fürs KIS)`;
  if (s.zustand === "offen" || s.zustand === "vorschlag") return `${s.label} (${s.zustand === "offen" ? "offen" : "Vorschlag"})`;
  return `${s.label} „${kurz(s.text)}“`;
}

/**
 * Namen der Stellen, die sich von `vorFall` zu `nachFall` geändert haben, in Lesereihenfolge: „Seite“, „„DS Außenband““. Für die
 * Meldung über eine Eingabe, die ein anderes Fenster nicht mehr bekommen hat (MT-R6-07): Sie sagt, wo nachzusehen ist, nicht
 * was dort stand. Leer, wenn sich nichts Sichtbares geändert hat. `brief` rendert einen Fall.
 */
export function geaenderteNamen(vorFall: Fall, nachFall: Fall, brief: (f: Fall) => BriefAnsicht | null): string[] {
  if (vorFall.id !== nachFall.id) return [];
  if (vorFall.vorlageId !== nachFall.vorlageId) return ["Vorlage"];
  const namen: string[] = [];
  if (vorFall.seite !== nachFall.seite) namen.push("Seite");
  if (vorFall.geschlecht !== nachFall.geschlecht) namen.push("Person");
  if (vorFall.alter !== nachFall.alter) namen.push("Alter");
  // Wie in `zurueckgenommenText`: Stellen, die nur wegen Seite, Person oder Alter anders aussehen, stehen nicht noch einmal da.
  const alt = stellen(brief(vorFall));
  const ohneKopf = stellen(brief({ ...nachFall, seite: vorFall.seite, geschlecht: vorFall.geschlecht, alter: vorFall.alter }));
  for (const k of geaendert(alt, ohneKopf)) {
    const s = ohneKopf.get(k) ?? alt.get(k);
    if (unsichtbar(alt.get(k)) && unsichtbar(ohneKopf.get(k))) continue;
    const name = `„${s!.label}“`;
    if (!namen.includes(name)) namen.push(name);
  }
  return namen;
}

/** „a, b und c“; ab `max + 1` Einträgen die ersten `max`, dann „und 4 weitere“ (MT-09). */
export function aufzaehlen(teile: readonly string[], max = 3): string {
  const t = teile.filter(Boolean);
  if (t.length <= 1) return t[0] ?? "";
  if (t.length > max) return `${t.slice(0, max).join(", ")} und ${t.length - max} weitere`;
  return `${t.slice(0, -1).join(", ")} und ${t[t.length - 1]}`;
}
