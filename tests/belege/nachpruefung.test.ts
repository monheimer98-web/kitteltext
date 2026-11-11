// Nachprüfung der Befunde P-01 bis P-29 aus dem Prüfbericht Patientensicherheit
// vom 07.10.2026, am echten Katalog. Grün heißt: Der damalige Weg ist
// verschlossen. Rot heißt: Der Befund oder ein Rest davon ist offen.
// Start: node --test "tests/belege/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import { INDEX, NICHT, aktionen, aktiv, ansicht, brief, fallOps, fenster, frisch, grau, klaereAlles, kopiertes, letzter, render, store, token, vorlage, zwischenablage } from "./geschirr.ts";
import { meldung } from "../../src/ui/kopieren.ts";
import type { Baustein, Vorlage } from "../../src/model/types.ts";

const OSG = "zna-osg-distorsion";

/** Ein OSG-Fall, in dem jede Lücke geklärt und jeder Vorschlag übernommen ist. */
function osgFertig(seite: "rechts" | "links" = "rechts") {
  store.fallNeu(vorlage(OSG), seite);
  store.aendere((f) => fallOps.mitPerson(f, "w", "34"));
  klaereAlles();
}

// --- hoch ------------------------------------------------------------------------

test("P-01: Kopierdrücke in Fall 1 machen in Fall 2 nichts kopierbar", async () => {
  frisch();
  store.fallNeu(vorlage(OSG), "rechts");
  await aktionen.kopiereAbschnitt(ansicht("befund"));
  await aktionen.kopiereAlles();
  store.fallNeu(vorlage(OSG), "links");
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("befund")), false);
  assert.equal(await aktionen.kopiereAlles(), false);
  assert.ok(!kopiertes().some((t) => /Reizlos|Druckschmerz/.test(t)), "kein Befundtext in der Zwischenablage");
  assert.deepEqual(aktiv().befund, {}, "nichts gilt als bestätigt");
});

test("P-02: Handtext mit Lückenzeichen bleibt gesperrt (der Knopf selbst ist nur für fertige Abschnitte frei: Brief.tsx)", async () => {
  frisch();
  store.fallNeu(vorlage(OSG));
  const text = ansicht("anamnese").text;
  assert.match(text, /‹Unfallhergang›/);
  store.aendere((f) => fallOps.mitManuell(f, "anamnese", text));
  assert.equal(ansicht("anamnese").fertig, false);
  assert.ok(ansicht("anamnese").offen >= 8);
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("anamnese")), false);
  assert.deepEqual(kopiertes(), []);
});

test("P-03: kein Befund-Baustein des Katalogs trägt eine Befundaussage als festen Text", () => {
  const fund: string[] = [];
  for (const r of INDEX.katalog.regionen) {
    for (const b of r.bausteine) {
      if (!["befund", "entlassbefund"].includes(render.abschnittVon(b))) continue;
      // Fester Text darf Überschrift und Satzbau sein: höchstens drei Wörter und kein Satzende.
      for (const s of b.segmente) if (s.art === "text" && (/[.!?]\s*$/.test(s.text.trim()) || s.text.trim().split(/\s+/).length > 4) && /\p{L}{3,}/u.test(s.text)) fund.push(`${b.id}: „${s.text.trim()}“`);
    }
  }
  assert.deepEqual(fund, []);
});

