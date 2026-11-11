// Stand je Abschnitt, reine Logik (PS-R6-3, E-86): welcher Abschnitt sich durch eine Eingabe geändert hat und wie alt sein
// Text ist. Der Ablauf im Store (Eingabe, Zurücknehmen, Neuladen) steht in behalten-ablauf.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { KATALOG } from "../src/data/katalog.ts";
import { indexiere, renderBrief } from "../src/engine/render.ts";
import { ergaenzt, mitVorlage, neuerFall } from "../src/engine/fall.ts";
import { neuerStand, standText, standVon } from "../src/engine/stand.ts";
import type { Fall } from "../src/model/types.ts";

const index = indexiere(KATALOG);
// Ortszeit wie am Klinik-PC: Montag, 09.11.2026, 14:10.
const MO_1410 = new Date(2026, 10, 9, 14, 10).getTime();
const DI_0900 = new Date(2026, 10, 10, 9, 0).getTime();
const MI_0800 = new Date(2026, 10, 11, 8, 0).getTime();
const DO_1000 = new Date(2026, 10, 12, 10, 0).getTime();

function hueftTep(): Fall {
  return mitVorlage(neuerFall("station", index, 1, MO_1410), index.vorlagen.get("station-hueft-tep")!, index);
}

test("Neuer Stand: nur Abschnitte, deren Text sich geändert hat, bekommen den Zeitpunkt; sonst dasselbe Objekt", () => {
  const vor = hueftTep();
  const nach: Fall = { ...vor, zusatz: { verlauf: "Tag 2: mobil am Rollator" } };
  const stand = neuerStand(vor.abschnittStand, renderBrief(vor, index), renderBrief(nach, index), DI_0900);
  assert.deepEqual(stand, { verlauf: DI_0900 });
  assert.deepEqual(vor.abschnittStand, {}, "der alte Stand bleibt unverändert");
  // Was den Text nicht ändert, ändert den Stand nicht.
  const gleich = { ...nach, etikett: "Merker" };
  assert.equal(neuerStand(stand, renderBrief(nach, index), renderBrief(gleich, index), MI_0800), stand);
  // Eine zweite Änderung an einem anderen Abschnitt lässt den ersten Stand stehen.
  const weiter: Fall = { ...nach, abschnittStand: stand, zusatz: { ...nach.zusatz, anamnese: "Sturz beim Wandern" } };
  assert.deepEqual(neuerStand(stand, renderBrief(nach, index), renderBrief(weiter, index), MI_0800), { verlauf: DI_0900, anamnese: MI_0800 });
});

test("Neuer Stand: die Seite im Fallkopf ändert jeden Abschnitt, in dem sie steht", () => {
  const vor = hueftTep();
  const nach: Fall = { ...vor, seite: "rechts" };
  const b = renderBrief(nach, index);
  const geaendert = b.abschnitte.filter((a) => a.text !== renderBrief(vor, index).abschnitte.find((x) => x.id === a.id)?.text).map((a) => a.id);
  assert.ok(geaendert.length > 0, "die Vorlage nennt die Seite");
  assert.deepEqual(Object.keys(neuerStand({}, renderBrief(vor, index), b, DI_0900)).sort(), [...geaendert].sort());
});

test("Stand in Worten: heute leer, sonst der Tag; mehrere Abschnitte mit dem frühesten Tag und „teils“", () => {
  const f = { erstellt: MO_1410, abschnittStand: { verlauf: DO_1000, anamnese: MI_0800 } };
  assert.equal(standText(f, ["verlauf"], DO_1000 + 3600_000), "");
  assert.equal(standText(f, ["anamnese"], DO_1000), "Stand gestern");
  // Ohne eigenen Stand gilt der Beginn des Falls.
  assert.equal(standVon(f, "befund"), MO_1410);
  assert.equal(standText(f, ["befund"], DO_1000), "Stand Mo 09.11.");
  assert.equal(standText(f, ["verlauf", "anamnese", "befund"], DO_1000), "Stand teils Mo 09.11.");
  assert.equal(standText(f, ["anamnese", "befund"], DO_1000), "Stand Mo 09.11.", "alle von früheren Tagen: ohne „teils“");
  assert.equal(standText(f, [], DO_1000), "");
  // Kurz nach Mitternacht ist der Text von 23:59 schon von gestern.
  const spaet = new Date(2026, 10, 9, 23, 59).getTime();
  assert.equal(standText({ erstellt: spaet, abschnittStand: {} }, ["befund"], new Date(2026, 10, 10, 0, 1).getTime()), "Stand gestern");
});

test("Gelesener Fall: ohne Stand je Abschnitt ein leerer, Unbrauchbares entfällt", () => {
  const roh = JSON.parse(JSON.stringify(hueftTep())) as Record<string, unknown>;
  delete roh.abschnittStand;
  assert.deepEqual(ergaenzt(roh, index)!.abschnittStand, {});
  const kaputt = ergaenzt({ ...roh, abschnittStand: { verlauf: "gestern", anamnese: DI_0900, befund: null } }, index)!;
  assert.deepEqual(kaputt.abschnittStand, { anamnese: DI_0900 });
});
