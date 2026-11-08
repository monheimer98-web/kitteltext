// Zugangscode als Prüfwert (E-51): SHA-256 gegen die Prüfvektoren aus FIPS 180-4
// und die Regeln des Vergleichs. Der Code selbst steht in keiner Datei.
import { test } from "node:test";
import assert from "node:assert/strict";
import { alsHex, sha256 } from "../src/sha256.ts";
import { ZUGANG_PRUEFWERT, pruefeCode, zugangsPruefwert } from "../src/access.ts";

const hex = (s: string) => alsHex(sha256(new TextEncoder().encode(s)));

test("SHA-256 stimmt mit den Prüfvektoren überein", () => {
  assert.equal(hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(
    hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
  // Genau 64 Byte: Die Auffüllung braucht einen zweiten Block.
  assert.equal(hex("a".repeat(64)), "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb");
  // Umlaute als UTF-8.
  assert.equal(hex("Größe"), "aedc3f80989a6546962705852b2f4a481dbd1e490760693525c3724bacab3f50");
});

test("Prüfwert: Groß- und Kleinschreibung und Leerraum am Rand zählen nicht", () => {
  assert.equal(zugangsPruefwert("  Beispiel Code 12 "), zugangsPruefwert("beispiel code 12"));
  assert.notEqual(zugangsPruefwert("beispielcode12"), zugangsPruefwert("beispiel code 12"));
  assert.match(ZUGANG_PRUEFWERT, /^[0-9a-f]{64}$/);
});

test("Ein falscher Code schaltet nicht frei", () => {
  assert.equal(pruefeCode("falsch"), false);
  assert.equal(pruefeCode(""), false);
  assert.equal(pruefeCode(ZUGANG_PRUEFWERT), false);
});