test("P-04: eigene Vorlage trägt keine Antwort eines Patienten weiter", () => {
  frisch();
  osgFertig("rechts");
  store.aendere((f) => fallOps.mitOption(f, "ana-trauma/kopf", true));
  assert.match(ansicht("anamnese").text, /Gerinnungshemmende Medikamente: keine\./);
  assert.match(ansicht("anamnese").text, /Arbeitsunfall: nein\./);
  assert.equal(store.eigeneVorlageSpeichern("Mein OSG"), true);
  const v = store.eigenes.value.vorlagen[0];
  assert.deepEqual(Object.keys(v.vorgaben ?? {}).sort(), ["an", "aus"]);
  store.fallNeu(INDEX.vorlagen.get(v.id), "links");
  store.aendere((f) => fallOps.mitPerson(f, "w", "71"));
  const ana = ansicht("anamnese");
  assert.match(ana.text, /Gerinnungshemmende Medikamente: ‹Gerinnungshemmung›/);
  assert.match(ana.text, /Arbeitsunfall: ‹Arbeitsunfall›/);
  assert.match(ansicht("diagnostik").text, /‹Röntgenbefund›/);
  // Der zugewählte Satz kommt mit, aber nur als Vorschlag.
  assert.equal(token("ana-trauma/kopf")?.zustand, "vorschlag");
  assert.deepEqual([aktiv().slots, aktiv().auswahl, aktiv().befund, aktiv().werte], [{}, {}, {}, {}]);
  assert.equal(brief().abschnitte.filter((a) => !a.leer && a.id !== "diagnose").every((a) => !a.fertig), true);
});

test("P-05 (Mechanik): eigener Baustein ist in jedem Fall zuerst ein Vorschlag und folgt der Seite", async () => {
  frisch();
  assert.equal(store.eigenenBausteinSpeichern("Mein OSG-Befund", "befund", "Oberes Sprunggelenk {seite}: Reizlos geschlossene Weichteile."), true);
  const id = store.eigeneBausteinId(store.eigenes.value.bausteine[0].id);
  store.fallNeu(vorlage("zna-frei"), "links");
  store.aendere((f) => fallOps.mitBaustein(f, id, INDEX, "befund"));
  assert.equal(ansicht("befund").text, "Oberes Sprunggelenk links: Reizlos geschlossene Weichteile.");
  assert.equal(ansicht("befund").fertig, false);
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("befund")), false);
  assert.deepEqual(kopiertes(), []);
});

test("P-05 (Rest): die Vorbelegung des Speicherformulars enthält keinen Befund und keine Angabe des Patienten", () => {
  frisch();
  osgFertig("rechts");
  // Patient A: Schwellung auffällig mit gewähltem Ort.
  store.aendere((f) => fallOps.mitBefund(f, "osg-untersuchung/osg_schwellung", "abw"));
  const seg = INDEX.bausteine.get("osg-untersuchung")!.segmente.find((s) => "id" in s && s.id === "osg_schwellung");
  assert.ok(seg && seg.art === "befund");
  for (const sl of seg.slots ?? []) if (sl.art === "auswahl") store.aendere((f) => fallOps.mitSlot(f, `osg-untersuchung/osg_schwellung/${sl.id}`, String(sl.optionen.findIndex((o) => o !== ""))));
  const auffaellig = token("osg-untersuchung/osg_schwellung")!.t.trim();
  // Genau der Ausdruck aus Brief.tsx (EigenSpeichern), mit dem das Textfeld vorbelegt wird.
  const fall = aktiv();
  const ohnePatient = { ...fall, werte: {}, eigen: {}, zusatz: {}, manuell: {}, spaeter: {}, alter: "", seiteBaustein: {} };
  const vorbelegt = render.renderAbschnitt("befund", "Befund", ohnePatient, INDEX).text.replace(/\brechts\b/g, "{seite}");
  assert.ok(!vorbelegt.includes("‹"), "ohne Lückenzeichen, also ohne weitere Handlung speicherbar");
  assert.ok(!vorbelegt.includes(auffaellig), `der auffällige Befund von Patient A steht im vorbelegten Text: „${auffaellig}“`);
});

test("P-06: ungewählte Auswahl in Therapie, Procedere, Diagnostik geht nicht hinaus; Finger und Thromboseprophylaxe sind Lücken", async () => {
  frisch();
  store.fallNeu(vorlage(OSG), "rechts");
  assert.equal(token("osg-procedere/osg_thrombose")?.zustand, "offen");
  assert.equal(await aktionen.kopiereAbschnitt(ansicht("procedere")), false);
  store.fallNeu(vorlage("zna-schnittverletzung-d1"), "rechts");
  const finger = brief().abschnitte.flatMap((a) => a.tokens).filter((t) => t.label === "betroffener Finger" || t.label === "Finger");
  assert.ok(finger.length > 0);
  assert.ok(finger.every((t) => t.zustand === "offen"), "kein Finger ist vorgewählt");
  assert.deepEqual(kopiertes(), []);
  // Kein Halt wird übersprungen: F2 endet erst, wenn nichts mehr offen oder grau ist.
  assert.equal(aktionen.naechsteStelle(), true);
});

