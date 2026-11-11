// Einmal eingeben (M-14) und Folgeangaben (M-24), E-60: Antworten anderer Stellen erscheinen, wo noch keine steht;
// eigene Antworten gehen vor; anderer Bezug ist Vorschlag; Folgeangaben werden mit den Pflichtangaben zur Aussage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KATALOG } from "../src/data/katalog.ts";
import { indexiere, renderBrief } from "../src/engine/render.ts";
import type { KatalogIndex } from "../src/engine/render.ts";
import { mitAngabe, mitAuswahl, mitBaustein, mitOption, mitPerson, mitSeite, mitSlot, mitVorlage, mitWert, neuerFall, sicherZuruecknehmen, uebernehmen } from "../src/engine/fall.ts";
import { regelFehler, uebertragungen, uebertragungenAn, wahlImFenster, widersprueche } from "../src/engine/kopplung.ts";
import { ersetzteStellen, mitProtokoll } from "../src/engine/protokoll.ts";
import type { Token } from "../src/engine/text.ts";
import { findeAbgleichhinweise } from "../src/engine/abgleich.ts";
import { ABGLEICHREGELN } from "../src/data/abgleich.ts";
import type { BefundSlot, Fall } from "../src/model/types.ts";

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

test("PS-R6F-2: Ein geleertes Textfeld zeigt den Vorschlag wieder; eine Allergie neben „keine bekannt“ meldet der Abgleich", () => {
  const MED = "med-st-entlassung/unvertraeglich";
  let f = mitWert(vorlage("station-hueft-tep"), "ana-st-elektiv/allergien", "Penicillin (Exanthem)");
  // Getippt und wieder gelöscht: wieder grau mit dem Wortlaut der Anamnese, nicht offen ohne ihn.
  f = mitWert(mitWert(f, MED, "ü"), MED, "");
  assert.equal(token(f, MED)!.t, "Penicillin (Exanthem)");
  assert.equal(token(f, MED)!.zustand, "vorschlag");
  assert.equal(uebertragungen(f, index).get(MED)?.wert, "Penicillin (Exanthem)");
  assert.equal(uebernehmen(f, [MED], index).werte[MED], "Penicillin (Exanthem)");
  // Nur Leerraum gilt auch als leer.
  assert.equal(token(mitWert(f, MED, "  "), MED)!.zustand, "vorschlag");
  const allergie = (x: Fall) =>
    findeAbgleichhinweise(renderBrief(x, index), ABGLEICHREGELN)
      .filter((h) => h.text.startsWith("Allergien:"))
      .map((h) => h.text);
  // Grau zählt nicht: Erst eine Aussage auf beiden Seiten ist ein Widerspruch.
  assert.deepEqual(allergie(f), []);
  assert.deepEqual(allergie(mitWert(f, MED, "keine bekannt")), ["Allergien: Die Anamnese nennt eine Allergie, die Medikation keine Arzneimittelunverträglichkeit."]);
  assert.deepEqual(allergie(mitWert(f, MED, "Penicillin (Exanthem)")), []);
  assert.deepEqual(allergie(mitWert(f, MED, "Latex")), []);
  // Umgekehrt: keine Allergie in der Anamnese, eine Unverträglichkeit in der Medikation.
  const g = mitWert(mitWert(vorlage("station-hueft-tep"), "ana-st-elektiv/allergien", "keine bekannt"), MED, "Metamizol (Agranulozytose)");
  assert.deepEqual(allergie(g), ["Allergien: Die Anamnese nennt keine Allergie, die Medikation eine Arzneimittelunverträglichkeit."]);
  for (const nein of ["keine", "Keine bekannt", "nicht bekannt"]) assert.deepEqual(allergie(mitWert(g, MED, nein)), [], nein);
});

