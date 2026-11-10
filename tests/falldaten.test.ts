// Falldaten im Fallkopf (E-58) und errechnete Daten hinter Fristen (E-59): Datum lesen, Felder füllen, Platzhalter
// fürs KIS ohne Sperre, Vorschlag in Klammern, Übernehmen, Speicherformat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KATALOG } from "../src/data/katalog.ts";
import { WEITERE_OP_BAUSTEIN } from "../src/data/falldaten.ts";
import { indexiere, renderBrief } from "../src/engine/render.ts";
import type { AbschnittAnsicht } from "../src/engine/render.ts";
import { ergaenzt, mitAngabe, mitBaustein, mitFalldatum, mitFrist, mitManuell, mitSpaeter, mitVorlage, mitWert, neuerFall, uebernehmen } from "../src/engine/fall.ts";
import { leseDatum, plusTage, tageZwischen, wochentag } from "../src/engine/datum.ts";
import { falldatenHinweise, fristDatum, fristSchluessel, leseFristSchluessel } from "../src/engine/falldaten.ts";
import { handtext, offeneFristen } from "../src/engine/text.ts";
import { mitProtokoll } from "../src/engine/protokoll.ts";
import type { Token } from "../src/engine/text.ts";
import type { Fall } from "../src/model/types.ts";

const index = indexiere(KATALOG);
const HEUTE = new Date(2026, 10, 8, 14, 30); // 08.11.2026, Nachmittag

function hueftTep(): Fall {
  const v = index.vorlagen.get("station-hueft-tep");
  assert.ok(v);
  return mitVorlage(neuerFall("station", index), v, index);
}

function abschnitt(f: Fall, id: string): AbschnittAnsicht {
  const a = renderBrief(f, index).abschnitte.find((x) => x.id === id);
  assert.ok(a, id);
  return a;
}

function token(f: Fall, key: string): Token | undefined {
  return renderBrief(f, index)
    .abschnitte.flatMap((a) => a.tokens)
    .find((t) => t.key === key);
}

test("Datum lesen: TT.MM. mit ergänztem Jahr, zweistelliges und vierstelliges Jahr, Stichwörter", () => {
  assert.equal(leseDatum("12.11.", HEUTE), "12.11.2026");
  assert.equal(leseDatum("12.11", HEUTE), "12.11.2026");
  assert.equal(leseDatum("1.2.", HEUTE), "01.02.2027");
  assert.equal(leseDatum(" 3.11. ", HEUTE), "03.11.2026");
  assert.equal(leseDatum("12.11.25", HEUTE), "12.11.2025");
  assert.equal(leseDatum("12.11.2025", HEUTE), "12.11.2025");
  assert.equal(leseDatum("heute", HEUTE), "08.11.2026");
  assert.equal(leseDatum("Gestern", HEUTE), "07.11.2026");
  assert.equal(leseDatum("vorgestern", HEUTE), "06.11.2026");
  assert.equal(leseDatum("morgen", HEUTE), "09.11.2026");
  // Jahreswechsel: Das Jahr, mit dem der Tag heute am nächsten liegt.
  assert.equal(leseDatum("28.12.", new Date(2027, 0, 5)), "28.12.2026");
  assert.equal(leseDatum("02.01.", new Date(2026, 11, 30)), "02.01.2027");
  for (const falsch of ["", "12", "12.", "31.02.", "29.02.2027", "12.13.", "heut", "12.11.202", "1211", "12/11"]) {
    assert.equal(leseDatum(falsch, HEUTE), null, falsch);
  }
  assert.equal(leseDatum("29.02.2028", HEUTE), "29.02.2028");
});

test("Datum rechnen: über Monatsende und Zeitumstellung, Wochentag", () => {
  assert.equal(plusTage("25.10.2026", 1), "26.10.2026");
  assert.equal(plusTage("29.03.2026", 1), "30.03.2026");
  assert.equal(plusTage("20.11.2026", 12), "02.12.2026");
  assert.equal(plusTage("08.11.2026", 35), "13.12.2026");
  assert.equal(plusTage("kein Datum", 3), null);
  assert.equal(tageZwischen("08.11.2026", "20.11.2026"), 12);
  assert.equal(wochentag("08.11.2026"), "Sonntag");
});

