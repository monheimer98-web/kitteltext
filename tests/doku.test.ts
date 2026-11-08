// Doku und App sagen dasselbe: Die Tastaturtabelle der Einstellungen steht Wort für Wort in der Anleitung (QA-18).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPERRE, TASTATUR, TASTENSPERRE } from "../src/data/tastatur.ts";
import { SCHRECKZEIT_MS } from "../src/engine/tippzug.ts";

const ANLEITUNG = readFileSync(new URL("../ANLEITUNG.md", import.meta.url), "utf8");

function abschnitt(titel: string): string {
  const start = ANLEITUNG.indexOf(`## ${titel}\n`);
  assert.ok(start >= 0, `Abschnitt „${titel}“ fehlt in ANLEITUNG.md`);
  const ende = ANLEITUNG.indexOf("\n## ", start + 1);
  return ANLEITUNG.slice(start, ende < 0 ? undefined : ende);
}

test("Tastaturtabelle: Einstellungen und Anleitung nennen dieselben Tasten mit derselben Wirkung (QA-18)", () => {
  const zeilen = abschnitt("Tastatur")
    .split("\n")
    .filter((z) => z.startsWith("| ") && !z.startsWith("| Taste |"))
    .map((z) => z.slice(2, -2).split(" | "));
  assert.deepEqual(
    zeilen.map(([taste, wirkt]) => ({ taste, wirkt })),
    TASTATUR.map((r) => ({ ...r })),
  );
  assert.ok(abschnitt("Tastatur").includes(TASTENSPERRE), "Absatz zur Tastensperre fehlt oder weicht ab");
});

test("Tastaturtabelle lehrt E-43 und E-44: Enter setzt nichts Unmarkiertes, Ü übernimmt, Sperre nach verirrter Taste", () => {
  const taste = (t: string) => TASTATUR.find((r) => r.taste === t)?.wirkt ?? "";
  assert.match(taste("Enter"), /Sonst setzt Enter nichts/);
  assert.doesNotMatch(taste("Enter"), /übernehmen|Bestätigen/);
  assert.match(taste("Ü"), /übernimmt den grauen Vorschlag/);
  assert.ok(!TASTATUR.some((r) => r.taste.startsWith("Enter in der Befundliste")), "die alte Zeile „Enter in der Befundliste übernimmt“ ist zurück");
  // Die Zeit im Text ist die Schreckzeit der Engine.
  assert.ok(TASTENSPERRE.includes(`${String(SCHRECKZEIT_MS / 1000).replace(".", ",")} Sekunden`));
  // Ein Satz zur Sperre, wortgleich in Fensterfuß, Meldung und Absatz (MT-01, R2-06).
  assert.ok(TASTENSPERRE.includes(SPERRE), "Der Absatz nennt den Sperrsatz nicht wörtlich");
  // Tab im Eingabefeld heißt weiter, nie „zum nächsten Bedienelement“ (PS-N05).
  assert.match(taste("Tab"), /^im Eingabefeld: weiter/);
  assert.doesNotMatch(ANLEITUNG, /Tastenkappe|Knopfreihe|der Zeiger|Vertippt\?/, "Werkstattwörter in der Anleitung (MT-06, MT-14 bis MT-16)");
});
