// „Arbeitsplatz räumen“ (E-81): Frage, Knöpfe und Meldung mit den richtigen Zahlen. Das Löschen selbst prüfen
// tests/behalten-ablauf.test.ts und tests/e2e/behalten.spec.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { geraeumtText, raeumenFrage, raeumenKnoepfe } from "../src/engine/raeumen.ts";

test("Frage: ohne behaltene wie bisher, mit behaltenen nennt sie Zahl oder Kurzbezeichnung und die Fälle dieses Fensters", () => {
  assert.equal(raeumenFrage({ fenster: 1, behalten: 0 }), "Den offenen Fall löschen?");
  assert.equal(raeumenFrage({ fenster: 3, behalten: 0 }), "Alle 3 Fälle löschen?");
  assert.equal(raeumenFrage({ fenster: 0, behalten: 1, einziger: "Zi 12" }), "Auf diesem PC liegt 1 behaltener Fall („Zi 12“). Was soll gelöscht werden?");
  assert.equal(raeumenFrage({ fenster: 2, behalten: 3 }), "Auf diesem PC liegen 3 behaltene Fälle, in diesem Fenster 2 weitere Fälle. Was soll gelöscht werden?");
  assert.equal(raeumenFrage({ fenster: 1, behalten: 2 }), "Auf diesem PC liegen 2 behaltene Fälle, in diesem Fenster 1 weiterer Fall. Was soll gelöscht werden?");
  assert.deepEqual(raeumenKnoepfe({ fenster: 0, behalten: 1 }), { bleiben: "Räumen, behaltener Fall bleibt", alles: "Alles löschen, auch den behaltenen" });
  assert.deepEqual(raeumenKnoepfe({ fenster: 0, behalten: 4 }), { bleiben: "Räumen, behaltene Fälle bleiben", alles: "Alles löschen, auch die 4 behaltenen" });
});

test("Meldung: sagt, was gelöscht ist, nie „alle Fälle“; behaltene nur als gelöscht, wenn es nachweislich geklappt hat", () => {
  const ok = (text: string) => ({ text, art: "ok" as const });
  assert.deepEqual(
    geraeumtText({ fenster: 2, behalten: { art: "geloescht", anzahl: 3 }, ablage: true }),
    ok("Arbeitsplatz geräumt: 2 Fälle dieses Fensters und 3 behaltene Fälle gelöscht, Zwischenablage überschrieben. Eigene Bausteine und Vorlagen bleiben."),
  );
  assert.deepEqual(
    geraeumtText({ fenster: 1, behalten: { art: "geloescht", anzahl: 0 }, ablage: true }),
    ok("Arbeitsplatz geräumt: 1 Fall dieses Fensters gelöscht, Zwischenablage überschrieben. Eigene Bausteine und Vorlagen bleiben."),
  );
  assert.deepEqual(
    geraeumtText({ fenster: 0, behalten: { art: "geloescht", anzahl: 1 }, ablage: true }),
    ok("Arbeitsplatz geräumt: 1 behaltener Fall gelöscht, Zwischenablage überschrieben. Eigene Bausteine und Vorlagen bleiben."),
  );
  assert.deepEqual(
    geraeumtText({ fenster: 2, behalten: { art: "bleiben", anzahl: 1 }, ablage: true }),
    ok("Arbeitsplatz geräumt: 2 Fälle dieses Fensters gelöscht, Zwischenablage überschrieben. 1 behaltener Fall bleibt unter „Behaltene Fälle“ bis zu seinem Ablauf. Eigene Bausteine und Vorlagen bleiben."),
  );
  assert.deepEqual(
    geraeumtText({ fenster: 0, behalten: { art: "bleiben", anzahl: 3 }, ablage: true }),
    ok("Arbeitsplatz geräumt: Zwischenablage überschrieben. 3 behaltene Fälle bleiben unter „Behaltene Fälle“ bis zu ihrem Ablauf. Eigene Bausteine und Vorlagen bleiben."),
  );
  const verweigert = geraeumtText({ fenster: 1, behalten: { art: "verweigert", anzahl: 2 }, ablage: true });
  assert.equal(verweigert.art, "fehler");
  assert.equal(
    verweigert.text,
    "Arbeitsplatz geräumt: 1 Fall dieses Fensters gelöscht, Zwischenablage überschrieben. Nicht gelöscht: Der Browser hat das Löschen der behaltenen Fälle verweigert, sie liegen weiter auf diesem PC. Bitte melden. Eigene Bausteine und Vorlagen bleiben.",
  );
  assert.doesNotMatch(verweigert.text, /behaltene Fälle gelöscht/);
  const ohneAblage = geraeumtText({ fenster: 1, behalten: { art: "geloescht", anzahl: 0 }, ablage: false });
  assert.equal(ohneAblage.art, "fehler");
  assert.match(ohneAblage.text, /Zwischenablage nicht überschrieben/);
  for (const r of [verweigert, ohneAblage]) assert.doesNotMatch(r.text, /alle Fälle/i);
});
