// Belegtests des Code-Reviews (Nachprüfung 07./08.10.2026), Bereich Engine.
// Rot = der Befund besteht. Grün mit Vorsilbe „widerlegt“ = Verdacht trifft nicht zu.
// Eigene kleine Bausteine, unabhängig vom Katalog.
// Start: node --test "tests/belege/review-*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIEFTYPEN } from "../../src/data/katalog.ts";
import { indexiere, renderBrief } from "../../src/engine/render.ts";
import type { AbschnittAnsicht } from "../../src/engine/render.ts";
import { ergaenzt, mitBefund, mitEigenemText, mitManuell, mitSeite, mitSlot, mitSpaeter, mitVorlage, nachKatalogwechsel, neuerFall, uebernehmen } from "../../src/engine/fall.ts";
import type { AbschnittId, Baustein, Fall, Platzhalter, Segment, Vorlage } from "../../src/model/types.ts";

function baustein(id: string, abschnitt: AbschnittId, segmente: Segment[], platzhalter: Platzhalter[] = []): Baustein {
  return { id, titel: id, typ: "untersuchung", abschnitt, platzhalter, segmente };
}
function vorlage(id: string, abschnitte: Partial<Record<AbschnittId, string[]>>, mehr: Partial<Vorlage> = {}): Vorlage {
  return { id, titel: id, region: "t", setting: "zna", abschnitte, status: "entwurf", ...mehr };
}

const BAUSTEINE: Baustein[] = [
  baustein("r-satz", "therapie", [
    {
      art: "option",
      id: "gips",
      label: "Ruhigstellung",
      an: true,
      text: "{art} {seite} für {wochen} angelegt.",
      slots: [
        { art: "auswahl", id: "art", label: "Art", required: true, optionen: ["", "Unterarmgipsschiene", "Oberarmgips"] },
        { art: "zahl", id: "wochen", label: "Dauer", einheit: "Wochen", required: true },
      ],
    },
  ]),
  baustein("r-befund", "befund", [
    { art: "text", text: "Schulter: " },
    { art: "befund", id: "bew", chip: "Beweglichkeit", gruppe: "Funktion", normal: "Schulter {seite} frei beweglich. ", abweichung: "Bewegung {seite} eingeschränkt {wo}. ", slots: [{ art: "detail", id: "wo", label: "Wo", maxLen: 80 }] },
    { art: "befund", id: "ds", chip: "Druckschmerz", gruppe: "Palpation", normal: "Kein Druckschmerz.", abweichung: "Druckschmerz." },
  ]),
  baustein(
    "r-feld",
    "anamnese",
    [
      { art: "text", text: "Hergang: " },
      { art: "platzhalter", ref: "hergang" },
      { art: "text", text: "." },
    ],
    [{ id: "hergang", typ: "freitext", label: "Unfallhergang", required: true }],
  ),
  baustein(
    "r-kaputt",
    "procedere",
    [
      { art: "text", text: "Kontrolle " },
      { art: "platzhalter", ref: "wann" },
      { art: "text", text: " empfohlen." },
    ],
    [{ id: "wann", typ: "auswahl", label: "Wann", optionen: ["in 7 Tagen"], default: "5" }],
  ),
  baustein("r-leer", "procedere", [
    { art: "text", text: "Hinweis:" },
    { art: "option", id: "frei", label: "Freier Hinweis", an: true, text: "{was}", slots: [{ art: "detail", id: "was", label: "Was", maxLen: 80 }] },
  ]),
];

const INDEX = indexiere({ version: 1, regionen: [{ id: "t", name: "T", kuerzel: "T", bausteine: BAUSTEINE }], vorlagen: [], brieftypen: BRIEFTYPEN });
const V_SATZ = vorlage("v-satz", { therapie: ["r-satz"] });
const V_BEFUND = vorlage("v-befund", { befund: ["r-befund"] }, { entscheiden: ["r-befund/ds"] });
const V_FELD = vorlage("v-feld", { anamnese: ["r-feld"] });
const V_KAPUTT = vorlage("v-kaputt", { procedere: ["r-kaputt"] });
const V_LEER = vorlage("v-leer", { procedere: ["r-leer"] });
const V_DOPPELT = vorlage("v-doppelt", { befund: ["r-befund"], diagnostik: ["r-befund"] });
for (const v of [V_SATZ, V_BEFUND, V_FELD, V_KAPUTT, V_LEER, V_DOPPELT]) INDEX.vorlagen.set(v.id, v);

const fallAus = (v: Vorlage): Fall => mitVorlage(neuerFall("zna", INDEX), v, INDEX);
const abschnitt = (f: Fall, id: AbschnittId): AbschnittAnsicht => renderBrief(f, INDEX).abschnitte.find((a) => a.id === id)!;
const zahl = (a: AbschnittAnsicht, zustand: string) => a.tokens.filter((t) => t.zustand === zustand).length;