test("P-07: achtmal Strg+Enter kopiert nur, was fertig ist, und bestätigt keinen Befund", async () => {
  frisch();
  store.fallNeu(vorlage(OSG), "rechts");
  for (let i = 0; i < 8; i++) {
    await aktionen.kopiereNaechsten();
    fenster.blur?.();
  }
  assert.deepEqual(kopiertes(), ["Distorsion des oberen Sprunggelenks rechts"]);
  assert.deepEqual(aktiv().befund, {});
  assert.match(letzter(), NICHT);
});

test("P-08: ein Kopierbefehl, der nichts kopiert, lässt den Brief des vorigen Patienten nicht in der Zwischenablage", async () => {
  frisch();
  osgFertig("rechts");
  assert.equal(await aktionen.kopiereAlles(), true);
  assert.match(letzter(), /Die 34-jährige Patientin/);
  store.fallNeu(vorlage(OSG), "links");
  assert.equal(await aktionen.kopiereAlles(), false);
  assert.match(letzter(), NICHT);
  assert.match(meldung.value?.text ?? "", /Nicht kopiert/);
});

// --- mittel ----------------------------------------------------------------------

function kopierEreignis(auswahl: string, beruehrt: boolean) {
  const daten: Record<string, string> = {};
  const el = {};
  Object.assign(window, { getSelection: () => ({ toString: () => auswahl, containsNode: () => beruehrt }) });
  const e = { currentTarget: { querySelectorAll: () => [el] }, clipboardData: { setData: (art: string, t: string) => (daten[art] = t) }, preventDefault() {} };
  aktionen.beiKopieAusBrief(e as unknown as ClipboardEvent);
  Object.assign(window, { getSelection: () => null });
  return daten["text/plain"];
}

test("P-09: Markierung, die eine graue oder offene Stelle berührt, kopiert nur den Hinweis; sonst den umgeschriebenen Text", () => {
  frisch();
  assert.match(kopierEreignis("Oberes Sprunggelenk rechts: Reizlos", true), NICHT);
  assert.equal(kopierEreignis("Wunde ≥ 3 cm – genäht", false), "Wunde >= 3 cm - genäht");
});

test("P-10: kein Befund schreibt nach „auffällig“ einen Normalbefund; FAST und rektale Untersuchung sind zuwählbare Sätze", () => {
  const fund: string[] = [];
  for (const r of INDEX.katalog.regionen) for (const b of r.bausteine) for (const s of b.segmente) {
    if (s.art === "befund" && !s.normal.trim() && /^\s*(unauffällig|kein|keine|ohne|regelrecht|intakt)\b/i.test(s.abweichung)) fund.push(`${b.id}/${s.id}`);
    if ("id" in s && ["bc_fast", "abd_rektal"].includes(s.id)) assert.equal(s.art, "option");
  }
  assert.deepEqual(fund, []);
});

test("P-11: die Seite des Falls zu ändern lässt die abweichende Seite eines Bausteins stehen", () => {
  frisch();
  store.fallNeu(vorlage(OSG), "rechts");
  const roentgen = aktiv().bausteine.diagnostik![0];
  store.aendere((f) => fallOps.mitSeite(f, "links", roentgen));
  store.aendere((f) => fallOps.mitSeite(f, "beidseits"));
  assert.equal(aktiv().seiteBaustein[roentgen], "links");
  assert.match(ansicht("diagnostik").text, / links /);
  assert.match(ansicht("befund").text, /^Oberes Sprunggelenk beidseits/);
});

