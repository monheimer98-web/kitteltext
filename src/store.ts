// Zustand der Anwendung. Ansichten lesen Signale und rufen Aktionen auf; die
// Fachlogik liegt in src/engine.

import { computed, effect, signal } from "@preact/signals";
import { KATALOG } from "./data/katalog.ts";
import { indexiere, renderBrief } from "./engine/render.ts";
import { findeAbgleichhinweise } from "./engine/abgleich.ts";
import { ABGLEICHREGELN } from "./data/abgleich.ts";
import { ergaenzt, mitSeite, mitVorlage, nachKatalogwechsel, neuerFall } from "./engine/fall.ts";
import { imBausteinVorgeschlagen, istFragesatz, stelleVor } from "./engine/vorlage.ts";
import type { AbschnittId, Baustein, Fall, Seite, Setting, Vorlage } from "./model/types.ts";
import {
  SCHNELLWERT_MAX,
  gueltigerSchnellwert,
  ladeEigenes,
  ladeEinstellungen,
  ladeNutzung,
  ladeSitzung,
  loescheFaelle,
  pruefeEigenes,
  raeumeAltlasten,
  speichereEigenes,
  speichereEinstellungen,
  speichereNutzung,
  speichereSitzung,
} from "./speicher.ts";
import type { Eigenes, Einstellungen, Nutzung } from "./speicher.ts";

export const INDEX = indexiere(KATALOG);

export const einstellungen = signal<Einstellungen>(ladeEinstellungen());

/**
 * Fälle, die so lange nicht angefasst wurden, werden verworfen, auch bei
 * offenem Fenster. In der Notaufnahme reicht das über die Wartezeit auf
 * Bildgebung und Konsil; auf Station über einen Arbeitstag.
 */
export const ABLAUF_STUNDEN: Record<Setting, number> = { zna: 4, station: 12 };

export function abgelaufen(f: Fall, jetzt = Date.now()): boolean {
  return jetzt - f.geaendert > ABLAUF_STUNDEN[f.setting] * 3600_000;
}

raeumeAltlasten();
const sitzung = ladeSitzung();
const geladen = sitzung.faelle.map((f) => ergaenzt(f, INDEX)).filter((f): f is Fall => f !== null && !abgelaufen(f));

/** Zahl der Fälle, deren Auswahlen nach einer Katalogänderung zurückgesetzt wurden. */
export const katalogGeaendert = signal(geladen.filter((f) => f.katalog !== KATALOG.version).length);

export const faelle = signal<Fall[]>(geladen.map((f) => nachKatalogwechsel(f, INDEX)));
export const aktivId = signal<string | null>(geladen.some((f) => f.id === sitzung.aktivId) ? sitzung.aktivId : (geladen[0]?.id ?? null));
export const nutzung = signal<Nutzung>(ladeNutzung());
let zaehler = Math.max(sitzung.zaehler, 0, ...geladen.map((f) => f.nr));

/**
 * Vorlagensuche über dem offenen Fall: "neu" legt einen weiteren Fall an,
 * "wechseln" ersetzt die Vorlage des aktiven Falls.
 */
export const sucheOffen = signal<"neu" | "wechseln" | null>(null);

/** Einsatzort, der gilt, solange kein Fall offen ist. */
export const setting = signal<Setting>(faelle.value.find((f) => f.id === aktivId.value)?.setting ?? "zna");

export const aktiverFall = computed<Fall | null>(() => faelle.value.find((f) => f.id === aktivId.value) ?? null);

// --- Eigene Bausteine und Vorlagen ----------------------------------------

export const EIGEN_REGION = "eigen";
export const eigenes = signal<Eigenes>(ladeEigenes(INDEX));

/** Zählt hoch, wenn sich der Katalog durch eigene Inhalte ändert; Ansichten lesen ihn, um neu zu zeichnen. */
export const katalogStand = signal(0);

export function eigeneBausteinId(id: string): string {
  return `eigen-${id}`;
}

/**
 * Ein eigener Baustein ist ein zuwählbarer Satz. So erscheint er in jedem Fall
 * zuerst als Vorschlag, den der Arzt übernimmt, und `{seite}` folgt dem Fall.
 */
function alsBaustein(e: Eigenes["bausteine"][number]): Baustein {
  return {
    id: eigeneBausteinId(e.id),
    titel: e.titel,
    typ: "procedere",
    abschnitt: e.abschnitt,
    platzhalter: [],
    segmente: [{ art: "option", id: "text", label: e.titel, an: true, text: e.text }],
    status: "eigen",
  };
}