test("OP-Datum im Fallkopf füllt die Therapiezeile; ohne Datum steht der Platzhalter fürs KIS und sperrt nicht", () => {
  let f = hueftTep();
  const ohne = token(f, "th-st-hueft-tep/datum");
  assert.equal(ohne?.t, "[OP-DATUM]");
  assert.equal(ohne?.zustand, "spaeter");
  assert.equal(ohne?.falldatum, "op");
  const brief = renderBrief(f, index);
  assert.ok(brief.spaeter.some((p) => p.key === "th-st-hueft-tep/datum"));
  // Offen sind Verankerung und Seite; das fehlende Datum zählt nicht als Lücke.
  assert.equal(abschnitt(f, "therapie").offen, 2);
  f = mitFalldatum(f, "op", "05.11.2026");
  const mit = token(f, "th-st-hueft-tep/datum");
  assert.equal(mit?.t, "05.11.2026");
  assert.equal(mit?.zustand, "gesetzt");
  assert.ok(!renderBrief(f, index).spaeter.some((p) => p.key === "th-st-hueft-tep/datum"));
  assert.match(abschnitt(f, "therapie").text, /Hüft-Totalendoprothese ‹Seite› am 05\.11\.2026/);
});

test("Ein an der Stelle eingetragenes Datum geht vor (bewusste Abweichung, Fall von vorher); das Datum des Fallkopfs ersetzt einen Platzhalter fürs KIS", () => {
  let f = mitFalldatum(hueftTep(), "op", "05.11.2026");
  f = mitWert(f, "th-st-hueft-tep/datum", "04.11.2026");
  assert.equal(token(f, "th-st-hueft-tep/datum")?.t, "04.11.2026");
  f = mitWert(f, "th-st-hueft-tep/datum", undefined);
  f = mitSpaeter(f, "th-st-hueft-tep/datum", true);
  assert.equal(token(f, "th-st-hueft-tep/datum")?.t, "05.11.2026");
  f = mitFalldatum(f, "op", undefined);
  assert.equal(token(f, "th-st-hueft-tep/datum")?.t, "[OP-DATUM]");
});

test("Falldaten nur auf Station: In der Notaufnahme bleibt ein Datumsfeld, was es war", () => {
  const f = { ...hueftTep(), setting: "zna" as const };
  const t = token(mitFalldatum(f, "op", "05.11.2026"), "th-st-hueft-tep/datum");
  assert.equal(t?.zustand, "offen");
  assert.equal(t?.falldatum, undefined);
});

test("mitFalldatum nimmt nur ein gültiges Datum an; leer löscht", () => {
  const f = hueftTep();
  assert.equal(mitFalldatum(f, "op", "12.11."), f);
  assert.equal(mitFalldatum(f, "op", "31.02.2026"), f);
  const g = mitFalldatum(f, "op", "12.11.2026");
  assert.equal(g.daten.op, "12.11.2026");
  assert.deepEqual(mitFalldatum(g, "op", "").daten, {});
  assert.equal(mitFalldatum(g, "op", "12.11.2026"), g);
});

const NAHT = "proc-st-wunde/naht";

function mitNaht(f: Fall, wann = 2): Fall {
  f = mitAngabe(f, NAHT, `${NAHT}/material`, "1");
  f = mitAngabe(f, NAHT, `${NAHT}/wann`, String(wann));
  return mitAngabe(f, NAHT, `${NAHT}/wer`, "1");
}

test("Frist mit OP-Datum: Datum in Klammern als Vorschlag, Übernehmen macht es zur Aussage, ein neues OP-Datum fragt neu", () => {
  let f = mitNaht(hueftTep());
  assert.equal(token(f, NAHT)?.zustand, "gesetzt");
  assert.equal(token(f, NAHT)?.fristen, undefined, "ohne OP-Datum kein Datum in Klammern");
  const vorher = abschnitt(f, "procedere").vorschlag;
  f = mitFalldatum(f, "op", "08.11.2026");
  const t = token(f, NAHT)!;
  assert.match(t.t, /am 12\. Tag nach der Operation \(20\.11\.2026\) in der Hausarztpraxis/);
  assert.equal(t.zustand, "gesetzt", "der Satz bleibt Aussage des Arztes");
  assert.equal(t.fristen?.length, 1);
  const frist = t.fristen![0];
  assert.equal(t.t.slice(frist.start, frist.ende), "(20.11.2026)");
  assert.equal(frist.zustand, "vorschlag");
  assert.equal(frist.key, fristSchluessel(NAHT, "op", 12));
  assert.deepEqual(offeneFristen(t), [frist.key]);
  assert.equal(abschnitt(f, "procedere").vorschlag, vorher + 1, "das graue Datum zählt als Vorschlag und hält das Kopieren auf");
  f = uebernehmen(f, [frist.key], index);
  assert.equal(f.fristen[frist.key], "20.11.2026");
  assert.equal(token(f, NAHT)?.fristen?.[0].zustand, "gesetzt");
  assert.equal(abschnitt(f, "procedere").vorschlag, vorher);
  f = mitFalldatum(f, "op", "09.11.2026");
  const neu = token(f, NAHT)!.fristen![0];
  assert.equal(neu.datum, "21.11.2026");
  assert.equal(neu.zustand, "vorschlag", "anderes Datum: wieder ein Vorschlag, nichts still geändert");
});