test("P-12: ein ausgeschriebenes Seitenwort in freiem Text, das der Fallseite widerspricht, wird gemeldet", () => {
  frisch();
  store.fallNeu(vorlage(OSG), "rechts");
  store.aendere((f) => fallOps.mitZusatz(f, "therapie", "Unterarmgipsschiene links angelegt."));
  assert.equal(ansicht("therapie").seitenkonflikt, "links");
});

test("P-12 (Rest): auch die übliche Kurzform „li.“ wird als widersprechende Seite erkannt", () => {
  frisch();
  store.fallNeu(vorlage(OSG), "rechts");
  store.aendere((f) => fallOps.mitZusatz(f, "therapie", "Sprunggelenkorthese li. angelegt."));
  assert.notEqual(ansicht("therapie").seitenkonflikt, null);
});

test("P-13: Vorlagen für Kopf, Halswirbelsäule, Lendenwirbelsäule und Ganzkörper verlangen keine Seite", () => {
  for (const id of ["zna-schaedel-hirn-trauma", "zna-hws-distorsion", "zna-lws-prellung", "zna-lumbago", "zna-kopfplatzwunde", "zna-body-check-trauma", "zna-ganzkoerper-normalbefund", "station-commotio-ueberwachung"]) {
    const v = vorlage(id);
    const b = render.renderBrief(fallOps.mitPerson(fallOps.mitVorlage(fallOps.neuerFall(v.setting, INDEX), v, INDEX), "m", "50"), INDEX);
    assert.equal(b.seiteFehlt, false, id);
  }
});

test("P-14: Messwerte stehen nur mit eingetragenem Wert im Brief; ein geleertes Feld bringt nichts zurück", () => {
  frisch();
  store.fallNeu(vorlage("zna-kniedistorsion"), "rechts");
  const k = "knie-untersuchung/knie_extflex";
  assert.equal(token(k), undefined);
  store.aendere((f) => fallOps.mitWert(f, k, "0/0/120"));
  assert.equal(token(k)?.t, "0/0/120");
  store.aendere((f) => fallOps.mitWert(f, k, ""));
  assert.equal(token(k), undefined);
});

test("P-14 (Rest): kein Normalbefund trägt einen Skalenwert, der gemessen sein müsste (Glasgow Coma Scale, Kraftgrad)", () => {
  const fund: string[] = [];
  for (const r of INDEX.katalog.regionen) for (const b of r.bausteine) for (const s of b.segmente) if (s.art === "befund" && /Glasgow Coma Scale \d|\b\d\/5\b/.test(s.normal)) fund.push(`${b.id}/${s.id}: „${s.normal.trim()}“`);
  assert.deepEqual(fund, []);
});

test("P-15: Fallnummern bleiben; „Zuletzt kopiert“ nennt weiter den richtigen Fall", async () => {
  frisch();
  osgFertig("rechts");
  const eins = aktiv();
  osgFertig("rechts");
  const zwei = aktiv();
  store.aendere((f) => ({ ...f, etikett: "Kabine 2" }));
  await aktionen.kopiereAbschnitt(ansicht("diagnose"));
  store.fallSchliessen(eins.id);
  assert.equal(aktiv().nr, zwei.nr);
  assert.equal(aktionen.letzteKopie.value?.fall, `Fall ${zwei.nr} · OSG-Distorsion re. · Kabine 2`);
});

test("P-16: ein Fall der Notaufnahme verfällt nach 4 Stunden ohne Änderung auch bei offenem Fenster", () => {
  frisch();
  store.fallNeu(vorlage(OSG), "rechts");
  const jetzt = Date.now();
  assert.equal(store.verwerfeAbgelaufene(jetzt + 3.9 * 3600_000), 0);
  assert.equal(store.verwerfeAbgelaufene(jetzt + 4.1 * 3600_000), 1);
  // Seit E-82 nur der Tag („gestern“); vorher „seit gestern 14:10“. Gestern 12:00 ist zu jeder Uhrzeit gestern.
  const gestern = new Date(jetzt);
  gestern.setDate(gestern.getDate() - 1);
  gestern.setHours(12, 0, 0, 0);
  assert.equal(aktionen.alterInWorten({ ...aktiv_oder_leer(), erstellt: gestern.getTime() }, jetzt), "gestern");
});
function aktiv_oder_leer() {
  return fallOps.neuerFall("zna", INDEX);
}