/** Hängt die eigenen Inhalte in den Katalog ein. Der mitgelieferte Katalog bleibt unverändert. */
function registriereEigenes(e: Eigenes) {
  const k = INDEX.katalog;
  for (const r of k.regionen.filter((x) => x.id === EIGEN_REGION)) for (const b of r.bausteine) INDEX.bausteine.delete(b.id);
  for (const v of k.vorlagen.filter((x) => x.status === "eigen")) INDEX.vorlagen.delete(v.id);
  k.regionen = k.regionen.filter((x) => x.id !== EIGEN_REGION);
  k.vorlagen = k.vorlagen.filter((x) => x.status !== "eigen");
  const bausteine = e.bausteine.map(alsBaustein);
  if (bausteine.length > 0 || e.vorlagen.length > 0) {
    k.regionen = [{ id: EIGEN_REGION, name: "Eigene", kuerzel: "★", bausteine }, ...k.regionen];
    for (const b of bausteine) {
      INDEX.bausteine.set(b.id, b);
      INDEX.regionVon.set(b.id, EIGEN_REGION);
    }
  }
  // Eine eigene Vorlage kann nie den Platz einer mitgelieferten einnehmen.
  const vorlagen = e.vorlagen.filter((v) => !INDEX.vorlagen.has(v.id)).map((v) => ({ ...v, region: EIGEN_REGION, status: "eigen" as const }));
  k.vorlagen = [...vorlagen, ...k.vorlagen];
  for (const v of vorlagen) INDEX.vorlagen.set(v.id, v);
  katalogStand.value++;
}
registriereEigenes(eigenes.value);

/** Speichert die eigenen Inhalte. false, wenn die Prüfung sie ablehnt oder der Browser das Speichern verweigert hat. */
function setzeEigenes(e: Eigenes): boolean {
  // Geschrieben wird nur, was beim nächsten Laden durchkommt; sonst verwürfe `ladeEigenes` den ganzen Bestand (CR-06).
  const geprueft = pruefeEigenes(e, INDEX);
  if (!geprueft) return false;
  const ok = speichereEigenes(geprueft);
  eigenes.value = geprueft;
  registriereEigenes(geprueft);
  return ok;
}

/** Eigene Schnellwerte zu einer Feldbezeichnung, zuletzt gemerkte zuerst. */
export function schnellwerteFuer(label: string): string[] {
  return eigenes.value.schnellwerte?.[label] ?? [];
}

/** Merkt sich eine getippte Formulierung als Schnellwert. false bei unbrauchbarem Text oder verweigertem Speichern. */
export function schnellwertMerken(label: string, text: string): boolean {
  const t = text.trim();
  if (!gueltigerSchnellwert(t) || !label.trim()) return false;
  const alt = eigenes.value;
  const liste = [t, ...(alt.schnellwerte?.[label] ?? []).filter((x) => x !== t)].slice(0, SCHNELLWERT_MAX);
  return setzeEigenes({ ...alt, schnellwerte: { ...alt.schnellwerte, [label]: liste } });
}

export function schnellwertVergessen(label: string, text: string): boolean {
  const alt = eigenes.value;
  const liste = (alt.schnellwerte?.[label] ?? []).filter((x) => x !== text);
  const schnellwerte = { ...alt.schnellwerte };
  if (liste.length > 0) schnellwerte[label] = liste;
  else delete schnellwerte[label];
  return setzeEigenes({ ...alt, schnellwerte });
}

function eigeneId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function eigenenBausteinSpeichern(titel: string, abschnitt: AbschnittId, text: string): boolean {
  const e = eigenes.value;
  return setzeEigenes({ ...e, bausteine: [...e.bausteine, { id: eigeneId(), titel: titel.trim(), abschnitt, text: text.trim() }] });
}

/** Offene Fälle, die einen eigenen Baustein oder eine eigene Vorlage verwenden. */
export function verwendetIn(art: "baustein" | "vorlage", id: string): Fall[] {
  return faelle.value.filter((f) => (art === "vorlage" ? f.vorlageId === id : Object.values(f.bausteine).some((l) => l?.includes(eigeneBausteinId(id)))));
}

/** Löscht einen eigenen Baustein. Verweigert, solange ein offener Fall ihn verwendet. */
export function eigenenBausteinLoeschen(id: string): boolean {
  if (verwendetIn("baustein", id).length > 0) return false;
  const e = eigenes.value;
  setzeEigenes({ ...e, bausteine: e.bausteine.filter((b) => b.id !== id) });
  return true;
}

