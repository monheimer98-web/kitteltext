// Einmal eingeben (M-14) und Folgeangaben (M-24), E-60: Antworten anderer Stellen erscheinen, wo noch keine steht;
// eigene Antworten gehen vor; anderer Bezug ist Vorschlag; Folgeangaben werden mit den Pflichtangaben zur Aussage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KATALOG } from "../src/data/katalog.ts";
import { indexiere, renderBrief } from "../src/engine/render.ts";
import type { KatalogIndex } from "../src/engine/render.ts";
import { mitAngabe, mitAuswahl, mitBaustein, mitOption, mitPerson, mitVorlage, mitWert, neuerFall, sicherZuruecknehmen, uebernehmen } from "../src/engine/fall.ts";
import { regelFehler, uebertragungen } from "../src/engine/kopplung.ts";
import { ersetzteStellen, mitProtokoll } from "../src/engine/protokoll.ts";
import type { Token } from "../src/engine/text.ts";
import type { Fall } from "../src/model/types.ts";

const index = indexiere(KATALOG);

function vorlage(id: string): Fall {
  const v = index.vorlagen.get(id);
  assert.ok(v, id);
  return mitVorlage(neuerFall("station", index), v, index);
}

function token(f: Fall, key: string, ix: KatalogIndex = index): Token | undefined {
  return renderBrief(f, ix)
    .abschnitte.flatMap((a) => a.tokens)
    .find((t) => t.key === key);
}

const EB = "eb-st-mobilitaet/gehen";
const PROC = "proc-st-belastung/hilfsmittel";
const VERL = "verl-st-operativ/mobilisation";

test("Regeln: Jede Kennung gibt es im Katalog, keine Folgeangabe ist Pflicht", () => {
  assert.deepEqual(regelFehler(index), []);
});

test("Gehhilfe einmal im Entlassbefund: Procedere und Verlauf zeigen sie grau, mit Herkunft", () => {
  let f = vorlage("station-hueft-tep");
  f = mitAngabe(f, EB, `${EB}/hilfsmittel`, "2"); // an Unterarmgehstützen
  const proc = token(f, PROC)!;
  assert.equal(proc.t.trim(), "Gehen an Unterarmgehstützen.");
  assert.equal(proc.zustand, "vorschlag", "anderer Bezug: Vorschlag, nicht still Aussage");
  assert.deepEqual(proc.uebertragen, [index.bausteine.get("eb-st-mobilitaet")!.titel]);
  assert.match(token(f, VERL)!.t, /mit Physiotherapie an Unterarmgehstützen/);
  // Übernehmen schreibt, was grau dasteht.
  const g = uebernehmen(f, [PROC], index);
  assert.equal(g.slots[`${PROC}/womit`], "1");
  assert.equal(token(g, PROC)!.zustand, "gesetzt");
});

test("Eine eigene Antwort an der Stelle geht vor; der nächstgelegene Bezug gewinnt; Widerspruch gleich naher bleibt offen", () => {
  let f = vorlage("station-hueft-tep");
  f = mitAngabe(f, EB, `${EB}/hilfsmittel`, "2");
  f = mitAngabe(f, PROC, `${PROC}/womit`, "2"); // am Rollator, bewusst anders
  assert.equal(token(f, PROC)!.t.trim(), "Gehen am Rollator.");
  assert.equal(token(f, PROC)!.uebertragen, undefined);
  // Verlauf Gehwagen, Entlassbefund Unterarmgehstützen: Procedere nimmt den Entlassbefund.
  let h = vorlage("station-hueft-tep");
  h = mitAngabe(h, VERL, `${VERL}/hilfsmittel`, "3");
  h = mitAngabe(h, EB, `${EB}/hilfsmittel`, "2");
  assert.equal(token(h, PROC)!.t.trim(), "Gehen an Unterarmgehstützen.");
  // Verlauf Gehwagen, Procedere Rollator: Der Entlassbefund liegt gleich nah an beiden und bekommt nichts.
  let k = vorlage("station-hueft-tep");
  k = mitAngabe(k, VERL, `${VERL}/hilfsmittel`, "3");
  k = mitAngabe(k, PROC, `${PROC}/womit`, "2");
  assert.equal(token(k, EB)!.zustand, "offen");
  assert.equal(uebertragungen(k, index).has(`${EB}/hilfsmittel`), false);
});

