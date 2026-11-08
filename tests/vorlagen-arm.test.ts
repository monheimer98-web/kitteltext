// SP-F1 (Mängelliste, 08.11.2026): Briefe zur Oberarmfraktur schlugen Belastung des
// Beins und Gehhilfe vor. Der Test sichert die Vorauswahl und die Röntgenregion, die
// als Index vorbelegt ist und bei einer neuen Option davor still wandern würde (PS-B2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const vorlagen = lies("../src/data/vorlagen/station-ergaenzung.json");
const liste: any[] = Array.isArray(vorlagen) ? vorlagen : vorlagen.vorlagen;
const station = lies("../src/data/corpus/brief-station.json");

function finde(x: any, id: string): any {
  if (Array.isArray(x)) for (const e of x) { const r = finde(e, id); if (r) return r; }
  else if (x && typeof x === "object") {
    if (x.id === id) return x;
    for (const v of Object.values(x)) { const r = finde(v, id); if (r) return r; }
  }
  return undefined;
}

const roentgen = finde(station, "proc-st-kontrollen").segmente.find((s: any) => s.id === "roentgen");
const regionen: string[] = roentgen.slots.find((s: any) => s.id === "region").optionen;
const anker: string[] = roentgen.slots.find((s: any) => s.id === "anker").optionen;

for (const id of [
  "station-proximale-humerusfraktur-konservativ",
  "station-proximale-humerusfraktur-osteosynthese",
  "station-proximale-humerusfraktur-inverse-prothese",
]) {
  test(`${id}: Arm statt Bein im Procedere, Röntgen der Schulter`, () => {
    const v = liste.find((x) => x.id === id);
    assert.ok(v, id);
    const { an, aus, slots } = v.vorgaben;
    for (const x of ["proc-st-belastung/bein", "proc-st-belastung/hilfsmittel"]) assert.ok(aus.includes(x), x);
    for (const x of ["proc-st-belastung/arm", "proc-st-verhalten/finger", "proc-st-kontrollen/roentgen"]) assert.ok(an.includes(x), x);
    assert.equal(regionen[slots["proc-st-kontrollen/roentgen/region"]], " der Schulter");
    const erwartet = id.endsWith("konservativ") ? "dem Unfall" : "der Operation";
    assert.equal(anker[slots["proc-st-kontrollen/roentgen/anker"] ?? 0], erwartet);
  });
}