/**
 * Speichert den Aufbau des aktiven Falls als Vorlage: Bausteine je Abschnitt,
 * Entweder-oder-Stellen und welche Sätze vorgeschlagen werden. Alles, was eine
 * Antwort zu diesem Patienten ist (Auswahlen, Werte, Befunde, freier Text,
 * Seite, Person, die Entscheidung an einer Entweder-oder-Stelle), bleibt draußen.
 */
export function eigeneVorlageSpeichern(titel: string): boolean {
  const f = aktiverFall.value;
  if (!f) return false;
  const basis = f.vorlageId ? INDEX.vorlagen.get(f.vorlageId) : undefined;
  // Die Stellen bleiben offen, auch wenn sie in diesem Fall entschieden sind: Röntgen oder Verzicht ist eine Antwort zum Patienten.
  // Ihre Bausteine stehen nie zugleich in `abschnitte` (Katalogtest, `pruefeEigenes`).
  const nurGewaehlt = new Set((basis?.wahl ?? []).flatMap((w) => w.bausteine));
  const abschnitte = Object.fromEntries(Object.entries(f.bausteine).map(([a, liste]) => [a, (liste ?? []).filter((id) => !nurGewaehlt.has(id))]));
  // Jede Stelle behält ihren Platz: vor dem Baustein, vor dem sie in diesem Fall steht. Hat der Arzt ihn entfernt, ist das der
  // nächste der Ausgangsvorlage; fehlen auch die, steht sie wie im Fall am Ende.
  const wahl = (basis?.wahl ?? []).map((w) => {
    const platz = basis ? stelleVor(basis, w, (abschnitte[w.abschnitt] ?? []).filter((id) => INDEX.bausteine.has(id))) : undefined;
    const { vor: _, ...stelle } = w;
    return { ...stelle, bausteine: [...w.bausteine], ...(platz ? { vor: platz } : {}) };
  });
  const ids = new Set([...Object.values(abschnitte).flat(), ...nurGewaehlt]);
  const zuFall = (k: string) => ids.has(k.split("/")[0]);
  const an = new Set((basis?.vorgaben?.an ?? []).filter(zuFall));
  const aus = new Set((basis?.vorgaben?.aus ?? []).filter(zuFall));
  // Was die Ausgangsvorlage weglässt, bleibt weggelassen, auch wenn der Arzt den Satz hier an- oder abgewählt hat: Die Wahl gilt
  // diesem Patienten. Als Vorschlag stünde die Impfung eines Patienten neben der Tetanuswahl jedes folgenden (PS-01, CR-05).
  const weggelassen = basis?.weglassen ?? {};
  const weglassen = Object.fromEntries(
    Object.entries(weggelassen)
      .filter(([k]) => zuFall(k))
      .map(([k, ersatz]) => [k, ersatz.filter(zuFall)] as const)
      .filter(([, ersatz]) => ersatz.length > 0),
  );
  // Eine Frage, die Baustein oder Ausgangsvorlage stellen (Satz mit Pflichtangabe), bleibt gestellt: „Satz entfernen“ galt diesem
  // Patienten. Sonst fragte die eigene Vorlage etwa nie mehr nach der Gerinnungshemmung (B-1).
  const basisAn = new Set(basis?.vorgaben?.an ?? []);
  const basisAus = new Set(basis?.vorgaben?.aus ?? []);
  const gestellt = (k: string) => istFragesatz(k, INDEX) && (basisAn.has(k) || (imBausteinVorgeschlagen(k, INDEX) && !basisAus.has(k)));
  for (const [k, wert] of Object.entries(f.optionen)) {
    if (k in weggelassen) continue;
    if (!wert && gestellt(k)) continue;
    (wert ? aus : an).delete(k);
    (wert ? an : aus).add(k);
  }
  const vorlage: Vorlage = {
    id: `eigen-${eigeneId()}`,
    titel: titel.trim(),
    suchbegriffe: basis ? [basis.titel, ...(basis.suchbegriffe ?? [])] : [],
    region: EIGEN_REGION,
    setting: f.setting,
    abschnitte,
    wahl,
    entscheiden: (basis?.entscheiden ?? []).filter(zuFall),
    ohne: (basis?.ohne ?? []).filter(zuFall),
    vorgaben: { an: [...an], aus: [...aus] },
    weglassen,
    schnellwerte: Object.fromEntries(Object.entries(basis?.schnellwerte ?? {}).filter(([k]) => zuFall(k))),
    status: "eigen",
    quelle: basis ? `eigene Fassung von „${basis.titel}“` : "eigene Vorlage",
  };
  const e = eigenes.value;
  return setzeEigenes({ ...e, vorlagen: [vorlage, ...e.vorlagen] });
}