test("P-17: nach einem Katalogwechsel mit neuer Versionsnummer sind gespeicherte Auswahlen zurückgesetzt", () => {
  const b: Baustein = { id: "x", titel: "x", typ: "anamnese", platzhalter: [], segmente: [{ art: "option", id: "ak", label: "Gerinnungshemmung", an: true, text: "Gerinnungshemmende Medikamente: {was}.", slots: [{ art: "auswahl", id: "was", label: "Gerinnungshemmung", required: true, optionen: ["", "keine", "Apixaban"] }] }] };
  const v: Vorlage = { id: "zna-x", titel: "x", region: "t", setting: "zna", abschnitte: { anamnese: ["x"] }, status: "entwurf" };
  const kat = (version: number, optionen: string[]) => render.indexiere({ version, brieftypen: INDEX.katalog.brieftypen, vorlagen: [v], regionen: [{ id: "t", name: "t", kuerzel: "t", bausteine: [{ ...b, segmente: [{ ...(b.segmente[0] as object), slots: [{ art: "auswahl", id: "was", label: "Gerinnungshemmung", required: true, optionen }] } as Baustein["segmente"][number]] }] }] });
  const alt = kat(4, ["", "keine", "Apixaban"]);
  const fall = fallOps.mitAngabe(fallOps.mitVorlage(fallOps.neuerFall("zna", alt), v, alt), "x/ak", "x/ak/was", "1");
  assert.match(render.renderBrief(fall, alt).abschnitte.find((a) => a.id === "anamnese")!.text, /: keine\./);
  const neu = kat(5, ["", "unbekannt", "keine", "Apixaban"]);
  assert.match(render.renderBrief(fallOps.nachKatalogwechsel(fall, neu), neu).abschnitte.find((a) => a.id === "anamnese")!.text, /‹Gerinnungshemmung›/);
});

test("P-17 (Rest): ändert sich der Katalog ohne neue Versionsnummer, wechselt eine gespeicherte Angabe nicht still ihren Inhalt", () => {
  const seg = (optionen: string[]) => ({ art: "option" as const, id: "ak", label: "Gerinnungshemmung", an: true, text: "Gerinnungshemmende Medikamente: {was}.", slots: [{ art: "auswahl" as const, id: "was", label: "Gerinnungshemmung", required: true, optionen }] });
  const v: Vorlage = { id: "zna-x", titel: "x", region: "t", setting: "zna", abschnitte: { anamnese: ["x"] }, status: "entwurf" };
  const kat = (optionen: string[]) => render.indexiere({ version: 4, brieftypen: INDEX.katalog.brieftypen, vorlagen: [v], regionen: [{ id: "t", name: "t", kuerzel: "t", bausteine: [{ id: "x", titel: "x", typ: "anamnese", platzhalter: [], segmente: [seg(optionen)] }] }] });
  const alt = kat(["", "keine", "Apixaban"]);
  const fall = fallOps.mitAngabe(fallOps.mitVorlage(fallOps.neuerFall("zna", alt), v, alt), "x/ak", "x/ak/was", "1");
  // Die Redaktion entfernt „keine“ und vergisst, die Versionsnummer in katalog.ts zu erhöhen.
  const neu = kat(["", "Apixaban", "Rivaroxaban"]);
  const text = render.renderBrief(fallOps.nachKatalogwechsel(fall, neu), neu).abschnitte.find((a) => a.id === "anamnese")!;
  assert.ok(!/Apixaban/.test(text.text) || !text.fertig, `im offenen Fall steht jetzt fertig und kopierbar: „${text.text}“`);
});

