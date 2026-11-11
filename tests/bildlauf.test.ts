// Bildlauf (CR-R6F-03, PS-R6F-5): Eine ausgewählte Lücke kommt ins Bild, mit möglichst kleiner Bewegung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verschiebung } from "../src/engine/bildlauf.ts";

const sicht = { oben: 100, unten: 500 };

test("Liegt das Ziel im Bild, bewegt sich nichts, auch nicht am Rand", () => {
  assert.equal(verschiebung(sicht, { oben: 200, unten: 220 }), 0);
  assert.equal(verschiebung(sicht, { oben: 100, unten: 120 }), 0);
  assert.equal(verschiebung(sicht, { oben: 480, unten: 500 }), 0);
  assert.equal(verschiebung(sicht, { oben: 200, unten: 220 }, 20), 0);
});

test("Unter dem Bild: rückt so weit, dass das Ziel mit Rand unten steht", () => {
  assert.equal(verschiebung(sicht, { oben: 900, unten: 920 }), 420);
  assert.equal(verschiebung(sicht, { oben: 900, unten: 920 }, 20), 440);
  // Knapp am Rand: Der Rand gilt auch hier.
  assert.equal(verschiebung(sicht, { oben: 470, unten: 490 }, 20), 10);
});

test("Über dem Bild, etwa unter dem stehenden Kopf: rückt zurück, bis das Ziel mit Rand oben steht", () => {
  assert.equal(verschiebung(sicht, { oben: 40, unten: 60 }), -60);
  assert.equal(verschiebung(sicht, { oben: 40, unten: 60 }, 20), -80);
  assert.equal(verschiebung(sicht, { oben: 110, unten: 130 }, 20), -10);
});

test("Höher als das Bild: Der Anfang des Ziels kommt ins Bild", () => {
  assert.equal(verschiebung(sicht, { oben: 300, unten: 1000 }), 200);
  // Ohne Platz für den Rand steht der Anfang an der Oberkante.
  assert.equal(verschiebung(sicht, { oben: 300, unten: 1000 }, 20), 200);
  assert.equal(verschiebung(sicht, { oben: 0, unten: 1000 }, 20), -100);
});

test("Ist der Ausschnitt knapp, wird der Rand kleiner statt das Ziel abzuschneiden", () => {
  // 40 px Ausschnitt, 20 px Ziel: höchstens 10 px Rand je Seite.
  assert.equal(verschiebung({ oben: 0, unten: 40 }, { oben: 100, unten: 120 }, 20), 90);
  assert.equal(verschiebung({ oben: 0, unten: 40 }, { oben: -100, unten: -80 }, 20), -110);
});