export function eigeneVorlageLoeschen(id: string): boolean {
  if (verwendetIn("vorlage", id).length > 0) return false;
  const e = eigenes.value;
  setzeEigenes({ ...e, vorlagen: e.vorlagen.filter((v) => v.id !== id) });
  return true;
}

/** Ersetzt die eigenen Inhalte (Einfügen von einem anderen Rechner). Verweigert, solange offene Fälle eigene Inhalte verwenden. */
export function eigenesErsetzen(e: Eigenes): boolean {
  const alt = eigenes.value;
  const benutzt = alt.bausteine.some((b) => verwendetIn("baustein", b.id).length > 0) || alt.vorlagen.some((v) => verwendetIn("vorlage", v.id).length > 0);
  if (benutzt) return false;
  setzeEigenes(e);
  return true;
}

export const brief = computed(() => {
  const f = aktiverFall.value;
  katalogStand.value;
  return f ? renderBrief(f, INDEX, { listen: einstellungen.value.listen }) : null;
});

/** Stellen, an denen zwei Abschnitte einander widersprechen können. Nur ein Hinweis, keine Sperre. */
export const abgleich = computed(() => findeAbgleichhinweise(brief.value, ABGLEICHREGELN));

// --- Rückgängig -----------------------------------------------------------

const verlauf = new Map<string, { zurueck: Fall[]; vor: Fall[]; gruppe: string | null }>();
const MAX_SCHRITTE = 100;

function historie(id: string) {
  let h = verlauf.get(id);
  if (!h) {
    h = { zurueck: [], vor: [], gruppe: null };
    verlauf.set(id, h);
  }
  return h;
}

export const kannZurueck = signal(false);
export const kannVor = signal(false);

function aktualisiereVerlaufssignale() {
  const h = aktivId.value ? verlauf.get(aktivId.value) : undefined;
  kannZurueck.value = !!h && h.zurueck.length > 0;
  kannVor.value = !!h && h.vor.length > 0;
}

function ersetze(fall: Fall) {
  faelle.value = faelle.value.map((f) => (f.id === fall.id ? fall : f));
}

/**
 * Ändert einen bestimmten Fall. `gruppe` fasst aufeinanderfolgende Änderungen
 * derselben Art (Tippen in einem Feld) zu einem Rückgängig-Schritt zusammen;
 * die Gruppe gilt je Fall.
 */
export function aendereFall(id: string, fn: (f: Fall) => Fall, gruppe?: string) {
  const alt = faelle.value.find((f) => f.id === id);
  if (!alt) return;
  const neu = fn(alt);
  if (neu === alt) return;
  const h = historie(id);
  if (!gruppe || gruppe !== h.gruppe) {
    h.zurueck.push(alt);
    if (h.zurueck.length > MAX_SCHRITTE) h.zurueck.shift();
  }
  h.vor = [];
  h.gruppe = gruppe ?? null;
  ersetze({ ...neu, geaendert: Date.now() });
  aktualisiereVerlaufssignale();
}

/**
 * Trägt etwas in einen Fall ein, das keine Eingabe des Arztes ist und deshalb
 * kein Rückgängig-Schritt wird (Kopiervermerke).
 */
export function vermerke(id: string, fn: (f: Fall) => Fall) {
  const alt = faelle.value.find((f) => f.id === id);
  if (alt) ersetze(fn(alt));
}

export function aendere(fn: (f: Fall) => Fall, gruppe?: string) {
  if (aktivId.value) aendereFall(aktivId.value, fn, gruppe);
}

/**
 * Kopiervermerke sind Tatsachen, keine Eingaben: Was ins KIS kopiert wurde,
 * bleibt kopiert, auch wenn der Arzt eine Eingabe zurücknimmt.
 */
function mitHeutigenVermerken(ziel: Fall, jetzt: Fall): Fall {
  return { ...ziel, kopiert: jetzt.kopiert, kopiertUm: jetzt.kopiertUm };
}

export function zurueck(): boolean {
  const alt = aktiverFall.value;
  if (!alt) return false;
  const h = historie(alt.id);
  const vorher = h.zurueck.pop();
  if (!vorher) return false;
  h.vor.push(alt);
  h.gruppe = null;
  ersetze(mitHeutigenVermerken(vorher, alt));
  aktualisiereVerlaufssignale();
  return true;
}

export function vor(): boolean {
  const alt = aktiverFall.value;
  if (!alt) return false;
  const h = historie(alt.id);
  const danach = h.vor.pop();
  if (!danach) return false;
  h.zurueck.push(alt);
  h.gruppe = null;
  ersetze(mitHeutigenVermerken(danach, alt));
  aktualisiereVerlaufssignale();
  return true;
}