test("Nur Antworten des Arztes: Vorschläge der Vorlage und entfernte Sätze übertragen nichts", () => {
  let f = vorlage("station-hueft-tep");
  assert.equal(uebertragungen(f, index).size, 0);
  f = mitAngabe(f, EB, `${EB}/hilfsmittel`, "2");
  f = mitOption(f, EB, false);
  assert.equal(token(f, PROC)!.zustand, "offen");
});

test("Allergien: Wortlaut der Anamnese erscheint grau bei den Arzneimittelunverträglichkeiten", () => {
  let f = vorlage("station-hueft-tep");
  f = mitWert(f, "ana-st-elektiv/allergien", "Penicillin (Exanthem)");
  const t = token(f, "med-st-entlassung/unvertraeglich")!;
  assert.equal(t.t, "Penicillin (Exanthem)");
  assert.equal(t.zustand, "vorschlag");
  assert.equal(uebernehmen(f, ["med-st-entlassung/unvertraeglich"], index).werte["med-st-entlassung/unvertraeglich"], "Penicillin (Exanthem)");
  // Eine eigene Eingabe dort bleibt.
  f = mitWert(f, "med-st-entlassung/unvertraeglich", "keine bekannt");
  assert.equal(token(f, "med-st-entlassung/unvertraeglich")!.t, "keine bekannt");
});

test("Klammern: nur „noch nicht entfernt“ wird zum Material der Entfernung", () => {
  let f = vorlage("station-hueft-tep");
  f = mitAuswahl(f, "eb-st-wunde/naht", 1); // Hautklammern noch nicht entfernt.
  assert.match(token(f, "proc-st-wunde/naht")!.t, /^Entfernung der Hautklammern /);
  f = mitAuswahl(f, "eb-st-wunde/naht", 3); // Hautklammern entfernt.
  assert.doesNotMatch(token(f, "proc-st-wunde/naht")!.t, /Hautklammern/);
  // Umgekehrt: Wer die Entfernung der Hautnähte empfiehlt, bekommt im Entlassbefund „noch nicht entfernt“ vorgeschlagen.
  let g = vorlage("station-hueft-tep");
  g = mitAngabe(g, "proc-st-wunde/naht", "proc-st-wunde/naht/material", "1");
  assert.equal(token(g, "eb-st-wunde/naht")!.t.trim(), "Hautnähte noch nicht entfernt.");
  assert.equal(token(g, "eb-st-wunde/naht")!.zustand, "vorschlag");
});

test("Commotio: Dauer der Überwachung aus der Therapie gilt im Verlauf als Aussage, sobald der Satz eingeschaltet ist", () => {
  let f = vorlage("station-commotio-ueberwachung");
  f = mitAuswahl(f, "th-st-commotio/dauer", 1); // 24 Stunden
  const grau = token(f, "verl-st-commotio/ueberwachung")!;
  assert.match(grau.t, /Über 24 Stunden kontrollierten wir/);
  assert.equal(grau.zustand, "vorschlag", "der Satz selbst ist noch Vorschlag der Vorlage");
  f = mitOption(f, "verl-st-commotio/ueberwachung", true);
  assert.equal(token(f, "verl-st-commotio/ueberwachung")!.zustand, "gesetzt");
});

test("Folgeangaben: Einheit hinter dem getippten Laborwert, Beginn der Mobilisation, „entließen“ werden mit den Pflichtangaben Aussage", () => {
  let f = mitBaustein(vorlage("station-hueft-tep"), "dgn-st-labor", index);
  f = mitAngabe(f, "dgn-st-labor/hb-aufnahme", "dgn-st-labor/hb-aufnahme/w", "11,2");
  const hb = token(f, "dgn-st-labor/hb-aufnahme")!;
  assert.equal(hb.t.trim(), "Hämoglobin bei Aufnahme 11,2 g/dl.");
  assert.equal(hb.zustand, "gesetzt");
  // Gegenprobe: ohne die Liste bleibt der Satz grau (R2-03).
  const ohne = indexiere({ ...KATALOG, regeln: { ...KATALOG.regeln, folgeangaben: [] } });
  assert.equal(token(f, "dgn-st-labor/hb-aufnahme", ohne)!.zustand, "vorschlag");

  let m = mitPerson(vorlage("station-hueft-tep"), "m", "");
  m = mitAngabe(m, VERL, `${VERL}/hilfsmittel`, "1");
  assert.equal(token(m, VERL)!.zustand, "offen");
  m = mitAngabe(m, VERL, `${VERL}/belastung`, "2");
  assert.match(token(m, VERL)!.t, /^Ab dem 1\. Tag nach der Operation mobilisierten wir/);
  assert.equal(token(m, VERL)!.zustand, "gesetzt");

  let e = mitPerson(vorlage("station-hueft-tep"), "m", "");
  e = mitAngabe(e, "verl-st-entlassung/entlassung", "verl-st-entlassung/entlassung/wohin", "5");
  assert.match(token(e, "verl-st-entlassung/entlassung")!.t, /^Wir entließen .* in die Anschlussrehabilitation\./);
});