test("E-92: Widersprüche gekoppelter Stellen meldet der Abgleich sofort, auch wenn ein Satz noch Lücken hat, und nur einmal", () => {
  const hinweise = (x: Fall) => findeAbgleichhinweise(renderBrief(x, index), ABGLEICHREGELN).map((h) => h.text);
  // Naht: Entlassbefund Klammern, Procedere Nähte; Wann und Wer offen.
  let f = mitAuswahl(vorlage("station-hueft-tep"), "eb-st-wunde/naht", 1);
  assert.deepEqual(widersprueche(f, index), []);
  f = mitAngabe(f, "proc-st-wunde/naht", "proc-st-wunde/naht/material", "1");
  assert.equal(token(f, "proc-st-wunde/naht")!.zustand, "offen");
  assert.deepEqual(widersprueche(f, index), [
    {
      kopplung: "Naht- oder Klammermaterial",
      stellen: [
        { key: "eb-st-wunde/naht", abschnitt: "entlassbefund", begriff: "Klammern" },
        { key: "proc-st-wunde/naht/material", abschnitt: "procedere", begriff: "Nähte" },
      ],
    },
  ]);
  assert.deepEqual(hinweise(f), ["Naht- oder Klammermaterial: Entlassbefund nennt „Klammern“, Procedere nennt „Nähte“."]);
  // Satz fertig: Die Regel über den Text meldet es; der Widerspruch der Kopplung steht nicht ein zweites Mal.
  f = mitAngabe(mitAngabe(f, "proc-st-wunde/naht", "proc-st-wunde/naht/wann", "1"), "proc-st-wunde/naht", "proc-st-wunde/naht/wer", "1");
  assert.deepEqual(hinweise(f), ["Nahtmaterial: Der Entlassbefund nennt Hautklammern, das Procedere Hautnähte."]);
  // Gleiche Antwort: nichts.
  assert.deepEqual(widersprueche(mitAngabe(f, "proc-st-wunde/naht", "proc-st-wunde/naht/material", "2"), index), []);
  // Gehhilfe: Jede beantwortete Stelle mit der nächsten in der Reihenfolge des Aufenthalts, nicht jede mit jeder.
  let g = vorlage("station-hueft-tep");
  g = mitAngabe(g, "verl-st-operativ/mobilisation", "verl-st-operativ/mobilisation/hilfsmittel", "2"); // am Rollator
  g = mitAngabe(g, EB, `${EB}/hilfsmittel`, "3"); // am Rollator
  g = mitAngabe(g, "proc-st-belastung/hilfsmittel", "proc-st-belastung/hilfsmittel/womit", "1"); // an Unterarmgehstützen
  assert.deepEqual(
    widersprueche(g, index).map((w) => w.stellen.map((x) => `${x.abschnitt} ${x.begriff}`).join(" / ")),
    ["entlassbefund Rollator / procedere Unterarmgehstützen"],
  );
  assert.ok(hinweise(g).includes("Gehhilfe: Entlassbefund nennt „Rollator“, Procedere nennt „Unterarmgehstützen“."), hinweise(g).join("\n"));
  // Ein ausgeblendeter Abschnitt sagt nichts.
  assert.deepEqual(widersprueche({ ...g, ausgeblendet: { ...g.ausgeblendet, procedere: true } }, index), []);
  // Freier Text ohne Begriffe ist kein Widerspruch: Allergien und Unverträglichkeiten haben eigene Regeln (E-91).
  const a = mitWert(mitWert(vorlage("station-hueft-tep"), "ana-st-elektiv/allergien", "Penicillin"), "med-st-entlassung/unvertraeglich", "Latex");
  assert.deepEqual(widersprueche(a, index), []);
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

// QA-38: Das Feldfenster zeigt an einer gekoppelten Angabe, was der Brief zeigt. Vorher war die Angabe dort offen, und die
// erste Ziffer setzte gegen den Entlassbefund („der Hautnähte“ neben „Hautklammern noch nicht entfernt“).
test("QA-38: wahlImFenster folgt der Rangfolge des Briefs: eigene Antwort, übertragene, Vorgabe der Vorlage, des Bausteins", () => {
  const optionen = ["", "der Hautnähte", "der Hautklammern"];
  const u = { wert: "2", quelle: "Entlassbefund Operationsgebiet", abschnitt: "entlassbefund" as const, aussage: false };
  assert.deepEqual(wahlImFenster({ optionen, pflicht: true, eigen: undefined, uebertragung: u }), { index: 2, uebertragen: u });
  assert.deepEqual(wahlImFenster({ optionen, pflicht: true, eigen: "1", uebertragung: u }), { index: 1 }, "eigene Antwort geht vor");
  assert.deepEqual(wahlImFenster({ optionen, pflicht: true, eigen: undefined }), { index: undefined }, "ohne alles offen");
  assert.deepEqual(wahlImFenster({ optionen, pflicht: true, eigen: undefined, vorgabe: 1, hausstandard: 2 }), { index: 1 });
  assert.deepEqual(wahlImFenster({ optionen, pflicht: true, eigen: undefined, hausstandard: 2 }), { index: 2 });
  assert.deepEqual(wahlImFenster({ optionen, pflicht: true, eigen: "0" }), { index: undefined }, "leere Möglichkeit einer Pflichtangabe ist keine Antwort");
  assert.deepEqual(wahlImFenster({ optionen, pflicht: true, eigen: undefined, uebertragung: { ...u, wert: "7" } }), { index: undefined }, "ungültige Übertragung zählt nicht");
  // Auffälliger Befund: keine Übertragung, keine Vorgabe mit Text.
  assert.deepEqual(wahlImFenster({ optionen, pflicht: true, eigen: undefined, uebertragung: u, vorgabe: 1, auffaellig: true }), { index: undefined });
  // Ohne Pflicht steht die erste Möglichkeit, wie im Brief.
  assert.deepEqual(wahlImFenster({ optionen: ["", "Schiene"], eigen: undefined }), { index: 0 });
  assert.deepEqual(wahlImFenster({ optionen: ["Schiene", "Gips"], pflicht: true, eigen: undefined }), { index: undefined }, "Pflicht ohne Vorgabe ist offen, auch ohne leere Möglichkeit");
});

test("QA-38: Der Brief trägt die Übertragungen, die er einsetzt; uebertragungenAn findet sie an Satz und Angabe", () => {
  let f = vorlage("station-hueft-tep");
  f = mitAuswahl(f, "eb-st-wunde/naht", 1); // Hautklammern noch nicht entfernt.
  const b = renderBrief(f, index);
  const u = b.uebertragen?.get("proc-st-wunde/naht/material");
  assert.deepEqual(u, { wert: "2", quelle: "Entlassbefund Operationsgebiet", abschnitt: "entlassbefund", aussage: false });
  assert.deepEqual(uebertragungenAn(b.uebertragen, "proc-st-wunde/naht"), [u]);
  assert.deepEqual(uebertragungenAn(b.uebertragen, "proc-st-wunde"), [u]);
  assert.deepEqual(uebertragungenAn(b.uebertragen, "proc-st-wun"), [], "nur ganze Schlüsselteile");
  // Der Satz ist offen (Wann, Wer); die Angabe aus dem Entlassbefund bleibt Vorschlag, auch wenn Wann und Wer beantwortet sind.
  assert.equal(token(f, "proc-st-wunde/naht")!.zustand, "offen");
  f = mitAngabe(f, "proc-st-wunde/naht", "proc-st-wunde/naht/wann", "1");
  f = mitAngabe(f, "proc-st-wunde/naht", "proc-st-wunde/naht/wer", "1");
  assert.equal(token(f, "proc-st-wunde/naht")!.zustand, "vorschlag", "nichts wird still zur Aussage");
  assert.equal(f.slots["proc-st-wunde/naht/material"], undefined);
  const g = uebernehmen(f, ["proc-st-wunde/naht"], index);
  assert.equal(g.slots["proc-st-wunde/naht/material"], "2");
  assert.equal(token(g, "proc-st-wunde/naht")!.zustand, "gesetzt");
});

/**
 * Beantwortet jede andere Angabe des Satzes selbst (Pflicht oder nicht) und schaltet ihn ein, wie ein Arzt, der alles
 * außer der gekoppelten Angabe ausgefüllt hat. Danach kann nur noch die Übertragung den Satz grau halten (PS-R6F-6).
 */
function allesAusserDemZiel(f: Fall, satz: string, slots: readonly BefundSlot[], ziel: string): Fall {
  let g = mitOption(f, satz, true);
  for (const slot of slots) {
    const key = `${satz}/${slot.id}`;
    if (key === ziel) continue;
    const wert = slot.art === "auswahl" ? String(slot.optionen.findIndex((o) => o.trim() !== "")) : slot.art === "zahl" ? "3" : slot.art === "lokaleSeite" ? "rechts" : "kurz";
    g = mitSlot(g, key, wert);
  }
  return g;
}

test("QA-38, PS-R6F-6: In jeder Stationsvorlage zeigt das Fenster an jeder Zielstelle jeder Kopplung die Wahl, die im Brief steht, und keine wird still schwarz", () => {
  const geprueft = { angabe: 0, auswahl: 0, feld: 0 };
  for (const v of index.vorlagen.values()) {
    if (v.setting !== "station") continue;
    // Seite und Person gesetzt: Sonst hielte ‹Patient/Patientin› jeden Satz offen, und „nicht schwarz“ bewiese nichts.
    const basis = mitSeite(mitPerson(mitVorlage(neuerFall("station", index), v, index), "w", "70"), "rechts");
    for (const k of index.katalog.regeln?.kopplungen ?? []) {
      for (const quelle of k.glieder) {
        const [b, s, a] = quelle.key.split("/");
        const baustein = index.bausteine.get(b);
        if (!baustein || !Object.values(basis.bausteine).some((l) => l?.includes(b))) continue;
        const seg = baustein.segmente.find((x) => "id" in x && x.id === s);
        // Jede Antwort der Quelle, die einen Begriff trägt (sonst überträgt sie nichts).
        const antworten: Fall[] = [];
        if (a && seg?.art === "option") {
          const slot = seg.slots?.find((x) => x.id === a);
          if (slot?.art === "auswahl") slot.optionen.forEach((o, i) => o.trim() && antworten.push(mitAngabe(basis, `${b}/${s}`, quelle.key, String(i))));
        } else if (seg?.art === "auswahl") seg.optionen.forEach((o, i) => o.trim() && antworten.push(mitAuswahl(basis, quelle.key, i)));
        else antworten.push(mitWert(basis, quelle.key, "Penicillin"));
        for (const f of antworten) {
          const brief = renderBrief(f, index);
          for (const [ziel, u] of brief.uebertragen ?? []) {
            const [zb, zs, za] = ziel.split("/");
            const zseg = index.bausteine.get(zb)?.segmente.find((x) => "id" in x && x.id === zs);
            const wo = `${v.id}: ${quelle.key} → ${ziel}`;
            if (za && zseg?.art === "option") {
              // Angabe in einem Satz: Fenster und Brief zeigen dieselbe Wahl.
              const slot = zseg.slots?.find((x) => x.id === za);
              if (slot?.art !== "auswahl") continue;
              const satzKey = `${zb}/${zs}`;
              const satz = brief.abschnitte.flatMap((x) => x.tokens).find((t) => t.key === satzKey);
              if (!satz || f.eigen[satzKey] !== undefined) continue;
              const w = wahlImFenster({ optionen: slot.optionen, pflicht: slot.required, eigen: f.slots[ziel], vorgabe: v.vorgaben?.slots?.[ziel], hausstandard: slot.default, uebertragung: u });
              assert.equal(w.uebertragen, u, wo);
              const text = slot.optionen[w.index!].trim().replace(/[.,]$/, "");
              assert.ok(satz.t.includes(text), `${wo} zeigt „${text}“, der Brief „${satz.t}“`);
              assert.ok(satz.uebertragen?.includes(u.quelle), `${wo} nennt die Herkunft`);
              if (u.aussage) continue;
              // Alles andere selbst beantwortet: grau, solange die gekoppelte Angabe nur übertragen ist; selbst gewählt schwarz.
              const voll = allesAusserDemZiel(f, satzKey, zseg.slots ?? [], ziel);
              const nochUebertragen = renderBrief(voll, index).uebertragen?.get(ziel);
              if (!nochUebertragen || nochUebertragen.aussage) continue;
              assert.equal(token(voll, satzKey)?.zustand, "vorschlag", `${wo} ist nicht still Aussage`);
              assert.equal(token(mitSlot(voll, ziel, nochUebertragen.wert), satzKey)?.zustand, "gesetzt", `${wo}: selbst gewählt wird der Satz Aussage`);
              geprueft.angabe++;
            } else if (!za && zseg?.art === "auswahl") {
              // Auswahl ohne Satz (Naht im Entlassbefund, Dauer der Überwachung).
              const t = token(f, ziel);
              if (!t || u.aussage) continue;
              assert.equal(t.zustand, "vorschlag", `${wo} ist nicht still Aussage`);
              assert.ok(t.uebertragen?.includes(u.quelle), `${wo} nennt die Herkunft`);
              assert.equal(token(mitAuswahl(f, ziel, Number(u.wert)), ziel)?.zustand, "gesetzt", `${wo}: selbst gewählt Aussage`);
              geprueft.auswahl++;
            } else if (!zseg) {
              // Freitextfeld (Allergien, Unverträglichkeiten).
              const t = token(f, ziel);
              if (!t || u.aussage) continue;
              assert.equal(t.zustand, "vorschlag", `${wo} ist nicht still Aussage`);
              assert.ok(t.t.includes(u.wert), `${wo} zeigt „${u.wert}“`);
              assert.equal(token(mitWert(f, ziel, u.wert), ziel)?.zustand, "gesetzt", `${wo}: selbst eingetragen Aussage`);
              geprueft.feld++;
            }
          }
        }
      }
    }
  }
  assert.ok(geprueft.angabe > 100, `nur ${geprueft.angabe} Angaben geprüft`);
  assert.ok(geprueft.auswahl > 0, "keine Auswahl geprüft");
  assert.ok(geprueft.feld > 0, "kein Freitextfeld geprüft");
});
