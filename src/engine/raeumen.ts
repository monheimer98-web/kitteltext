// „Arbeitsplatz räumen“ (E-81): Frage und Meldung mit den richtigen Zahlen. Reine Texte aus Zahlen; was gelöscht wird,
// entscheidet der Store, ob es geklappt hat, meldet `speicher.ts`.

/** Was die Frage zeigt: Fälle dieses Fensters, die nicht behalten sind, und alle behaltenen auf diesem PC. */
export interface RaeumenLage {
  /** nicht behaltene Fälle dieses Fensters */
  fenster: number;
  /** behaltene Fälle auf diesem PC, auch die in anderen Fenstern und die in keinem offenen */
  behalten: number;
  /** Kurzbezeichnung, wenn es genau einen behaltenen Fall gibt */
  einziger?: string;
}

function faelle(n: number, art = ""): string {
  return n === 1 ? `1 ${art ? `${art}r ` : ""}Fall` : `${n} ${art ? `${art} ` : ""}Fälle`;
}

/** Frage ohne behaltene Fälle: „Den offenen Fall löschen?“, „Alle 3 Fälle löschen?“. */
export function raeumenFrage(l: RaeumenLage): string {
  if (l.behalten === 0) return l.fenster === 1 ? "Den offenen Fall löschen?" : `Alle ${l.fenster} Fälle löschen?`;
  const behalten = l.behalten === 1 ? `liegt 1 behaltener Fall${l.einziger ? ` („${l.einziger}“)` : ""}` : `liegen ${faelle(l.behalten, "behaltene")}`;
  const fenster = l.fenster > 0 ? `, in diesem Fenster ${l.fenster === 1 ? "1 weiterer Fall" : `${l.fenster} weitere Fälle`}` : "";
  return `Auf diesem PC ${behalten}${fenster}. Was soll gelöscht werden?`;
}

/** Die zwei Knöpfe der Frage mit behaltenen Fällen. */
export function raeumenKnoepfe(l: RaeumenLage): { bleiben: string; alles: string } {
  return l.behalten === 1
    ? { bleiben: "Räumen, behaltener Fall bleibt", alles: "Alles löschen, auch den behaltenen" }
    : { bleiben: "Räumen, behaltene Fälle bleiben", alles: `Alles löschen, auch die ${l.behalten} behaltenen` };
}

export interface Geraeumt {
  /** gelöschte nicht behaltene Fälle dieses Fensters */
  fenster: number;
  /** behaltene Fälle: gelöscht (mit Zahl), nicht gelöscht (Browser hat verweigert) oder bleiben (mit Zahl) */
  behalten: { art: "geloescht"; anzahl: number } | { art: "verweigert"; anzahl: number } | { art: "bleiben"; anzahl: number };
  /** Zwischenablage überschrieben? */
  ablage: boolean;
}

/**
 * Meldung danach. Sie sagt, was gelöscht ist, und bestätigt das Löschen behaltener Fälle nur, wenn es nachweislich geklappt
 * hat; „alle Fälle“ sagt sie nie, weil andere Fenster eigene Fälle haben können (MT-R6-04, PS-R6-9).
 */
export function geraeumtText(r: Geraeumt): { text: string; art: "ok" | "fehler" } {
  const weg: string[] = [];
  if (r.fenster > 0) weg.push(`${faelle(r.fenster)} dieses Fensters`);
  if (r.behalten.art === "geloescht" && r.behalten.anzahl > 0) weg.push(faelle(r.behalten.anzahl, "behaltene"));
  const teile = [...(weg.length > 0 ? [`${weg.join(" und ")} gelöscht`] : []), r.ablage ? "Zwischenablage überschrieben" : "Zwischenablage nicht überschrieben (der Browser hat es verweigert)"];
  const saetze = [`Arbeitsplatz geräumt: ${teile.join(", ")}.`];
  if (r.behalten.art === "bleiben" && r.behalten.anzahl > 0) {
    saetze.push(r.behalten.anzahl === 1 ? "1 behaltener Fall bleibt unter „Behaltene Fälle“ bis zu seinem Ablauf." : `${r.behalten.anzahl} behaltene Fälle bleiben unter „Behaltene Fälle“ bis zu ihrem Ablauf.`);
  }
  if (r.behalten.art === "verweigert") {
    saetze.push("Nicht gelöscht: Der Browser hat das Löschen der behaltenen Fälle verweigert, sie liegen weiter auf diesem PC. Bitte melden.");
  }
  saetze.push("Eigene Bausteine und Vorlagen bleiben.");
  return { text: saetze.join(" "), art: r.behalten.art === "verweigert" || !r.ablage ? "fehler" : "ok" };
}