// --- Fälle ----------------------------------------------------------------

export function fallNeu(mit?: Vorlage, seite?: Seite) {
  let fall = neuerFall(mit?.setting ?? setting.value, INDEX, ++zaehler);
  if (mit) fall = mitVorlage(fall, mit, INDEX);
  if (seite) fall = mitSeite(fall, seite);
  faelle.value = [...faelle.value, fall];
  aktivId.value = fall.id;
  setting.value = fall.setting;
  sucheOffen.value = null;
  if (mit) zaehleNutzung(mit.id);
  aktualisiereVerlaufssignale();
}

export function fallWaehlen(id: string) {
  const f = faelle.value.find((x) => x.id === id);
  if (!f) return;
  aktivId.value = id;
  sucheOffen.value = null;
  setting.value = f.setting;
  historie(id).gruppe = null;
  aktualisiereVerlaufssignale();
}

/** Zuletzt geschlossener Fall, für "Rückgängig" in der Meldung. */
export const geschlossen = signal<{ fall: Fall; position: number } | null>(null);

export function fallSchliessen(id: string) {
  const liste = faelle.value;
  const position = liste.findIndex((f) => f.id === id);
  if (position === -1) return;
  geschlossen.value = { fall: liste[position], position };
  const rest = liste.filter((f) => f.id !== id);
  faelle.value = rest;
  if (aktivId.value === id) aktivId.value = rest[Math.min(position, rest.length - 1)]?.id ?? null;
  aktualisiereVerlaufssignale();
}

export function fallWiederherstellen() {
  const g = geschlossen.value;
  if (!g) return;
  const liste = [...faelle.value];
  liste.splice(Math.min(g.position, liste.length), 0, g.fall);
  faelle.value = liste;
  aktivId.value = g.fall.id;
  geschlossen.value = null;
  aktualisiereVerlaufssignale();
}

export function vorlageAnwenden(v: Vorlage, seite?: Seite) {
  if (!aktiverFall.value) {
    fallNeu(v, seite);
    return;
  }
  aendere((f) => {
    const neu = mitVorlage(f, v, INDEX);
    return seite ? mitSeite(neu, seite) : neu;
  });
  setting.value = v.setting;
  sucheOffen.value = null;
  zaehleNutzung(v.id);
}

function zaehleNutzung(id: string) {
  const alt = nutzung.value;
  const n: Nutzung = {
    anzahl: { ...alt.anzahl, [id]: (alt.anzahl[id] ?? 0) + 1 },
    zuletzt: [id, ...alt.zuletzt.filter((x) => x !== id)].slice(0, 8),
  };
  nutzung.value = n;
  speichereNutzung(n);
}

/** Entfernt alle Fälle von diesem Gerät, auch den zuletzt geschlossenen. */
export function allesLoeschen() {
  faelle.value = [];
  aktivId.value = null;
  sucheOffen.value = null;
  geschlossen.value = null;
  verlauf.clear();
  loescheFaelle();
  aktualisiereVerlaufssignale();
}

/** Verwirft abgelaufene Fälle. Gibt ihre Zahl zurück. */
export function verwerfeAbgelaufene(jetzt = Date.now()): number {
  const alt = faelle.value;
  const rest = alt.filter((f) => !abgelaufen(f, jetzt));
  if (rest.length === alt.length) return 0;
  for (const f of alt) if (!rest.includes(f)) verlauf.delete(f.id);
  faelle.value = rest;
  if (!rest.some((f) => f.id === aktivId.value)) aktivId.value = rest[0]?.id ?? null;
  if (geschlossen.value && abgelaufen(geschlossen.value.fall, jetzt)) geschlossen.value = null;
  aktualisiereVerlaufssignale();
  return alt.length - rest.length;
}

export function setzeEinstellung<K extends keyof Einstellungen>(name: K, wert: Einstellungen[K]) {
  einstellungen.value = { ...einstellungen.value, [name]: wert };
}

// --- Persistenz -----------------------------------------------------------

/** false, wenn der Browser das Speichern verweigert; die Oberfläche weist dann darauf hin. */
export const speichernMoeglich = signal(true);

effect(() => {
  speichereEinstellungen(einstellungen.value);
});

effect(() => {
  speichernMoeglich.value = speichereSitzung({ faelle: faelle.value, aktivId: aktivId.value, zaehler });
});

effect(() => {
  const modus = einstellungen.value.farbmodus;
  const root = document.documentElement;
  if (modus === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", modus === "hell" ? "light" : "dark");
});