test("Keine Folgeangabe: Ursache „nach der Operation“ in der Blutarmut bleibt Vorschlag, auch wenn alles Pflichtige beantwortet ist", () => {
  let f = vorlage("station-hueft-tep");
  const k = "verl-st-besonderheiten/anaemie";
  f = mitAngabe(f, k, `${k}/hb`, "7,9");
  f = mitAngabe(f, k, `${k}/transfusion`, "1");
  f = mitAngabe(f, k, `${k}/hb2`, "9,1");
  const t = token(f, k)!;
  assert.match(t.t, /nach der Operation auf minimal 7,9 g\/dl/);
  assert.equal(t.zustand, "vorschlag");
});

test("Standardprotokoll im Fall (r5-protokolle): Ein ersetzter Satz gibt seine Gehhilfe nicht weiter und bekommt keine", () => {
  let f = vorlage("station-hueft-tep");
  // Gehhilfe im Procedere beantwortet, danach das Protokoll übernommen: Der Satz steht nicht mehr im Brief.
  f = mitAngabe(f, PROC, `${PROC}/womit`, "2"); // Rollator
  assert.match(token(f, EB)!.t, /Rollator/, "vor dem Protokoll: Antwort aus dem Procedere grau im Entlassbefund");
  f = mitProtokoll(f, "proc-st-protokoll-hueft-tep-1", index);
  assert.equal(token(f, PROC), undefined, "der Satz tritt hinter das Protokoll zurück");
  assert.equal(uebertragungen(f, index, undefined, ersetzteStellen(f, index)).has(`${EB}/hilfsmittel`), false);
  assert.doesNotMatch(token(f, EB)!.t, /Rollator/, "eine Antwort aus einem Satz, der nicht im Brief steht, wandert nicht");
  // Umgekehrt: Die Antwort im Entlassbefund geht nicht in den ersetzten Satz, und Übernehmen schreibt dort nichts.
  f = mitAngabe(f, EB, `${EB}/hilfsmittel`, "2");
  assert.equal(uebernehmen(f, [PROC], index).slots[`${PROC}/womit`], "2", "der eigene Wert von vorher bleibt, wie er war");
  assert.equal(token(f, VERL) && /Unterarmgehstützen/.test(token(f, VERL)!.t), true, "Verlauf bekommt die Antwort des Entlassbefunds");
});

test("Folgeangabe und sichere Rücknahme (r5-fixes): Nimmt die App den getippten Wert zurück, ist die Einheit nicht mehr Aussage", () => {
  const vorher = mitBaustein(vorlage("station-hueft-tep"), "dgn-st-labor", index);
  const nachher = mitAngabe(vorher, "dgn-st-labor/hb-aufnahme", "dgn-st-labor/hb-aufnahme/w", "11,2");
  assert.equal(token(nachher, "dgn-st-labor/hb-aufnahme")!.zustand, "gesetzt");
  const zurueck = sicherZuruecknehmen(nachher, [{ vorher, nachher }], (f) => renderBrief(f, index)).fall;
  const hb = token(zurueck, "dgn-st-labor/hb-aufnahme")!;
  assert.notEqual(hb.zustand, "gesetzt", "ohne den getippten Wert kein schwarzer Satz mit „g/dl“");
  assert.equal(zurueck.slots["dgn-st-labor/hb-aufnahme/w"], undefined);
});
