// Zustand der Anwendung. Ansichten lesen Signale und rufen Aktionen auf; die
// Fachlogik liegt in src/engine.

import { batch, computed, effect, signal } from "@preact/signals";
import { KATALOG } from "./data/katalog.ts";
import { indexiere, renderBrief } from "./engine/render.ts";
import { findeAbgleichhinweise } from "./engine/abgleich.ts";
import { ABGLEICHREGELN } from "./data/abgleich.ts";
import { ergaenzt, mitSeite, mitVorlage, nachKatalogwechsel, neuerFall } from "./engine/fall.ts";
import { imBausteinVorgeschlagen, istFragesatz, stelleVor } from "./engine/vorlage.ts";
import type { AbschnittId, Baustein, Fall, Seite, Setting, Vorlage } from "./model/types.ts";
import { BEHALTEN_TAGE, LEERER_BESTAND, ablaufGrund, abgelaufen as eintragAbgelaufen, kurzBereinigt, kurzVergeben, liesBestand, loeschzeit, merkerAusKurz } from "./engine/behalten.ts";
import { aufzaehlen, geaenderteNamen } from "./engine/aenderung.ts";
import { neuerStand } from "./engine/stand.ts";
import type { Bestand, Eintrag, Gelesen } from "./engine/behalten.ts";
import {
  SCHNELLWERT_MAX,
  SITZUNG_FORMAT,
  beiFremderAenderung,
  beiFremdenEinstellungen,
  beimVerlassen,
  dauerspeicherGeht,
  gueltigerSchnellwert,
  ladeBehalten,
  ladeEigenes,
  ladeEinstellungen,
  ladeNutzung,
  ladeSitzung,
  loescheBehaltene,
  loescheFaelle,
  pruefeEigenes,
  raeumeAltlasten,
  speichereBehalten,
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
const START = Date.now();

/**
 * Kennung dieses Fensters (Tab). Sie bleibt beim Neuladen (Sitzungsspeicher), ein neues Fenster bekommt eine neue. Ein
 * behaltener Fall ist immer nur in einem Fenster offen (E-67): Die Kennung steht an seinem Eintrag.
 */
export const FENSTER: string = sitzung.fenster ?? `w${START.toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Behaltene Fälle: Abgelaufene fallen schon beim Lesen weg, beim Start wird der Rest zurückgeschrieben (E-50: „beim Start“).
// Nicht lesbar heißt nicht leer: Dann öffnet dieses Fenster keinen behaltenen Fall und schreibt nichts zurück (CR-R6-06).
const erstLesbar = ladeBehalten(START);
const erstGelesen: Gelesen = erstLesbar ?? liesBestand(null, START);
if (erstLesbar && (erstLesbar.abgelaufen.length > 0 || erstLesbar.verworfen > 0)) speichereBehalten(erstLesbar.bestand);
/** Stand der Einträge, den dieses Fenster zuletzt gelesen oder geschrieben hat; geschrieben wird nur darauf (E-67). */
const bekannt = new Map<string, number>();
// Was in diesem Fenster offen war, ist nach dem Neuladen wieder offen, wenn kein anderes Fenster es inzwischen hat.
const hierGeladen: Fall[] = [];
for (const id of sitzung.behalten) {
  const e = erstGelesen.bestand.eintraege.find((x) => x.id === id);
  if (!e || ausNeuererFassung(e, erstGelesen.bestand) || (e.fenster !== null && e.fenster !== FENSTER)) continue;
  // Das Schreiben war zuletzt gescheitert: Die Kopie aus dem Sitzungsspeicher ist der neuere Stand, solange niemand sonst
  // geschrieben hat (gleicher `stand`). Sonst gilt der Eintrag auf dem PC (CR-R6-01).
  const kopie = sitzung.ungespeichert.find((u) => u.stand === e.stand && (u.fall as { id?: unknown } | null)?.id === id);
  const f = (kopie && ergaenzt(kopie.fall, INDEX, sitzung.format)) || ergaenzt(e.fall, INDEX, e.fallFormat);
  if (!f || f.id !== id || f.setting !== "station") continue;
  bekannt.set(id, e.stand);
  hierGeladen.push(f);
}
const hierIds = new Set(hierGeladen.map((f) => f.id));
// Formatstand nur für die Fälle der Sitzung; behaltene Fälle schreibt erst Format 3, sie sind aktuell (CR-R5-03).
const sitzungsfaelle = sitzung.faelle.map((f) => ergaenzt(f, INDEX, sitzung.format)).filter((f): f is Fall => f !== null && !abgelaufen(f) && !hierIds.has(f.id));
const platz = new Map(sitzung.reihenfolge.map((id, i) => [id, i]));
const sortiert = [...sitzungsfaelle, ...hierGeladen].sort((a, b) => (platz.get(a.id) ?? 1e9) - (platz.get(b.id) ?? 1e9));
let zaehler = Math.max(sitzung.zaehler, 0, ...sortiert.map((f) => f.nr));
// Die Nummer eines behaltenen Falls kommt vom PC: Hat ein anderes Fenster ihn inzwischen geöffnet und wieder freigegeben,
// trägt er dessen Nummer. Ist sie hier schon vergeben, bekommt er wie beim Öffnen die nächste dieses Fensters; sonst gäbe
// es zwei Reiter mit derselben Ziffer, und Alt+Ziffer träfe nur den ersten (CR-R6-19).
const vergeben = new Set(sitzungsfaelle.map((f) => f.nr));
const geladen = sortiert.map((f) => {
  if (!hierIds.has(f.id) || !vergeben.has(f.nr)) {
    vergeben.add(f.nr);
    return f;
  }
  return { ...f, nr: ++zaehler };
});

/** Zahl der Fälle, deren Auswahlen nach einer Katalogänderung zurückgesetzt wurden. */
export const katalogGeaendert = signal(geladen.filter((f) => f.katalog !== KATALOG.version).length);

export const faelle = signal<Fall[]>(geladen.map((f) => nachKatalogwechsel(f, INDEX)));
// War beim letzten Mal ein Fall offen, den es jetzt nicht mehr gibt (abgelaufen, in ein anderes Fenster geholt, gelöscht),
// wird kein anderer Fall aktiv: Sonst stünde nach dem Neuladen still der Brief eines anderen Patienten da (PS-R6C-3, E-79).
const aktivFehlt = sitzung.aktivId !== null && !geladen.some((f) => f.id === sitzung.aktivId);
export const aktivId = signal<string | null>(aktivFehlt ? null : (sitzung.aktivId ?? geladen[0]?.id ?? null));
export const nutzung = signal<Nutzung>(ladeNutzung());

/** Alle behaltenen Fälle auf diesem PC, wie zuletzt gelesen oder geschrieben (Liste auf der Startseite). */
export const bestand = signal<Bestand>(erstGelesen.bestand);
/** false, solange der Browser das Lesen der behaltenen Fälle verweigert; die Liste sagt es dann, statt „keine“ zu zeigen. */
export const behaltenLesbar = signal(erstLesbar !== null);
/**
 * Hier offene behaltene Fälle, deren letztes Schreiben gescheitert ist, mit dem Zeitpunkt des Stands, der auf dem PC liegt
 * (CR-R6-01, H-R6-4). Solange einer darin steht, schreibt das Fenster ihn zusätzlich in den Sitzungsspeicher und zeigt ein
 * Banner; beides endet mit dem ersten gelungenen Schreiben.
 */
export const nichtGespeichert = signal<ReadonlyMap<string, number>>(new Map());
/** Behaltene Fälle, die in diesem Fenster offen sind. Ihr Inhalt liegt nicht im Sitzungsspeicher, nur in `kitteltext3.behalten`. */
export const behaltenHier = signal<ReadonlySet<string>>(hierIds);
/** Meldung aus dem Speicher (Ablauf, anderes Fenster, verweigertes Speichern); die Oberfläche zeigt sie und setzt sie zurück. */
export const behaltenMeldung = signal<{ text: string; art: "ok" | "warnung" | "fehler" } | null>(
  erstGelesen.abgelaufen.length > 0 ? { text: ablaufSaetze(erstGelesen.abgelaufen, erstGelesen.uhr).join(" "), art: "ok" } : null,
);
/**
 * Meldung, die stehen bleibt, bis jemand „Verstanden“ drückt: Der offene Fall ist ohne Zutun dieses Fensters zugegangen
 * (Ablauf, ein anderes Fenster hat ihn geholt oder gelöscht, PS-R6-1). Dann ist kein Fall aktiv; die Meldung sagt, welcher
 * und warum. Eine zweite Meldung kommt hinzu, statt die erste zu verdrängen.
 */
export const stehendeMeldung = signal<{ text: string; art: "warnung" | "fehler" } | null>(
  aktivFehlt
    ? {
        text: (() => {
          const e = sitzung.behalten.includes(sitzung.aktivId!) ? erstGelesen.bestand.eintraege.find((x) => x.id === sitzung.aktivId) : undefined;
          if (e) return `„${e.kurz}“ ist inzwischen in einem anderen Fenster geöffnet. Hierher holen unter „Behaltene Fälle“ (Strg+K). Hier ist kein Fall geöffnet.`;
          return `Der zuletzt hier offene Fall ist nicht mehr da (abgelaufen oder in einem anderen Fenster gelöscht). Hier ist kein Fall geöffnet${geladen.length > 0 ? "; die übrigen stehen in den Reitern" : ""}.`;
        })(),
        art: "warnung",
      }
    : null,
);

/**
 * Zeitpunkt der letzten Minutenprüfung (`verwerfeAbgelaufene`). Ansichten mit Zeitangaben lesen ihn, damit sie jede Minute
 * neu zeichnen: Über Mitternacht wird aus „14:10“ „gestern 14:10“, und die Vorwarnung vor dem Löschen erscheint, ohne dass
 * jemand etwas ändert (PS-R6-2, E-82). Gerechnet wird mit der Uhr beim Zeichnen.
 */
export const uhrTakt = signal(Date.now());

function meldeStehend(text: string, art: "warnung" | "fehler") {
  const alt = stehendeMeldung.peek();
  stehendeMeldung.value = alt ? { text: alt.text.endsWith(text) ? alt.text : `${alt.text} ${text}`, art: alt.art === "fehler" ? "fehler" : art } : { text, art };
}
/** Offene Frage nach der Kurzbezeichnung: beim Anlegen eines Stationsfalls, beim späteren Behalten, beim Ändern. */
export const kurzFrage = signal<{ fallId: string; anlass: "neu" | "behalten" | "aendern" } | null>(null);

/**
 * Vorlagensuche über dem offenen Fall: "neu" legt einen weiteren Fall an,
 * "wechseln" ersetzt die Vorlage des aktiven Falls.
 */
export const sucheOffen = signal<"neu" | "wechseln" | null>(null);
/** Seitenleiste „Anleitung“: zu, von selbst beim ersten Start geöffnet (ohne den Fokus zu nehmen) oder per Knopf (D-05). */
export const anleitungOffen = signal<"selbst" | "knopf" | null>(null);

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

/** Offene und behaltene Fälle, die einen eigenen Baustein oder eine eigene Vorlage verwenden. */
export function verwendetIn(art: "baustein" | "vorlage", id: string): Fall[] {
  const offen = new Set(faelle.value.map((f) => f.id));
  const b = bestand.value;
  const behalten = b.eintraege.filter((e) => !offen.has(e.id)).map((e) => fallAusEintrag(e, b)).filter((f): f is Fall => f !== null);
  return [...faelle.value, ...behalten].filter((f) => (art === "vorlage" ? f.vorlageId === id : Object.values(f.bausteine).some((l) => l?.includes(eigeneBausteinId(id)))));
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

type Verlauf = { zurueck: Fall[]; vor: Fall[]; gruppe: string | null };
const verlauf = new Map<string, Verlauf>();
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
  const jetzt = Date.now();
  ersetze({ ...neu, geaendert: jetzt, abschnittStand: gestempelt(alt, neu, jetzt) });
  aktualisiereVerlaufssignale();
}

/**
 * Stand je Abschnitt nach einer Eingabe (E-86): Abschnitte, deren Text sich geändert hat, bekommen den heutigen Zeitpunkt.
 * Teil derselben Änderung, kein eigener Rückgängig-Schritt; Zurücknehmen bringt mit dem alten Text auch den alten Stand.
 */
function gestempelt(alt: Fall, neu: Fall, jetzt: number): Fall["abschnittStand"] {
  const art = { listen: einstellungen.peek().listen };
  const vorher = alt.id === aktivId.peek() ? brief.peek() : renderBrief(alt, INDEX, art);
  return neuerStand(neu.abschnittStand, vorher, renderBrief(neu, INDEX, art), jetzt);
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
  // Eingeschaltet fragt jeder neue Stationsfall nach seiner Kurzbezeichnung (E-50); „Nur in diesem Fenster“ lässt ihn ungespeichert.
  if (fall.setting === "station" && frischeEinstellungen().stationBehalten && behaltenVerfuegbar() === "ja") kurzFrage.value = { fallId: fall.id, anlass: "neu" };
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

/**
 * Zuletzt geschlossener Fall, für "Rückgängig" in der Meldung. Bei einem behaltenen Fall steht dabei, ob er nur hier
 * geschlossen (er bleibt auf dem PC) oder gelöscht wurde.
 */
export const geschlossen = signal<{
  fall: Fall;
  position: number;
  behalten?: { eintrag: Eintrag; geloescht: boolean };
  /** Rückgängig-Verlauf des Falls: Nach „Rückgängig“ geht Strg+Z weiter wie vor dem Schließen (CR-R6-10). */
  verlauf?: Verlauf;
} | null>(null);

/**
 * Fälle, die ohne den Brief vor Augen aus diesem Fenster gingen (Ablauf, Verwerfen nach langer Ruhe, ein anderes Fenster hat
 * sie geholt oder gelöscht, Löschen aus der Liste oder beim Ausschalten) oder die, hier schon geschlossen, vom PC
 * verschwunden sind (Ablauf, anderswo gelöscht), bis sie hier wieder geöffnet werden. Die Oberfläche
 * räumt damit „Zuletzt kopiert“ und die Abschrift von Hand: Sonst stünde Brieftext eines Falls, den es hier nicht mehr gibt,
 * tagelang in der Seitenleiste (CR-R6-09, QA-16). Nach dem Schließen mit dem Reiter bleibt der Hinweis, was in der
 * Zwischenablage liegt.
 */
export const ohneBriefZu = signal<ReadonlySet<string>>(new Set());

/**
 * Nimmt einen Fall aus den Reitern dieses Fensters, ohne ihn irgendwo zu merken. Schließt der Arzt ihn mit dem Reiter, wird
 * der Nachbar aktiv. Geht er ohne Zutun zu (Ablauf, anderes Fenster) oder löscht der Arzt ihn, ohne den Brief vor sich zu
 * haben (Liste, Ausschalten), wird mit `keinNachbar` kein anderer Fall aktiv: Der Nachbar sieht oft gleich aus (gleiche
 * Vorlage, gleiche Seite), und Strg+Enter kopierte sonst den Brief eines anderen Patienten (PS-R6-1).
 */
function ausDemFenster(id: string, keinNachbar = false) {
  const liste = faelle.value;
  const position = liste.findIndex((f) => f.id === id);
  if (position === -1) return;
  const rest = liste.filter((f) => f.id !== id);
  batch(() => {
    if (behaltenHier.peek().has(id)) behaltenHier.value = new Set([...behaltenHier.peek()].filter((x) => x !== id));
    faelle.value = rest;
    if (aktivId.value === id) {
      aktivId.value = keinNachbar ? null : (rest[Math.min(position, rest.length - 1)]?.id ?? null);
      // „Andere Vorlage für diesen Fall“ hätte keinen Fall mehr.
      if (keinNachbar && sucheOffen.peek() === "wechseln") sucheOffen.value = null;
    }
  });
  bekannt.delete(id);
  geschrieben.delete(id);
  vergissUngespeichert([id]);
  verlauf.delete(id);
  if (keinNachbar) ohneBriefZu.value = new Set([...ohneBriefZu.peek(), id]);
  aktualisiereVerlaufssignale();
}

/**
 * Was beim Schließen geschah (CR-R6-14): „geschlossen“ (Fall nur dieses Fensters), „behalten“ (bleibt auf dem PC),
 * „geloescht“, „nicht-geloescht“ (Löschen verweigert oder Speicher nicht lesbar; er bleibt auf dem PC), „anderswo“ (gehört
 * inzwischen einem anderen Fenster oder wurde dort geändert; hier nur geschlossen), „fehlt“ (war schon vom PC weg).
 */
export type SchliessenErgebnis = "geschlossen" | "behalten" | "geloescht" | "nicht-geloescht" | "anderswo" | "fehlt";

/**
 * Schließt einen Fall in diesem Fenster. Ein behaltener Fall bleibt auf dem PC und ist für andere Fenster frei; mit
 * `loeschen` (nach „Alles kopiert“) wird er gelöscht. „Rückgängig“ holt ihn zurück, wenn `geschlossen` danach gesetzt ist;
 * die Meldung richtet sich nach dem Ergebnis.
 */
export function fallSchliessen(id: string, loeschen = false): SchliessenErgebnis {
  const liste = faelle.value;
  const position = liste.findIndex((f) => f.id === id);
  if (position === -1) return "fehlt";
  const fall = liste[position];
  const schritte = verlauf.get(id);
  if (behaltenHier.peek().has(id)) {
    const g = lese(Date.now());
    const e = g?.bestand.eintraege.find((x) => x.id === id);
    const meins = g && e && !g.bestand.neuer && e.stand === bekannt.get(id) && (e.fenster === null || e.fenster === FENSTER);
    let behalten: { eintrag: Eintrag; geloescht: boolean } | undefined;
    let ergebnis: SchliessenErgebnis;
    if (!g) ergebnis = loeschen ? "nicht-geloescht" : "behalten";
    else if (!e) ergebnis = "fehlt";
    else if (!meins) ergebnis = "anderswo";
    else {
      const rest = loeschen ? g.bestand.eintraege.filter((x) => x !== e) : g.bestand.eintraege.map((x) => (x === e ? { ...e, fenster: null } : x));
      const ok = setzeBestand({ ...g.bestand, eintraege: rest });
      behalten = { eintrag: { ...e, fenster: null }, geloescht: loeschen && ok };
      ergebnis = !loeschen ? "behalten" : ok ? "geloescht" : "nicht-geloescht";
    }
    ausDemFenster(id);
    // Die Liste zeigt, was die Meldung sagt („in einem anderen Fenster geöffnet“), auch wenn das Ereignis `storage` ausblieb.
    if (g && ergebnis !== "behalten" && ergebnis !== "geloescht") bestand.value = g.bestand;
    // Gehört der Fall inzwischen einem anderen Fenster, holt „Rückgängig“ nichts zurück: Sonst gäbe es ihn zweimal.
    geschlossen.value = behalten ? { fall, position, behalten, verlauf: schritte } : null;
    return ergebnis;
  }
  ausDemFenster(id);
  geschlossen.value = { fall, position, verlauf: schritte };
  return "geschlossen";
}

/**
 * Ergebnis von „Rückgängig“ nach dem Schließen (CR-R6-14, CR-R6-18): „ok“; „nichts“ (nichts zum Zurückholen); „anderswo“
 * (inzwischen in einem anderen Fenster geöffnet: holen nur über die Liste, mit Rückfrage); „doppelt“ (die Kurzbezeichnung
 * trägt inzwischen ein anderer behaltener Fall: Der Fall ist wieder offen, aber nur in diesem Fenster); sonst wie beim Öffnen.
 */
export type WiederherstellenErgebnis = OeffnenErgebnis | "nichts" | "anderswo" | "doppelt";

export function fallWiederherstellen(): WiederherstellenErgebnis {
  const g = geschlossen.value;
  if (!g) return "nichts";
  geschlossen.value = null;
  if (g.behalten) {
    const jetzt = Date.now();
    const gel = lese(jetzt);
    if (!gel) return "gesperrt";
    if (gel.bestand.neuer) return "neuer";
    const e = gel.bestand.eintraege.find((x) => x.id === g.fall.id);
    // Die Liste zeigt danach, was auf dem PC liegt: Die Meldungen verweisen auf sie.
    bestand.value = gel.bestand;
    // Gelöscht und nicht wieder auf dem PC: eintragen, wie er war, wenn nichts dagegen spricht. Sonst gilt der Stand auf dem
    // PC, ein anderes Fenster kann ihn geändert haben; wie in der Liste holt Rückgängig ihn nicht ohne Rückfrage dorthin weg.
    let unveraendert = true;
    if (g.behalten.geloescht && !e) {
      if (eintragAbgelaufen(g.behalten.eintrag, jetzt)) return "fehlt";
      if (kurzVergeben(g.behalten.eintrag.kurz, gel.bestand.eintraege, g.fall.id)) {
        nurHierWieder(g, merkerAusKurz(g.behalten.eintrag.kurz));
        return "doppelt";
      }
      const b = { ...gel.bestand, eintraege: [...gel.bestand.eintraege, { ...g.behalten.eintrag, fall: g.fall, fallFormat: SITZUNG_FORMAT, stand: g.behalten.eintrag.stand + 1 }] };
      if (!speichereBehalten(b)) return "gesperrt";
      bestand.value = b;
    } else {
      if (!e) return "fehlt";
      if (e.fenster !== null && e.fenster !== FENSTER) return "anderswo";
      unveraendert = !g.behalten.geloescht && e.stand === g.behalten.eintrag.stand;
    }
    const r = behaltenOeffnen(g.fall.id, { nr: g.fall.nr, position: g.position });
    // Den Verlauf nur, wenn der Fall so zurückkommt, wie er ging; sonst führte Strg+Z über die Änderung eines anderen Fensters.
    if (r === "ok" && unveraendert && g.verlauf) {
      verlauf.set(g.fall.id, g.verlauf);
      aktualisiereVerlaufssignale();
    }
    return r;
  }
  nurHierWieder(g);
  return "ok";
}

/** Legt einen geschlossenen Fall wieder in dieses Fenster, als Fall nur dieses Fensters; mit `merker` als Merker im Reiter. */
function nurHierWieder(g: NonNullable<typeof geschlossen.value>, merker?: string) {
  const liste = [...faelle.value];
  liste.splice(Math.min(g.position, liste.length), 0, merker === undefined ? g.fall : { ...g.fall, etikett: merker });
  faelle.value = liste;
  aktivId.value = g.fall.id;
  setting.value = g.fall.setting;
  if (ohneBriefZu.peek().has(g.fall.id)) ohneBriefZu.value = new Set([...ohneBriefZu.peek()].filter((x) => x !== g.fall.id));
  if (g.verlauf) verlauf.set(g.fall.id, g.verlauf);
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

/**
 * Entfernt alle Fälle dieses Fensters, auch den zuletzt geschlossenen, und alle behaltenen auf diesem PC (auch die anderer
 * Fenster). Gelingt das Löschen der behaltenen nachweislich nicht, bleiben die hier offenen offen: Die Meldung sagt dann,
 * dass sie noch auf dem PC liegen (E-81).
 */
export function allesLoeschen(): { fenster: number; behalten: { anzahl: number; geloescht: boolean } } {
  const behalten = behalteneLoeschen();
  const hier = behaltenHier.peek();
  const bleiben = faelle.peek().filter((f) => hier.has(f.id));
  const fenster = faelle.peek().length - bleiben.length;
  batch(() => {
    faelle.value = bleiben;
    aktivId.value = bleiben.some((f) => f.id === aktivId.peek()) ? aktivId.peek() : null;
    sucheOffen.value = null;
    geschlossen.value = null;
    kurzFrage.value = null;
  });
  for (const id of [...verlauf.keys()]) if (!hier.has(id)) verlauf.delete(id);
  loescheFaelle();
  aktualisiereVerlaufssignale();
  return { fenster, behalten };
}

/**
 * Räumt nur dieses Fenster: Die nicht behaltenen Fälle sind gelöscht, die hier offenen behaltenen geschlossen und für andere
 * Fenster frei; auf dem PC bleiben alle behaltenen bis zu ihrem Ablauf (E-81).
 */
export function fensterRaeumen(): { fenster: number; behalten: number } {
  const hier = [...behaltenHier.peek()];
  gibFrei();
  const fenster = faelle.peek().filter((f) => !hier.includes(f.id)).length;
  batch(() => {
    behaltenHier.value = new Set();
    faelle.value = [];
    aktivId.value = null;
    sucheOffen.value = null;
    geschlossen.value = null;
    kurzFrage.value = null;
  });
  for (const id of hier) {
    bekannt.delete(id);
    geschrieben.delete(id);
  }
  verlauf.clear();
  loescheFaelle();
  aktualisiereVerlaufssignale();
  return { fenster, behalten: bestand.peek().eintraege.length };
}

/**
 * Verwirft abgelaufene Fälle: Fälle dieses Fensters nach `ABLAUF_STUNDEN` ohne Änderung, behaltene Fälle drei Tage nach
 * ihrem Beginn, auch solche, die in keinem Fenster offen sind (E-50: „regelmäßig“). Gibt die Zahl der Fälle dieses Fensters
 * zurück; gemeldet wird über `behaltenMeldung`, oder über `stehendeMeldung`, wenn der offene Fall dabei war.
 */
export function verwerfeAbgelaufene(jetzt = Date.now()): number {
  const aktivVorher = aktivId.peek();
  const vorher = bestand.peek();
  // Nicht lesbar: Die behaltenen Fälle bleiben, wie sie sind; geprüft werden nur die Fälle dieses Fensters (CR-R6-06).
  const gelesen = lese(jetzt);
  const lesbar = gelesen !== null;
  const g: Gelesen = gelesen ?? { ...liesBestand(null, jetzt), bestand: vorher };
  if (lesbar && (g.abgelaufen.length > 0 || g.verworfen > 0)) speichereBehalten(g.bestand);
  bestand.value = g.bestand;
  const hier = behaltenHier.peek();
  // Was hier offen, aber nicht mehr im Bestand ist, ist abgelaufen oder in einem anderen Fenster gelöscht; beides gilt hier ebenso.
  const nochDa = (id: string) => !lesbar || g.bestand.eintraege.some((e) => e.id === id && !eintragAbgelaufen(e, jetzt));
  const alt = faelle.value;
  const sitzungWeg = alt.filter((f) => !hier.has(f.id) && abgelaufen(f, jetzt));
  const hierWeg = alt.filter((f) => hier.has(f.id) && !nochDa(f.id));
  const vorherVon = (id: string) => vorher.eintraege.find((e) => e.id === id);
  // Abgelaufen ist, was beim Lesen eben entfallen ist oder was ein anderes Fenster schon entfernt hat und nach dem zuletzt
  // bekannten Eintrag abgelaufen wäre (CR-R6-07).
  const grundVon = (id: string): "frist" | "uhr" | null => {
    const e = vorherVon(id);
    return g.entfallen.find((x) => x.id === id)?.grund ?? (e ? ablaufGrund(e, jetzt) : null);
  };
  const hierAbgelaufen = hierWeg.filter((f) => grundVon(f.id) !== null);
  const kurzVon = (f: Fall) => g.entfallen.find((x) => x.id === f.id)?.kurz ?? vorherVon(f.id)?.kurz ?? kurzVorher(f);
  const namen = [...new Set([...g.abgelaufen, ...hierAbgelaufen.map(kurzVon)])];
  const uhr = [...new Set([...g.uhr, ...hierAbgelaufen.filter((f) => grundVon(f.id) === "uhr").map(kurzVon)])];
  for (const f of [...sitzungWeg, ...hierAbgelaufen]) ausDemFenster(f.id, true);
  const anders = hierWeg.filter((f) => !hierAbgelaufen.includes(f));
  // Ein anderes Fenster hat den Fall geholt oder geändert, und das Ereignis `storage` kam hier nicht an (Seitenspeicher des
  // Browsers, Ruhezustand): Auch das schließt die Minutenprüfung, nicht erst das nächste Schreiben (PS-R6-5, CR-R6-11).
  const fremd = alt.filter((f) => {
    if (!lesbar || !hier.has(f.id) || !nochDa(f.id)) return false;
    const e = g.bestand.eintraege.find((x) => x.id === f.id)!;
    return g.bestand.neuer || e.stand !== bekannt.get(f.id) || (e.fenster !== null && e.fenster !== FENSTER);
  });
  loeseAus(
    [
      ...anders.map((f) => ({ id: f.id, grund: "fehlt" as const, kurz: vorherVon(f.id)?.kurz ?? kurzVorher(f) })),
      ...fremd.map((f) => ({ id: f.id, grund: g.bestand.neuer ? ("neuer" as const) : ("fremd" as const), kurz: kurzVorher(f) })),
    ],
    [...ablaufSaetze(namen, uhr), ...(sitzungWeg.length > 0 ? [verworfenText(sitzungWeg.length)] : [])],
    aktivVorher,
  );
  const gz = geschlossen.value;
  if (gz && (gz.behalten ? eintragAbgelaufen(gz.behalten.eintrag, jetzt) : abgelaufen(gz.fall, jetzt))) geschlossen.value = null;
  // Gescheitertes Schreiben noch einmal versuchen, auch ohne neue Eingabe: Geht es wieder, verschwindet das Banner (H-R6-4).
  if (nichtGespeichert.peek().size > 0) schreibeBehaltene(faelle.peek(), true);
  uhrTakt.value = jetzt;
  return sitzungWeg.length;
}

/** Meldung nach dem Verwerfen von Fällen dieses Fensters nach langer Ruhe. */
export function verworfenText(n: number): string {
  return `${n} ${n === 1 ? "Fall wurde" : "Fälle wurden"} nach langer Ruhe verworfen (Notaufnahme ${ABLAUF_STUNDEN.zna} Std., Station ${ABLAUF_STUNDEN.station} Std.).`;
}

/**
 * Einstellungen gelten für alle Fenster des PCs. Gelesen werden sie beim Start, wenn ein anderes Fenster sie ändert
 * (`storage`), und frisch vor jedem Ändern und vor dem Behalten: Kam das Ereignis nicht an, schriebe dieses Fenster mit dem
 * ganzen Objekt sonst den alten Stand zurück und schaltete „Stationsfälle behalten“ still wieder ein (CR-R6-02, E-50).
 */
function frischeEinstellungen(): Einstellungen {
  const alt = einstellungen.peek();
  const neu = ladeEinstellungen(alt);
  if ((Object.keys(neu) as (keyof Einstellungen)[]).some((k) => neu[k] !== alt[k])) einstellungen.value = neu;
  return einstellungen.peek();
}

export function setzeEinstellung<K extends keyof Einstellungen>(name: K, wert: Einstellungen[K]) {
  einstellungen.value = { ...frischeEinstellungen(), [name]: wert };
}

// --- Behaltene Stationsfälle (E-50, E-67) -------------------------------------
// Eingeschaltet bleibt ein Stationsfall unter einer Kurzbezeichnung bis zu drei Tage ab Beginn auf diesem PC. Sein Inhalt liegt
// einmal in `kitteltext3.behalten`; jedes Fenster schreibt nur Fälle, die es selbst offen hat, und nur auf den Stand, den es
// kennt. Was ein anderes Fenster geändert, geholt oder gelöscht hat, schließt dieses Fenster, statt es zu überschreiben.

/** Zuletzt in diesen Fall geschriebener Stand; ein anderes Objekt im Fall heißt: neu schreiben. */
const geschrieben = new Map<string, Fall>();

/** Liest den Bestand und merkt sich, ob er lesbar war; `null`: nicht lesbar (CR-R6-06). */
function lese(jetzt: number): Gelesen | null {
  const g = ladeBehalten(jetzt);
  behaltenLesbar.value = g !== null;
  return g;
}

/** Schreiben gescheitert: Diese Fälle stehen mit dem Zeitpunkt des Stands, der auf dem PC liegt, in `nichtGespeichert`. */
function merkeUngespeichert(liste: Fall[], g: Gelesen | null) {
  const m = new Map(nichtGespeichert.peek());
  for (const f of liste) {
    if (m.has(f.id)) continue;
    const gespeichert = g?.bestand.eintraege.find((e) => e.id === f.id)?.fall as Partial<Fall> | null | undefined;
    m.set(f.id, geschrieben.get(f.id)?.geaendert ?? (typeof gespeichert?.geaendert === "number" ? gespeichert.geaendert : f.erstellt));
  }
  if (m.size !== nichtGespeichert.peek().size) nichtGespeichert.value = m;
}

function vergissUngespeichert(ids: Iterable<string>) {
  const m = new Map(nichtGespeichert.peek());
  for (const id of ids) m.delete(id);
  if (m.size !== nichtGespeichert.peek().size) nichtGespeichert.value = m;
}

/**
 * Sätze über abgelaufene behaltene Fälle: nach der Frist, oder weil die Uhr des PCs vor ihrem Beginn steht (RD-R6-8). Im
 * Zweifel wird gelöscht; die Meldung sagt dann den wahren Grund statt „nach 3 Tagen“ (CR-R6-08). `uhr` ist eine Teilmenge
 * von `namen`.
 */
function ablaufSaetze(namen: readonly string[], uhr: readonly string[]): string[] {
  const zitiert = (n: readonly string[]) => n.map((x) => `„${x}“`).join(", ");
  const frist = namen.filter((n) => !uhr.includes(n));
  const saetze: string[] = [];
  if (frist.length === 1) saetze.push(`Behaltener Fall ${zitiert(frist)} nach ${BEHALTEN_TAGE} Tagen gelöscht.`);
  else if (frist.length > 1) saetze.push(`${frist.length} behaltene Fälle nach ${BEHALTEN_TAGE} Tagen gelöscht: ${zitiert(frist)}.`);
  if (uhr.length > 0) saetze.push(`${zitiert(uhr)} gelöscht: Die Uhr dieses PCs steht vor dem Beginn ${uhr.length === 1 ? "des Falls" : "der Fälle"}.`);
  return saetze;
}

/** Kann dieses Fenster Fälle behalten? Nicht bei gesperrtem Speicher und nicht, wenn eine neuere Fassung den Bestand angelegt hat. */
export function behaltenVerfuegbar(): "ja" | "gesperrt" | "neuer" {
  if (!dauerspeicherGeht()) return "gesperrt";
  return bestand.value.neuer ? "neuer" : "ja";
}

/**
 * Stammt der Eintrag aus einer neueren Fassung, der ganze Bestand oder nur das Format seines Falls? Dann wird er gelistet,
 * läuft ab und lässt sich löschen, aber diese Fassung öffnet ihn nie (CR-R6-03).
 */
export function ausNeuererFassung(e: Eintrag, b: Bestand = bestand.peek()): boolean {
  return b.neuer || e.fallFormat > SITZUNG_FORMAT;
}

/** Der Fall eines Eintrags auf dem heutigen Aufbau, gelesen mit seinem Formatstand; null aus einer neueren Fassung oder unlesbar. */
export function fallAusEintrag(e: Eintrag, b: Bestand = bestand.peek()): Fall | null {
  return ausNeuererFassung(e, b) ? null : ergaenzt(e.fall, INDEX, e.fallFormat);
}

export function istBehalten(id: string): boolean {
  return behaltenHier.value.has(id);
}

export function eintragVon(id: string): Eintrag | undefined {
  return bestand.value.eintraege.find((e) => e.id === id);
}

/** Was im Reiter und in Meldungen hinter dem Fall steht: bei einem behaltenen die Kurzbezeichnung, sonst der Merker. */
export function merkerVon(f: Fall): string {
  return (behaltenHier.value.has(f.id) ? eintragVon(f.id)?.kurz : undefined) ?? f.etikett.trim();
}

function setzeBestand(b: Bestand): boolean {
  if (!speichereBehalten(b)) return false;
  bestand.value = b;
  return true;
}

export type BehaltenErgebnis = "ok" | "leer" | "doppelt" | "aus" | "station" | "gesperrt" | "neuer" | "zu-alt" | "fremd";

/** Behält einen offenen Stationsfall unter einer Kurzbezeichnung; ist er schon behalten, ändert es die Kurzbezeichnung. */
export function fallBehalten(id: string, kurzRoh: string, jetzt = Date.now()): BehaltenErgebnis {
  const f = faelle.value.find((x) => x.id === id);
  const kurz = kurzBereinigt(kurzRoh);
  if (!kurz) return "leer";
  if (behaltenHier.peek().has(id)) return kurzAendern(id, kurz, jetzt);
  if (!f || f.setting !== "station") return "station";
  if (!frischeEinstellungen().stationBehalten) return "aus";
  if (!dauerspeicherGeht()) return "gesperrt";
  const g = lese(jetzt);
  if (!g) return "gesperrt";
  if (g.bestand.neuer) return "neuer";
  if (g.bestand.eintraege.some((e) => e.id === id)) return "fremd";
  if (kurzVergeben(kurz, g.bestand.eintraege)) return "doppelt";
  const e: Eintrag = { id, kurz, erstellt: f.erstellt, loeschenAb: loeschzeit(f.erstellt), stand: 1, fenster: FENSTER, fall: f, fallFormat: SITZUNG_FORMAT };
  if (eintragAbgelaufen(e, jetzt)) return "zu-alt";
  if (!setzeBestand({ ...g.bestand, eintraege: [...g.bestand.eintraege, e] })) return "gesperrt";
  bekannt.set(id, e.stand);
  geschrieben.set(id, f);
  behaltenHier.value = new Set([...behaltenHier.peek(), id]);
  return "ok";
}

function kurzAendern(id: string, kurz: string, jetzt: number): BehaltenErgebnis {
  const g = lese(jetzt);
  if (!g) return "gesperrt";
  const e = g.bestand.eintraege.find((x) => x.id === id);
  if (!e || g.bestand.neuer || e.stand !== bekannt.get(id) || (e.fenster !== null && e.fenster !== FENSTER)) return "fremd";
  if (kurzVergeben(kurz, g.bestand.eintraege, id)) return "doppelt";
  const neu = { ...e, kurz, stand: e.stand + 1, fenster: FENSTER };
  if (!setzeBestand({ ...g.bestand, eintraege: g.bestand.eintraege.map((x) => (x === e ? neu : x)) })) return "gesperrt";
  bekannt.set(id, neu.stand);
  return "ok";
}

export type OeffnenErgebnis = "ok" | "fehlt" | "neuer" | "unlesbar" | "gesperrt";

/**
 * Öffnet einen behaltenen Fall in diesem Fenster. Ist er in einem anderen offen, geht er hierher: Das andere Fenster schließt
 * ihn, sobald es davon erfährt. Die Fallnummer ist die nächste dieses Fensters, damit Alt+Ziffer eindeutig bleibt.
 */
export function behaltenOeffnen(id: string, wie: { nr?: number; position?: number } = {}): OeffnenErgebnis {
  if (behaltenHier.peek().has(id)) {
    fallWaehlen(id);
    return "ok";
  }
  const g = lese(Date.now());
  if (!g) return "gesperrt";
  bestand.value = g.bestand;
  const e = g.bestand.eintraege.find((x) => x.id === id);
  if (!e) return "fehlt";
  if (ausNeuererFassung(e, g.bestand)) return "neuer";
  const roh = fallAusEintrag(e, g.bestand);
  if (!roh || roh.id !== id || roh.setting !== "station") return "unlesbar";
  const geholt = { ...e, stand: e.stand + 1, fenster: FENSTER };
  if (!setzeBestand({ ...g.bestand, eintraege: g.bestand.eintraege.map((x) => (x === e ? geholt : x)) })) return "gesperrt";
  bekannt.set(id, geholt.stand);
  if (roh.katalog !== KATALOG.version) katalogGeaendert.value++;
  const fall = { ...nachKatalogwechsel(roh, INDEX), nr: wie.nr ?? ++zaehler };
  const liste = faelle.value.filter((f) => f.id !== id);
  liste.splice(Math.min(wie.position ?? liste.length, liste.length), 0, fall);
  batch(() => {
    behaltenHier.value = new Set([...behaltenHier.peek(), id]);
    faelle.value = liste;
    aktivId.value = id;
    setting.value = "station";
    sucheOffen.value = null;
    if (ohneBriefZu.peek().has(id)) ohneBriefZu.value = new Set([...ohneBriefZu.peek()].filter((x) => x !== id));
  });
  historie(id).gruppe = null;
  aktualisiereVerlaufssignale();
  return "ok";
}

/** Löscht einen behaltenen Fall vom PC, auch wenn er gerade in einem anderen Fenster offen ist. Hier offen: wird geschlossen. */
export function behaltenLoeschen(id: string): boolean {
  const g = lese(Date.now());
  if (!g) return false;
  const b = { ...g.bestand, eintraege: g.bestand.eintraege.filter((e) => e.id !== id) };
  if (!setzeBestand(b)) return false;
  if (geschlossen.value?.fall.id === id) geschlossen.value = null;
  ausDemFenster(id, true);
  return true;
}

/**
 * Löscht alle behaltenen Fälle vom PC und schließt die hier offenen. Gezählt wird, was jetzt auf dem PC liegt, auch in
 * anderen Fenstern; `geloescht` nur, wenn der Eintrag danach nachweislich weg ist. Sonst bleibt hier alles offen.
 */
export function behalteneLoeschen(): { anzahl: number; geloescht: boolean } {
  const anzahl = (lese(Date.now())?.bestand ?? bestand.peek()).eintraege.length;
  if (!loescheBehaltene()) {
    bestand.value = lese(Date.now())?.bestand ?? bestand.peek();
    return { anzahl, geloescht: false };
  }
  bestand.value = { ...LEERER_BESTAND, eintraege: [] };
  for (const id of [...behaltenHier.peek()]) ausDemFenster(id, true);
  if (geschlossen.value?.behalten) geschlossen.value = null;
  return { anzahl, geloescht: true };
}

/**
 * Schaltet „Stationsfälle behalten“ aus. Mit `loeschen` gehen alle behaltenen Fälle sofort; ohne bleiben die vorhandenen bis
 * zu ihrem Ablauf (Liste und Löschen auf der Startseite bleiben), neue kommen nicht hinzu.
 */
export function behaltenAusschalten(loeschen: boolean): { anzahl: number; geloescht: boolean } {
  setzeEinstellung("stationBehalten", false);
  if (kurzFrage.value?.anlass !== "aendern") kurzFrage.value = null;
  return loeschen ? behalteneLoeschen() : { anzahl: bestand.peek().eintraege.length, geloescht: false };
}

type Grund = "fehlt" | "fremd" | "notaufnahme" | "neuer" | "frist" | "uhr";
interface Weg {
  id: string;
  grund: Grund;
  kurz: string;
  /** nur bei „fremd“ nach einer Eingabe hier: die Stellen, die dort fehlen (MT-R6-07); leer, wenn unbekannt */
  verloren?: string[];
}

/**
 * Ein Fall dieses Fensters ist woanders geändert, geholt oder gelöscht worden oder abgelaufen: Er geht hier zu, ohne dass ein
 * anderer Fall aktiv wird. War er der offene, bleibt die Meldung stehen (PS-R6-1); sonst steht sie in der Meldungszeile.
 */
function loeseAus(weg: Weg[], vorab: string[] = [], aktivVorher: string | null = aktivId.peek(), nachsatz = "") {
  const namen = (...gruende: Grund[]) => weg.filter((w) => gruende.includes(w.grund)).map((w) => `„${w.kurz}“`);
  const viele = (n: string[]) => n.length > 1;
  const saetze = [...vorab];
  const fremd = namen("fremd");
  const fehlt = namen("fehlt");
  const zna = namen("notaufnahme");
  saetze.push(...ablaufSaetze(weg.filter((w) => w.grund === "frist" || w.grund === "uhr").map((w) => w.kurz), weg.filter((w) => w.grund === "uhr").map((w) => w.kurz)));
  if (fremd.length > 0) saetze.push(`${fremd.join(", ")} ${viele(fremd) ? "sind" : "ist"} jetzt in einem anderen Fenster geöffnet und hier geschlossen.`);
  const verloren = weg.filter((w) => w.grund === "fremd" && w.verloren);
  if (verloren.length === 1) {
    const stellen = verloren[0].verloren!;
    saetze.push(`Deine letzte Eingabe${stellen.length > 0 ? ` (${aufzaehlen(stellen)})` : ""} fehlt dort: dort prüfen und neu setzen.`);
  } else if (verloren.length > 1) {
    saetze.push(`Deine letzten Eingaben in ${verloren.map((w) => `„${w.kurz}“`).join(", ")} fehlen dort: dort prüfen und neu setzen.`);
  }
  if (fehlt.length > 0) saetze.push(`${fehlt.join(", ")} ${viele(fehlt) ? "wurden" : "wurde"} in einem anderen Fenster gelöscht und ${viele(fehlt) ? "sind" : "ist"} hier geschlossen.`);
  if (namen("neuer").length > 0) saetze.push("Eine neuere Fassung von Kitteltext hat die behaltenen Fälle geändert; sie sind hier geschlossen. Mit der neueren Fassung weiterarbeiten.");
  if (zna.length > 0) {
    // Die Kurzbezeichnung bleibt als Merker, damit der Reiter den Fall weiter erkennbar nennt (PS-R6-7, E-83).
    const gekuerzt = weg.filter((w) => w.grund === "notaufnahme" && merkerAusKurz(w.kurz) !== kurzBereinigt(w.kurz)).map((w) => `„${merkerAusKurz(w.kurz)}“`);
    saetze.push(
      viele(zna)
        ? `${zna.join(", ")} sind jetzt Notaufnahmefälle und werden nicht mehr behalten, nur noch in diesem Fenster. Die Kurzbezeichnungen bleiben als Merker${gekuerzt.length > 0 ? `, gekürzt: ${gekuerzt.join(", ")}` : ""}.`
        : `${zna[0]} ist jetzt ein Notaufnahmefall und wird nicht mehr behalten, nur noch in diesem Fenster. Die Kurzbezeichnung bleibt als Merker${gekuerzt.length > 0 ? `, gekürzt: ${gekuerzt[0]}` : ""}.`,
    );
  }
  for (const w of weg) {
    if (w.grund === "notaufnahme") {
      behaltenHier.value = new Set([...behaltenHier.peek()].filter((x) => x !== w.id));
      bekannt.delete(w.id);
      geschrieben.delete(w.id);
      const merker = merkerAusKurz(w.kurz);
      faelle.value = faelle.peek().map((f) => (f.id === w.id ? { ...f, etikett: merker } : f));
    } else ausDemFenster(w.id, true);
  }
  if (saetze.length === 0) return;
  if (nachsatz) saetze.push(nachsatz);
  const text = saetze.join(" ");
  if (aktivVorher !== null && !faelle.peek().some((f) => f.id === aktivVorher)) meldeStehend(text, "warnung");
  else behaltenMeldung.value = { text, art: "warnung" };
}

/**
 * Warum ein hier offener Fall im Bestand fehlt: abgelaufen (nach dem zuletzt bekannten Eintrag), sonst in einem anderen
 * Fenster gelöscht. Ein anderes Fenster vollzieht den Ablauf oft zuerst; dann heißt es hier nicht „gelöscht“ (CR-R6-07).
 */
function grundFehlt(id: string, jetzt: number, g: Gelesen): Grund {
  const vorher = bestand.peek().eintraege.find((e) => e.id === id);
  return g.entfallen.find((x) => x.id === id)?.grund ?? (vorher && ablaufGrund(vorher, jetzt)) ?? "fehlt";
}

/**
 * Schreibt jeden hier offenen behaltenen Fall, der sich seit dem letzten Schreiben geändert hat; `nochmal` auch die, deren
 * letztes Schreiben gescheitert ist (Minutenprüfung).
 */
function schreibeBehaltene(liste: Fall[], nochmal = false) {
  const hier = behaltenHier.peek();
  const offen = nichtGespeichert.peek();
  const neu = liste.filter((f) => hier.has(f.id) && (geschrieben.get(f.id) !== f || (nochmal && offen.has(f.id))));
  if (neu.length === 0) return;
  const jetzt = Date.now();
  const g = lese(jetzt);
  if (!g) {
    merkeUngespeichert(neu, null);
    return;
  }
  const weg: Weg[] = [];
  let eintraege = g.bestand.eintraege;
  const neuStand = new Map<string, number>();
  for (const f of neu) {
    const e = eintraege.find((x) => x.id === f.id);
    const kurz = e?.kurz ?? kurzVorher(f);
    if (g.bestand.neuer) weg.push({ id: f.id, grund: "neuer", kurz });
    else if (!e) weg.push({ id: f.id, grund: grundFehlt(f.id, jetzt, g), kurz });
    else if (e.stand !== bekannt.get(f.id) || (e.fenster !== null && e.fenster !== FENSTER)) weg.push({ id: f.id, grund: "fremd", kurz, verloren: verloreneStellen(f) });
    else if (f.setting !== "station") {
      eintraege = eintraege.filter((x) => x !== e);
      weg.push({ id: f.id, grund: "notaufnahme", kurz });
    } else {
      const n = { ...e, fall: f, fallFormat: SITZUNG_FORMAT, stand: e.stand + 1, fenster: FENSTER };
      eintraege = eintraege.map((x) => (x === e ? n : x));
      neuStand.set(f.id, n.stand);
    }
  }
  const b = { ...g.bestand, eintraege };
  if (b.eintraege !== g.bestand.eintraege || g.abgelaufen.length > 0) {
    if (speichereBehalten(b)) {
      for (const [id, st] of neuStand) bekannt.set(id, st);
      for (const f of neu) if (neuStand.has(f.id)) geschrieben.set(f.id, f);
      bestand.value = b;
      vergissUngespeichert(neuStand.keys());
    } else {
      bestand.value = g.bestand;
      // Kein einmaliger Hinweis mehr, sondern ein Zustand: Banner und Kopie im Sitzungsspeicher, bis das Schreiben gelingt.
      merkeUngespeichert(neu.filter((f) => neuStand.has(f.id)), g);
    }
  }
  // Nach dem Zeichnen: Ein Fall verschwindet nicht mitten aus der Änderung, die ihn eben geschrieben hätte.
  if (weg.length > 0) queueMicrotask(() => loeseAus(weg));
}

/** Was sich seit dem letzten Schreiben geändert hat und im anderen Fenster deshalb fehlt, als Namen der Stellen. */
function verloreneStellen(f: Fall): string[] {
  const alt = geschrieben.get(f.id);
  if (!alt) return [];
  const art = { listen: einstellungen.peek().listen };
  return geaenderteNamen(alt, f, (x) => renderBrief(x, INDEX, art));
}

/** Ein anderes Fenster hat geschrieben: Liste neu lesen und schließen, was hier nicht mehr gilt. */
function behaltenNeuGelesen(nachsatz = "") {
  const jetzt = Date.now();
  const g = lese(jetzt);
  // Nicht lesbar ist kein Zeichen, dass ein anderes Fenster etwas geändert hat: nichts schließen (CR-R6-06).
  if (!g) return;
  if (g.abgelaufen.length > 0) speichereBehalten(g.bestand);
  const weg: Weg[] = [];
  for (const id of behaltenHier.peek()) {
    const e = g.bestand.eintraege.find((x) => x.id === id);
    const kurz = e?.kurz ?? kurzVorher({ id, etikett: "" });
    if (g.bestand.neuer) weg.push({ id, grund: "neuer", kurz });
    else if (!e) weg.push({ id, grund: grundFehlt(id, jetzt, g), kurz });
    else if (e.stand !== bekannt.get(id) || (e.fenster !== null && e.fenster !== FENSTER)) weg.push({ id, grund: "fremd", kurz });
  }
  bestand.value = g.bestand;
  if (weg.length > 0) loeseAus(weg, [], aktivId.peek(), nachsatz);
}

/**
 * Vor dem Kopieren aus einem behaltenen Fall (PS-R6-5): Gehört er noch diesem Fenster, mit dem Stand, den es zuletzt
 * gelesen hat, und ist er nicht abgelaufen? Kam das Ereignis `storage` nicht an (Seitenspeicher des Browsers, Ruhezustand,
 * ein nicht geprüfter Browser), zeigte das Fenster sonst einen alten Stand und kopierte ihn, und erst das Schreiben des
 * Kopiervermerks bemerkte es. Gilt der Fall nicht mehr, schließt ihn das Fenster mit Meldung, und es wird nichts kopiert.
 * Fälle, die nicht behalten sind, gelten immer.
 */
export function behaltenNochHier(id: string): boolean {
  if (!behaltenHier.peek().has(id)) return true;
  const g = lese(Date.now());
  // Nicht lesbar: Dann kann auch kein anderes Fenster den Eintrag geändert haben; was hier steht, ist der Stand (CR-R6-06).
  if (!g) return true;
  const e = g.bestand.eintraege.find((x) => x.id === id);
  if (!g.bestand.neuer && e && e.stand === bekannt.get(id) && (e.fenster === null || e.fenster === FENSTER)) return true;
  behaltenNeuGelesen("Nichts kopiert.");
  return false;
}

/**
 * Zurück aus dem Seitenspeicher des Browsers („Zurück“ ohne Neuladen): Beim Verlassen hat das Fenster seine behaltenen Fälle
 * freigegeben (`gibFrei`); hat sie inzwischen niemand genommen, gehören sie wieder ihm. Was ein anderes Fenster genommen oder
 * geändert hat, schließt danach die Prüfung (`verwerfeAbgelaufene`) (CR-R6-11).
 */
export function nimmFreigegebeneZurueck() {
  const hier = behaltenHier.peek();
  if (hier.size === 0) return;
  const g = lese(Date.now());
  if (!g || g.bestand.neuer) return;
  const frei = (e: Eintrag) => hier.has(e.id) && e.fenster === null && e.stand === bekannt.get(e.id);
  if (!g.bestand.eintraege.some(frei)) return;
  const b = { ...g.bestand, eintraege: g.bestand.eintraege.map((e) => (frei(e) ? { ...e, fenster: FENSTER } : e)) };
  if (speichereBehalten(b)) bestand.value = b;
}

/** Kurzbezeichnung aus dem zuletzt bekannten Bestand, für Meldungen über einen Eintrag, den es nicht mehr gibt. */
function kurzVorher(f: Pick<Fall, "id" | "etikett">): string {
  return bestand.peek().eintraege.find((e) => e.id === f.id)?.kurz ?? (f.etikett.trim() || "ohne Kurzbezeichnung");
}

/** Beim Schließen oder Neuladen: Die hier offenen Fälle sind für andere Fenster frei. Der Stand bleibt, damit ein Neuladen sie wieder nimmt. */
function gibFrei() {
  const hier = behaltenHier.peek();
  if (hier.size === 0) return;
  const g = lese(Date.now());
  if (!g || g.bestand.neuer) return;
  const b = { ...g.bestand, eintraege: g.bestand.eintraege.map((e) => (hier.has(e.id) && e.fenster === FENSTER && e.stand === bekannt.get(e.id) ? { ...e, fenster: null } : e)) };
  if (speichereBehalten(b)) bestand.value = b;
}

/** Für die Tests: was das Fenster beim Schließen täte, und was es täte, wenn ein anderes Fenster geschrieben hat. */
export const fuerTests = { gibFrei, behaltenNeuGelesen };

// --- Persistenz -----------------------------------------------------------

/** false, wenn der Browser das Speichern verweigert; die Oberfläche weist dann darauf hin. */
export const speichernMoeglich = signal(true);

effect(() => {
  speichereEinstellungen(einstellungen.value);
});

effect(() => {
  // Behaltene Fälle stehen hier nur mit Kennung; ihr Inhalt liegt einmal auf dem PC, nicht zusätzlich in jedem Fenster.
  const hier = behaltenHier.value;
  const liste = faelle.value;
  const offen = nichtGespeichert.value;
  speichernMoeglich.value = speichereSitzung({
    faelle: liste.filter((f) => !hier.has(f.id)),
    // Ausnahme: Ist das Schreiben auf den PC gescheitert, übersteht der Stand dieses Fensters so wenigstens das Neuladen (CR-R6-01).
    ungespeichert: liste.filter((f) => hier.has(f.id) && offen.has(f.id)).map((f) => ({ fall: f, stand: bekannt.get(f.id) ?? 0 })),
    aktivId: aktivId.value,
    zaehler,
    fenster: FENSTER,
    behalten: liste.filter((f) => hier.has(f.id)).map((f) => f.id),
    reihenfolge: liste.map((f) => f.id),
  });
});

effect(() => {
  behaltenHier.value;
  schreibeBehaltene(faelle.value);
});

// Ein behaltener Fall, der hier nicht offen ist und vom PC verschwindet (Ablauf, in einem anderen Fenster gelöscht), geht
// ebenso ohne den Brief vor Augen: Auch sein Auszug unter „Zuletzt kopiert“ geht mit (CR-R6-09).
let bisherBehalten = new Set(bestand.peek().eintraege.map((e) => e.id));
effect(() => {
  const jetzt = new Set(bestand.value.eintraege.map((e) => e.id));
  const offen = new Set(faelle.peek().map((f) => f.id));
  const weg = [...bisherBehalten].filter((id) => !jetzt.has(id) && !offen.has(id));
  bisherBehalten = jetzt;
  if (weg.length > 0) ohneBriefZu.value = new Set([...ohneBriefZu.peek(), ...weg]);
});

beiFremderAenderung(behaltenNeuGelesen);
beiFremdenEinstellungen(frischeEinstellungen);
beimVerlassen(gibFrei);

effect(() => {
  const modus = einstellungen.value.farbmodus;
  const root = document.documentElement;
  if (modus === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", modus === "hell" ? "light" : "dark");
});