test("P-18: Kopiervermerk bleibt bei ausgeblendetem oder geleertem Abschnitt, Vorlagenwechsel und Rückgängig; zweimal Strg+Enter überspringt nichts", async () => {
  frisch();
  osgFertig("rechts");
  await aktionen.kopiereAbschnitt(ansicht("therapie"));
  store.aendere((f) => fallOps.mitAusgeblendet(f, "therapie", true));
  assert.deepEqual(aktionen.verwaist().map((a) => a.id), ["therapie"]);
  store.aendere((f) => fallOps.mitAusgeblendet(f, "therapie", false));
  store.vorlageAnwenden(vorlage("zna-osg-fraktur-konservativ"));
  assert.equal(ansicht("therapie").kopiert, true);
  store.zurueck();
  store.zurueck();
  assert.equal(ansicht("therapie").kopiert, true);
  // Strg+Enter zweimal, ohne ins KIS zu wechseln: derselbe Abschnitt, nicht der nächste.
  frisch();
  osgFertig("rechts");
  await aktionen.kopiereNaechsten();
  await aktionen.kopiereNaechsten();
  assert.equal(ansicht("anamnese").kopiert, false);
  assert.equal(kopiertes().length, 2);
  assert.equal(kopiertes()[0], kopiertes()[1]);
});

test("P-19: Platzhalter fürs KIS werden je Fall geführt, bis der Fall geschlossen wird", async () => {
  frisch();
  osgFertig("rechts");
  store.aendere((f) => fallOps.mitSpaeter(f, "ana-trauma/hergang", true));
  assert.equal(ansicht("anamnese").fertig, true);
  assert.match(ansicht("anamnese").text, /\[UNFALLHERGANG\]/);
  await aktionen.kopiereAbschnitt(ansicht("anamnese"));
  assert.match(meldung.value?.text ?? "", /1 Platzhalter im KIS ergänzen/);
  assert.deepEqual(brief().spaeter.map((p) => p.label), ["Unfallhergang"]);
});

test("P-20: unsichere Zeichen in freiem Text nennt die Kopiermeldung", async () => {
  frisch();
  osgFertig("rechts");
  store.aendere((f) => fallOps.mitZusatz(f, "therapie", "Labor: CRP ↑, Hb ↓."));
  await aktionen.kopiereAbschnitt(ansicht("therapie"));
  assert.match(meldung.value?.text ?? "", /Zeichen, die das KIS verfälschen kann: ↑ ↓/);
  assert.match(letzter(), /CRP ↑/);
});

// --- niedrig ---------------------------------------------------------------------

test("P-21: ein einzeln auffällig gestellter Befund klebt in keiner Vorlage am Folgesatz", () => {
  const fund: string[] = [];
  for (const v of INDEX.katalog.vorlagen) {
    const basis = fallOps.mitPerson(fallOps.mitSeite(fallOps.mitVorlage(fallOps.neuerFall(v.setting, INDEX), v, INDEX), "links"), "w", "52");
    for (const id of [...(v.abschnitte.befund ?? []), ...(v.abschnitte.entlassbefund ?? [])]) {
      for (const s of INDEX.bausteine.get(id)?.segmente ?? []) {
        if (s.art !== "befund") continue;
        const text = render.briefText(render.renderBrief(fallOps.mitBefund(basis, `${id}/${s.id}`, "abw"), INDEX)).replace(/‹[^›]*›/g, "X");
        if (/[a-zäöüß)]\.[A-ZÄÖÜ]/.test(text)) fund.push(`${v.id}: ${id}/${s.id}`);
      }
    }
  }
  assert.deepEqual(fund, []);
});

test("P-22: ein leer gelöschter eigener Wortlaut lässt den auffälligen Befund nicht verschwinden", () => {
  frisch();
  store.fallNeu(vorlage(OSG), "rechts");
  const k = "osg-untersuchung/osg_gabel";
  store.aendere((f) => fallOps.mitBefund(f, k, "abw"));
  store.aendere((f) => fallOps.mitEigenemText(f, k, "Gabelkompression schmerzhaft."));
  store.aendere((f) => fallOps.mitEigenemText(f, k, "   "));
  assert.equal(token(k)?.t.trim(), "Gabelkompressionsschmerz.");
});