test("NL-1 Zählung: „offen“ nennt die Zahl der Stellen, die zu klären sind (Satz mit drei fehlenden Angaben)", () => {
  const a = abschnitt(fallAus(V_SATZ), "therapie");
  // Ein Satz, eine Stelle im Brief, ein Halt im Durchlauf; gezählt werden Art, Seite und Dauer einzeln.
  assert.equal(zahl(a, "offen"), 1);
  assert.equal(a.offen, zahl(a, "offen"), `Zähler ${a.offen}, Stellen ${zahl(a, "offen")}: ${a.text}`);
});

test("NL-1 Zählung: eigener Wortlaut mit {seite} ohne gewählte Seite zählt eine Lücke nicht doppelt", () => {
  let f = fallAus(V_BEFUND);
  f = mitBefund(f, "r-befund/bew", "abw");
  f = mitEigenemText(f, "r-befund/bew", "Abduktion {seite} bis 60 Grad. ");
  f = mitBefund(f, "r-befund/ds", "ok");
  const a = abschnitt(f, "befund");
  assert.equal((a.text.match(/‹/g) ?? []).length, 1, a.text);
  assert.equal(a.offen, 1, `eine Lücke im Text, Zähler sagt ${a.offen}`);
});

test("NS-2 (Engine-Anteil) Bestätigter Normalbefund mit fehlender Seite ist als offene Stelle gekennzeichnet", () => {
  let f = fallAus(V_BEFUND);
  f = mitBefund(f, "r-befund/bew", "ok");
  const t = abschnitt(f, "befund").tokens.find((x) => x.key === "r-befund/bew")!;
  assert.match(t.t, /‹Seite›/);
  // Die Oberfläche sperrt das Kopieren einer Markierung nur an Stellen mit Zustand „offen“ oder „vorschlag“.
  assert.equal(t.zustand, "offen", `Text „${t.t.trim()}“ trägt Zustand „${t.zustand}“`);
});

test("NL-2 uebernehmen macht aus einem zu entscheidenden Befund keinen Normalbefund", () => {
  const f = uebernehmen(fallAus(V_BEFUND), ["r-befund/ds"], INDEX);
  assert.equal(f.befund["r-befund/ds"], undefined, "Befund aus `entscheiden` wurde als unauffällig übernommen");
});

test("NL-3 Jeder gezählte Vorschlag hat eine sichtbare Stelle (Feld mit ungültiger Vorgabe)", () => {
  const a = abschnitt(fallAus(V_KAPUTT), "procedere");
  assert.equal(a.vorschlag, zahl(a, "vorschlag"), `Zähler ${a.vorschlag}, graue Stellen ${zahl(a, "vorschlag")}: „${a.text}“ ist ohne Ausweg gesperrt`);
});

test("NL-3 Jeder gezählte Vorschlag hat eine sichtbare Stelle (vorgeschlagener Satz ohne Text)", () => {
  const a = abschnitt(fallAus(V_LEER), "procedere");
  assert.equal(a.vorschlag, zahl(a, "vorschlag"), `Zähler ${a.vorschlag}, graue Stellen ${zahl(a, "vorschlag")}: „${a.text}“ ist ohne Ausweg gesperrt`);
});

test("NL-4 Katalogwechsel: eigener Wortlaut eines Befunds verfällt mit der Abweichung", () => {
  let f = fallAus(V_BEFUND);
  f = mitBefund(f, "r-befund/bew", "abw");
  f = mitEigenemText(f, "r-befund/bew", "Abduktion rechts bis 60 Grad. ");
  f = nachKatalogwechsel({ ...f, katalog: 0 }, INDEX);
  assert.equal(f.befund["r-befund/bew"], undefined);
  // mitBefund räumt den eigenen Wortlaut ab, sobald der Befund nicht mehr auffällig ist; der Katalogwechsel tut es nicht.
  assert.equal(f.eigen["r-befund/bew"], undefined, "eigener Wortlaut liegt weiter im Fall und erscheint beim nächsten Klick auf „auffällig“ ungefragt");
});

test("NL-4 Katalogwechsel: getippte Angabe in einem Satz bleibt erhalten (zugesagt: „eingetragener Text ist erhalten“)", () => {
  let f = fallAus(V_BEFUND);
  f = mitBefund(f, "r-befund/bew", "abw");
  f = mitSlot(f, "r-befund/bew/wo", "ab 60 Grad Abduktion");
  f = nachKatalogwechsel({ ...f, katalog: 0 }, INDEX);
  assert.equal(f.slots["r-befund/bew/wo"], "ab 60 Grad Abduktion");
});