test("Zwei Operationen im Aufenthalt: Fristen „nach der Operation“ bekommen kein Datum, andere Anker schon", () => {
  let f = mitFalldatum(mitFalldatum(mitNaht(hueftTep()), "op", "08.11.2026"), "entlassung", "14.11.2026");
  assert.equal(token(f, NAHT)?.fristen?.length, 1);
  // Weitere Operation im Brief, ihr Datum noch nicht im Fallkopf: Welche Operation gemeint ist, weiß die App nicht.
  f = mitBaustein(f, WEITERE_OP_BAUSTEIN, index, "therapie");
  assert.ok(f.bausteine.therapie?.includes(WEITERE_OP_BAUSTEIN));
  assert.equal(token(f, NAHT)?.fristen, undefined);
  assert.match(token(f, NAHT)!.t, /am 12\. Tag nach der Operation in der Hausarztpraxis/, "die relative Angabe bleibt");
  f = mitFalldatum(mitFalldatum(f, "op2", "11.11.2026"), "aufnahme", "07.11.2026");
  assert.equal(token(f, NAHT)?.fristen, undefined, "auch mit beiden Daten kein Datum");
  f = mitAngabe(f, "ana-st-elektiv/antikoagulation", "ana-st-elektiv/antikoagulation/was", "3");
  f = mitAngabe(f, "ana-st-elektiv/antikoagulation", "ana-st-elektiv/antikoagulation/zuletzt", "1");
  assert.match(token(f, "ana-st-elektiv/antikoagulation")!.t, /am Aufnahmetag \(07\.11\.2026\)/, "der Aufnahmetag ist eindeutig");
  // Ohne den Baustein, aber mit Datum der zweiten Operation im Fallkopf: ebenso.
  f = { ...f, bausteine: { ...f.bausteine, therapie: f.bausteine.therapie?.filter((id) => id !== WEITERE_OP_BAUSTEIN) } };
  assert.equal(token(f, NAHT)?.fristen, undefined);
  f = mitFalldatum(f, "op2", undefined);
  assert.equal(token(f, NAHT)?.fristen?.[0].datum, "20.11.2026");
});