test("P-23: Rückgängig nennt die Stelle, wenn ein Befund von auffällig auf unauffällig kippt", () => {
  frisch();
  store.fallNeu(vorlage(OSG), "rechts");
  const k = "osg-untersuchung/osg_gabel";
  store.aendere((f) => fallOps.mitBefund(f, k, "ok"));
  store.aendere((f) => fallOps.mitBefund(f, k, "abw"));
  const vor = [aktiv(), store.brief.value] as const;
  store.zurueck();
  assert.match(aktionen.unterschied(vor[0], vor[1]), /Gabelkompression \(jetzt: unauffällig\)/);
});

test("P-24 und P-25: freier Text geht unverändert hinaus; gezählt wird, was in der Zwischenablage liegt", async () => {
  frisch();
  osgFertig("rechts");
  store.aendere((f) => fallOps.mitManuell(f, "therapie", "Belastung:  Faktor 1..5\n\n\n\nKontrolle in 3 .. 5 Tagen ,  dann Röntgen"));
  await aktionen.kopiereAbschnitt(ansicht("therapie"));
  assert.equal(letzter(), "Belastung:  Faktor 1..5\r\n\r\n\r\n\r\nKontrolle in 3 .. 5 Tagen ,  dann Röntgen");
  assert.equal(aktionen.letzteKopie.value?.zeichen, letzter().length);
});

test("P-26: „Arbeitsplatz räumen“ leert Fälle, „Zuletzt kopiert“ und Zwischenablage", async () => {
  frisch();
  osgFertig("rechts");
  await aktionen.kopiereAlles();
  await aktionen.raeumeArbeitsplatz(true);
  assert.equal(store.faelle.value.length, 0);
  assert.equal(aktionen.letzteKopie.value, null);
  assert.equal(letzter().trim(), "");
});

test("P-27: kein fest geschriebenes „Patient“, „Patientin“ oder „Pat.“ im Katalog", () => {
  const fund: string[] = [];
  for (const r of INDEX.katalog.regionen) for (const b of r.bausteine) if (/\bPatient(in|en)?\b|\bPat\./.test(JSON.stringify(b.segmente))) fund.push(b.id);
  assert.deepEqual(fund, []);
});

test("P-28: hinter der Vorlagensuche wirkt kein Kopierbefehl", async () => {
  frisch();
  osgFertig("rechts");
  store.sucheOffen.value = "neu";
  await aktionen.kopiereNaechsten();
  assert.equal(await aktionen.kopiereAlles(), false);
  assert.deepEqual(zwischenablage.texte, []);
});

test("P-29 (Rest): ein mit einem Klick zugewählter Satz ist nicht sofort kopierbare Aussage", () => {
  frisch();
  osgFertig("rechts");
  assert.equal(ansicht("anamnese").fertig, true);
  // Brief.tsx, einschalten(): ein Klick auf „+ Kein Sturz auf den Kopf“.
  store.aendere((f) => fallOps.mitOption(f, "ana-trauma/kopf", true));
  assert.match(ansicht("anamnese").text, /Bewusstlosigkeit und Erinnerungslücke hätten nicht bestanden/);
  assert.equal(ansicht("anamnese").fertig, false, "der Abschnitt bleibt nach einem einzigen Klick kopierbar");
});

test("Kontrolle des Geschirrs: ein vollständig geklärter OSG-Fall lässt sich kopieren", async () => {
  frisch();
  osgFertig("rechts");
  assert.deepEqual(brief().abschnitte.filter((a) => !a.leer && !a.fertig).map((a) => `${a.id}: ${a.offen} offen, ${a.vorschlag} grau`), []);
  assert.equal(await aktionen.kopiereAlles(), true);
  assert.deepEqual(grau("befund"), []);
});