test("NL-5 Von Hand bearbeiten: ein Platzhalter fürs KIS wird weiter nachgehalten", () => {
  let f = mitSpaeter(fallAus(V_FELD), "r-feld/hergang", true);
  const vorher = abschnitt(f, "anamnese");
  assert.equal(vorher.fertig, true);
  assert.equal(vorher.spaeter.length, 1);
  f = mitManuell(f, "anamnese", vorher.text);
  const nachher = abschnitt(f, "anamnese");
  assert.match(nachher.text, /\[UNFALLHERGANG\]/);
  assert.equal(nachher.spaeter.length, 1, "der Text enthält weiter [UNFALLHERGANG], die Liste „Im KIS zu ergänzen“ ist leer");
});

test("NL-6 Getippte Angabe in einem Satz bleibt, wie sie getippt wurde", () => {
  let f = mitSeite(fallAus(V_BEFUND), "rechts");
  f = mitBefund(f, "r-befund/bew", "abw");
  f = mitSlot(f, "r-befund/bew/wo", "(Abd. 60..90 Grad)");
  const a = abschnitt(f, "befund");
  assert.match(a.text, /60\.\.90/, a.text);
});

test("NL-6 Getippte geschweifte Klammer in einer Angabe wird nicht gelöscht", () => {
  let f = mitSeite(fallAus(V_BEFUND), "rechts");
  f = mitBefund(f, "r-befund/bew", "abw");
  f = mitSlot(f, "r-befund/bew/wo", "{links}");
  const a = abschnitt(f, "befund");
  assert.match(a.text, /links/, `aus „{links}“ wurde: ${a.text}`);
});

test("NL-7 Gespeicherter Fall ohne Katalogversion gilt als veraltet", () => {
  let f = fallAus(V_BEFUND);
  f = mitBefund(f, "r-befund/ds", "ok");
  const roh = JSON.parse(JSON.stringify(f)) as Record<string, unknown>;
  delete roh.katalog;
  const geladen = ergaenzt(roh, INDEX)!;
  const danach = nachKatalogwechsel(geladen, INDEX);
  assert.deepEqual(danach.befund, {}, "Fall aus einer Fassung ohne Katalogversion behält seine Auswahlen");
});

test("NL-8 Eigener Wortlaut in einem vorgeschlagenen Satz macht ihn zur Aussage des Arztes", () => {
  let f = mitSeite(fallAus(V_SATZ), "rechts");
  f = mitEigenemText(f, "r-satz/gips", "Oberarmgips rechts für 4 Wochen angelegt.");
  const t = abschnitt(f, "therapie").tokens.find((x) => x.key === "r-satz/gips")!;
  assert.equal(t.zustand, "gesetzt", `selbst geschriebener Satz steht als „${t.zustand}“ im Brief`);
});

test("NL-9 Vorlage mit demselben Baustein in zwei Abschnitten: der Baustein steht nur einmal im Fall", () => {
  const f = fallAus(V_DOPPELT);
  const alle = Object.values(f.bausteine).flat();
  assert.equal(new Set(alle).size, alle.length, `Bausteine im Fall: ${JSON.stringify(f.bausteine)}`);
});

test("widerlegt: auffaelligesZuerst zieht einen auffälligen Befund nicht über festen Text oder eine andere Gruppe hinweg", () => {
  let f = mitSeite(fallAus(V_BEFUND), "rechts");
  f = mitBefund(f, "r-befund/ds", "abw");
  f = mitBefund(f, "r-befund/bew", "ok");
  assert.equal(abschnitt(f, "befund").text, "Schulter: Schulter rechts frei beweglich. Druckschmerz.");
});

test("widerlegt: Vorgaben einer Vorlage stehen nie im Fall; nach uebernehmen ist nichts mehr grau", () => {
  const v = vorlage("v-vorgabe", { therapie: ["r-satz"] }, { vorgaben: { slots: { "r-satz/gips/art": 1 } } });
  INDEX.vorlagen.set(v.id, v);
  let f = mitSeite(fallAus(v), "rechts");
  assert.deepEqual(f.slots, {});
  f = mitSlot(f, "r-satz/gips/wochen", "4");
  const vor = abschnitt(f, "therapie");
  assert.equal(vor.vorschlag, 1);
  assert.equal(vor.fertig, false);
  f = uebernehmen(f, ["r-satz/gips"], INDEX);
  const nach = abschnitt(f, "therapie");
  assert.equal(nach.text, "Unterarmgipsschiene rechts für 4 Wochen angelegt.");
  assert.equal(nach.fertig, true);
});