test("„Ohne Datum“ lässt die Klammer weg; Rückgängig macht sie wieder zum Vorschlag", () => {
  let f = mitFalldatum(mitNaht(hueftTep()), "op", "08.11.2026");
  const key = fristSchluessel(NAHT, "op", 12);
  f = mitFrist(f, key, "");
  assert.equal(token(f, NAHT)?.fristen, undefined);
  assert.doesNotMatch(token(f, NAHT)!.t, /\(/);
  f = mitFrist(f, key, undefined);
  assert.equal(token(f, NAHT)?.fristen?.[0].zustand, "vorschlag");
  assert.equal(mitFrist(f, "fremd/naht|op+12", "20.11.2026"), f, "nur Stellen des Falls");
  assert.equal(mitFrist(f, key, "20.11."), f, "nur gültige Daten");
});

test("Thromboseprophylaxe bis einschließlich 35. Tag, letzte Einnahme am Aufnahmetag, Entlassung + 1 Woche", () => {
  let f = hueftTep();
  f = mitFalldatum(mitFalldatum(mitFalldatum(f, "op", "08.11.2026"), "aufnahme", "07.11.2026"), "entlassung", "14.11.2026");
  f = { ...f, auswahl: { ...f.auswahl, "proc-st-thrombose/art": 4 } };
  f = mitAngabe(f, "ana-st-elektiv/antikoagulation", "ana-st-elektiv/antikoagulation/was", "3");
  f = mitAngabe(f, "ana-st-elektiv/antikoagulation", "ana-st-elektiv/antikoagulation/zuletzt", "1");
  assert.match(token(f, "proc-st-thrombose/art")!.t, /bis einschließlich 35\. Tag nach der Operation \(13\.12\.2026\)\./);
  assert.match(token(f, "ana-st-elektiv/antikoagulation")!.t, /letzte Einnahme am Aufnahmetag \(07\.11\.2026\)/);
});

test("Keine Klammer bei Bereichen, Aufzählungen, im Verlauf und in frei geschriebenem Text", () => {
  const regeln = KATALOG.regeln!;
  const treffer = (text: string) => regeln.fristen!.filter((m) => (m.muster.lastIndex = 0, m.muster.test(text)));
  assert.equal(treffer("Kontrolle 2 bis 3 Tage nach der Entlassung in der Hausarztpraxis.").length, 0);
  assert.equal(treffer("Kontrolle in der 1. Woche nach der Entlassung.").length, 0);
  assert.equal(treffer("Röntgenkontrolle am 4., 7. und 11. Tag nach der Operation.").length, 0);
  assert.equal(treffer("Röntgenkontrolle 6 und 12 Wochen nach der Operation.").length, 0);
  assert.equal(treffer("Röntgenkontrolle 2, 6 und 12 Wochen nach der Operation.").length, 0);
  assert.equal(treffer("Kontrolle 2–3 Tage nach der Entlassung.").length, 0);
  assert.equal(treffer("Kontrolle 2 oder 3 Wochen nach der Operation.").length, 0);
  assert.equal(treffer("Teilbelastung für 6 Wochen nach der Operation.").length, 1);
  assert.equal(treffer("Kontrolle 1 Woche nach der Entlassung.").length, 1);
  assert.equal(treffer("Röntgenkontrolle 6 Wochen nach der Operation.").length, 1);
  assert.equal(treffer("Teilbelastung bis zum Ende der 6. Woche nach der Operation.").length, 1);
  // Verlauf ist Vergangenheit: kein Datum hinter „Ab dem 1. Tag nach der Operation mobilisierten wir …“.
  let f = mitFalldatum(hueftTep(), "op", "08.11.2026");
  f = mitAngabe(f, "verl-st-operativ/mobilisation", "verl-st-operativ/mobilisation/hilfsmittel", "1");
  assert.equal(token(f, "verl-st-operativ/mobilisation")?.fristen, undefined);
  // Eigener Wortlaut bleibt, wie der Arzt ihn geschrieben hat.
  f = mitNaht(f);
  f = { ...f, eigen: { ...f.eigen, [NAHT]: "Fäden am 12. Tag nach der Operation." } };
  assert.equal(token(f, NAHT)?.fristen, undefined);
});

test("Fristschlüssel: lesen, rechnen, Fremdes abweisen", () => {
  assert.deepEqual(leseFristSchluessel("proc-st-wunde/naht|op+12"), { stelle: "proc-st-wunde/naht", anker: "op", tage: 12 });
  assert.equal(leseFristSchluessel("proc-st-wunde/naht"), null);
  assert.equal(leseFristSchluessel("x/y|geburt+3"), null);
  const f = mitFalldatum(hueftTep(), "op", "08.11.2026");
  assert.equal(fristDatum(f, "proc-st-wunde/naht|op+12"), "20.11.2026");
  assert.equal(fristDatum(f, "proc-st-wunde/naht|aufnahme+1"), null);
});

test("Fall aus Speicherformat 1 lädt weiter: Falldaten leer, Ungültiges entfällt", () => {
  const alt = { ...hueftTep() } as Partial<Fall>;
  delete alt.daten;
  delete alt.fristen;
  const f = ergaenzt(JSON.parse(JSON.stringify(alt)), index);
  assert.ok(f);
  assert.deepEqual(f.daten, {});
  assert.deepEqual(f.fristen, {});
  const kaputt = ergaenzt({ ...hueftTep(), daten: { op: "12.11.", aufnahme: "07.11.2026", geburt: "01.01.1950" }, fristen: { "a/b|op+3": "x", "a/b|op+4": "", "a/b": "01.01.2026" } }, index);
  assert.deepEqual(kaputt?.daten, { aufnahme: "07.11.2026" });
  assert.deepEqual(kaputt?.fristen, { "a/b|op+4": "" });
});

test("Hinweise zu den Falldaten: Reihenfolge und Zukunft, nur Hinweis", () => {
  const name = (a: string) => ({ aufnahme: "Aufnahmedatum", op: "OP-Datum", op2: "Datum der weiteren Operation", entlassung: "Entlassdatum" })[a]!;
  assert.deepEqual(falldatenHinweise({ aufnahme: "07.11.2026", op: "08.11.2026", entlassung: "14.11.2026" }, "08.11.2026", name), []);
  assert.deepEqual(falldatenHinweise({ aufnahme: "09.11.2026", op: "08.11.2026" }, "08.11.2026", name), ["OP-Datum liegt vor dem Aufnahmedatum."]);
  assert.deepEqual(falldatenHinweise({ op: "08.11.2026", entlassung: "07.11.2026" }, "08.11.2026", name), ["Entlassdatum liegt vor dem OP-Datum."]);
  assert.deepEqual(falldatenHinweise({ entlassung: "08.12.2026" }, "08.11.2026", name), ["Entlassdatum liegt mehr als zwei Wochen in der Zukunft."]);
});

test("Katalog: Jede Bezeichnung, die ein Datum des Fallkopfs einsetzt, gibt es in Stationsbausteinen (Umbenennen fällt auf)", () => {
  const labels = new Map<string, number>();
  for (const b of index.bausteine.values()) {
    for (const p of b.platzhalter) if (p.typ === "datum") labels.set(p.label, (labels.get(p.label) ?? 0) + 1);
  }
  for (const label of Object.keys(KATALOG.regeln!.falldatumFelder!)) assert.ok(labels.get(label), `kein Datumsfeld „${label}“ im Katalog`);
  // Jede operative Stationsvorlage fragt nach dem OP-Datum, keine konservative.
  for (const v of index.vorlagen.values()) {
    if (v.setting !== "station") continue;
    const f = mitVorlage(neuerFall("station", index), v, index);
    const op = renderBrief(f, index).abschnitte.some((a) => a.tokens.some((t) => t.falldatum === "op"));
    const konservativ = /konservativ|commotio|lumboischialgie|rippenserie/.test(v.id);
    assert.equal(op, !konservativ, `${v.id}: OP-Datum ${op ? "gebunden" : "fehlt"}`);
  }
});

test("Standardprotokolle (r5-protokolle): Wochenbereiche und Aufzählungen ohne Datum, einzelne Kontrolle mit Datum", () => {
  const regeln = KATALOG.regeln!;
  const treffer = (text: string) =>
    regeln.fristen!.flatMap((m) => {
      m.muster.lastIndex = 0;
      return [...text.matchAll(m.muster)].map((t) => t[0]);
    });
  assert.deepEqual(treffer("1. bis 2. Woche nach der Operation: Vollbelastung des Beins rechts an Unterarmgehstützen."), []);
  assert.deepEqual(treffer("3. bis 6. Woche nach der Operation: Vollbelastung im Zweipunktegang."), []);
  assert.deepEqual(treffer("Ab der 7. Woche nach der Operation: keine Bewegungsgrenzen der Hüfte mehr."), []);
  assert.deepEqual(treffer("Arbeitsunfähigkeit: leichte Tätigkeit 12 Wochen, mittelschwere bis schwere Tätigkeit 16 Wochen nach der Operation."), []);
  assert.deepEqual(treffer("leichte Tätigkeit 12 Wochen, mittelschwere bis schwere Tätigkeit im Lauf der ersten 16 Wochen nach der Operation."), []);
  assert.deepEqual(treffer("Bis zum Ende der 6. Woche nach der Operation: Hüfte rechts nicht über 90° beugen."), ["Ende der 6. Woche nach der Operation"]);
  assert.deepEqual(treffer("Klinische und radiologische Kontrolle der Hüfte rechts 6 Wochen nach der Operation in der Praxis."), ["6 Wochen nach der Operation"]);
  // Über alle Zeilen aller Protokolle: Kein Datum hinter einem Bereich oder einem Glied einer Aufzählung.
  for (const p of KATALOG.protokolle ?? []) {
    for (const z of [...p.zeilen, ...p.zusatz]) {
      for (const t of treffer(z)) {
        const davor = z.slice(0, z.indexOf(t));
        assert.doesNotMatch(davor, /(\d+\. bis|\bbis|\bund|,) ?$/, `${p.id}: „${z}“`);
        assert.doesNotMatch(davor, /\d+ Wochen?,[^.;:]*$/, `${p.id}: „${z}“`);
      }
    }
  }
});

test("Protokoll im Brief bekommt Daten in Klammern wie jeder Satz des Procedere", () => {
  let f = mitFalldatum(hueftTep(), "op", "08.11.2026");
  f = mitProtokoll(f, "proc-st-protokoll-hueft-tep-1", index);
  // Eine Zeile mit offener Seite ist eine Lücke und bekommt noch kein Datum; mit Seite schon.
  f = { ...f, seite: "rechts" };
  const zeilen = renderBrief(f, index).abschnitte.find((a) => a.id === "procedere")!.tokens.filter((t) => t.key?.startsWith("proc-st-protokoll-hueft-tep-1/"));
  const mitDatum = zeilen.filter((t) => t.fristen?.length).map((t) => t.t.slice(t.fristen![0].start, t.fristen![0].ende));
  assert.deepEqual(mitDatum, ["(20.12.2026)", "(20.12.2026)"], "Ende der 6. Woche und Kontrolle nach 6 Wochen: OP + 42 Tage");
  assert.ok(zeilen.some((t) => /^1\. bis 2\. Woche nach der Operation:/.test(t.t.trim()) && !t.fristen), "Wochenbereich ohne Datum");
});

test("Von Hand bearbeiten vor dem Klären (r5-fixes, E-66): Ein graues Datum steht als Lücke „‹Vorschlag: …›“, ein übernommenes als Text", () => {
  let f = mitFalldatum(mitNaht(hueftTep()), "op", "08.11.2026");
  const a = abschnitt(f, "procedere");
  assert.equal(a.fertig, false);
  const h = handtext(a.tokens);
  assert.match(h, /am 12\. Tag nach der Operation ‹Vorschlag: \(20\.11\.2026\)› in der Hausarztpraxis/);
  f = mitManuell(f, "procedere", h);
  assert.ok(abschnitt(f, "procedere").offen > 0, "die Lücke hält das Kopieren auf, bis der Arzt das Datum übernimmt oder streicht");
  const g = uebernehmen(mitNaht(mitFalldatum(hueftTep(), "op", "08.11.2026")), [fristSchluessel(NAHT, "op", 12)], index);
  assert.match(handtext(abschnitt(g, "procedere").tokens), /am 12\. Tag nach der Operation \(20\.11\.2026\) in der Hausarztpraxis/);
});

test("Katalog (PS-R5-1): Zwei beliebige OP-Bausteine tragen nie dasselbe Datum des Fallkopfs, „nach der Operation“ bekommt kein Datum; ein dritter ist eine Lücke", () => {
  const ops = [...index.bausteine.values()].filter((b) => b.platzhalter.some((p) => p.typ === "datum" && p.label === "OP-Datum")).map((b) => b.id);
  assert.equal(ops.length, 22);
  const basis = mitFalldatum(mitFalldatum(mitNaht(hueftTep()), "op", "02.11.2026"), "op2", "10.11.2026");
  const nur = (therapie: string[]) => {
    const f = mitFalldatum({ ...basis, bausteine: { ...basis.bausteine, therapie } }, "op2", therapie.length > 1 ? "10.11.2026" : undefined);
    return renderBrief(f, index).abschnitte.flatMap((a) => a.tokens);
  };
  const datum = (toks: Token[]) => toks.filter((t) => t.label === "OP-Datum" || t.falldatum).map((t) => `${t.key!.split("/")[0]}:${t.falldatum ?? t.zustand}:${t.t}`);
  // Ein OP-Baustein allein: OP-Datum, Frist mit Datum.
  for (const a of ops) {
    const toks = nur([a]);
    assert.deepEqual(datum(toks), [`${a}:op:02.11.2026`], a);
    assert.ok(toks.some((t) => t.fristen?.some((x) => x.anker === "op")), `${a}: Frist ohne Datum`);
  }
  for (const a of ops) {
    for (const b of ops) {
      if (a === b) continue;
      const toks = nur([a, b]);
      assert.deepEqual(datum(toks), [`${a}:op:02.11.2026`, `${b}:op2:10.11.2026`], `${a} + ${b}`);
      assert.ok(!toks.some((t) => t.fristen?.some((x) => x.anker === "op")), `${a} + ${b}: Datum hinter „nach der Operation“`);
    }
  }
  // „+ weitere OP“ behält das Datum der 2. OP; ein zweiter OP-Baustein daneben ist der dritte und eine Lücke.
  assert.deepEqual(datum(nur([ops[0], WEITERE_OP_BAUSTEIN, ops[1]])), [`${ops[0]}:op:02.11.2026`, `${WEITERE_OP_BAUSTEIN}:op2:10.11.2026`, `${ops[1]}:offen:‹OP-Datum›`]);
  assert.deepEqual(datum(nur([ops[0], ops[1], ops[2]])), [`${ops[0]}:op:02.11.2026`, `${ops[1]}:op2:10.11.2026`, `${ops[2]}:offen:‹OP-Datum›`]);
});
