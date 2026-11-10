// Tests der Engine. Sie arbeiten mit eigenen kleinen Bausteinen, damit sie
// nicht davon abhängen, wie die Redaktion den Katalog gerade formuliert.

import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIEFTYPEN } from "../src/data/katalog.ts";
import { STELLUNG, briefText, einheitDahinter, indexiere, ohneDoppelteEinheit, renderBrief, stellungVon } from "../src/engine/render.ts";
import type { BriefAnsicht, KatalogIndex } from "../src/engine/render.ts";
import {
  alsKopiert,
  ergaenzt,
  mitAngabe,
  mitAusgeblendet,
  mitAuswahl,
  mitBaustein,
  mitBefund,
  mitEigenemText,
  mitManuell,
  mitOption,
  mitPerson,
  mitSeite,
  mitSlot,
  mitSpaeter,
  mitVorlage,
  mitWahl,
  mitWert,
  mitZusatz,
  nachKatalogwechsel,
  neuerFall,
  ohneBaustein,
  schrittZuruecknehmen,
  schritteZuruecknehmen,
  uebernehmen,
  beendetZug,
  enthaeltNoch,
  sicherZuruecknehmen,
} from "../src/engine/fall.ts";
import {
  BILD_ERSATZ_MS,
  EBEN_MS,
  FREI,
  KETTE_MS,
  SCHRECKZEIT_MS,
  bereit,
  blind,
  geloest,
  inSchreckzeit,
  mitBefehl,
  mitWirkung,
  nachSprung,
  nachTaste,
  nachText,
  nachUrteil,
  neueKette,
  textFenster,
  tastenArt,
  urteil,
  verworfenWort,
} from "../src/engine/tippzug.ts";
import { aenderungJetzt, aufzaehlen, geaenderteStellen, gesetztText, kurz, zurueckgenommenText } from "../src/engine/aenderung.ts";
import { naechsteAngabe } from "../src/engine/ziffernreihe.ts";
import { entwurfEigenerBaustein } from "../src/engine/eigen.ts";
import { bausteinStand, mitSammelangabe, ohneSammelangabe, sammelAussagen, sammelSchritte } from "../src/engine/sammel.ts";
import { findeAbgleichhinweise } from "../src/engine/abgleich.ts";
import { ABGLEICHREGELN } from "../src/data/abgleich.ts";
import { personText } from "../src/engine/person.ts";
import { LUECKE, fuerZwischenablage, glaetten, handtext, istKisSicher, tokensZuText, unsichereZeichen } from "../src/engine/text.ts";
import type { Token } from "../src/engine/text.ts";
import { TREFFER_MAX, abstand, sucheVorlagen, trefferNachBereich } from "../src/engine/suche.ts";
import { schnellwerteFehler, schnellwerteVon, stelleVor, wahlPlatzFehler, weglassenFehler } from "../src/engine/vorlage.ts";
import type { AbschnittId, Baustein, Fall, Platzhalter, Segment, Vorlage } from "../src/model/types.ts";
import { anleitungVonSelbst } from "../src/engine/einfuehrung.ts";
import { fuerStellung, normTitel, normwertKarte, normZeile } from "../src/engine/normwerte.ts";
import type { Normwerte } from "../src/engine/normwerte.ts";

function testIndex(bausteine: Baustein[], vorlagen: Vorlage[] = [], version = 3): KatalogIndex {
  return indexiere({ version, regionen: [{ id: "t", name: "T", kuerzel: "t", bausteine }], vorlagen, brieftypen: BRIEFTYPEN });
}
function baustein(id: string, abschnitt: AbschnittId, segmente: Segment[], platzhalter: Platzhalter[] = []): Baustein {
  return { id, titel: id, typ: "untersuchung", abschnitt, platzhalter, segmente };
}
function vorlage(id: string, abschnitte: Partial<Record<AbschnittId, string[]>>, mehr: Partial<Vorlage> = {}): Vorlage {
  return { id, titel: id, region: "t", setting: "zna", abschnitte, status: "entwurf", ...mehr };
}
function fallMit(index: KatalogIndex, bausteine: Partial<Record<AbschnittId, string[]>>): Fall {
  return { ...neuerFall("zna", index), bausteine };
}
function ab(fall: Fall, index: KatalogIndex, id: AbschnittId, listen: "striche" | "fliesstext" = "striche") {
  const a = renderBrief(fall, index, { listen }).abschnitte.find((x) => x.id === id);
  assert.ok(a, `Abschnitt ${id} fehlt im Brieftyp`);
  return a;
}
const fix = (t: string): Token => ({ t, art: "fix" });
const glatt = (...teile: string[]) => tokensZuText(glaetten(teile.map(fix)));

// --- Bausteine für die Tests -------------------------------------------------

const BEFUND = baustein("t-osg", "befund", [
  { art: "text", text: "Sprunggelenk " },
  { art: "seite" },
  { art: "text", text: ": " },
  { art: "befund", id: "schwellung", chip: "Schwellung", gruppe: "Inspektion", normal: "Keine Schwellung. ", abweichung: "Schwellung{wo}. ", slots: [{ art: "auswahl", id: "wo", label: "Ort", optionen: ["", " lateral", " medial"] }] },
  { art: "befund", id: "haut", chip: "Haut", gruppe: "Inspektion", normal: "Haut intakt.", abweichung: "Schürfwunde." },
  { art: "befund", id: "ds", chip: "Druckschmerz Außenknöchel", gruppe: "Palpation", normal: "Kein Druckschmerz über dem Außenknöchel. ", abweichung: "Druckschmerz über dem Außenknöchel. " },
  { art: "befund", id: "schublade", chip: "Talusvorschub", gruppe: "Stabilität", selten: true, normal: "Kein Talusvorschub. ", abweichung: "Talusvorschub vermehrt. " },
  { art: "befund", id: "krepitation", chip: "Krepitation", gruppe: "Palpation", normal: "", abweichung: "Krepitation tastbar. " },
  { art: "messwert", id: "rom", label: "Extension/Flexion", gruppe: "Beweglichkeit", vorlage: "Extension/Flexion {w}°. ", normal: "20/0/40" },
]);
const ANAMNESE = baustein(
  "t-ana",
  "anamnese",
  [
    { art: "person", form: "nom", gross: true, alter: true },
    { art: "text", text: " stellte sich vor. " },
    { art: "platzhalter", ref: "hergang" },
    { art: "text", text: ". Vorstellung: " },
    { art: "auswahl", id: "weg", label: "Art der Vorstellung", optionen: ["selbstständig", "mit dem Rettungsdienst"] },
    { art: "text", text: ". " },
    { art: "option", id: "kopf", label: "Kein Sturz auf den Kopf", text: "Auf den Kopf sei {er} nicht gefallen. " },
    { art: "option", id: "antiko", label: "Gerinnungshemmung", an: true, text: "Gerinnungshemmende Medikamente: {was}.", slots: [{ art: "auswahl", id: "was", label: "Gerinnungshemmung", required: true, optionen: ["", "keine", "Apixaban"] }] },
  ],
  [{ id: "hergang", typ: "freitext", label: "Unfallhergang", required: true }],
);
const PROCEDERE = baustein(
  "t-proc",
  "procedere",
  [
    { art: "punkt" },
    { art: "option", id: "schiene", label: "Schiene", an: true, text: "Orthese {seite} für {dauer}.", slots: [{ art: "auswahl", id: "dauer", label: "Dauer", required: true, optionen: ["", "2 Wochen", "6 Wochen"] }] },
    { art: "punkt" },
    { art: "option", id: "kuehlen", label: "Kühlen", an: true, text: "Kühlung und Hochlagerung." },
    { art: "punkt" },
    { art: "option", id: "sport", label: "Sportpause", text: "Sportpause für " },
    { art: "platzhalter", ref: "wochen" },
    { art: "text", text: "." },
    { art: "punkt" },
    { art: "option", id: "tvt", label: "Thromboseprophylaxe", text: "{art}", slots: [{ art: "auswahl", id: "art", label: "Thromboseprophylaxe", required: true, optionen: ["", "Keine medikamentöse Thromboseprophylaxe.", "Niedermolekulares Heparin bis zur Vollbelastung."] }] },
  ],
  [{ id: "wochen", typ: "zeitraum", label: "Sportpause", einheit: "Wochen", default: "4", required: true }],
);
const THERAPIE = baustein("t-th", "therapie", [
  { art: "punkt" },
  { art: "option", id: "untersucht", label: "Untersuchung", an: true, text: "Klinisch untersucht und beraten." },
  { art: "punkt" },
  { art: "option", id: "gips", label: "Gips", text: "{was} {seite} angelegt.", slots: [{ art: "auswahl", id: "was", label: "Ruhigstellung", required: true, optionen: ["", "Unterarmgipsschiene", "Orthese"] }] },
]);
const THERAPIE2 = baustein("t-th2", "therapie", [{ art: "punkt" }, { art: "option", id: "tetanus", label: "Tetanus", an: true, text: "Tetanusschutz aufgefrischt." }]);
const DIAGNOSTIK = baustein("t-dgn", "diagnostik", [
  { art: "text", text: "Röntgen in " },
  { art: "auswahl", id: "ebenen", label: "Ebenen", variante: true, optionen: ["2 Ebenen", "3 Ebenen"] },
  { art: "text", text: ": " },
  { art: "auswahl", id: "ergebnis", label: "Röntgenbefund", pflicht: true, optionen: ["Kein Frakturnachweis.", "Fraktur."] },
  { art: "auswahl", id: "kontrolle", label: "Kontrolle", default: 0, optionen: [" Kontrolle nach 7 Tagen.", " Keine Kontrolle."] },
]);
const V = vorlage("t-v", { anamnese: ["t-ana"], befund: ["t-osg"], diagnostik: ["t-dgn"], therapie: ["t-th"], procedere: ["t-proc"] });
const V_ENTSCHEIDEN = vorlage("t-v-e", { befund: ["t-osg"] }, { entscheiden: ["t-osg/schwellung"] });
const V_VORGABE = vorlage("t-v-g", { therapie: ["t-th"] }, { vorgaben: { an: ["t-th/gips"], slots: { "t-th/gips/was": 2 } } });
const V_ANDERE = vorlage("t-v-a", { therapie: ["t-th"] });
const index = testIndex([BEFUND, ANAMNESE, PROCEDERE, THERAPIE, THERAPIE2, DIAGNOSTIK], [V, V_ENTSCHEIDEN, V_VORGABE, V_ANDERE]);
const neu = (v: Vorlage = V): Fall => mitVorlage(neuerFall("zna", index), v, index);
const grau = (fall: Fall, id: AbschnittId) => ab(fall, index, id).tokens.filter((t) => t.zustand === "vorschlag" && t.key).map((t) => t.key!);

// --- Person, Glätten ---------------------------------------------------------

test("Person: Fälle, Alter, Kind, neutral, Alter mit Vorsatz", () => {
  assert.equal(personText("nom", "m", "34", { gross: true, alter: true }), "Der 34-jährige Patient");
  assert.equal(personText("gen", "m", "34", { alter: true }), "des 34-jährigen Patienten");
  assert.equal(personText("dat", "w", "71", { alter: true }), "der 71-jährigen Patientin");
  assert.equal(personText("akk", "w", "71", { alter: true }), "die 71-jährige Patientin");
  assert.equal(personText("nom", "w", "", { gross: true, alter: true }), "Die Patientin");
  assert.equal(personText("nom", "m", "8 Monate", { alter: true }), "der 8 Monate alte Patient");
  assert.equal(personText("nom", "n", "34", { alter: true }), "Pat. (34 J.)");
  assert.equal(personText("nom", "k", "4", { gross: true, alter: true }), "Das 4-jährige Kind");
  assert.equal(personText("gen", "k", "4", { alter: true }), "des 4-jährigen Kindes");
  assert.equal(personText("pron-dat", "w", "34"), "ihr");
  assert.equal(personText("nom", "m", "ca. 80", { alter: true }), "der ca. 80-jährige Patient");
  assert.equal(personText("nom", null, "34"), null);
});

test("Glätten: Leerraum und Satzzeichen über Tokengrenzen", () => {
  assert.equal(glatt("Kein Druckschmerz ", "", " über dem Knöchel ", "."), "Kein Druckschmerz über dem Knöchel.");
  assert.equal(glatt("Befund.", ".", " Weiter"), "Befund. Weiter");
  assert.equal(glatt("\n\n- Erster.", "\n- ", "Zweiter. ", "\n\n\n\nAbsatz"), "- Erster.\n- Zweiter.\n\nAbsatz");
  assert.equal(glatt("a ,", " b"), "a, b");
  assert.equal(glatt("  führend  "), "führend");
  assert.equal(glatt("Wert 0,5 mg, z. B. i.v. (2 Ebenen) am 05.10.2026 um 14:30 Uhr."), "Wert 0,5 mg, z. B. i.v. (2 Ebenen) am 05.10.2026 um 14:30 Uhr.");
});

test("Glätten: Sätze, die ohne Leerzeichen aufeinandertreffen, werden getrennt", () => {
  assert.equal(glatt("Mehr als vier Schritte.", "Keine Schwellung."), "Mehr als vier Schritte. Keine Schwellung.");
  assert.equal(glatt("Befund:", "‹Seite›"), "Befund: ‹Seite›");
  assert.equal(glatt("‹Schwellung?›", "Kein Druckschmerz."), "‹Schwellung?› Kein Druckschmerz.");
  assert.equal(glatt("am ", "[OP-DATUM]", " operiert"), "am [OP-DATUM] operiert");
  // Innerhalb eines Tokens bleibt alles, wie es ist.
  assert.equal(glatt("Dosis 1.5 mg"), "Dosis 1.5 mg");
});

test("Glätten: frei geschriebener Text bleibt unverändert", () => {
  const frei = (t: string): Token => ({ t, art: "zusatz", frei: true });
  assert.equal(tokensZuText(glaetten([frei("Faktor 1..5 ... dann  weiter")])), "Faktor 1..5 ... dann  weiter");
  assert.equal(tokensZuText(glaetten([fix("Hergang: "), frei("Sturz."), fix(". Danach")])), "Hergang: Sturz. Danach");
});

// --- Seite und Person --------------------------------------------------------

test("Seite: ohne Wahl eine Lücke, gesetzt überall ausgeschrieben, auch in Sätzen", () => {
  let fall = neu();
  let b = renderBrief(fall, index);
  assert.equal(b.seiteFehlt, true);
  assert.equal(b.brauchtSeite, true);
  assert.match(ab(fall, index, "befund").text, /^Sprunggelenk ‹Seite›:/);
  fall = mitSeite(fall, "rechts");
  b = renderBrief(fall, index);
  assert.equal(b.seiteFehlt, false);
  assert.match(ab(fall, index, "befund").text, /^Sprunggelenk rechts:/);
  assert.match(ab(fall, index, "procedere").text, /Orthese rechts für/);
});

test("Seite: „ohne Seite“ ist eine Wahl und hinterlässt kein Wort", () => {
  const fall = mitSeite(neu(), "ohne");
  assert.equal(renderBrief(fall, index).seiteFehlt, false);
  assert.match(ab(fall, index, "befund").text, /^Sprunggelenk:/);
});

test("Seite: fehlt sie nur in einem zugewählten Satz, meldet der Brief das trotzdem", () => {
  const nur = fallMit(index, { therapie: ["t-th"] });
  assert.equal(renderBrief(nur, index).brauchtSeite, false);
  const mitGips = mitSlot(mitOption(nur, "t-th/gips", true), "t-th/gips/was", "1");
  const b = renderBrief(mitGips, index);
  assert.equal(b.brauchtSeite, true);
  assert.equal(b.seiteFehlt, true);
  assert.match(ab(mitGips, index, "therapie").text, /Unterarmgipsschiene ‹Seite› angelegt\./);
});

test("Seite: die abweichende Seite eines Bausteins bleibt, wenn die Seite des Falls gesetzt wird", () => {
  let fall = mitSeite(neu(), "rechts");
  fall = mitSeite(fall, "links", "t-osg");
  assert.match(ab(fall, index, "befund").text, /^Sprunggelenk links:/);
  fall = mitSeite(fall, "rechts");
  assert.match(ab(fall, index, "befund").text, /^Sprunggelenk links:/);
  fall = mitSeite(fall, "beidseits");
  assert.match(ab(fall, index, "befund").text, /^Sprunggelenk links:/);
  assert.match(ab(fall, index, "procedere").text, /Orthese beidseits/);
  fall = mitSeite(fall, null, "t-osg");
  assert.match(ab(fall, index, "befund").text, /^Sprunggelenk beidseits:/);
});

test("Person fehlt: offene Stelle statt falschem Geschlecht; danach richtig gebeugt", () => {
  let fall = neu();
  assert.match(ab(fall, index, "anamnese").text, /^‹Patient\/Patientin› stellte sich vor\./);
  assert.equal(renderBrief(fall, index).personFehlt, true);
  fall = mitOption(mitPerson(fall, "w", "34"), "t-ana/kopf", true);
  const text = ab(fall, index, "anamnese").text;
  assert.match(text, /^Die 34-jährige Patientin stellte sich vor\./);
  assert.match(text, /Auf den Kopf sei sie nicht gefallen\./);
});

// --- Vorschlag und Übernahme -------------------------------------------------

test("Normalbefunde sind Vorschläge: grau, gezählt, erst nach Übernahme fertig", () => {
  let fall = mitSeite(neu(), "rechts");
  let a = ab(fall, index, "befund");
  assert.equal(a.vorschlag, 3);
  assert.equal(a.fertig, false);
  assert.deepEqual(grau(fall, "befund"), ["t-osg/schwellung", "t-osg/haut", "t-osg/ds"]);
  fall = uebernehmen(fall, grau(fall, "befund"), index);
  a = ab(fall, index, "befund");
  assert.equal(a.vorschlag, 0);
  assert.equal(a.fertig, true);
  assert.equal(a.text, "Sprunggelenk rechts: Keine Schwellung. Haut intakt. Kein Druckschmerz über dem Außenknöchel.");
});

test("Befund: auffällig mit Slot, eigener Wortlaut, weggelassen", () => {
  let fall = mitSeite(neu(), "links");
  const key = "t-osg/schwellung";
  fall = mitBefund(fall, key, "abw");
  assert.match(ab(fall, index, "befund").text, /links: Schwellung\./);
  fall = mitSlot(fall, `${key}/wo`, "1");
  assert.match(ab(fall, index, "befund").text, /Schwellung lateral\./);
  fall = mitEigenemText(fall, key, "Teigige Schwellung am Außenknöchel.");
  assert.match(ab(fall, index, "befund").text, /Teigige Schwellung am Außenknöchel\. Haut intakt\./);
  // Ein leer gelöschter eigener Wortlaut lässt den Befund nicht verschwinden.
  fall = mitEigenemText(fall, key, "  ");
  assert.match(ab(fall, index, "befund").text, /Schwellung lateral\./);
  fall = mitBefund(fall, key, "weg");
  const a = ab(fall, index, "befund");
  assert.doesNotMatch(a.text, /Schwellung/);
  assert.ok(a.aus.some((e) => e.key === key));
});

test("Auffälliger Befund: Art und Ort wählt der Arzt, auch wenn der Katalog eine erste Option nennt", () => {
  const b = baustein("t-knie", "befund", [
    {
      art: "befund",
      id: "schwellung",
      chip: "Schwellung",
      gruppe: "Inspektion",
      normal: "Keine Schwellung.",
      abweichung: "{was}{ort}{ausmass}.",
      slots: [
        { art: "auswahl", id: "was", label: "Befund", optionen: ["Schwellung und Hämatom", "Schwellung"] },
        { art: "auswahl", id: "ort", label: "Ort", default: 1, optionen: ["", " lateral", " medial"] },
        { art: "auswahl", id: "ausmass", label: "Ausmaß", optionen: ["", ", gering", ", deutlich"] },
      ],
    },
  ]);
  const v = vorlage("t-v-knie", { befund: ["t-knie"] }, { vorgaben: { slots: { "t-knie/schwellung/was": 1 } } });
  const idx = testIndex([b], [v]);
  let fall = mitBefund(mitVorlage(neuerFall("zna", idx), v, idx), "t-knie/schwellung", "abw");
  let a = ab(fall, idx, "befund");
  // Weder die erste Option noch der Hausstandard noch die Vorgabe der Vorlage gelten als gewählt.
  assert.equal(a.text, "‹Schwellung: Befund›‹Schwellung: Ort›.");
  // Zwei fehlende Angaben, aber eine offene Stelle: Gezählt wird, was der Durchlauf anläuft.
  assert.equal(a.offen, 1);
  assert.equal(a.fertig, false);
  fall = mitSlot(mitSlot(fall, "t-knie/schwellung/was", "0"), "t-knie/schwellung/ort", "2");
  a = ab(fall, idx, "befund");
  assert.equal(a.text, "Schwellung und Hämatom medial.");
  assert.equal(a.fertig, true);
});

test("Freitext-Angabe als Pflicht: leer eine Lücke, gefüllt Teil des Satzes", () => {
  const b = baustein("t-frei", "befund", [
    { art: "befund", id: "rest", chip: "Übriger Körper", gruppe: "Übriger Körper", selten: true, normal: "Übriger Körper ohne Verletzungszeichen.", abweichung: "Übriger Körper: {was}.", slots: [{ art: "detail", id: "was", label: "Befund", maxLen: 160, required: true }] },
  ]);
  const v = vorlage("t-v-frei", { befund: ["t-frei"] });
  const idx = testIndex([b], [v]);
  let fall = mitBefund(mitVorlage(neuerFall("zna", idx), v, idx), "t-frei/rest", "abw");
  assert.equal(ab(fall, idx, "befund").text, "Übriger Körper: ‹Übriger Körper: Befund›.");
  assert.equal(ab(fall, idx, "befund").fertig, false);
  fall = mitSlot(fall, "t-frei/rest/was", "Prellmarke am rechten Ellenbogen");
  assert.equal(ab(fall, idx, "befund").text, "Übriger Körper: Prellmarke am rechten Ellenbogen.");
  assert.equal(ab(fall, idx, "befund").fertig, true);
});

test("Befund: selten Erhobenes und reine Zusatzbefunde stehen nur nach ausdrücklicher Wahl im Brief", () => {
  let fall = mitSeite(neu(), "rechts");
  let a = ab(fall, index, "befund");
  assert.doesNotMatch(a.text, /Talusvorschub|Krepitation/);
  assert.ok(a.aus.some((e) => e.key === "t-osg/schublade"));
  // Die Sammelübernahme erfasst sie nicht.
  fall = uebernehmen(fall, ["t-osg/schwellung", "t-osg/haut", "t-osg/ds"], index);
  assert.doesNotMatch(ab(fall, index, "befund").text, /Talusvorschub/);
  fall = mitBefund(fall, "t-osg/schublade", "ok");
  assert.match(ab(fall, index, "befund").text, /Kein Talusvorschub\./);
  fall = mitBefund(fall, "t-osg/krepitation", "abw");
  a = ab(fall, index, "befund");
  assert.match(a.text, /Krepitation tastbar\./);
  assert.equal(a.fertig, true);
});

test("Zu entscheidende Befunde sind offen, nicht vorgeschlagen, und lassen sich nicht sammelweise übernehmen", () => {
  let fall = mitSeite(neu(V_ENTSCHEIDEN), "rechts");
  let a = ab(fall, index, "befund");
  assert.match(a.text, /‹Schwellung\?›/);
  assert.equal(a.offen, 1);
  assert.equal(a.vorschlag, 2);
  fall = uebernehmen(fall, ["t-osg/schwellung", "t-osg/haut", "t-osg/ds"], index);
  // uebernehmen bestätigt nur, was als Schlüssel übergeben wird; die Oberfläche übergibt nur graue Stellen.
  fall = mitBefund(fall, "t-osg/schwellung", undefined);
  a = ab(fall, index, "befund");
  assert.equal(a.offen, 1);
  fall = mitBefund(fall, "t-osg/schwellung", "abw");
  assert.equal(ab(fall, index, "befund").fertig, true);
});

test("Auffälliges zuerst: nur innerhalb der Untersuchungsgruppe, nie über festen Text hinweg", () => {
  let fall = mitSeite(neu(), "rechts");
  fall = mitBefund(fall, "t-osg/haut", "abw");
  fall = mitBefund(fall, "t-osg/ds", "abw");
  const text = ab(fall, index, "befund").text;
  // Haut (Inspektion) rückt vor die Schwellung derselben Gruppe; der Druckschmerz (Palpation) bleibt dahinter.
  assert.equal(text, "Sprunggelenk rechts: Schürfwunde. Keine Schwellung. Druckschmerz über dem Außenknöchel.");

  const abc = baustein("t-abc", "befund", [
    { art: "text", text: "A – " },
    { art: "befund", id: "a", chip: "Atemweg", gruppe: "ABCDE", normal: "Atemwege frei. ", abweichung: "Atemweg verlegt. " },
    { art: "text", text: "C – " },
    { art: "befund", id: "c", chip: "Kreislauf", gruppe: "ABCDE", normal: "Kreislauf stabil. ", abweichung: "Kreislauf instabil. " },
  ]);
  const idx = testIndex([abc]);
  const f = mitBefund(fallMit(idx, { befund: ["t-abc"] }), "t-abc/c", "abw");
  assert.equal(ab(f, idx, "befund").text, "A – Atemwege frei. C – Kreislauf instabil.");
});

test("Pflichtfeld: Lücke mit Bezeichnung; Wert aus dem Hausstandard ist ein Vorschlag", () => {
  let fall = mitPerson(mitSeite(neu(), "rechts"), "m", "");
  assert.match(ab(fall, index, "anamnese").text, /‹Unfallhergang›/);
  fall = mitWert(fall, "t-ana/hergang", "Beim Sport sei der Fuß umgeknickt.");
  assert.match(ab(fall, index, "anamnese").text, /vor\. Beim Sport sei der Fuß umgeknickt\. Vorstellung:/);

  fall = mitOption(fall, "t-proc/sport", true);
  let a = ab(fall, index, "procedere");
  assert.match(a.text, /Sportpause für 4 Wochen\./);
  assert.ok(grau(fall, "procedere").includes("t-proc/wochen"));
  fall = uebernehmen(fall, ["t-proc/wochen"], index);
  assert.equal(fall.werte["t-proc/wochen"], "4");
  assert.ok(!grau(fall, "procedere").includes("t-proc/wochen"));
  // Löscht der Arzt den Wert, kehrt der Hausstandard nicht still zurück.
  fall = mitWert(fall, "t-proc/wochen", "");
  a = ab(fall, index, "procedere");
  assert.match(a.text, /Sportpause für ‹Sportpause›\./);
});

test("Platzhalter fürs KIS: bewusst offen gelassen, zählt nicht als Lücke, wird nachgehalten", () => {
  let fall = mitPerson(neu(), "m", "");
  fall = mitSpaeter(fall, "t-ana/hergang", true);
  const a = ab(fall, index, "anamnese");
  assert.match(a.text, /vor\. \[UNFALLHERGANG\]\./);
  assert.deepEqual(a.spaeter.map((p) => p.label), ["Unfallhergang"]);
  assert.equal(renderBrief(fall, index).spaeter.length, 1);
  fall = mitWert(fall, "t-ana/hergang", "Sturz.");
  assert.equal(ab(fall, index, "anamnese").spaeter.length, 0);
});

test("Lückenzeichen in getipptem Text bleiben eine offene Stelle", () => {
  let fall = mitPerson(neu(), "m", "");
  fall = mitWert(fall, "t-ana/hergang", "Sturz auf ‹Seite›");
  assert.ok(ab(fall, index, "anamnese").offen >= 1);
  fall = mitZusatz(mitWert(fall, "t-ana/hergang", "Sturz."), "anamnese", "Siehe ‹Vorbefund›.");
  assert.ok(ab(fall, index, "anamnese").offen >= 1);
});

test("Auswahl: ohne Vorgabe Pflicht, mit Vorgabe Vorschlag, Formulierungsvariante ohne Rückfrage", () => {
  let fall = neu();
  let a = ab(fall, index, "diagnostik");
  assert.equal(a.text, "Röntgen in 2 Ebenen: ‹Röntgenbefund› Kontrolle nach 7 Tagen.");
  assert.equal(a.offen, 1);
  assert.deepEqual(grau(fall, "diagnostik"), ["t-dgn/kontrolle"]);
  fall = mitAuswahl(fall, "t-dgn/ergebnis", 0);
  fall = uebernehmen(fall, ["t-dgn/kontrolle"], index);
  a = ab(fall, index, "diagnostik");
  assert.equal(a.text, "Röntgen in 2 Ebenen: Kein Frakturnachweis. Kontrolle nach 7 Tagen.");
  assert.equal(a.fertig, true);
  fall = mitEigenemText(fall, "t-dgn/ergebnis", "Knöcherner Ausriss an der Fibulaspitze.");
  assert.match(ab(fall, index, "diagnostik").text, /Knöcherner Ausriss an der Fibulaspitze\. Kontrolle/);
  // Die Auswahl in der Anamnese hat weder Vorgabe noch Kennzeichen: Sie ist Pflicht.
  assert.match(ab(neu(), index, "anamnese").text, /Vorstellung: ‹Art der Vorstellung›/);
});

test("Ungültiger gespeicherter Index gilt als nicht gewählt", () => {
  let fall = { ...neu(), auswahl: { "t-dgn/ergebnis": 7 } };
  assert.match(ab(fall, index, "diagnostik").text, /‹Röntgenbefund›/);
  fall = { ...mitPerson(neu(), "m", ""), slots: { "t-ana/antiko/was": "9" } };
  assert.match(ab(fall, index, "anamnese").text, /‹Gerinnungshemmung›/);
});

test("Sätze der Vorlage sind Vorschläge; vom Arzt zugewählte Sätze sind seine Aussage", () => {
  let fall = mitSeite(neu(), "rechts");
  let a = ab(fall, index, "therapie");
  assert.equal(a.text, "- Klinisch untersucht und beraten.");
  assert.deepEqual(grau(fall, "therapie"), ["t-th/untersucht"]);
  assert.equal(a.fertig, false);
  fall = uebernehmen(fall, grau(fall, "therapie"), index);
  assert.equal(ab(fall, index, "therapie").fertig, true);
  fall = mitOption(fall, "t-th/gips", true);
  a = ab(fall, index, "therapie");
  assert.match(a.text, /- ‹Gips: Ruhigstellung› rechts angelegt\./);
  assert.equal(a.offen, 1);
  fall = mitSlot(fall, "t-th/gips/was", "1");
  a = ab(fall, index, "therapie");
  assert.equal(a.text, "- Klinisch untersucht und beraten.\n- Unterarmgipsschiene rechts angelegt.");
  assert.equal(a.fertig, true);
  assert.ok(!a.aus.some((e) => e.key === "t-th/gips"));
});

test("Pflichtangabe in einem vorgeschlagenen Satz bleibt offen; die leere Option ist keine Antwort", () => {
  let fall = mitPerson(neu(), "m", "");
  assert.match(ab(fall, index, "anamnese").text, /Gerinnungshemmende Medikamente: ‹Gerinnungshemmung›\./);
  fall = mitSlot(fall, "t-ana/antiko/was", "0");
  assert.match(ab(fall, index, "anamnese").text, /‹Gerinnungshemmung›/);
  fall = mitSlot(fall, "t-ana/antiko/was", "1");
  const a = ab(fall, index, "anamnese");
  assert.match(a.text, /Gerinnungshemmende Medikamente: keine\./);
  // Der Satz selbst kommt aus der Vorlage und ist noch zu übernehmen.
  assert.ok(grau(fall, "anamnese").includes("t-ana/antiko"));
});

test("Wer in einem vorgeschlagenen Satz selbst eine Angabe wählt, macht ihn zu seiner Aussage", () => {
  let fall = mitPerson(neu(), "m", "");
  fall = mitAngabe(fall, "t-ana/antiko", "t-ana/antiko/was", "1");
  assert.ok(!grau(fall, "anamnese").includes("t-ana/antiko"));
  assert.match(ab(fall, index, "anamnese").text, /Gerinnungshemmende Medikamente: keine\./);
  // Die leere Option bleibt auch dann eine offene Stelle.
  fall = mitAngabe(fall, "t-ana/antiko", "t-ana/antiko/was", "0");
  assert.match(ab(fall, index, "anamnese").text, /‹Gerinnungshemmung›/);
});

test("Vorgaben einer Vorlage: als Vorschlag sichtbar, nie im Fall gespeichert, nach Vorlagenwechsel weg", () => {
  let fall = mitSeite(neu(V_VORGABE), "links");
  assert.deepEqual(fall.optionen, {});
  assert.deepEqual(fall.slots, {});
  let a = ab(fall, index, "therapie");
  assert.equal(a.text, "- Klinisch untersucht und beraten.\n- Orthese links angelegt.");
  assert.deepEqual(grau(fall, "therapie"), ["t-th/untersucht", "t-th/gips"]);
  assert.equal(a.fertig, false);

  const andere = mitVorlage(fall, V_ANDERE, index);
  assert.equal(ab(andere, index, "therapie").text, "- Klinisch untersucht und beraten.");

  fall = uebernehmen(fall, grau(fall, "therapie"), index);
  assert.equal(fall.slots["t-th/gips/was"], "2");
  a = ab(fall, index, "therapie");
  assert.equal(a.fertig, true);
  // Was der Arzt übernommen hat, bleibt auch nach dem Wechsel seine Wahl.
  assert.match(ab(mitVorlage(fall, V_ANDERE, index), index, "therapie").text, /Orthese links angelegt\./);
});

test("Messwerte sind nie vorbelegt und kehren nach dem Löschen nicht zurück", () => {
  let fall = mitSeite(neu(), "rechts");
  assert.doesNotMatch(ab(fall, index, "befund").text, /Extension/);
  assert.ok(ab(fall, index, "befund").aus.some((e) => e.key === "t-osg/rom"));
  fall = mitWert(fall, "t-osg/rom", "10/0/30");
  assert.match(ab(fall, index, "befund").text, /Extension\/Flexion 10\/0\/30°\./);
  fall = mitWert(fall, "t-osg/rom", "");
  assert.doesNotMatch(ab(fall, index, "befund").text, /Extension/);
});

// --- Listen, freier Text -----------------------------------------------------

test("Listen: leere Punkte entfallen, zwei Listen-Bausteine bilden eine Liste, Fließtext ohne Striche", () => {
  let fall = fallMit(index, { therapie: ["t-th", "t-th2"] });
  assert.equal(ab(fall, index, "therapie").text, "- Klinisch untersucht und beraten.\n- Tetanusschutz aufgefrischt.");
  assert.equal(ab(fall, index, "therapie", "fliesstext").text, "Klinisch untersucht und beraten.\nTetanusschutz aufgefrischt.");
  fall = mitOption(fall, "t-th/untersucht", false);
  assert.equal(ab(fall, index, "therapie").text, "- Tetanusschutz aufgefrischt.");
});

test("Freie Ergänzung und Handtext: stehen unverändert im Brief", () => {
  let fall = fallMit(index, { therapie: ["t-th2"] });
  fall = uebernehmen(fall, ["t-th2/tetanus"], index);
  fall = mitZusatz(fall, "therapie", "Wunde gespült ... dann  verbunden");
  assert.equal(ab(fall, index, "therapie").text, "- Tetanusschutz aufgefrischt.\nWunde gespült ... dann  verbunden");
  fall = mitManuell(fall, "therapie", "Belastung:  Faktor 1..5\n\n\nKontrolle");
  const a = ab(fall, index, "therapie");
  assert.equal(a.text, "Belastung:  Faktor 1..5\n\n\nKontrolle");
  assert.equal(a.manuell, true);
  fall = mitManuell(fall, "therapie", undefined);
  assert.match(ab(fall, index, "therapie").text, /^- Tetanusschutz/);
});

test("Handtext mit Lückenzeichen sperrt weiter; ein widersprechendes Seitenwort wird gemeldet", () => {
  let fall = mitSeite(fallMit(index, { therapie: ["t-th2"] }), "links");
  fall = mitManuell(fall, "therapie", "‹Ruhigstellung› angelegt.");
  let a = ab(fall, index, "therapie");
  assert.equal(a.offen, 1);
  assert.equal(a.fertig, false);
  fall = mitManuell(fall, "therapie", "Gipsschiene rechts angelegt.");
  a = ab(fall, index, "therapie");
  assert.equal(a.fertig, true);
  assert.equal(a.seitenkonflikt, "rechts");
  assert.equal(ab(mitSeite(fall, "rechts"), index, "therapie").seitenkonflikt, null);
  // Auch ein eigener Wortlaut friert die Seite ein und wird gemeldet.
  let f2 = mitSeite(neu(), "rechts");
  f2 = mitEigenemText(mitOption(f2, "t-proc/kuehlen", true), "t-proc/kuehlen", "Kühlung des rechten Sprunggelenks.");
  assert.equal(ab(mitSeite(f2, "links"), index, "procedere").seitenkonflikt, "rechten");
});

// --- Fall-Operationen --------------------------------------------------------

test("Eingaben zu Bausteinen, die der Fall nicht hat, werden nicht angenommen", () => {
  const fall = fallMit(index, { therapie: ["t-th"] });
  assert.equal(mitWert(fall, "t-ana/hergang", "Sturz"), fall);
  assert.equal(mitAuswahl(fall, "t-dgn/ergebnis", 1), fall);
  assert.equal(mitBefund(fall, "t-osg/ds", "abw"), fall);
  assert.equal(mitSeite(fall, "links", "t-osg"), fall);
});

test("Baustein entfernen und Vorlagenwechsel räumen fremde Eingaben ab, Person und Seite bleiben", () => {
  let fall = mitPerson(mitSeite(neu(), "rechts"), "m", "40");
  fall = mitBefund(fall, "t-osg/ds", "abw");
  fall = mitWert(fall, "t-ana/hergang", "Sturz");
  fall = ohneBaustein(fall, "t-ana");
  assert.equal(fall.werte["t-ana/hergang"], undefined);
  assert.equal(ab(fall, index, "anamnese").leer, true);
  fall = mitVorlage(fall, V_ANDERE, index);
  assert.equal(fall.seite, "rechts");
  assert.equal(fall.geschlecht, "m");
  assert.equal(fall.befund["t-osg/ds"], undefined);
});

test("Fehlender Baustein: sichtbare Lücke statt stillem Verschwinden", () => {
  const fall = fallMit(index, { therapie: ["t-th2", "t-gibt-es-nicht"] });
  const a = ab(uebernehmen(fall, ["t-th2/tetanus"], index), index, "therapie");
  assert.deepEqual(a.fehlend, ["t-gibt-es-nicht"]);
  assert.equal(a.fertig, false);
  assert.match(a.text, /‹Baustein „t-gibt-es-nicht“ gibt es nicht mehr›/);
});

test("Kopiervermerk: erkennt spätere Änderung und übersteht den Vorlagenwechsel", () => {
  let fall = uebernehmen(fallMit(index, { therapie: ["t-th2"] }), ["t-th2/tetanus"], index);
  let a = ab(fall, index, "therapie");
  fall = alsKopiert(fall, [{ id: "therapie", text: a.text }], 1000);
  a = ab(fall, index, "therapie");
  assert.equal(a.kopiert, true);
  assert.equal(a.geaendertSeitKopie, false);
  assert.equal(a.kopiertUm, 1000);
  fall = mitZusatz(fall, "therapie", "Nachtrag.");
  assert.equal(ab(fall, index, "therapie").geaendertSeitKopie, true);
  fall = mitVorlage(fall, V_ANDERE, index);
  a = ab(fall, index, "therapie");
  assert.equal(a.kopiert, true);
  assert.equal(a.geaendertSeitKopie, true);
});

test("Gespeicherte Fälle: altes Format wird ergänzt, Unbrauchbares verworfen, Katalogwechsel setzt Auswahlen zurück", () => {
  assert.equal(ergaenzt(null, index), null);
  assert.equal(ergaenzt({ id: 5 }, index), null);
  const alt = ergaenzt({ id: "x", setting: "zna", bausteine: { therapie: ["t-th2"] }, befund: {} }, index);
  assert.ok(alt);
  assert.doesNotThrow(() => renderBrief(alt, index));
  assert.equal(alt.nr, 1);

  let fall = mitAuswahl(neu(), "t-dgn/ergebnis", 1);
  fall = mitWert(fall, "t-ana/hergang", "Sturz");
  const neuerKatalog = testIndex([BEFUND, ANAMNESE, PROCEDERE, THERAPIE, THERAPIE2, DIAGNOSTIK], [V], 4);
  const danach = nachKatalogwechsel(fall, neuerKatalog);
  assert.deepEqual(danach.auswahl, {});
  assert.equal(danach.werte["t-ana/hergang"], "Sturz");
  assert.equal(danach.katalog, 4);
  assert.equal(nachKatalogwechsel(fall, index), fall);
});

// --- Befunde der Code-Nachprüfung vom 08.10.2026 ------------------------------

test("Übernehmen nimmt nur, was vorgeschlagen war: keine zu entscheidenden, seltenen oder abgeschalteten Stellen", () => {
  let fall = mitSeite(mitVorlage(neuerFall("zna", index), V_ENTSCHEIDEN, index), "rechts");
  fall = uebernehmen(fall, ["t-osg/schwellung", "t-osg/schublade", "t-osg/haut"], index);
  assert.equal(fall.befund["t-osg/schwellung"], undefined, "zu entscheidender Befund wurde übernommen");
  assert.equal(fall.befund["t-osg/schublade"], undefined, "selten erhobener Befund wurde übernommen");
  assert.equal(fall.befund["t-osg/haut"], "ok");
  let th = uebernehmen(mitSeite(neu(), "rechts"), ["t-th/gips"], index);
  assert.equal(th.optionen["t-th/gips"], undefined, "nicht vorgeschlagener Satz wurde eingeschaltet");
  th = uebernehmen(th, ["t-th/untersucht"], index);
  assert.equal(th.optionen["t-th/untersucht"], true);
});

test("Fehlt einem bestätigten oder vorgeschlagenen Befund die Seite, ist die Stelle offen", () => {
  const b = baustein("t-seite", "befund", [{ art: "befund", id: "bew", chip: "Beweglichkeit", gruppe: "Beweglichkeit", normal: "Schulter {seite} frei beweglich.", abweichung: "Schulter {seite} eingeschränkt." }]);
  const v = vorlage("t-v-seite", { befund: ["t-seite"] });
  const idx = testIndex([b], [v]);
  let fall = mitVorlage(neuerFall("zna", idx), v, idx);
  assert.equal(ab(fall, idx, "befund").tokens.find((t) => t.key === "t-seite/bew")?.zustand, "offen");
  fall = mitBefund(fall, "t-seite/bew", "ok");
  assert.equal(ab(fall, idx, "befund").tokens.find((t) => t.key === "t-seite/bew")?.zustand, "offen");
  assert.equal(ab(fall, idx, "befund").fertig, false);
  fall = mitSeite(fall, "links");
  assert.equal(ab(fall, idx, "befund").tokens.find((t) => t.key === "t-seite/bew")?.zustand, "ok");
  assert.equal(ab(fall, idx, "befund").fertig, true);
});

test("Eigener Wortlaut in einem vorgeschlagenen Satz macht ihn zur Aussage des Arztes", () => {
  let fall = mitSeite(neu(), "rechts");
  assert.deepEqual(grau(fall, "therapie"), ["t-th/untersucht"]);
  fall = mitEigenemText(fall, "t-th/untersucht", "Untersucht, beraten und Merkblatt mitgegeben.");
  assert.deepEqual(grau(fall, "therapie"), []);
  assert.equal(ab(fall, index, "therapie").fertig, true);
  fall = mitEigenemText(fall, "t-th/untersucht", undefined);
  assert.deepEqual(grau(fall, "therapie"), ["t-th/untersucht"]);
});

test("Katalogwechsel: getippte Angaben und eigener Wortlaut bleiben im Brief, gewählte Indizes verfallen", () => {
  let fall = mitSeite(neu(), "rechts");
  fall = mitBefund(fall, "t-osg/haut", "abw");
  fall = mitEigenemText(fall, "t-osg/haut", "Schürfwunde am Außenknöchel.");
  fall = mitBefund(fall, "t-osg/ds", "abw");
  fall = mitSlot(mitBefund(fall, "t-osg/schwellung", "abw"), "t-osg/schwellung/wo", "1");
  const neuIndex = testIndex([BEFUND, ANAMNESE, PROCEDERE, THERAPIE, THERAPIE2, DIAGNOSTIK], [V], 99);
  const nach = nachKatalogwechsel(fall, neuIndex);
  assert.equal(nach.befund["t-osg/haut"], "abw");
  assert.equal(nach.eigen["t-osg/haut"], "Schürfwunde am Außenknöchel.");
  assert.equal(nach.befund["t-osg/ds"], undefined);
  assert.equal(nach.slots["t-osg/schwellung/wo"], undefined);
  // Ein gespeicherter Fall ohne Versionsangabe gilt als alt.
  const alt = ergaenzt({ id: "x", setting: "zna", auswahl: { "t-dgn/ergebnis": 1 } }, neuIndex);
  assert.equal(alt?.katalog, 0);
});

test("Platzhalter fürs KIS in frei geschriebenem Text werden nachgehalten", () => {
  let fall = mitSeite(neu(), "rechts");
  fall = mitZusatz(fall, "therapie", "Operation am [OP-DATUM] geplant.");
  assert.deepEqual(ab(fall, index, "therapie").spaeter.map((p) => p.label), ["OP-DATUM"]);
  fall = mitManuell(fall, "therapie", "Gips angelegt, Kontrolle am [DATUM].");
  assert.deepEqual(ab(fall, index, "therapie").spaeter.map((p) => p.label), ["DATUM"]);
});

test("Ein Baustein steht nur einmal im Fall, auch wenn eine Vorlage ihn zweimal nennt", () => {
  const doppelt = vorlage("t-v-doppelt", { befund: ["t-osg"], diagnostik: ["t-dgn", "t-osg"] });
  const fall = mitVorlage(neuerFall("zna", index), doppelt, index);
  assert.deepEqual(fall.bausteine, { befund: ["t-osg"], diagnostik: ["t-dgn"] });
});

test("Gezählt werden Stellen: ein Satz mit zwei fehlenden Angaben ist eine offene Stelle; leere Vorschläge zählen nicht", () => {
  const b = baustein("t-zwei", "procedere", [
    { art: "punkt" },
    { art: "option", id: "kontrolle", label: "Kontrolle", an: true, text: "Kontrolle {wann} {wo}.", slots: [
      { art: "auswahl", id: "wann", label: "wann", required: true, optionen: ["", "morgen"] },
      { art: "auswahl", id: "wo", label: "wo", required: true, optionen: ["", "in der Praxis"] },
    ] },
    { art: "punkt" },
    { art: "option", id: "leer", label: "Zusatz", an: true, text: "{was}", slots: [{ art: "auswahl", id: "was", label: "Zusatz", optionen: ["", "Sportpause."] }] },
  ]);
  const v = vorlage("t-v-zwei", { procedere: ["t-zwei"] });
  const idx = testIndex([b], [v]);
  const a = ab(mitVorlage(neuerFall("zna", idx), v, idx), idx, "procedere");
  assert.equal(a.offen, 1);
  assert.equal(a.vorschlag, 0);
  assert.equal(a.tokens.filter((t) => t.zustand === "offen").length, 1);
});

// --- Restpunkte der Sicherheits-Nachprüfung vom 08.10.2026 ---------------------

test("Entwurf für einen eigenen Baustein: kein Befund und keine Angabe des Patienten, Seite als {seite}", () => {
  let fall = mitSeite(mitVorlage(neuerFall("zna", index), V_ENTSCHEIDEN, index), "rechts");
  fall = mitSlot(mitBefund(fall, "t-osg/schwellung", "abw"), "t-osg/schwellung/wo", "1");
  fall = mitEigenemText(mitBefund(fall, "t-osg/haut", "abw"), "t-osg/haut", "Schürfwunde am Knöchel rechts.");
  fall = mitWert(fall, "t-osg/rom", "10/0/30");
  const entwurf = entwurfEigenerBaustein(fall, "befund", "Befund", index);
  assert.equal(entwurf, "Sprunggelenk {seite}: Haut intakt. Kein Druckschmerz über dem Außenknöchel.");
});

test("Seitenwort in freiem Text: auch die Kurzformen „li.“ und „re.“ werden als Widerspruch erkannt", () => {
  let fall = mitSeite(neu(), "rechts");
  fall = mitZusatz(fall, "therapie", "Orthese li. angelegt.");
  assert.equal(ab(fall, index, "therapie").seitenkonflikt, "li.");
  fall = mitZusatz(mitSeite(fall, "links"), "therapie", "Orthese re. angelegt.");
  assert.equal(ab(fall, index, "therapie").seitenkonflikt, "re.");
  fall = mitZusatz(fall, "therapie", "Andere. Reizlos.");
  assert.equal(ab(fall, index, "therapie").seitenkonflikt, null);
});

test("Zuwählbarer Satz nennt seinen Wortlaut vorab", () => {
  const fall = mitSeite(neu(), "rechts");
  const gips = ab(fall, index, "therapie").aus.find((e) => e.key === "t-th/gips");
  assert.equal(gips?.vorschau, "… rechts angelegt.");
});

test("Vorlage nimmt Befunde aus den Vorschlägen (ohne) und lässt auch selten Erhobenes entscheiden", () => {
  // Wiederverwendeter Untersuchungsbaustein: Was bei dieser Diagnose nicht zu erwarten ist, wird nicht vorgeschlagen.
  const v = vorlage("t-v-ohne", { befund: ["t-osg"] }, { entscheiden: ["t-osg/schublade"], ohne: ["t-osg/ds"] });
  const idx = testIndex([BEFUND], [v]);
  let fall = mitSeite(mitVorlage(neuerFall("zna", idx), v, idx), "rechts");
  let a = ab(fall, idx, "befund");
  assert.ok(!a.text.includes("Kein Druckschmerz über dem Außenknöchel"), "Befund aus `ohne` wurde vorgeschlagen");
  assert.ok(a.aus.some((e) => e.key === "t-osg/ds"), "Befund aus `ohne` bleibt zuwählbar");
  // Der seltene Befund ist in dieser Vorlage zu entscheiden: eine Lücke, kein Schweigen.
  assert.match(a.text, /‹Talusvorschub\?›/);
  // Sammelübernahme fasst beide nicht an.
  fall = uebernehmen(fall, ["t-osg/ds", "t-osg/schublade", "t-osg/haut"], idx);
  assert.equal(fall.befund["t-osg/ds"], undefined);
  assert.equal(fall.befund["t-osg/schublade"], undefined);
  assert.equal(fall.befund["t-osg/haut"], "ok");
  fall = mitBefund(fall, "t-osg/ds", "ok");
  a = ab(fall, idx, "befund");
  assert.ok(a.text.includes("Kein Druckschmerz über dem Außenknöchel"));
});

// Weglassen: ein allgemeiner Satz und eine Ersatzstelle, die dieselbe Aussage als Pflichtauswahl abfragt.
const ALLG = baustein("t-allg", "therapie", [
  { art: "punkt" },
  { art: "option", id: "untersucht", label: "Untersuchung", an: true, text: "Klinisch untersucht." },
  { art: "punkt" },
  { art: "option", id: "tetanus", label: "Tetanusimpfung", text: "Tetanusschutz aufgefrischt." },
  { art: "punkt" },
  { art: "option", id: "rezept", label: "Rezept", text: "Rezept ausgestellt." },
]);
const ERSATZ = baustein("t-ers", "therapie", [
  { art: "auswahl", id: "tetanus", label: "Tetanus", optionen: ["Tetanusschutz ausreichend.", "Tetanus-Auffrischimpfung verabreicht."] },
  { art: "auswahl", id: "verband", label: "Verband", default: 0, optionen: ["Steriler Verband.", "Pflaster."] },
]);
const OHNE_ERSATZ = baustein("t-ohne", "therapie", [{ art: "text", text: "Keine Wunde." }]);
const W_FEST = vorlage("t-w-fest", { therapie: ["t-allg", "t-ers"] }, { weglassen: { "t-allg/tetanus": ["t-ers/tetanus"] } });
const W_WAHL = vorlage("t-w-wahl", { therapie: ["t-allg"] }, { weglassen: { "t-allg/tetanus": ["t-ers/tetanus"] }, wahl: [{ abschnitt: "therapie", label: "Wunde?", bausteine: ["t-ers", "t-ohne"] }] });
const W_OHNE = vorlage("t-w-ohne", { therapie: ["t-allg", "t-ers"] });
const W_INDEX = testIndex([ALLG, ERSATZ, OHNE_ERSATZ], [W_FEST, W_WAHL, W_OHNE]);
const wStart = (v: Vorlage) => mitSeite(mitVorlage(neuerFall("zna", W_INDEX), v, W_INDEX), "rechts");
const zuwaehlbar = (fall: Fall, key: string) => ab(fall, W_INDEX, "therapie").aus.some((e) => e.key === key);
const imBrief = (fall: Fall, key: string) => ab(fall, W_INDEX, "therapie").tokens.some((t) => t.key === key);

test("Weglassen: der Satz fehlt, solange seine Ersatzstelle im Fall steht; nach Entfernen des Bausteins ist er wieder zuwählbar; uebernehmen setzt ihn nie", () => {
  // Gegenprobe ohne `weglassen`: der Satz ist zuwählbar.
  assert.ok(zuwaehlbar(wStart(W_OHNE), "t-allg/tetanus"));
  let fall = wStart(W_FEST);
  assert.ok(!zuwaehlbar(fall, "t-allg/tetanus"), "weggelassener Satz ist zuwählbar");
  assert.ok(!imBrief(fall, "t-allg/tetanus"));
  // Die Ersatzstelle ist die Lücke, an der der Arzt die Aussage macht; die übrigen Sätze bleiben, wie sie waren.
  const th = ab(fall, W_INDEX, "therapie");
  assert.ok(th.tokens.some((t) => t.key === "t-ers/tetanus" && t.zustand === "offen"));
  assert.ok(th.tokens.some((t) => t.key === "t-allg/untersucht" && t.zustand === "vorschlag"));
  assert.ok(zuwaehlbar(fall, "t-allg/rezept"));
  fall = uebernehmen(fall, ["t-allg/tetanus", "t-allg/untersucht"], W_INDEX);
  assert.equal(fall.optionen["t-allg/tetanus"], undefined, "weggelassener Satz wurde übernommen");
  assert.equal(fall.optionen["t-allg/untersucht"], true);
  // Ohne den Baustein mit der Ersatzstelle hat die Aussage keinen anderen Ort mehr (CR-01, PS-02).
  fall = ohneBaustein(fall, "t-ers");
  assert.ok(zuwaehlbar(fall, "t-allg/tetanus"), "nach Entfernen der Ersatzstelle ist der Satz nicht wählbar");
});

test("Weglassen: an einer Entweder-oder-Stelle fehlt der Satz, solange sie offen ist oder den Baustein mit der Ersatzstelle gewählt hat; nach „nichts davon“ oder einer anderen Wahl ist er zuwählbar", () => {
  const offen = wStart(W_WAHL);
  assert.ok(!zuwaehlbar(offen, "t-allg/tetanus"), "offene Stelle bietet die Ersatzstelle noch an");
  assert.ok(!zuwaehlbar(mitWahl(offen, "wahl/therapie/0", "t-ers", W_INDEX), "t-allg/tetanus"));
  assert.ok(zuwaehlbar(mitWahl(offen, "wahl/therapie/0", null, W_INDEX), "t-allg/tetanus"), "nach „nichts davon“ ist der Satz nicht wählbar");
  assert.ok(zuwaehlbar(mitWahl(offen, "wahl/therapie/0", "t-ohne", W_INDEX), "t-allg/tetanus"), "nach anderer Wahl ist der Satz nicht wählbar");
});

test("Weglassen: eine Ersatzstelle in einem ausgeblendeten oder von Hand überschriebenen Abschnitt zählt nicht (CR-12, PS-07)", () => {
  const v = vorlage("t-w-proc", { therapie: ["t-allg"], procedere: ["t-ers"] }, { weglassen: { "t-allg/tetanus": ["t-ers/tetanus"] } });
  const idx = testIndex([ALLG, ERSATZ], [v]);
  const start = mitSeite(mitVorlage(neuerFall("zna", idx), v, idx), "rechts");
  const frei = (fall: Fall) => ab(fall, idx, "therapie").aus.some((e) => e.key === "t-allg/tetanus");
  assert.ok(!frei(start));
  assert.ok(frei(mitAusgeblendet(start, "procedere", true)), "Ersatzstelle im ausgeblendeten Procedere verbirgt den Satz");
  assert.ok(frei(mitManuell(start, "procedere", "Kontrolle beim Hausarzt.")), "Ersatzstelle im überschriebenen Procedere verbirgt den Satz");
  assert.ok(!frei(mitAusgeblendet(mitAusgeblendet(start, "procedere", true), "procedere", false)));
});

test("Weglassen: eine ausdrückliche Angabe im Fall gewinnt, der Arzt sieht den Satz und kann ihn abwählen", () => {
  // Eingabe in einer Vorlage ohne `weglassen`, dann Vorlagenwechsel: Die Eingaben gemeinsamer Bausteine bleiben im Fall.
  let fall = mitOption(wStart(W_OHNE), "t-allg/tetanus", true);
  fall = mitVorlage(fall, W_FEST, W_INDEX);
  assert.ok(imBrief(fall, "t-allg/tetanus"));
  // Abgewählt bleibt der Satz zuwählbar, solange die Abwahl im Fall steht.
  fall = mitOption(fall, "t-allg/tetanus", false);
  assert.ok(zuwaehlbar(fall, "t-allg/tetanus"));
  // Ohne Angabe gilt wieder die Vorlage.
  fall = mitOption(fall, "t-allg/tetanus", undefined);
  assert.ok(!zuwaehlbar(fall, "t-allg/tetanus"));
  // Eigener Wortlaut ist ebenfalls eine ausdrückliche Angabe.
  fall = mitEigenemText(fall, "t-allg/tetanus", "Tetanus aufgefrischt.");
  assert.ok(zuwaehlbar(fall, "t-allg/tetanus"));
});

test("Weglassen: Schlüssel, die nicht zuwählbar wären, und ungültige Ersatzstellen gelten nicht", () => {
  // So kann eine eingefügte eigene Vorlage keinen Vorschlag, keine Lücke und keinen Befund unsichtbar machen (PS-03 b, PS-04).
  const v = vorlage(
    "t-w-falsch",
    { befund: ["t-osg"], therapie: ["t-allg", "t-ers"], procedere: ["t-proc"] },
    {
      vorgaben: { an: ["t-allg/rezept"] },
      weglassen: {
        "t-allg/untersucht": ["t-ers/tetanus"],
        "t-allg/rezept": ["t-ers/tetanus"],
        "t-osg/haut": ["t-ers/tetanus"],
        "t-allg/tetanus": ["t-ers/verband", "t-dgn/ergebnis", "t-allg/tetanus"],
        "t-proc/sport": ["t-ers/tetanus"],
      },
    },
  );
  const idx = testIndex([ALLG, ERSATZ, BEFUND, PROCEDERE, DIAGNOSTIK], [v]);
  const fall = mitSeite(mitVorlage(neuerFall("zna", idx), v, idx), "rechts");
  const th = ab(fall, idx, "therapie");
  assert.ok(th.tokens.some((t) => t.key === "t-allg/untersucht"), "vorgeschlagener Satz (an: true) verschwand");
  assert.ok(th.tokens.some((t) => t.key === "t-allg/rezept"), "Satz aus vorgaben.an verschwand");
  // Ersatzstellen ohne Pflicht, außerhalb der Vorlage oder im eigenen Baustein tragen nicht.
  assert.ok(th.aus.some((e) => e.key === "t-allg/tetanus"));
  assert.match(ab(fall, idx, "befund").text, /Haut intakt\./, "Befund verschwand");
  // Ein gültiger Eintrag gilt weiter.
  assert.ok(!ab(fall, idx, "procedere").aus.some((e) => e.key === "t-proc/sport"));
});

test("Schnellwerte je Vorlage: ersetzen die des Katalogs an genau diesem Feld; leere Liste heißt keine", () => {
  const katalog = ["Beim Gehen sei der Fuß nach außen umgeknickt."];
  const v = vorlage("t-v-schnell", { anamnese: ["t-ana"] }, { schnellwerte: { "t-ana/hergang": ["Sturz auf die Hüfte."], "t-ana/leer": [] } });
  assert.deepEqual(schnellwerteVon(v, "t-ana/hergang", katalog), ["Sturz auf die Hüfte."]);
  assert.deepEqual(schnellwerteVon(v, "t-ana/leer", katalog), []);
  // Andere Felder, andere Vorlagen und der Fall ohne Vorlage behalten die Liste des Katalogs.
  assert.deepEqual(schnellwerteVon(v, "t-ana/zeitpunkt", katalog), katalog);
  assert.deepEqual(schnellwerteVon(V, "t-ana/hergang", katalog), katalog);
  assert.deepEqual(schnellwerteVon(undefined, "t-ana/hergang", katalog), katalog);
});

test("Abgleich: Widersprüche zwischen Abschnitten werden genannt, Vorschläge und Lücken zählen nicht mit", () => {
  const eb = baustein("t-eb", "entlassbefund", [
    { art: "auswahl", id: "naht", label: "Nahtmaterial", pflicht: true, optionen: ["Hautklammern noch nicht entfernt. ", "Hautklammern entfernt. "] },
    { art: "option", id: "gehen", label: "Gehen", an: true, text: "Gehen{belastung}. ", slots: [{ art: "auswahl", id: "belastung", label: "Belastung", required: true, optionen: ["", " mit Vollbelastung", " mit schmerzadaptierter Vollbelastung", " mit Teilbelastung"] }] },
  ]);
  const proc = baustein("t-pr", "procedere", [
    { art: "punkt" },
    { art: "option", id: "bein", label: "Belastung", an: true, text: "{stufe} des Beins, danach Vollbelastung.", slots: [{ art: "auswahl", id: "stufe", label: "Stufe", required: true, optionen: ["", "Vollbelastung", "Schmerzadaptierte Vollbelastung", "Teilbelastung", "Entlastung"] }] },
    { art: "punkt" },
    { art: "option", id: "naht", label: "Naht", an: true, text: "Entfernung der Hautklammern am 14. Tag." },
  ]);
  const v: Vorlage = { ...vorlage("t-v-abgleich", { entlassbefund: ["t-eb"], procedere: ["t-pr"] }), setting: "station" };
  const idx = testIndex([eb, proc], [v]);
  let fall = mitVorlage(neuerFall("station", idx), v, idx);
  const hinweise = () => findeAbgleichhinweise(renderBrief(fall, idx), ABGLEICHREGELN).map((h) => h.text);
  // Solange nichts gewählt und nichts übernommen ist, gibt es nichts abzugleichen.
  assert.deepEqual(hinweise(), []);
  fall = mitAngabe(fall, "t-eb/gehen", "t-eb/gehen/belastung", "3");
  fall = mitAngabe(fall, "t-pr/bein", "t-pr/bein/stufe", "4");
  assert.deepEqual(hinweise(), ["Belastung: Entlassbefund nennt „Teilbelastung“, Procedere nennt „Entlastung“."]);
  // „Schmerzadaptierte Vollbelastung“ und „Vollbelastung“ gelten als dasselbe; das spätere „danach Vollbelastung“ zählt nicht.
  fall = mitAngabe(fall, "t-eb/gehen", "t-eb/gehen/belastung", "2");
  fall = mitAngabe(fall, "t-pr/bein", "t-pr/bein/stufe", "1");
  assert.deepEqual(hinweise(), []);
  fall = mitAngabe(fall, "t-eb/gehen", "t-eb/gehen/belastung", "1");
  fall = mitAngabe(fall, "t-pr/bein", "t-pr/bein/stufe", "3");
  assert.deepEqual(hinweise(), ["Belastung: Entlassbefund nennt „Vollbelastung“, Procedere nennt „Teilbelastung“."]);
  fall = mitAngabe(fall, "t-pr/bein", "t-pr/bein/stufe", "2");
  // Nahtmaterial: entfernt im Entlassbefund, Entfernung im Procedere erst, wenn der Satz übernommen ist.
  fall = mitAuswahl(fall, "t-eb/naht", 1);
  assert.deepEqual(hinweise(), []);
  fall = uebernehmen(fall, ["t-pr/naht"], idx);
  assert.deepEqual(hinweise(), ["Nahtmaterial: Laut Entlassbefund ist nichts mehr zu entfernen, das Procedere nennt eine Entfernung."]);
  fall = mitAuswahl(fall, "t-eb/naht", 0);
  assert.deepEqual(hinweise(), []);
});

test("Abgleich: eine Aussage, die eine zweite verlangt (Stellschraube ohne Satz zur Entfernung)", () => {
  const th = baustein("t-op", "therapie", [{ art: "option", id: "schraube", label: "Stellschraube", an: true, text: "Stabilisierung der Syndesmose mit einer Stellschraube." }]);
  const pr = baustein("t-me", "procedere", [
    { art: "punkt" },
    { art: "option", id: "kontrolle", label: "Kontrolle", an: true, text: "Kontrolle in der Praxis." },
    { art: "punkt" },
    { art: "option", id: "entfernung", label: "Entfernung", text: "Entfernung der Stellschraube nach der Heilung der Syndesmose." },
  ]);
  const v: Vorlage = { ...vorlage("t-v-fehlt", { therapie: ["t-op"], procedere: ["t-me"] }), setting: "station" };
  const idx = testIndex([th, pr], [v]);
  let fall = uebernehmen(mitVorlage(neuerFall("station", idx), v, idx), ["t-op/schraube", "t-me/kontrolle"], idx);
  const hinweise = () => findeAbgleichhinweise(renderBrief(fall, idx), ABGLEICHREGELN);
  assert.equal(hinweise().length, 1);
  assert.deepEqual(hinweise()[0].abschnitte, ["therapie", "procedere"]);
  fall = mitOption(fall, "t-me/entfernung", true);
  assert.deepEqual(hinweise(), []);
});

test("Abgleich Gerinnungshemmung: verneint in der Anamnese, vorausgesetzt anderswo; ein Hinweis je Widerspruch, keiner bei bloßen Hinweisen", () => {
  // Wortlaute aus dem Katalog; der Abgleich sieht nur den Text, den der Arzt schon zu seiner Aussage gemacht hat.
  const hinweise = (texte: Partial<Record<AbschnittId, string>>) =>
    findeAbgleichhinweise(
      { abschnitte: Object.entries(texte).map(([id, t]) => ({ id, titel: id, leer: false, ausgeblendet: false, tokens: [{ t, art: "fix", zustand: "gesetzt" }] })) } as unknown as BriefAnsicht,
      ABGLEICHREGELN,
    )
      .map((h) => h.text)
      // Andere Regeln, die auf dieselben Sätze ansprechen (Präparat der Prophylaxe), prüfen ihre eigenen Tests.
      .filter((t) => t.startsWith("Gerinnungshemmung:"));
  const VERNEINT = "Vorerkrankungen: keine bekannt. Dauermedikation: keine. Gerinnungshemmende Medikamente: keine. Allergien: keine bekannt.";
  const PROCEDERE = "Gerinnungshemmung: Die Anamnese verneint gerinnungshemmende Medikamente, das Procedere setzt eine Gerinnungshemmung voraus.";
  for (const satz of [
    "Die vorbestehende Blutverdünnung (Antikoagulation) wird unverändert fortgeführt, keine zusätzliche Thromboseprophylaxe.",
    "Vorbestehende Antikoagulation unverändert fortführen, keine zusätzliche Thromboseprophylaxe.",
    "Vorbestehende Antikoagulation pausiert bis zur klinischen Kontrolle, dort Entscheidung über den Wiederbeginn.",
    "Vorbestehende Gerinnungshemmung pausiert, stattdessen medikamentöse Thromboseprophylaxe mit niedermolekularem Heparin.",
    "Apixaban pausiert, letzte Einnahme heute.",
    "Acetylsalicylsäure in niedriger Dosis wird weitergegeben.",
    "Gerinnungshemmendes Medikament unverändert weiter einnehmen. Eine Hirnblutung kann darunter auch verzögert auftreten: Warnzeichen in den nächsten Tagen besonders beachten.",
    "Gerinnungshemmendes Medikament pausieren bis 10.11.2026; über den Wiederbeginn entscheidet die Hausarztpraxis bei der Kontrolle am 12.11.2026.",
    "Gerinnungshemmende Medikamente bis zur Operation: unverändert weiter einnehmen.",
    "Gerinnungshemmende Medikamente bis zur Operation: Apixaban ab heute pausieren.",
    "Medikamentöse Thromboseprophylaxe, bis der INR unter Phenprocoumon im Zielbereich liegt, danach keine zusätzliche Thromboseprophylaxe.",
  ]) {
    // Vorher meldeten zwei Regeln denselben Widerspruch; jetzt genau ein Hinweis.
    assert.deepEqual(hinweise({ anamnese: VERNEINT, procedere: `- ${satz}` }), [PROCEDERE], satz);
  }
  for (const satz of [
    "Unter gerinnungshemmender Medikation kann ein Bluterguss in den nächsten Tagen zunehmen.",
    "Keine Antikoagulation, weil kein Verdacht auf eine Thrombose besteht.",
    "Keine Acetylsalicylsäure als Schmerzmittel einnehmen.",
    "Vorbestehende Dauermedikation unverändert, siehe Medikationsplan.",
    "Bis zur Klärung therapeutische Antikoagulation.",
    "Gerinnungshemmende Medikamente bis zur Operation: Festlegung bei der Wiedervorstellung.",
  ]) {
    assert.deepEqual(hinweise({ anamnese: VERNEINT, procedere: `- ${satz}` }), [], satz);
  }
  assert.deepEqual(hinweise({ diagnose: "Leichtes Schädel-Hirn-Trauma, unter gerinnungshemmender Medikation", anamnese: VERNEINT }), [
    "Gerinnungshemmung: Die Anamnese verneint gerinnungshemmende Medikamente, die Diagnose nennt eine gerinnungshemmende Medikation.",
  ]);
  assert.deepEqual(hinweise({ anamnese: `${VERNEINT} Letzte Einnahme des gerinnungshemmenden Medikaments: heute.` }), [
    "Gerinnungshemmung: Die Anamnese verneint gerinnungshemmende Medikamente und nennt zugleich ihre letzte Einnahme.",
  ]);
  assert.deepEqual(hinweise({ anamnese: `${VERNEINT} Letzte Einnahme des gerinnungshemmenden Medikaments: unbekannt.` }), []);
  // Innerhalb der Anamnese: leere Vorgeschichte aus dem Knopf, Gerinnungshemmung einzeln gewählt, und umgekehrt.
  assert.deepEqual(hinweise({ anamnese: "Vorerkrankungen: keine bekannt. Dauermedikation: keine. Gerinnungshemmende Medikamente: Apixaban. Allergien: keine bekannt." }), [
    "Gerinnungshemmung: Die Anamnese nennt keine Dauermedikation, aber ein gerinnungshemmendes Medikament.",
  ]);
  assert.deepEqual(hinweise({ anamnese: "Vorerkrankungen: Vorhofflimmern. Dauermedikation: Xarelto 20 mg 1-0-0, Ramipril 5 mg. Gerinnungshemmende Medikamente: keine. Allergien: keine bekannt." }), [
    "Gerinnungshemmung: Die Anamnese verneint gerinnungshemmende Medikamente, die Dauermedikation nennt eines.",
  ]);
  // Was hinter der Dauermedikation steht, zählt nicht dazu (Allergie gegen Aspirin).
  assert.deepEqual(hinweise({ anamnese: "Dauermedikation: Ramipril. Gerinnungshemmende Medikamente: keine. Allergien: Aspirin." }), []);
  assert.deepEqual(hinweise({ anamnese: VERNEINT }), []);
});

// --- Abgleich aus dem Akzeptanztest Station (r5-luecken, M-01 bis M-20) -------------------------------

/** Abgleich über reine Texte je Abschnitt; `vorn` filtert auf Hinweise, die so beginnen. */
function textHinweise(texte: Partial<Record<AbschnittId, string>>, vorn?: string): string[] {
  return findeAbgleichhinweise(
    { abschnitte: Object.entries(texte).map(([id, t]) => ({ id, titel: id, leer: false, ausgeblendet: false, tokens: [{ t, art: "fix", zustand: "gesetzt" }] })) } as unknown as BriefAnsicht,
    ABGLEICHREGELN,
  )
    .map((h) => h.text)
    .filter((t) => !vorn || t.startsWith(vorn));
}

const MOBILISATION = (womit: string, belastung: string) =>
  `Ab dem 1. Tag nach der Operation mobilisierten wir die Patientin mit Physiotherapie${womit}${belastung}, zuletzt selbstständig auf Stationsebene. `;

test("Abgleich Belastung und Gehhilfe (M-04): Verlauf, Entlassbefund und Procedere paarweise", () => {
  const verlauf = MOBILISATION(" an Unterarmgehstützen", " unter Teilbelastung");
  const procedere = "- Vollbelastung des Beins rechts ab sofort.\n- Gehen am Rollator, bis der Gang sicher ist.";
  // Fall Hüft-TEP aus dem Akzeptanztest: Der Entlassbefund sagt nichts, die Kette über ihn ist unterbrochen.
  assert.deepEqual(textHinweise({ verlauf, procedere }), [
    "Belastung: verlauf nennt „Teilbelastung“, procedere nennt „Vollbelastung“.",
    "Gehhilfe: verlauf nennt „Unterarmgehstützen“, procedere nennt „Rollator“.",
  ]);
  // Fall Pertrochantär: Gehhilfe im Verlauf und im Entlassbefund verschieden.
  assert.deepEqual(textHinweise({ verlauf: MOBILISATION(" am Rollator", " unter Vollbelastung"), entlassbefund: "Gehen selbstständig ohne Hilfsmittel auf Stationsebene. " }, "Gehhilfe:"), [
    "Gehhilfe: verlauf nennt „Rollator“, entlassbefund nennt „ohne Hilfsmittel“.",
  ]);
  // Gleiche Angaben melden nichts.
  assert.deepEqual(
    textHinweise({
      verlauf: MOBILISATION(" am Rollator", " unter schmerzadaptierter Vollbelastung"),
      entlassbefund: "Gehen selbstständig am Rollator mit Vollbelastung auf Stationsebene. ",
      procedere: "- Schmerzadaptierte Vollbelastung des Beins rechts ab sofort.\n- Gehen am Rollator, bis der Gang sicher ist.",
    }),
    [],
  );
  // Spätere Ziele zählen nicht: „danach Vollbelastung“, „bis zum Erreichen der Vollbelastung“, „Steigerung bis zur Vollbelastung“.
  for (const p of [
    "- Teilbelastung des Beins rechts mit 20 kg für 6 Wochen nach der Operation, danach Vollbelastung.\n- Medikamentöse Thromboseprophylaxe bis zum Erreichen der Vollbelastung.",
    "- Teilbelastung des Beins rechts für 6 Wochen nach der Operation, danach schrittweise Steigerung bis zur Vollbelastung.",
    "- Belastung bei Entlassung: Teilbelastung mit 20 kg. Weitere Belastung: wie bei Entlassung bis zum Ende der 6. Woche nach der Operation, Vollbelastung ab der 7. Woche.",
  ]) {
    assert.deepEqual(textHinweise({ verlauf: MOBILISATION(" an Unterarmgehstützen", " unter Teilbelastung"), procedere: p }, "Belastung:"), [], p);
  }
  // Eine Steigerung im Verlauf ist kein Stand.
  assert.deepEqual(textHinweise({ verlauf: MOBILISATION(" am Rollator", " unter schmerzadaptierter Steigerung der Belastung bis zur Vollbelastung"), procedere: "- Teilbelastung des Beins rechts mit 15 kg ab sofort." }, "Belastung:"), []);
  // „Ohne Einschränkung der Belastung“ zählt als Vollbelastung.
  assert.deepEqual(textHinweise({ verlauf: MOBILISATION(" am Rollator", " unter Teilbelastung"), procedere: "- Mobilisation nach Schmerzen ohne Einschränkung der Belastung ab sofort." }, "Belastung:"), [
    "Belastung: verlauf nennt „Teilbelastung“, procedere nennt „Vollbelastung“.",
  ]);
  // Hilfsmittel, die der Verlauf außerhalb der Mobilisation nennt, zählen nicht.
  assert.deepEqual(textHinweise({ verlauf: "Wir verordneten einen Rollator. ", procedere: "- Gehen an Unterarmgehstützen." }, "Gehhilfe:"), []);
});

test("Abgleich Belastung und Gehhilfe: Wortlaut der Standardprotokolle; nur die erste Zeile gibt den Stand bei Entlassung", () => {
  // Zeilen aus docs/03-inhalt/standardprotokolle-entwurf.json (Nr. 1, 4, 7, 14, 15, 17, 18, 20, 23, 26, 27, 28, 40, 41), Seite und
  // Gehhilfe eingesetzt; der Kasten aus r5-protokolle setzt sie als Listenpunkte ein. Bei 15, 20 und 28 zählt „steigern bis zur
  // Vollbelastung“ nicht als Vollbelastung (G-101). Nr. 27 nennt die Gehstützen in einem eigenen Satz; der zählt nicht.
  const protokolle: { nr: number; zeilen: string[]; belastung: string | null; gehhilfe: string | null }[] = [
    { nr: 1, belastung: "Vollbelastung", gehhilfe: "Unterarmgehstützen", zeilen: [
      "1. bis 2. Woche nach der Operation: Vollbelastung des Beins rechts an Unterarmgehstützen im Dreipunktegang.",
      "3. bis 6. Woche nach der Operation: Vollbelastung im Zweipunktegang. Unterarmgehstützen abtrainieren, sobald der Gang ohne Hinken sicher ist.",
      "Ab der 7. Woche nach der Operation: keine Bewegungsgrenzen der Hüfte mehr. Belastung im Alltag nach Beschwerden steigern.",
    ] },
    { nr: 4, belastung: "Vollbelastung", gehhilfe: "Rollator", zeilen: [
      "1. bis 6. Woche nach der Operation: Vollbelastung des Beins rechts am Rollator.",
      "Physiotherapie mit Gangschule, Transfertraining, Kräftigung und Sturzvorbeugung.",
      "Ab der 7. Woche nach der Operation: keine Bewegungsgrenzen der Hüfte mehr. Gehhilfe abtrainieren, sobald der Gang sicher ist.",
    ] },
    { nr: 7, belastung: "Teilbelastung", gehhilfe: "Unterarmgehstützen", zeilen: [
      "1. bis 6. Woche nach der Operation: Teilbelastung des Beins rechts mit 20 kg an Unterarmgehstützen im Dreipunktegang. Hüfte ohne Bewegungsgrenze nach Schmerzen bewegen.",
      "Physiotherapie mit Gangschule unter Teilbelastung, Transfertraining und Kräftigung.",
      "Ab der 7. Woche nach der Operation: nach Röntgenkontrolle ohne Verschiebung Steigerung bis zur Vollbelastung innerhalb von 2 Wochen.",
    ] },
    { nr: 14, belastung: "Vollbelastung", gehhilfe: "Gehwagen", zeilen: [
      "1. bis 6. Woche nach dem Unfall: schmerzadaptierte Vollbelastung beider Beine am Gehwagen. Gehstrecke nach Schmerzen steigern.",
      "Keine Bettruhe und keine Beckenorthese.",
      "Ab der 7. Woche nach dem Unfall: Gehhilfe abtrainieren, sobald der Gang sicher ist.",
    ] },
    { nr: 15, belastung: null, gehhilfe: "Unterarmgehstützen", zeilen: [
      "1. bis 2. Woche nach dem Unfall: Belastung beider Beine an Unterarmgehstützen nach Schmerzen steigern bis zur Vollbelastung.",
      "3. bis 6. Woche nach dem Unfall: Vollbelastung, Unterarmgehstützen abtrainieren, sobald der Gang ohne Hinken sicher ist.",
    ] },
    { nr: 17, belastung: "Teilbelastung", gehhilfe: "Unterarmgehstützen", zeilen: [
      "1. bis 6. Woche nach der Operation: Teilbelastung des Beins rechts mit 20 kg an Unterarmgehstützen im Dreipunktegang. Kniegelenk aktiv und passiv bewegen bis Extension/Flexion 0/0/90°.",
      "7. bis 12. Woche nach der Operation: nach Röntgenkontrolle mit Zeichen der knöchernen Heilung schrittweise Steigerung bis zur Vollbelastung. Beugung ohne Bewegungsgrenze.",
    ] },
    { nr: 18, belastung: "Teilbelastung", gehhilfe: "Unterarmgehstützen", zeilen: [
      "1. bis 12. Woche nach der Operation: Teilbelastung des Beins rechts mit 20 kg an Unterarmgehstützen im Dreipunktegang.",
      "1. bis 6. Woche nach der Operation: Kniegelenk aktiv und passiv bewegen bis Extension/Flexion 0/0/90°. Ab der 7. Woche Beugung ohne Bewegungsgrenze.",
      "Ab der 13. Woche nach der Operation: nach Röntgenkontrolle mit Zeichen der knöchernen Heilung schrittweise Steigerung bis zur Vollbelastung.",
    ] },
    { nr: 20, belastung: null, gehhilfe: "Unterarmgehstützen", zeilen: [
      "1. bis 6. Woche nach der Operation: Belastung des Beins rechts an Unterarmgehstützen nach Schmerzen steigern bis zur Vollbelastung.",
      "Ab der 7. Woche nach der Operation: Unterarmgehstützen abtrainieren, sobald der Gang ohne Hinken sicher ist.",
    ] },
    { nr: 23, belastung: null, gehhilfe: "Unterarmgehstützen", zeilen: [
      "1. bis 2. Woche nach der Operation: Belastung des Beins rechts an Unterarmgehstützen nach Schmerzen steigern.",
      "3. bis 4. Woche nach der Operation: Vollbelastung im Zweipunktegang, Unterarmgehstützen abtrainieren, sobald der Gang ohne Hinken sicher ist.",
    ] },
    { nr: 26, belastung: "Teilbelastung", gehhilfe: "Unterarmgehstützen", zeilen: [
      "1. bis 6. Woche nach der Operation: Minimalbelastung des Beins rechts an Unterarmgehstützen, den Fuß nur mit dem Gewicht des Beins aufsetzen.",
      "7. bis 12. Woche nach der Operation: schrittweise Steigerung bis zur Vollbelastung, Orthese und Unterarmgehstützen abtrainieren.",
    ] },
    { nr: 27, belastung: "Vollbelastung", gehhilfe: null, zeilen: [
      "1. bis 2. Woche nach der Operation: schmerzadaptierte Vollbelastung des Beins rechts. Unterarmgehstützen, bis das Gehen ohne Hinken gelingt.",
      "Kniegelenk ohne Bewegungsgrenze nach Schmerzen bewegen, Drehbewegungen unter Belastung bis zum Ende der 2. Woche vermeiden.",
      "Ab der 3. Woche nach der Operation: Belastung im Alltag ohne Einschränkung.",
    ] },
    { nr: 28, belastung: null, gehhilfe: "Unterarmgehstützen", zeilen: [
      "1. bis 2. Woche nach der Operation: Belastung des Beins rechts an Unterarmgehstützen nach Schwellung und Schmerz steigern bis zur Vollbelastung.",
      "3. bis 6. Woche nach der Operation: Vollbelastung, Unterarmgehstützen abtrainieren, sobald der Gang ohne Hinken sicher ist. Beugung bis zur freien Beweglichkeit steigern.",
    ] },
    { nr: 41, belastung: "Vollbelastung", gehhilfe: "ohne Hilfsmittel", zeilen: [
      "1. bis 2. Woche nach der Operation: Mobilisation nach Schmerzen ohne Einschränkung der Belastung, Gehen ohne Gehhilfe. Bewegung der Wirbelsäule im schmerzarmen Bereich.",
      "Ab der 7. Woche nach der Operation: Belastung im Alltag ohne Einschränkung, Kraft- und Gleichgewichtstraining fortführen.",
    ] },
    { nr: 40, belastung: "Vollbelastung", gehhilfe: "Rollator", zeilen: [
      "1. bis 6. Woche nach dem Unfall: Mobilisation nach Schmerzen ohne Einschränkung der Belastung, Gehen am Rollator. Tiefes Sitzen, Rumpfbeugen und schweres Heben meiden.",
      "Ab der 7. Woche nach dem Unfall: Belastung im Alltag nach Beschwerden steigern, Kraft- und Gleichgewichtstraining fortführen.",
    ] },
  ];
  const WOMIT: Record<string, string> = { Unterarmgehstützen: " an Unterarmgehstützen", Rollator: " am Rollator", Gehwagen: " am Gehwagen" };
  const BELASTUNG: Record<string, string> = { Vollbelastung: " unter Vollbelastung", Teilbelastung: " unter Teilbelastung" };
  let geprueft = 0;
  for (const p of protokolle) {
    // Ob der Kasten die Zeilen als Listenpunkte, als Zeilen oder als Absatz einsetzt, ändert nichts.
    for (const procedere of [p.zeilen.map((z) => `- ${z}`).join("\n"), p.zeilen.join("\n"), p.zeilen.join(" ")]) {
      for (const [g, womit] of Object.entries(WOMIT)) {
        for (const [b, belastung] of Object.entries(BELASTUNG)) {
          geprueft++;
          const h = textHinweise({ verlauf: MOBILISATION(womit, belastung), procedere });
          const soll = [
            ...(p.belastung && p.belastung !== b ? [`Belastung: verlauf nennt „${b}“, procedere nennt „${p.belastung}“.`] : []),
            ...(p.gehhilfe && p.gehhilfe !== g ? [`Gehhilfe: verlauf nennt „${g}“, procedere nennt „${p.gehhilfe}“.`] : []),
          ];
          assert.deepEqual(h.filter((t) => /^(Belastung|Gehhilfe):/.test(t)), soll, `Nr. ${p.nr}, ${g}, ${b}: ${procedere}`);
        }
      }
    }
  }
  assert.equal(geprueft, protokolle.length * 3 * 6);
});

test("Abgleich Gerinnungshemmung (M-01): Pause ohne Wiederbeginn, genanntes Medikament gegen „keine“", () => {
  const PAUSE = "Gerinnungshemmung: Der Verlauf nennt eine Pause, das Procedere keinen Wiederbeginn.";
  const KEINE = "Gerinnungshemmung: Die Anamnese nennt ein gerinnungshemmendes Medikament, das Procedere verneint eine gerinnungshemmende Medikation.";
  const anamnese = "Gerinnungshemmende Medikamente: Apixaban, letzte Einnahme am Aufnahmetag. Allergien: keine bekannt.";
  // Fall Commotio aus dem Akzeptanztest.
  assert.deepEqual(
    textHinweise({ anamnese, verlauf: "Die gerinnungshemmende Medikation pausierten wir während der Überwachung. ", procedere: "- Gerinnungshemmende Medikation: keine." }, "Gerinnungshemmung:"),
    [PAUSE, KEINE],
  );
  // Pause mit Verweis auf das Procedere, das nichts dazu sagt.
  for (const verlauf of [
    "Die gerinnungshemmende Medikation pausierten wir, Wiederbeginn siehe Procedere. ",
    "Die gerinnungshemmende Medikation mit Apixaban pausierten wir vor der Operation. Bis zur Entlassung blieb sie pausiert, Wiederbeginn siehe Procedere. ",
    "Die gerinnungshemmende Medikation mit Apixaban pausierten wir ab der Aufnahme. Bis zur Entlassung gaben wir stattdessen niedermolekulares Heparin, Wiederbeginn siehe Procedere. ",
  ]) {
    assert.deepEqual(textHinweise({ verlauf, procedere: "- Medikamentöse Thromboseprophylaxe bis einschließlich 35. Tag nach der Operation." }, "Gerinnungshemmung:"), [PAUSE], verlauf);
    assert.deepEqual(
      textHinweise({ verlauf, procedere: "- Medikamentöse Thromboseprophylaxe bis zum Wiederbeginn der vorbestehenden Antikoagulation, danach keine zusätzliche Thromboseprophylaxe." }, "Gerinnungshemmung:"),
      [PAUSE],
      verlauf,
    );
  }
  // Ein Procedere, das den Wiederbeginn regelt, meldet nichts.
  for (const procedere of [
    "- Gerinnungshemmende Medikation: unverändert fortführen.",
    "- Gerinnungshemmende Medikation: pausiert, Entscheidung über den Wiederbeginn bei der Kontrolle in der Hausarztpraxis.",
    "- Gerinnungshemmende Medikation pausiert, Wiederbeginn am 12.11.2026.",
    "- Medikamentöse Thromboseprophylaxe bis einschließlich 10. Tag nach der Operation. Wiederbeginn der vorbestehenden gerinnungshemmenden Medikation ab dem 3. Tag nach der Operation.",
    "- Vorbestehende gerinnungshemmende Medikation fortführen, keine zusätzliche Thromboseprophylaxe.",
    "- Pausierte Medikation siehe Medikation. Über das Wiederansetzen entscheidet die Hausarztpraxis.",
  ]) {
    assert.deepEqual(textHinweise({ anamnese, verlauf: "Die gerinnungshemmende Medikation pausierten wir während der Überwachung. ", procedere }, "Gerinnungshemmung:"), [], procedere);
  }
  // Wiederbeginn schon im Verlauf; unveränderte Fortführung im Verlauf.
  for (const verlauf of [
    "Die gerinnungshemmende Medikation mit Apixaban pausierten wir vor der Operation. Am 2. Tag nach der Operation begannen wir sie wieder. ",
    "Die gerinnungshemmende Medikation führten wir unverändert fort. ",
  ]) {
    assert.deepEqual(textHinweise({ verlauf, procedere: "- Medikamentöse Thromboseprophylaxe bis einschließlich 35. Tag nach der Operation." }, "Gerinnungshemmung:"), [], verlauf);
  }
  // Ohne Gerinnungshemmer in der Anamnese passt „keine“.
  assert.deepEqual(textHinweise({ anamnese: "Gerinnungshemmende Medikamente: keine. Allergien: keine bekannt.", procedere: "- Gerinnungshemmende Medikation: keine." }, "Gerinnungshemmung:"), []);
  assert.deepEqual(textHinweise({ anamnese: "Gerinnungshemmende Medikamente: Acetylsalicylsäure 100 mg. ", procedere: "- Gerinnungshemmende Medikation: keine." }, "Gerinnungshemmung:"), [KEINE]);
});

test("Abgleich Thromboseprophylaxe (M-05, M-10): Procedere und Medikation in beiden Richtungen; Vollbelastung gegen „bis zum Erreichen der Vollbelastung“", () => {
  const OHNE_ZEILE = "Thromboseprophylaxe: Das Procedere nennt eine medikamentöse Prophylaxe, die Medikation keine Zeile dazu.";
  const OHNE_PROCEDERE = "Thromboseprophylaxe: Die Medikation verweist für die Dauer auf das Procedere, das keine Prophylaxe nennt.";
  const BEENDET = "Thromboseprophylaxe: Das Procedere beendet sie mit der Entlassung, die Medikation enthält eine Zeile dazu.";
  const UNBESTIMMT = "Thromboseprophylaxe: Bei Entlassung besteht schon Vollbelastung; das Ende der Prophylaxe ist damit unbestimmt.";
  const UNBESTIMMT_EB = "Thromboseprophylaxe: Der Entlassbefund nennt schon Vollbelastung; das Ende der Prophylaxe ist damit unbestimmt.";
  const MEDIKATION_LEER = "Schema: morgens-mittags-abends-nachts.\n- Ramipril 5 mg Tablette, 1-0-0-0, dauerhaft. UNVERÄNDERT: Bluthochdruck.\n\nArzneimittelunverträglichkeiten: keine bekannt.";
  const ZEILE = "Enoxaparin 40 mg Fertigspritze, subkutan, 0-0-1-0, Dauer siehe Procedere. NEU: Thromboseprophylaxe.";
  const PROPHYLAXE_35 = "- Medikamentöse Thromboseprophylaxe bis einschließlich 35. Tag nach der Operation.";
  // Fall Hüft-TEP aus dem Akzeptanztest: 35 Tage im Procedere, keine Medikationszeile.
  assert.deepEqual(textHinweise({ procedere: PROPHYLAXE_35, medikation: MEDIKATION_LEER }, "Thromboseprophylaxe:"), [OHNE_ZEILE]);
  for (const med of [ZEILE, "- Clexane 40 mg s.c. 0-0-1 bis 35. Tag", "- Siehe beigefügter Medikationsplan.", "- Rivaroxaban 10 mg 1-0-0 für 35 Tage"]) {
    assert.deepEqual(textHinweise({ procedere: PROPHYLAXE_35, medikation: med }, "Thromboseprophylaxe:"), [], med);
  }
  // Der Verweis auf die Medikation hat seine eigene Regel; keine doppelte Meldung.
  assert.deepEqual(textHinweise({ procedere: "- Medikamentöse Thromboseprophylaxe bis einschließlich 28. Tag nach der Operation. Wirkstoff und Dosis siehe Medikation.", medikation: MEDIKATION_LEER }, "Thromboseprophylaxe:"), [
    "Thromboseprophylaxe: Das Procedere verweist für Wirkstoff und Dosis auf die Medikation, die keine Zeile dazu enthält.",
  ]);
  // Umgekehrt: Medikationszeile verweist auf ein Procedere ohne Prophylaxe.
  assert.deepEqual(textHinweise({ procedere: "- Vollbelastung des Beins rechts ab sofort.", medikation: ZEILE }, "Thromboseprophylaxe:"), [OHNE_PROCEDERE]);
  assert.deepEqual(textHinweise({ procedere: PROPHYLAXE_35, medikation: ZEILE }, "Thromboseprophylaxe:"), []);
  // Mit der Entlassung beendet, aber Zeile in der Medikation.
  assert.deepEqual(textHinweise({ procedere: "- Medikamentöse Thromboseprophylaxe mit der Entlassung beendet bei ausreichender Mobilität.", medikation: ZEILE }, "Thromboseprophylaxe:"), [BEENDET]);
  assert.deepEqual(textHinweise({ procedere: "- Medikamentöse Thromboseprophylaxe mit der Entlassung beendet bei ausreichender Mobilität.", medikation: MEDIKATION_LEER }, "Thromboseprophylaxe:"), []);
  // M-10, Fall OSG: „Vollbelastung ab sofort“ und Prophylaxe bis zur Vollbelastung.
  const BIS_VOLL = "- Medikamentöse Thromboseprophylaxe bis zum Erreichen der Vollbelastung.";
  for (const belastung of [
    "- Vollbelastung des Beins rechts ab sofort.",
    "- Schmerzadaptierte Vollbelastung des Beins rechts ab sofort.",
    "- Vollbelastung ab sofort.",
    "- Mobilisation nach Schmerzen ohne Einschränkung der Belastung ab sofort.",
    "- Belastung bei Entlassung: Schmerzadaptierte Vollbelastung.",
    "- 1. bis 6. Woche nach der Operation: schmerzadaptierte Vollbelastung des Beins rechts am Rollator.",
  ]) {
    assert.deepEqual(textHinweise({ procedere: `${belastung}\n${BIS_VOLL}` }, "Thromboseprophylaxe:"), [UNBESTIMMT], belastung);
    // Der Entlassbefund meldet nicht noch einmal dasselbe.
    assert.deepEqual(textHinweise({ procedere: `${belastung}\n${BIS_VOLL}`, entlassbefund: "Gehen selbstständig am Rollator mit Vollbelastung. " }, "Thromboseprophylaxe:"), [UNBESTIMMT], belastung);
  }
  for (const belastung of [
    "- Teilbelastung des Beins rechts mit 20 kg für 6 Wochen nach der Operation, danach Vollbelastung.",
    "- 1. bis 6. Woche nach der Operation: Teilbelastung des Beins rechts mit 20 kg an Unterarmgehstützen im Dreipunktegang.\n- 7. bis 12. Woche nach der Operation: schrittweise Steigerung bis zur Vollbelastung.",
    "- Teilbelastung des Beins rechts mit 15 kg ab sofort.\n- Keine medikamentöse Thromboseprophylaxe nach der Entlassung, Vollbelastung erreicht.",
    // Protokolle Nr. 20 und 28: Steigerung bis zur Vollbelastung, Vollbelastung erst ab der 3. Woche (G-101).
    "- 1. bis 6. Woche nach der Operation: Belastung des Beins rechts an Unterarmgehstützen nach Schmerzen steigern bis zur Vollbelastung.",
    "- 1. bis 2. Woche nach der Operation: Belastung des Beins rechts an Unterarmgehstützen nach Schwellung und Schmerz steigern bis zur Vollbelastung.\n- 3. bis 6. Woche nach der Operation: Vollbelastung, Unterarmgehstützen abtrainieren, sobald der Gang ohne Hinken sicher ist.",
  ]) {
    assert.deepEqual(textHinweise({ procedere: `${belastung}\n${BIS_VOLL}` }, "Thromboseprophylaxe: Bei"), [], belastung);
  }
  // Vollbelastung nur im Entlassbefund.
  assert.deepEqual(
    textHinweise({ procedere: `- Teilbelastung des Beins rechts mit 20 kg für 2 Wochen nach der Operation.\n${BIS_VOLL}`, entlassbefund: "Gehen selbstständig an Unterarmgehstützen mit Vollbelastung auf Stationsebene. " }, "Thromboseprophylaxe:"),
    [UNBESTIMMT_EB],
  );
  assert.deepEqual(
    textHinweise({ procedere: `- Teilbelastung des Beins rechts mit 20 kg für 2 Wochen nach der Operation.\n${BIS_VOLL}`, entlassbefund: "Gehen selbstständig an Unterarmgehstützen mit Teilbelastung auf Stationsebene. " }, "Thromboseprophylaxe:"),
    [],
  );
});

test("Abgleich Arbeitsunfähigkeit (M-20) und Wunde (M-02)", () => {
  const AU = "Arbeitsunfähigkeit: Das Procedere nennt eine Bescheinigung von uns, aber kein Ende.";
  for (const p of ["- Arbeitsunfähigkeit: von uns bescheinigt.", "- Arbeitsunfähigkeit: von uns bescheinigt .", "Arbeitsunfähigkeit: von uns bescheinigt, Verlängerung bei Bedarf über die Hausarztpraxis."]) {
    assert.deepEqual(textHinweise({ procedere: p }, "Arbeitsunfähigkeit:"), [AU], p);
  }
  for (const p of [
    "- Arbeitsunfähigkeit: von uns bescheinigt bis einschließlich 20.11.2026.",
    "- Arbeitsunfähigkeit: von uns bescheinigt 20.11.2026.",
    "Arbeitsunfähigkeit: von uns bescheinigt für 1 Woche, Verlängerung bei Bedarf über die Hausarztpraxis.",
    "Arbeitsunfähigkeit: von uns bescheinigt bis zur Kontrolle in der Praxis.",
    "- Arbeitsunfähigkeit: keine Bescheinigung erforderlich.",
    "- Arbeitsunfähigkeit: von uns nicht bescheinigt, Beurteilung durch die Hausarztpraxis.",
  ]) {
    assert.deepEqual(textHinweise({ procedere: p }, "Arbeitsunfähigkeit:"), [], p);
  }
  const WUNDE = "Wunde: Der Verlauf nennt eine reizlose Heilung und zugleich eine Wundheilungsstörung.";
  const FORT = "Wunde: Laut Verlauf bestand die Wundheilungsstörung bei Entlassung fort, der Entlassbefund nennt reizlose Wundverhältnisse.";
  // Fall DRF aus dem Akzeptanztest.
  assert.deepEqual(
    textHinweise({ verlauf: "Die Operationswunde heilte trocken und reizlos. Die Operationswunde zeigte eine Rötung der Wundränder. Unter lokaler Wundbehandlung besserte sich der Befund. " }, "Wunde:"),
    [WUNDE],
  );
  assert.deepEqual(textHinweise({ verlauf: "Die Operationswunde zeigte eine Rötung der Wundränder. Unter lokaler Wundbehandlung besserte sich der Befund. ", entlassbefund: "Wundverhältnisse trocken und reizlos. " }, "Wunde:"), []);
  assert.deepEqual(
    textHinweise({ verlauf: "Die Operationswunde sezernierte verlängert. Bei Entlassung bestand der Befund fort, Kontrollen siehe Procedere. ", entlassbefund: "Wundverhältnisse trocken und reizlos. " }, "Wunde:"),
    [FORT],
  );
  assert.deepEqual(
    textHinweise({ verlauf: "Die Operationswunde sezernierte verlängert. Bei Entlassung bestand der Befund fort, Kontrollen siehe Procedere. ", entlassbefund: "Wunde mit geringer seröser Sekretion. " }, "Wunde:"),
    [],
  );
  assert.deepEqual(textHinweise({ verlauf: "Die Operationswunde heilte nach anfänglicher Sekretion trocken und reizlos. " }, "Wunde:"), []);
  // Entweder-oder in verl-st-operativ/wunde: Störung ohne Maßnahme, reizlose Heilung mit Maßnahme.
  const OHNE_MASSNAHME = "Wunde: Der Verlauf nennt eine Wundheilungsstörung, aber weder Behandlung noch Befund bei Entlassung.";
  const REIZLOS_MIT = "Wunde: Der Verlauf nennt eine reizlose Heilung und zugleich eine Behandlung der Wunde.";
  for (const st of ["sezernierte verlängert", "zeigte eine Rötung der Wundränder", "zeigte ein Hämatom", "zeigte eine Wundrandnekrose", "öffnete sich oberflächlich"]) {
    assert.deepEqual(textHinweise({ verlauf: `Die Operationswunde ${st}. Die Schmerzen behandelten wir nach Stufenschema. ` }, "Wunde:"), [OHNE_MASSNAHME], st);
    for (const m of [
      "Unter lokaler Wundbehandlung besserte sich der Befund.",
      "Unter lokaler Wundbehandlung und antibiotischer Behandlung besserte sich der Befund.",
      "Wir revidierten die Wunde operativ, siehe Therapie.",
      "Bei Entlassung bestand der Befund fort, Kontrollen siehe Procedere.",
    ]) {
      assert.deepEqual(textHinweise({ verlauf: `Die Operationswunde ${st}. ${m} ` }, "Wunde:"), [], m);
      assert.deepEqual(textHinweise({ verlauf: `Die Operationswunde heilte trocken und reizlos. ${m} ` }, "Wunde:"), [REIZLOS_MIT], m);
    }
  }
});

test("Gesamtbrief: Überschriften, leere und ausgeblendete Abschnitte fehlen", () => {
  const fall = mitSeite(neu(), "rechts");
  const text = briefText(renderBrief(fall, index));
  assert.match(text, /^Anamnese:\n/);
  assert.match(text, /\n\nBefund:\nSprunggelenk rechts:/);
  assert.doesNotMatch(text, /\nMedikation:|\nDiagnose:/);
  assert.doesNotMatch(text, / {2}| \n|\n{3}/);
  assert.doesNotMatch(briefText(renderBrief(fall, index), false), /Befund:\n/);
});

// --- Zwischenablage, Suche ---------------------------------------------------

test("Zwischenablage: Windows-Zeilenenden, sichere Zeichen, zusammengesetzte Umlaute", () => {
  const t = fuerZwischenablage("5–7 Tage „Schiene“ …\nZeile ≥ 2 cm", { zeilenende: "crlf", zeichen: "einfach" });
  assert.equal(t, '5-7 Tage "Schiene" ...\r\nZeile >= 2 cm');
  assert.equal(fuerZwischenablage("a\r\nb", { zeilenende: "lf", zeichen: "original" }), "a\nb");
  assert.equal(fuerZwischenablage("ä", { zeilenende: "lf", zeichen: "einfach" }), "ä");
  assert.equal(fuerZwischenablage("100 μg", { zeilenende: "lf", zeichen: "einfach" }), "100 µg");
});

test("Unsichere Zeichen in freiem Text werden erkannt", () => {
  assert.deepEqual(unsichereZeichen("CRP ↑, Hämoglobin ↓"), ["↑", "↓"]);
  assert.equal(istKisSicher("Flexion 120°, 2 cm², ± 5 mm, ä ö ü ß"), true);
  assert.equal(istKisSicher("∅ Fraktur"), false);
});

test("Suche: Kürzel, Umlaute, Tippfehler, Synonyme, mehrere Wörter", () => {
  const v = (titel: string, mehr: Partial<Vorlage> = {}) => vorlage(titel, {}, { titel, ...mehr });
  const liste = [
    v("Distale Radiusfraktur konservativ", { kuerzel: ["drf"] }),
    v("Distale Radiusfraktur OP"),
    v("OSG-Distorsion", { kuerzel: ["osg"], suchbegriffe: ["Umknicktrauma"] }),
    v("Schädel-Hirn-Trauma"),
    v("HWS-Distorsion", { suchbegriffe: ["Schleudertrauma"] }),
    v("Claviculafraktur"),
    v("Skaphoidfraktur konservativ"),
  ];
  const titel = (q: string) => sucheVorlagen(liste, q, "zna").map((t) => t.vorlage.titel);
  assert.equal(titel("drf")[0], "Distale Radiusfraktur konservativ");
  assert.equal(titel("osg")[0], "OSG-Distorsion");
  assert.equal(titel("schadel")[0], "Schädel-Hirn-Trauma");
  assert.equal(titel("schleudertrauma")[0], "HWS-Distorsion");
  assert.equal(titel("radius op")[0], "Distale Radiusfraktur OP");
  assert.equal(titel("klavicula")[0], "Claviculafraktur");
  assert.equal(titel("skafoid")[0], "Skaphoidfraktur konservativ");
  assert.deepEqual(titel("xyzxyz"), []);
  assert.equal(abstand("radius", "raduis", 1), 1);
});

test("Eigener Baustein als Satz: erscheint als Vorschlag und folgt der Seite des Falls", () => {
  const eigen: Baustein = { id: "eigen-1", titel: "Mein Procedere", typ: "procedere", abschnitt: "procedere", platzhalter: [], status: "eigen", segmente: [{ art: "option", id: "text", label: "Mein Procedere", an: true, text: "Gips {seite} für 4 Wochen." }] };
  const idx = testIndex([eigen]);
  let fall = mitBaustein(neuerFall("zna", idx), "eigen-1", idx);
  let a = ab(fall, idx, "procedere");
  assert.equal(a.seiteFehlt, true);
  fall = mitSeite(fall, "links");
  a = ab(fall, idx, "procedere");
  assert.equal(a.text, "Gips links für 4 Wochen.");
  assert.equal(a.vorschlag, 1);
  assert.equal(a.fertig, false);
  assert.equal(ab(uebernehmen(fall, ["eigen-1/text"], idx), idx, "procedere").fertig, true);
});

test("Vorlage verlangt einen Wahlbefund und einen Messwert: Lücke, bis angegeben oder als nicht erhoben gekennzeichnet", () => {
  const knie = baustein("knie", "befund", [
    { art: "befund", id: "schwellung", chip: "Schwellung", normal: "Keine Schwellung. ", abweichung: "Schwellung. ", gruppe: "Inspektion" },
    {
      art: "befund",
      id: "baender",
      chip: "Seitenbänder",
      normal: "",
      abweichung: "{befund}. ",
      gruppe: "Stabilität",
      slots: [{ art: "auswahl", id: "befund", label: "Befund", optionen: ["", "Seitenbänder stabil", "Mediale Aufklappbarkeit"], required: true }],
    },
    { art: "befund", id: "instabil", chip: "Instabilitätsgefühl", normal: "", abweichung: "Subjektives Instabilitätsgefühl. ", gruppe: "Stabilität" },
    { art: "messwert", id: "rom", label: "Extension/Flexion", vorlage: "Extension/Flexion {w}°. ", gruppe: "Beweglichkeit" },
  ]);
  const ohneListe = testIndex([knie], [vorlage("v", { befund: ["knie"] })]);
  const index = testIndex([knie], [vorlage("v", { befund: ["knie"] }, { entscheiden: ["knie/baender", "knie/rom"] })]);

  // Ohne die Liste der Vorlage steht von beidem nichts im Brief.
  const still = ab(mitVorlage(neuerFall("zna", ohneListe), ohneListe.vorlagen.get("v")!, ohneListe), ohneListe, "befund");
  assert.equal(still.text, "Keine Schwellung.");
  assert.equal(still.offen, 0);

  let fall = mitVorlage(neuerFall("zna", index), index.vorlagen.get("v")!, index);
  let a = ab(fall, index, "befund");
  assert.equal(a.offen, 2);
  assert.match(a.text, /‹Seitenbänder\?›/);
  assert.match(a.text, /‹Extension\/Flexion\?›/);
  assert.equal(a.fertig, false);

  // Sammelübernahme der Vorschläge schließt die Lücken nicht.
  fall = uebernehmen(fall, a.tokens.filter((t) => t.zustand === "vorschlag" && t.key).map((t) => t.key!), index);
  a = ab(fall, index, "befund");
  assert.equal(a.offen, 2);

  // Angegeben: Der Wahlbefund gilt nicht als auffällig, auch wenn der Arzt den Weg über „angeben" nimmt.
  fall = mitSlot(mitBefund(fall, "knie/baender", "abw"), "knie/baender/befund", "1");
  fall = mitWert(fall, "knie/rom", "0/0/130");
  a = ab(fall, index, "befund");
  assert.equal(a.text, "Keine Schwellung. Seitenbänder stabil. Extension/Flexion 0/0/130°.");
  assert.equal(a.tokens.find((t) => t.key === "knie/baender")?.zustand, "gesetzt");
  assert.equal(a.auffaellig, 0);
  assert.equal(a.fertig, true);

  // Ein fester auffälliger Satz ohne Normaltext bleibt ein auffälliger Befund.
  const mitGefuehl = ab(mitBefund(fall, "knie/instabil", "abw"), index, "befund");
  assert.equal(mitGefuehl.tokens.find((t) => t.key === "knie/instabil")?.zustand, "abw");
  assert.equal(mitGefuehl.auffaellig, 1);

  // Nicht untersucht, nicht gemessen: Die Lücke entfällt, der Satz steht nicht im Brief.
  let nicht = mitVorlage(neuerFall("zna", index), index.vorlagen.get("v")!, index);
  nicht = mitBefund(mitBefund(nicht, "knie/baender", "weg"), "knie/schwellung", "ok");
  nicht = { ...nicht, versteckt: { "knie/rom": true } };
  a = ab(nicht, index, "befund");
  assert.equal(a.text, "Keine Schwellung.");
  assert.equal(a.offen, 0);
  assert.equal(a.fertig, true);
});

test("Entweder-oder-Stelle: nichts steht vorab im Brief, die Lücke bleibt bis zur Wahl oder bis der Arzt sie leer lässt", () => {
  const roentgen = baustein("roentgen", "diagnostik", [
    { art: "text", text: "Röntgen: " },
    { art: "auswahl", id: "ergebnis", label: "Röntgenbefund", optionen: ["Kein Frakturnachweis.", "Fraktur."], pflicht: true },
  ]);
  const verzicht = baustein("verzicht", "diagnostik", [{ art: "option", id: "satz", label: "Verzicht", text: "Auf ein Röntgen haben wir verzichtet.", an: true }]);
  const labor = baustein("labor", "diagnostik", [{ art: "option", id: "satz", label: "Labor", text: "Labor unauffällig.", an: true }]);
  const v = vorlage("v", { diagnostik: ["labor"] }, { wahl: [{ abschnitt: "diagnostik", label: "Röntgen oder Verzicht?", bausteine: ["roentgen", "verzicht"] }] });
  const index = testIndex([roentgen, verzicht, labor], [v]);
  const start = mitVorlage(neuerFall("zna", index), v, index);

  let a = ab(start, index, "diagnostik");
  assert.match(a.text, /‹Röntgen oder Verzicht\?›/);
  assert.doesNotMatch(a.text, /Röntgen:/);
  assert.equal(a.fertig, false);
  const luecke = a.tokens.find((t) => t.art === "wahl");
  assert.equal(luecke?.key, "wahl/diagnostik/0");
  // Sammelübernahme der Vorschläge schließt die Stelle nicht.
  a = ab(uebernehmen(start, a.tokens.filter((t) => t.zustand === "vorschlag" && t.key).map((t) => t.key!), index), index, "diagnostik");
  assert.equal(a.offen, 1);

  // Gewählt: Der Baustein steht im Abschnitt, mit seinen eigenen Lücken und Vorschlägen.
  const mitRoentgen = mitWahl(start, "wahl/diagnostik/0", "roentgen", index);
  a = ab(mitRoentgen, index, "diagnostik");
  assert.doesNotMatch(a.text, /oder Verzicht/);
  assert.match(a.text, /Röntgen: ‹Röntgenbefund›/);
  // Wieder entfernt: Die Frage steht wieder da.
  assert.match(ab(ohneBaustein(mitRoentgen, "roentgen"), index, "diagnostik").text, /‹Röntgen oder Verzicht\?›/);

  // Bewusst leer gelassen: keine Lücke, und das bleibt so, wenn ein anderer Baustein entfernt wird.
  const leer = mitWahl(start, "wahl/diagnostik/0", null, index);
  assert.equal(ab(leer, index, "diagnostik").offen, 0);
  assert.equal(ab(ohneBaustein(leer, "labor"), index, "diagnostik").text, "");
});

test("Pflichtstelle (PS-T1-01): kein „nichts davon“, entfernter Baustein lässt die Lücke wieder stehen, einzelne Sätze bleiben entfernbar", () => {
  const unfall = baustein("unfall", "anamnese", [
    { art: "text", text: "Sturz. " },
    { art: "option", id: "gerinnung", label: "Gerinnungshemmung", an: true, text: "Gerinnungshemmende Medikamente: {was}. ", slots: [{ art: "auswahl", id: "was", label: "Gerinnungshemmung", required: true, optionen: ["", "keine", "Apixaban"] }] },
    { art: "text", text: "Allergien: " },
    { art: "platzhalter", ref: "allergien" },
    { art: "text", text: ". " },
  ], [{ id: "allergien", typ: "freitext", label: "Allergien", required: true }]);
  const ohne = baustein("ohne", "anamnese", [{ art: "text", text: "Kein Unfall. " }]);
  const kopf = baustein("kopf", "anamnese", [{ art: "text", text: "Kopfanprall: nein." }]);
  const v = vorlage("v-pflicht", { anamnese: ["kopf"] }, { wahl: [{ abschnitt: "anamnese", label: "Unfall oder ohne Unfall?", bausteine: ["unfall", "ohne"], vor: "kopf", pflicht: true }] });
  const index = testIndex([unfall, ohne, kopf], [v]);
  const start = mitVorlage(neuerFall("station", index), v, index);
  const key = "wahl/anamnese/0";
  // „nichts davon“ ändert nichts: Die Lücke bleibt und sperrt.
  assert.equal(mitWahl(start, key, null, index), start);
  assert.equal(ab(start, index, "anamnese").offen, 1);
  // Auch ein Eintrag aus einem älteren Fall (vor `pflicht`) lässt die Stelle nicht leer.
  const alt = { ...start, versteckt: { [key]: true } };
  assert.match(ab(alt, index, "anamnese").text, /^‹Unfall oder ohne Unfall\?›/);
  // Gewählt, dann entfernt: wieder Lücke, an ihrem Platz.
  const gewaehlt = mitWahl(start, key, "unfall", index);
  assert.match(ab(ohneBaustein(gewaehlt, "unfall"), index, "anamnese").text, /^‹Unfall oder ohne Unfall\?›\nKopfanprall/);
  // Einzelne Sätze des gewählten Bausteins nimmt der Arzt wie überall heraus (Leitlinie der Auftraggeberin, 08.11.2026).
  assert.equal(ab(gewaehlt, index, "anamnese").offen, 2);
  const ohneSatz = ab(mitOption(gewaehlt, "unfall/gerinnung", false), index, "anamnese");
  assert.doesNotMatch(ohneSatz.text, /Gerinnungshemmende/);
  assert.equal(ohneSatz.offen, 1);
  // Ein Feld wie die Allergien bleibt als Platzhalter fürs KIS stehen: keine Lücke mehr, der Abschnitt ist abschließbar.
  assert.equal(ab(mitSpaeter(mitOption(gewaehlt, "unfall/gerinnung", false), "unfall/allergien", true), index, "anamnese").offen, 0);
});

test("Entweder-oder-Stelle: „nichts davon“ gilt nicht für die Stelle gleicher Nummer einer anderen Vorlage", () => {
  // Die Nummern zählen je Vorlage; nach dem Wechsel muss der Arzt die neue Frage sehen (CR-02).
  const roentgen = baustein("roentgen", "diagnostik", [{ art: "text", text: "Röntgen." }]);
  const verzicht = baustein("verzicht", "diagnostik", [{ art: "text", text: "Kein Röntgen." }]);
  const sono = baustein("sono", "diagnostik", [{ art: "text", text: "Sonografie." }]);
  const a = vorlage("v-a", {}, { wahl: [{ abschnitt: "diagnostik", label: "Röntgen oder Verzicht?", bausteine: ["roentgen", "verzicht"] }] });
  const b = vorlage("v-b", {}, { wahl: [{ abschnitt: "diagnostik", label: "Sonografie oder Verzicht?", bausteine: ["sono", "verzicht"] }] });
  const index = testIndex([roentgen, verzicht, sono], [a, b]);
  const leer = mitWahl(mitVorlage(neuerFall("zna", index), a, index), "wahl/diagnostik/0", null, index);
  assert.equal(ab(leer, index, "diagnostik").offen, 0);
  assert.match(ab(mitVorlage(leer, b, index), index, "diagnostik").text, /‹Sonografie oder Verzicht\?›/);
  // Dieselbe Vorlage noch einmal angewendet: Die Entscheidung bleibt.
  assert.equal(ab(mitVorlage(leer, a, index), index, "diagnostik").offen, 0);
});


// --- Sammelangabe (leere Vorgeschichte in einem Schritt) ----------------------------

const VORGESCHICHTE: Baustein = {
  ...baustein(
    "t-vg",
    "anamnese",
    [
      { art: "text", text: "Vorerkrankungen: " },
      { art: "platzhalter", ref: "vorerkrankungen" },
      { art: "text", text: ". Dauermedikation: " },
      { art: "platzhalter", ref: "medikation" },
      { art: "text", text: ". " },
      {
        art: "option",
        id: "antiko",
        label: "Gerinnungshemmung",
        an: true,
        text: "Gerinnungshemmende Medikamente: {was}. ",
        slots: [{ art: "auswahl", id: "was", label: "Gerinnungshemmung", required: true, optionen: ["", "keine", "Apixaban"] }],
      },
      { art: "text", text: "Allergien: " },
      { art: "platzhalter", ref: "allergien" },
      { art: "text", text: ". " },
    ],
    [
      { id: "vorerkrankungen", typ: "freitext", label: "Vorerkrankungen", required: true, vorschlaege: ["keine bekannt"] },
      { id: "medikation", typ: "freitext", label: "Dauermedikation", required: true, vorschlaege: ["keine"] },
      { id: "allergien", typ: "freitext", label: "Allergien", required: true, vorschlaege: ["keine bekannt"] },
    ],
  ),
  // Die Gerinnungshemmung gehört nie dazu (E-39): Sie bleibt überall eine eigene Frage.
  sammelangabe: {
    angaben: [
      { ref: "vorerkrankungen", wert: "keine bekannt", aussage: "keine Vorerkrankungen" },
      { ref: "medikation", wert: "keine", aussage: "keine Dauermedikation" },
      { ref: "allergien", wert: "keine bekannt", aussage: "keine Allergien" },
    ],
    // Nennt der Block schon einen Gerinnungshemmer, ist die Vorgeschichte nicht leer.
    ausblendenBei: [{ ref: "antiko/was", ausser: ["keine"] }],
  },
};
const V_VG = vorlage("v-vg", { anamnese: ["t-vg"] });
const VG_INDEX = testIndex([VORGESCHICHTE], [V_VG]);
const vgFall = () => mitVorlage(neuerFall("zna", VG_INDEX), V_VG, VG_INDEX);
/** Knopf mit veränderter Angabe: zeigt, dass eine einzige ungeeignete Angabe den Knopf ganz abschaltet. */
function vgMit(aendern: (p: Platzhalter[]) => Platzhalter[], angaben = VORGESCHICHTE.sammelangabe!.angaben) {
  const b: Baustein = { ...VORGESCHICHTE, id: "t-vg-x", platzhalter: aendern(VORGESCHICHTE.platzhalter.map((p) => ({ ...p }))), sammelangabe: { angaben } };
  const idx = testIndex([b], [vorlage("v-x", { anamnese: ["t-vg-x"] })]);
  return sammelSchritte(mitVorlage(neuerFall("zna", idx), idx.vorlagen.get("v-x")!, idx), "t-vg-x", idx);
}

test("Sammelangabe: setzt alle drei Angaben, schwarz wie einzeln gewählt; die Gerinnungshemmung bleibt eine eigene Frage", () => {
  const start = vgFall();
  assert.equal(ab(start, VG_INDEX, "anamnese").offen, 4);
  const schritte = sammelSchritte(start, "t-vg", VG_INDEX);
  assert.equal(sammelAussagen(schritte), "keine Vorerkrankungen, keine Dauermedikation, keine Allergien");
  assert.deepEqual(
    schritte.map((s) => `${s.label}: ${s.wert}`),
    ["Vorerkrankungen: keine bekannt", "Dauermedikation: keine", "Allergien: keine bekannt"],
  );

  const { fall, gesetzt } = mitSammelangabe(start, "t-vg", VG_INDEX);
  assert.equal(gesetzt.length, 3);
  const a = ab(fall, VG_INDEX, "anamnese");
  assert.equal(a.text, "Vorerkrankungen: keine bekannt. Dauermedikation: keine. Gerinnungshemmende Medikamente: ‹Gerinnungshemmung›. Allergien: keine bekannt.");
  assert.equal(a.offen, 1);
  assert.equal(a.vorschlag, 0);
  assert.equal(a.tokens.find((t) => t.key === "t-vg/antiko")?.zustand, "offen");
  for (const s of schritte) assert.equal(a.tokens.find((t) => t.key === s.key)?.zustand, "gesetzt", s.key);
  // Derselbe Fall wie nach drei einzelnen Wahlen im Fenster.
  let einzeln = mitWert(start, "t-vg/vorerkrankungen", "keine bekannt");
  einzeln = mitWert(einzeln, "t-vg/medikation", "keine");
  einzeln = mitWert(einzeln, "t-vg/allergien", "keine bekannt");
  assert.deepEqual(fall, einzeln);
  // Danach kein Knopf mehr, und ein zweiter Klick ändert nichts.
  assert.deepEqual(sammelSchritte(fall, "t-vg", VG_INDEX), []);
  assert.equal(mitSammelangabe(fall, "t-vg", VG_INDEX).fall, fall);
});

test("Sammelangabe: nur bei ganz leerer Vorgeschichte; der Knopf füllt nie auf", () => {
  const start = vgFall();
  const ohneKnopf = (f: Fall, warum: string) => {
    assert.deepEqual(sammelSchritte(f, "t-vg", VG_INDEX), [], warum);
    assert.equal(mitSammelangabe(f, "t-vg", VG_INDEX).fall, f, warum);
  };
  // Eine einzige eigene Angabe genügt, gleich welche und gleich welchen Inhalts.
  ohneKnopf(mitWert(start, "t-vg/vorerkrankungen", "arterielle Hypertonie"), "Vorerkrankung getippt");
  ohneKnopf(mitWert(start, "t-vg/medikation", "Apixaban 5 mg 1-0-1"), "Medikation getippt");
  ohneKnopf(mitWert(start, "t-vg/allergien", "keine bekannt"), "Allergien einzeln verneint");
  ohneKnopf(mitWert(start, "t-vg/medikation", "‹Wirkstoff›"), "Lücke im getippten Text");
  ohneKnopf(mitSpaeter(start, "t-vg/allergien", true), "fürs KIS stehen gelassen");
  // Von Hand bearbeiteter Abschnitt und ein Baustein, der nicht im Fall steht: kein Knopf.
  ohneKnopf(mitManuell(start, "anamnese", "Frei geschrieben."), "Handtext");
  assert.deepEqual(sammelSchritte(neuerFall("zna", VG_INDEX), "t-vg", VG_INDEX), []);
  // Ein bewusst geleertes Feld ist leer.
  assert.equal(sammelSchritte(mitWert(start, "t-vg/allergien", ""), "t-vg", VG_INDEX).length, 3);
  // Ein schon gewählter Gerinnungshemmer: Dann ist die Vorgeschichte nicht leer (Nachprüfung, N-1).
  ohneKnopf(mitAngabe(start, "t-vg/antiko", "t-vg/antiko/was", "2"), "Apixaban gewählt");
});

test("Sammelangabe: kein Knopf neben einer genannten Gerinnungshemmung; „keine“, leer, ein entfernter Satz oder ein Vorschlag der Vorlage lassen ihn stehen", () => {
  const start = vgFall();
  const knopf = (f: Fall) => sammelSchritte(f, "t-vg", VG_INDEX).length;
  assert.equal(knopf(mitAngabe(start, "t-vg/antiko", "t-vg/antiko/was", "2")), 0, "Apixaban gewählt");
  assert.equal(knopf(mitEigenemText(start, "t-vg/antiko", "Gerinnungshemmende Medikamente: Eliquis 5 mg. ")), 0, "selbst geschrieben");
  assert.equal(knopf(mitSpaeter(start, "t-vg/antiko/was", true)), 0, "fürs KIS stehen gelassen");
  assert.equal(knopf(mitAngabe(start, "t-vg/antiko", "t-vg/antiko/was", "1")), 3, "„keine“ gewählt");
  assert.equal(knopf(mitAngabe(start, "t-vg/antiko", "t-vg/antiko/was", "0")), 3, "leere Option");
  assert.equal(knopf(mitOption(mitAngabe(start, "t-vg/antiko", "t-vg/antiko/was", "2"), "t-vg/antiko", false)), 3, "Satz entfernt");
  const mitVorschlag = vorlage("v-vg-vorschlag", { anamnese: ["t-vg"] }, { vorgaben: { slots: { "t-vg/antiko/was": 2 } } });
  const idx = testIndex([VORGESCHICHTE], [mitVorschlag]);
  assert.equal(sammelSchritte(mitVorlage(neuerFall("zna", idx), mitVorschlag, idx), "t-vg", idx).length, 3, "grauer Vorschlag ist keine Nennung");
  // Erst der Knopf, dann der Gerinnungshemmer: Der Knopf ist schon weg; den Widerspruch meldet der Abgleich.
  const danach = mitAngabe(mitSammelangabe(start, "t-vg", VG_INDEX).fall, "t-vg/antiko", "t-vg/antiko/was", "2");
  assert.equal(ab(danach, VG_INDEX, "anamnese").text, "Vorerkrankungen: keine bekannt. Dauermedikation: keine. Gerinnungshemmende Medikamente: Apixaban. Allergien: keine bekannt.");
});

test("Sammelangabe: eine Angabe mit grauem Vorschlag, Ersatztext, ohne Pflicht oder mit fremdem Wert schaltet den Knopf ganz ab", () => {
  assert.equal(vgMit((p) => p).length, 3);
  const nur = (id: string, mehr: Partial<Platzhalter>) => (p: Platzhalter[]) => p.map((x) => (x.id === id ? { ...x, ...mehr } : x));
  assert.deepEqual(vgMit(nur("medikation", { default: "keine" })), [], "grauer Vorschlag");
  assert.deepEqual(vgMit(nur("allergien", { leerMarker: "nicht erfragt" })), [], "Ersatztext");
  assert.deepEqual(vgMit(nur("vorerkrankungen", { required: false })), [], "keine Pflicht");
  const [vor, med, all] = VORGESCHICHTE.sammelangabe!.angaben;
  assert.deepEqual(vgMit((p) => p, [{ ...vor, wert: "keine" }, med, all]), [], "Wert ohne Schnellwert");
  assert.deepEqual(vgMit((p) => p, [vor, med, { ...all, ref: "unbekannt" }]), [], "unbekannte Angabe");
  assert.deepEqual(vgMit((p) => p, [vor]), [], "eine Angabe allein");
});

test("Sammelangabe: Rückgängig nimmt genau diese Eingaben zurück; was der Arzt danach geändert hat, bleibt; ohne Wirkung derselbe Fall", () => {
  const start = vgFall();
  const { fall, gesetzt } = mitSammelangabe(start, "t-vg", VG_INDEX);
  assert.deepEqual(ohneSammelangabe(fall, gesetzt), start);

  const geaendert = mitAngabe(mitWert(fall, "t-vg/medikation", "Ramipril"), "t-vg/antiko", "t-vg/antiko/was", "2");
  const zurueck = ohneSammelangabe(geaendert, gesetzt);
  assert.equal(zurueck.werte["t-vg/medikation"], "Ramipril");
  assert.equal(zurueck.slots["t-vg/antiko/was"], "2");
  assert.equal(zurueck.werte["t-vg/vorerkrankungen"], undefined);
  assert.equal(zurueck.werte["t-vg/allergien"], undefined);
  // Alles inzwischen selbst geändert: nichts zurückzunehmen, derselbe Fall.
  let alles = mitWert(fall, "t-vg/vorerkrankungen", "Diabetes mellitus Typ 2");
  alles = mitWert(mitWert(alles, "t-vg/medikation", "Metformin"), "t-vg/allergien", "Penicillin");
  assert.equal(ohneSammelangabe(alles, gesetzt), alles);
  // Ein vorher bewusst geleertes Feld ist danach wieder leer, nicht verschwunden.
  const r = mitSammelangabe(mitWert(start, "t-vg/allergien", ""), "t-vg", VG_INDEX);
  assert.equal(ohneSammelangabe(r.fall, r.gesetzt).werte["t-vg/allergien"], "");
});

test("Sammelangabe: der Stand eines Bausteins ändert sich nur mit Eingaben in diesem Baustein", () => {
  const { fall } = mitSammelangabe(vgFall(), "t-vg", VG_INDEX);
  const stand = bausteinStand(fall, "t-vg");
  assert.match(stand, /werte:t-vg\/medikation="keine"/);
  assert.equal(bausteinStand(mitWert(fall, "t-anderer/feld", "x"), "t-vg"), stand);
  assert.equal(bausteinStand(mitWert(fall, "t-vg-x/medikation", "x"), "t-vg"), stand, "ähnliche Kennung zählt nicht");
  assert.notEqual(bausteinStand(mitAngabe(fall, "t-vg/antiko", "t-vg/antiko/was", "1"), "t-vg"), stand);
  assert.notEqual(bausteinStand(mitWert(fall, "t-vg/allergien", "Penicillin"), "t-vg"), stand);
  assert.notEqual(bausteinStand(mitSpaeter(fall, "t-vg/allergien", true), "t-vg"), stand);
});

// --- Weglassen und Schnellwerte mit der Vorgeschichte (Bausteine oben) ------------

test("Weglassen: ein Satz, auf den eine Sammelangabe baut, bleibt stehen; nennt er etwas, erscheint der Knopf nicht", () => {
  // Gerinnungshemmung als zuwählbarer Satz: Die Sammelangabe blendet sich an ihm aus; weggelassen wäre die Sperre unsichtbar.
  const vg: Baustein = { ...VORGESCHICHTE, id: "t-vg-w", segmente: VORGESCHICHTE.segmente.map((s) => (s.art === "option" ? { ...s, an: undefined } : s)) };
  const v = vorlage("t-w-sammel", { anamnese: ["t-vg-w"], therapie: ["t-ers"] }, { weglassen: { "t-vg-w/antiko": ["t-ers/tetanus"] } });
  const idx = testIndex([vg, ERSATZ], [v]);
  let fall = mitVorlage(neuerFall("zna", idx), v, idx);
  assert.ok(ab(fall, idx, "anamnese").aus.some((e) => e.key === "t-vg-w/antiko"), "Satz der Sammelangabe wurde weggelassen");
  assert.equal(sammelSchritte(fall, "t-vg-w", idx).length, 3);
  fall = mitAngabe(fall, "t-vg-w/antiko", "t-vg-w/antiko/was", "2");
  assert.deepEqual(sammelSchritte(fall, "t-vg-w", idx), [], "Knopf neben genannter Gerinnungshemmung");
});

test("Katalogregeln für weglassen und schnellwerte: eine absichtlich falsche Vorlage verletzt jede Regel, eine richtige keine", () => {
  const richtig = vorlage("t-r", { anamnese: ["t-ana"], therapie: ["t-allg", "t-ers"] }, { weglassen: { "t-allg/tetanus": ["t-ers/tetanus"] }, schnellwerte: { "t-ana/hergang": ["Beim Gehen umgeknickt."] } });
  const falsch = vorlage(
    "t-f",
    { anamnese: ["t-ana"], therapie: ["t-allg", "t-ers"], procedere: ["t-proc"] },
    {
      vorgaben: { aus: ["t-allg/rezept"], slots: { "t-proc/tvt/art": 1 } },
      entscheiden: ["t-proc/sport"],
      weglassen: {
        "t-allg/untersucht": ["t-ers/tetanus"],
        "t-allg/rezept": ["t-ers/tetanus", "t-ers/tetanus"],
        "t-ana/antiko": [],
        "t-proc/sport": ["t-ers/verband"],
        "t-proc/tvt": ["t-allg/tetanus"],
        "t-osg/haut": ["t-dgn/ergebnis"],
        "t-allg": ["t-ers/tetanus"],
      },
      schnellwerte: {
        "t-ana/hergang": ["", " Sturz.", "Mit ‹Lücke›.", "Der Patient stürzte.", "Sturz auf die rechte Hand.", "Sturz rechts.", "Gut.", "Gut."],
        "t-proc/wochen": ["2"],
        "t-proc/schiene/dauer": ["2 Wochen"],
        "t-osg/haut": ["x"],
        "t-ana/weg": ["x"],
      },
    },
  );
  const idx = testIndex([ANAMNESE, ALLG, ERSATZ, PROCEDERE, BEFUND, DIAGNOSTIK], [richtig, falsch]);
  assert.deepEqual(weglassenFehler(richtig, idx), []);
  assert.deepEqual(schnellwerteFehler(richtig, idx), []);
  const w = weglassenFehler(falsch, idx).join("\n");
  for (const erwartet of [
    "t-allg/untersucht: Satz ist im Baustein vorgeschlagen",
    "t-allg/rezept: steht auch in vorgaben.aus",
    "t-allg/rezept: Ersatzstelle t-ers/tetanus doppelt",
    "t-ana/antiko: Satz ist im Baustein vorgeschlagen",
    "t-ana/antiko: braucht mindestens eine Ersatzstelle",
    "t-proc/sport: Satz steht in entscheiden",
    "t-proc/sport: Ersatzstelle t-ers/verband: keine Pflichtauswahl",
    "t-proc/tvt: steht auch in vorgaben.slots",
    "t-proc/tvt: Ersatzstelle t-allg/tetanus: keine Auswahl",
    "t-osg/haut: Baustein gehört nicht zur Vorlage",
    "t-osg/haut: Ersatzstelle t-dgn/ergebnis: Baustein gehört nicht zur Vorlage",
    "t-allg: Schlüssel braucht zwei Teile",
  ]) {
    assert.ok(w.includes(erwartet), `nicht erkannt: ${erwartet}\n${w}`);
  }
  // Nur Sätze: ein Befund als Schlüssel ist ein Fehler, auch im eigenen Baustein.
  const befund = vorlage("t-b", { befund: ["t-osg"], therapie: ["t-ers"] }, { weglassen: { "t-osg/haut": ["t-ers/tetanus"] } });
  assert.match(weglassenFehler(befund, testIndex([BEFUND, ERSATZ], [befund])).join(), /kein Satz/);
  const s = schnellwerteFehler(falsch, idx).join("\n");
  for (const erwartet of [
    "t-ana/hergang: leerer Eintrag",
    "t-ana/hergang: Leerraum am Rand",
    "t-ana/hergang: Zeichen außerhalb des sicheren Vorrats in „Mit ‹Lücke›.“",
    "t-ana/hergang: festes „Patient“",
    "t-ana/hergang: Seitenwort in „Sturz auf die rechte Hand.“",
    "t-ana/hergang: Seitenwort in „Sturz rechts.“",
    "t-ana/hergang: „Gut.“ doppelt",
    "t-proc/wochen: Feld vom Typ zeitraum",
    "t-proc/schiene/dauer: keine Angabe vom Typ detail",
    "t-osg/haut: Baustein gehört nicht zur Vorlage",
    "t-ana/weg: kein Feld im Text des Bausteins",
  ]) {
    assert.ok(s.includes(erwartet), `nicht erkannt: ${erwartet}\n${s}`);
  }
  // Eine Angabe, auf die die Sammelangabe baut, auch als Angabe in einem Satz (`ausblendenBei`).
  const vg = vorlage("t-vg-s", { anamnese: ["t-vg"] }, { schnellwerte: { "t-vg/vorerkrankungen": ["keine"], "t-vg/antiko/was": ["keine"] } });
  const sv = schnellwerteFehler(vg, testIndex([VORGESCHICHTE], [vg])).join("\n");
  assert.match(sv, /t-vg\/vorerkrankungen: Feld gehört zu einer Sammelangabe/);
  assert.match(sv, /t-vg\/antiko\/was: Feld gehört zu einer Sammelangabe/);
});

// --- Platz der Entweder-oder-Stelle (`vor`, E-42) -------------------------------------

const P_UNFALL = baustein("p-unfall", "anamnese", [
  { art: "text", text: "Unfall: " },
  { art: "auswahl", id: "hergang", label: "Hergang", pflicht: true, optionen: ["Sturz.", "Verkehrsunfall."] },
]);
const P_BESCHW = baustein(
  "p-beschw",
  "anamnese",
  [{ art: "text", text: "Beschwerden ohne Unfall seit " }, { art: "platzhalter", ref: "seit" }, { art: "text", text: "." }],
  [{ id: "seit", typ: "begriff", label: "Beginn", required: true }],
);
const P_KOPF = baustein("p-kopf", "anamnese", [
  { art: "text", text: "Kopfanprall: " },
  { art: "auswahl", id: "kopf", label: "Kopfanprall", pflicht: true, optionen: ["nein.", "ja."] },
]);
const P_VOR = baustein("p-vor", "anamnese", [{ art: "option", id: "mobil", label: "Mobilität", an: true, text: "Vorher selbstständig mobil." }]);
const P_EXTRA = baustein("p-extra", "anamnese", [{ art: "text", text: "Eigener Zusatzblock." }]);
const stelle = (vor?: string) => ({ abschnitt: "anamnese" as const, label: "Unfall oder Beschwerden?", bausteine: ["p-unfall", "p-beschw"], ...(vor ? { vor } : {}) });
const P_ANFANG = vorlage("p-anfang", { anamnese: ["p-kopf", "p-vor"] }, { wahl: [stelle("p-kopf")] });
const P_MITTE = vorlage("p-mitte", { anamnese: ["p-kopf", "p-vor"] }, { wahl: [stelle("p-vor")] });
const P_ENDE = vorlage("p-ende", { anamnese: ["p-kopf", "p-vor"] }, { wahl: [stelle()] });
const P_FEST = vorlage("p-fest", { anamnese: ["p-unfall", "p-kopf", "p-vor"] });
const P_INDEX = testIndex([P_UNFALL, P_BESCHW, P_KOPF, P_VOR, P_EXTRA, VORGESCHICHTE, ALLG, ERSATZ, OHNE_ERSATZ], [P_ANFANG, P_MITTE, P_ENDE, P_FEST]);
const P_TEXT = {
  luecke: "‹Unfall oder Beschwerden?›",
  unfall: "Unfall: ‹Hergang›",
  beschw: "Beschwerden ohne Unfall seit ‹Beginn›.",
  kopf: "Kopfanprall: ‹Kopfanprall›",
  vor: "Vorher selbstständig mobil.",
  extra: "Eigener Zusatzblock.",
};
type PTeil = keyof typeof P_TEXT;
const pStart = (v: Vorlage) => mitVorlage(neuerFall("zna", P_INDEX), v, P_INDEX);
/** Abschnitt Anamnese als Folge der Teile, aus dem Text rückübersetzt; scheitert, wenn eine Zeile keinem Teil entspricht. */
const pFolge = (fall: Fall): PTeil[] => {
  const zeilen = ab(fall, P_INDEX, "anamnese").text.split("\n").filter((z) => z !== "");
  return zeilen.map((z) => {
    const teil = (Object.keys(P_TEXT) as PTeil[]).find((k) => P_TEXT[k] === z);
    assert.ok(teil, `unbekannte Zeile „${z}“`);
    return teil;
  });
};

test("Platz der Stelle: am Anfang, in der Mitte, ohne Angabe am Ende; offen, mit jedem Baustein, bewusst leer", () => {
  const erwartet: [Vorlage, (x: PTeil) => PTeil[]][] = [
    [P_ANFANG, (x) => [x, "kopf", "vor"]],
    [P_MITTE, (x) => ["kopf", x, "vor"]],
    [P_ENDE, (x) => ["kopf", "vor", x]],
  ];
  for (const [v, folge] of erwartet) {
    const start = pStart(v);
    assert.deepEqual(pFolge(start), folge("luecke"), `${v.id} offen`);
    const a = ab(start, P_INDEX, "anamnese");
    assert.equal(a.tokens.find((t) => t.art === "wahl")?.key, "wahl/anamnese/0");
    assert.equal(a.fertig, false);
    for (const [bid, teil] of [["p-unfall", "unfall"], ["p-beschw", "beschw"]] as const) {
      // Über die Stelle gewählt und über „+ Baustein“ eingefügt: derselbe Platz.
      const gewaehlt = mitWahl(start, "wahl/anamnese/0", bid, P_INDEX);
      assert.deepEqual(pFolge(gewaehlt), folge(teil), `${v.id} ${bid}`);
      assert.deepEqual(pFolge(mitBaustein(start, bid, P_INDEX, "anamnese")), folge(teil), `${v.id} ${bid} über + Baustein`);
      // Die Bausteine des Abschnitts (Menü „entfernen“, Befundliste) stehen in derselben Reihenfolge wie der Text.
      assert.deepEqual(
        ab(gewaehlt, P_INDEX, "anamnese").bausteine.map((b) => b.id),
        folge(teil).map((t) => ({ unfall: "p-unfall", beschw: "p-beschw", kopf: "p-kopf", vor: "p-vor" })[t as "kopf"]),
      );
      // Wieder entfernt: Die Lücke steht wieder an ihrem Platz.
      assert.deepEqual(pFolge(ohneBaustein(gewaehlt, bid)), folge("luecke"));
    }
    const leer = mitWahl(start, "wahl/anamnese/0", null, P_INDEX);
    assert.deepEqual(pFolge(leer), folge("luecke").filter((t) => t !== "luecke"), `${v.id} leer`);
    assert.equal(ab(leer, P_INDEX, "anamnese").offen, 1, "nur noch der Kopfanprall offen");
  }
});

test("Platz der Stelle: fehlt der Baustein aus `vor` im Fall, gilt der nächste der Vorlage, sonst das Ende; Bausteine des Arztes bleiben dahinter", () => {
  // Vor dem Kopfanprall; ist er entfernt, vor dem nächsten Baustein der Vorlage.
  assert.deepEqual(pFolge(ohneBaustein(pStart(P_ANFANG), "p-kopf")), ["luecke", "vor"]);
  assert.deepEqual(pFolge(ohneBaustein(ohneBaustein(pStart(P_ANFANG), "p-kopf"), "p-vor")), ["luecke"]);
  // Ein vom Arzt eingefügter Baustein steht hinten; die Stelle hält ihren Platz davor.
  const mitExtra = mitBaustein(pStart(P_MITTE), "p-extra", P_INDEX);
  assert.deepEqual(pFolge(mitExtra), ["kopf", "luecke", "vor", "extra"]);
  assert.deepEqual(pFolge(mitWahl(mitExtra, "wahl/anamnese/0", "p-unfall", P_INDEX)), ["kopf", "unfall", "vor", "extra"]);
  // Ohne den Baustein aus `vor` und ohne Nachfolger in der Vorlage: am Ende wie ohne Angabe.
  assert.deepEqual(pFolge(ohneBaustein(mitExtra, "p-vor")), ["kopf", "extra", "luecke"]);
  // Entfernt und wieder eingefügt steht ein Baustein im Fall hinten; die Stelle steht vor dem ersten Baustein des Falls,
  // der in der Vorlage ab `vor` steht (hier `p-vor`), nicht vor dem wieder eingefügten (CR-T1-04).
  const wieder = mitBaustein(ohneBaustein(pStart(P_ANFANG), "p-kopf"), "p-kopf", P_INDEX);
  assert.deepEqual(pFolge(wieder), ["luecke", "vor", "kopf"], "die Stelle steht vor dem ersten Baustein der Vorlage, der im Fall vorkommt");
  // Beide Bausteine einer Stelle im Fall (einer gewählt, einer eingefügt): beide an ihrem Platz, in der Reihenfolge des Falls.
  const beide = mitBaustein(mitWahl(pStart(P_ANFANG), "wahl/anamnese/0", "p-beschw", P_INDEX), "p-unfall", P_INDEX);
  assert.deepEqual(pFolge(beide), ["beschw", "unfall", "kopf", "vor"]);
});

test("Platz der Stelle: ungültiges `vor` (eingefügte eigene Vorlage) gilt nicht, die Stelle steht am Ende", () => {
  for (const vor of ["p-extra", "p-unfall", "gibt-es-nicht", "ana-trauma"]) {
    const v = vorlage(`p-falsch-${vor}`, { anamnese: ["p-kopf", "p-vor"], therapie: ["p-extra"] }, { wahl: [stelle(vor)] });
    const idx = testIndex([P_UNFALL, P_BESCHW, P_KOPF, P_VOR, P_EXTRA], [v]);
    const fall = mitVorlage(neuerFall("zna", idx), v, idx);
    assert.equal(ab(fall, idx, "anamnese").text.split("\n").pop(), P_TEXT.luecke, vor);
    assert.equal(stelleVor(v, v.wahl![0], fall.bausteine.anamnese ?? []), undefined, vor);
  }
  const nichtText = { ...P_ANFANG, wahl: [{ ...stelle(), vor: 7 as unknown as string }] };
  assert.equal(stelleVor(nichtText, nichtText.wahl[0], ["p-kopf", "p-vor"]), undefined);
});

test("Platz der Stelle: zwei Stellen vor demselben Baustein stehen in der Reihenfolge der Vorlage", () => {
  const zweite = { abschnitt: "anamnese" as const, label: "Zusatz?", bausteine: ["p-extra"], vor: "p-kopf" };
  const v = vorlage("p-zwei", { anamnese: ["p-kopf", "p-vor"] }, { wahl: [stelle("p-kopf"), zweite] });
  const idx = testIndex([P_UNFALL, P_BESCHW, P_KOPF, P_VOR, P_EXTRA], [v]);
  let fall = mitVorlage(neuerFall("zna", idx), v, idx);
  assert.deepEqual(ab(fall, idx, "anamnese").tokens.filter((t) => t.art === "wahl").map((t) => t.key), ["wahl/anamnese/0", "wahl/anamnese/1"]);
  // Die zweite zuerst entschieden: Sie bleibt hinter der ersten.
  fall = mitWahl(fall, "wahl/anamnese/1", "p-extra", idx);
  assert.equal(ab(fall, idx, "anamnese").text, [P_TEXT.luecke, P_TEXT.extra, P_TEXT.kopf, P_TEXT.vor].join("\n"));
  fall = mitWahl(fall, "wahl/anamnese/0", "p-unfall", idx);
  assert.equal(ab(fall, idx, "anamnese").text, [P_TEXT.unfall, P_TEXT.extra, P_TEXT.kopf, P_TEXT.vor].join("\n"));
});

test("Platz der Stelle: Vorlagenwechsel ordnet nach der neuen Vorlage, Eingaben gemeinsamer Bausteine bleiben, „nichts davon“ verfällt", () => {
  let fall = mitWahl(pStart(P_ANFANG), "wahl/anamnese/0", "p-unfall", P_INDEX);
  fall = mitAuswahl(mitAuswahl(fall, "p-unfall/hergang", 0), "p-kopf/kopf", 0);
  assert.equal(ab(fall, P_INDEX, "anamnese").text, ["Unfall: Sturz.", "Kopfanprall: nein.", P_TEXT.vor].join("\n"));
  // In der neuen Vorlage steht der Unfall fest an erster Stelle: Er behält seine Eingabe.
  fall = mitVorlage(fall, P_FEST, P_INDEX);
  assert.equal(ab(fall, P_INDEX, "anamnese").text, ["Unfall: Sturz.", "Kopfanprall: nein.", P_TEXT.vor].join("\n"));
  // Wieder eine Vorlage mit Stelle, diesmal in der Mitte: Der Unfall stand dort nur zur Wahl und fällt heraus, die Frage steht offen an ihrem Platz.
  fall = mitVorlage(fall, P_MITTE, P_INDEX);
  assert.equal(ab(fall, P_INDEX, "anamnese").text, ["Kopfanprall: nein.", P_TEXT.luecke, P_TEXT.vor].join("\n"));
  // „Nichts davon“ gilt nur in seiner Vorlage (CR-02); dieselbe Vorlage noch einmal behält es.
  const leer = mitWahl(fall, "wahl/anamnese/0", null, P_INDEX);
  const text = (f: Fall) => ab(f, P_INDEX, "anamnese").text;
  assert.equal(text(mitVorlage(leer, P_MITTE, P_INDEX)), ["Kopfanprall: nein.", P_TEXT.vor].join("\n"));
  assert.equal(text(mitVorlage(mitVorlage(leer, P_FEST, P_INDEX), P_ANFANG, P_INDEX)), [P_TEXT.luecke, "Kopfanprall: nein.", P_TEXT.vor].join("\n"));
  assert.equal(text(mitVorlage(leer, P_ENDE, P_INDEX)), ["Kopfanprall: nein.", P_TEXT.vor, P_TEXT.luecke].join("\n"));
});

test("Platz der Stelle: `weglassen` mit der Ersatzstelle in einer offenen Stelle am Anfang", () => {
  const v = vorlage(
    "p-weg",
    { therapie: ["t-allg"] },
    { weglassen: { "t-allg/tetanus": ["t-ers/tetanus"] }, wahl: [{ abschnitt: "therapie", label: "Wunde?", bausteine: ["t-ers", "t-ohne"], vor: "t-allg" }] },
  );
  const idx = testIndex([ALLG, ERSATZ, OHNE_ERSATZ], [v]);
  const start = mitSeite(mitVorlage(neuerFall("zna", idx), v, idx), "rechts");
  const th = (f: Fall) => ab(f, idx, "therapie");
  // Offen: Die Lücke steht vor der Liste, der Tetanussatz ist nicht im Angebot.
  assert.equal(th(start).tokens[0].art, "wahl");
  assert.ok(!th(start).aus.some((e) => e.key === "t-allg/tetanus"));
  // Gewählt: Die Ersatzstelle steht an der Stelle, der Satz bleibt weg, auch nach „Übernehmen“.
  let fall = mitWahl(start, "wahl/therapie/0", "t-ers", idx);
  assert.equal(th(fall).tokens[0].key, "t-ers/tetanus");
  fall = uebernehmen(fall, th(fall).tokens.filter((t) => t.zustand === "vorschlag" && t.key).map((t) => t.key!).concat("t-allg/tetanus"), idx);
  assert.equal(fall.optionen["t-allg/tetanus"], undefined);
  assert.ok(!th(fall).aus.some((e) => e.key === "t-allg/tetanus"));
  assert.equal(th(fall).text, "‹Tetanus› Steriler Verband.\n\n- Klinisch untersucht.");
  // Nichts davon: keine Lücke, der Satz ist wieder zuwählbar.
  const leer = mitWahl(start, "wahl/therapie/0", null, idx);
  assert.ok(!th(leer).tokens.some((t) => t.art === "wahl"));
  assert.ok(th(leer).aus.some((e) => e.key === "t-allg/tetanus"));
});

test("Platz der Stelle: Sammelangabe in einem gewählten und in einem festen Baustein hinter der Stelle", () => {
  // Gewählter Baustein mit Sammelangabe an erster Stelle.
  const gewaehlt = vorlage("p-vg-wahl", { anamnese: ["p-kopf"] }, { wahl: [{ abschnitt: "anamnese", label: "Vorgeschichte?", bausteine: ["t-vg", "p-beschw"], vor: "p-kopf" }] });
  // Fester Baustein mit Sammelangabe hinter einer offenen Stelle.
  const fest = vorlage("p-vg-fest", { anamnese: ["t-vg", "p-kopf"] }, { wahl: [stelle("t-vg")] });
  const idx = testIndex([VORGESCHICHTE, P_UNFALL, P_BESCHW, P_KOPF], [gewaehlt, fest]);
  const zeilen = (f: Fall) => ab(f, idx, "anamnese").text.split("\n");
  let fall = mitWahl(mitVorlage(neuerFall("zna", idx), gewaehlt, idx), "wahl/anamnese/0", "t-vg", idx);
  assert.equal(sammelSchritte(fall, "t-vg", idx).length, 3);
  const { fall: nach, gesetzt } = mitSammelangabe(fall, "t-vg", idx);
  assert.equal(gesetzt.length, 3);
  assert.match(zeilen(nach)[0], /^Vorerkrankungen: keine bekannt\. Dauermedikation: keine\. Gerinnungshemmende Medikamente: ‹Gerinnungshemmung›\. Allergien: keine bekannt\.$/);
  assert.equal(zeilen(nach)[1], P_TEXT.kopf);
  assert.deepEqual(ohneSammelangabe(nach, gesetzt).werte, fall.werte);

  fall = mitVorlage(neuerFall("zna", idx), fest, idx);
  assert.equal(zeilen(fall)[0], P_TEXT.luecke);
  const { fall: nachFest } = mitSammelangabe(fall, "t-vg", idx);
  assert.equal(zeilen(nachFest)[0], P_TEXT.luecke, "die offene Stelle bleibt vorn");
  assert.match(zeilen(nachFest)[1], /^Vorerkrankungen: keine bekannt\./);
  assert.equal(zeilen(mitWahl(nachFest, "wahl/anamnese/0", "p-unfall", idx))[0], P_TEXT.unfall);
});

test("Platz der Stelle: ausgeblendeter und von Hand überschriebener Abschnitt", () => {
  const start = pStart(P_ANFANG);
  // Ausgeblendet: Die Lücke zählt im Brief nicht, der Abschnitt behält seine Reihenfolge für später.
  const aus = mitAusgeblendet(start, "anamnese", true);
  assert.equal(renderBrief(aus, P_INDEX).offen, renderBrief(start, P_INDEX).offen - ab(start, P_INDEX, "anamnese").offen);
  assert.deepEqual(pFolge(mitAusgeblendet(aus, "anamnese", false)), ["luecke", "kopf", "vor"]);
  // Von Hand überschrieben: Es gilt nur der Handtext, keine Lücke der Stelle; aufgehoben, steht alles wieder an seinem Platz.
  const fertig = uebernehmen(mitAuswahl(mitAuswahl(mitWahl(start, "wahl/anamnese/0", "p-unfall", P_INDEX), "p-unfall/hergang", 1), "p-kopf/kopf", 1), ["p-vor/mobil"], P_INDEX);
  const a = ab(fertig, P_INDEX, "anamnese");
  assert.equal(a.text, "Unfall: Verkehrsunfall.\nKopfanprall: ja.\nVorher selbstständig mobil.");
  assert.equal(a.fertig, true);
  const hand = mitManuell(fertig, "anamnese", "Kopfanprall: ja. Unfall: Verkehrsunfall.");
  assert.equal(ab(hand, P_INDEX, "anamnese").text, "Kopfanprall: ja. Unfall: Verkehrsunfall.");
  assert.ok(!ab(mitManuell(start, "anamnese", "Frei."), P_INDEX, "anamnese").tokens.some((t) => t.art === "wahl"));
  assert.equal(ab(mitManuell(hand, "anamnese", undefined), P_INDEX, "anamnese").text, a.text);
});

test("Platz der Stelle: der Gesamtbrief zum Kopieren hat dieselbe Reihenfolge", () => {
  let fall = mitWahl(pStart(P_MITTE), "wahl/anamnese/0", "p-beschw", P_INDEX);
  fall = uebernehmen(mitWert(mitAuswahl(fall, "p-kopf/kopf", 0), "p-beschw/seit", "gestern"), ["p-vor/mobil"], P_INDEX);
  const brief = renderBrief(fall, P_INDEX);
  assert.equal(ab(fall, P_INDEX, "anamnese").fertig, true);
  assert.equal(briefText(brief), "Anamnese:\nKopfanprall: nein.\nBeschwerden ohne Unfall seit gestern.\nVorher selbstständig mobil.");
});

test("Platz der Stelle: der Entwurf eines eigenen Bausteins hat weder die Frage der Stelle noch eine Leerzeile an ihrem Platz", () => {
  for (const v of [P_ANFANG, P_MITTE, P_ENDE]) {
    for (const fall of [pStart(v), mitWahl(pStart(v), "wahl/anamnese/0", null, P_INDEX)]) {
      assert.equal(entwurfEigenerBaustein(fall, "anamnese", "Anamnese", P_INDEX), `${P_TEXT.kopf}\n${P_TEXT.vor}`, v.id);
    }
  }
  // Ein gewählter Baustein gehört zum Aufbau des Abschnitts und steht an seinem Platz im Entwurf.
  assert.equal(entwurfEigenerBaustein(mitWahl(pStart(P_MITTE), "wahl/anamnese/0", "p-unfall", P_INDEX), "anamnese", "Anamnese", P_INDEX), [P_TEXT.kopf, P_TEXT.unfall, P_TEXT.vor].join("\n"));
});

test("Katalogregel: `vor` zeigt auf einen festen Baustein im Abschnitt der Stelle", () => {
  const v = vorlage(
    "p-regeln",
    { anamnese: ["p-kopf"], therapie: ["p-extra"] },
    {
      wahl: [
        { ...stelle("p-kopf") },
        { abschnitt: "anamnese", label: "Anderer Abschnitt?", bausteine: ["p-vor"], vor: "p-extra" },
        { abschnitt: "anamnese", label: "Eigener Baustein?", bausteine: ["t-allg"], vor: "t-allg" },
        { abschnitt: "anamnese", label: "Andere Stelle?", bausteine: ["t-ers"], vor: "p-unfall" },
        { abschnitt: "anamnese", label: "Unbekannt?", bausteine: ["t-ohne"], vor: "gibt-es-nicht" },
        { abschnitt: "diagnostik", label: "Leerer Abschnitt?", bausteine: ["t-vg"], vor: "p-kopf" },
        { abschnitt: "therapie", label: "Kein Text?", bausteine: ["p-beschw"], vor: "" },
      ],
    },
  );
  const f = wahlPlatzFehler(v, P_INDEX).join("\n");
  for (const erwartet of [
    "„Anderer Abschnitt?“ vor \"p-extra\": steht im Abschnitt therapie, nicht in anamnese",
    "„Eigener Baustein?“ vor \"t-allg\": Baustein einer Entweder-oder-Stelle",
    "„Andere Stelle?“ vor \"p-unfall\": Baustein einer Entweder-oder-Stelle",
    "„Unbekannt?“ vor \"gibt-es-nicht\": Baustein fehlt im Katalog",
    "„Unbekannt?“ vor \"gibt-es-nicht\": steht nicht in abschnitte.anamnese",
    "„Leerer Abschnitt?“ vor \"p-kopf\": steht im Abschnitt anamnese, nicht in diagnostik",
    "„Kein Text?“ vor \"\": keine Baustein-ID",
  ]) {
    assert.ok(f.includes(erwartet), `nicht erkannt: ${erwartet}\n${f}`);
  }
  assert.ok(!f.includes("„Unfall oder Beschwerden?“"), "gültiges vor gemeldet");
  assert.equal(f.split("\n").length, 7);
  assert.deepEqual(wahlPlatzFehler(P_ANFANG, P_INDEX), []);
  assert.deepEqual(wahlPlatzFehler(P_ENDE, P_INDEX), []);
});

// --- Tipp-Zug (E-44) ---------------------------------------------------------

test("Tipp-Zug: Tastenarten an einem Halt", () => {
  assert.equal(tastenArt("1", "123456789ü"), "befehl");
  assert.equal(tastenArt("Ü", "123456789ü"), "befehl");
  assert.equal(tastenArt("u", "123456789ü"), "text", "U ist im Fenster kein Befehl");
  assert.equal(tastenArt("u", "123456789üuan"), "befehl", "in der Befundliste schon");
  assert.equal(tastenArt("0", "123456789ü"), "text");
  assert.equal(tastenArt("-", "123456789ü"), "text");
  assert.equal(tastenArt(" ", "123456789ü"), "neutral", "Leertaste sperrt nicht");
  assert.equal(tastenArt("Enter", "123456789ü"), "neutral");
  assert.equal(tastenArt("1", "123456789ü", true), "neutral", "mit Strg, Alt oder Befehlstaste");
});

test("Tipp-Zug: ein Befehl wirkt erst, wenn der neue Halt die Schreckzeit lang zu sehen war (CR-TS01, PS-N02)", () => {
  assert.equal(urteil(FREI, "befehl", 5), "wirkt", "ohne Sprung gilt die Taste sofort");
  const gesprungen = nachSprung(FREI);
  assert.equal(urteil(gesprungen, "befehl", 1000), "zu-frueh", "noch nicht gezeichnet");
  const sichtbar = { ...gesprungen, sichtbarAb: 1000 };
  assert.equal(urteil(sichtbar, "befehl", 1000 + SCHRECKZEIT_MS - 1), "zu-frueh");
  assert.equal(urteil(sichtbar, "befehl", 1000 + SCHRECKZEIT_MS), "wirkt");
  assert.equal(urteil(sichtbar, "befehl", 900), "zu-frueh", "gedrückt, bevor der Halt zu sehen war, auch wenn später verarbeitet");
  assert.equal(bereit(sichtbar, 1000 + SCHRECKZEIT_MS - 1), false);
  assert.equal(bereit(sichtbar, 1000 + SCHRECKZEIT_MS), true);
});

test("Tipp-Zug: Text und zu frühe Befehle sperren den ganzen Zug, über Sprünge hinweg, bis Pfeiltaste, Tab, F2 oder Klick", () => {
  const zug = { sichtbarAb: 0, gesperrt: false };
  // „und Hand“ nach Enter: das U kommt zu früh und sperrt; das N danach wirkt auch nach der Schreckzeit nicht.
  const u = urteil(nachSprung(zug), "befehl", 10);
  assert.equal(u, "zu-frueh");
  let z = nachUrteil({ ...nachSprung(zug), sichtbarAb: 0 }, u);
  assert.equal(z.gesperrt, true);
  assert.equal(urteil(z, "befehl", 5000), "gesperrt");
  // Ein Sprung hebt die Sperre nicht auf.
  z = { ...nachSprung(z), sichtbarAb: 6000 };
  assert.equal(urteil(z, "befehl", 9000), "gesperrt");
  // Text sperrt sofort, auch nach der Schreckzeit.
  assert.equal(urteil({ sichtbarAb: 0, gesperrt: false }, "text", 9000), "sperrt");
  assert.equal(nachUrteil({ sichtbarAb: 0, gesperrt: false }, "sperrt").gesperrt, true);
  // Lösen: frei und sofort wirksam.
  assert.equal(urteil(geloest(), "befehl", 0), "wirkt");
  assert.equal(nachUrteil(z, "neutral"), z, "Leertaste und Enter ändern nichts");
  assert.ok(EBEN_MS > SCHRECKZEIT_MS);
});

test("schrittZuruecknehmen nimmt genau einen Schritt zurück und lässt spätere Änderungen stehen", () => {
  const f0 = neu();
  const keys = ["t-osg/schwellung", "t-osg/haut", "t-osg/ds"];
  const f1 = uebernehmen(f0, keys, index);
  assert.notDeepEqual(f1.befund, f0.befund, "Voraussetzung: der Schritt setzt Befunde");
  // Ohne spätere Änderung: zurück auf den Stand davor.
  const z1 = schrittZuruecknehmen(f1, f0, f1);
  assert.deepEqual(z1.befund, f0.befund);
  // Danach anders geändert: diese Änderung bleibt, der Rest geht zurück.
  const geaendert = Object.keys(f1.befund).find((k) => f1.befund[k] !== f0.befund[k])!;
  const f2 = mitWert(mitBefund(f1, geaendert, "abw"), "t-osg/rom", "10/0/30");
  const z2 = schrittZuruecknehmen(f2, f0, f1);
  assert.equal(z2.befund[geaendert], "abw");
  assert.equal(z2.werte["t-osg/rom"], "10/0/30");
  for (const k of Object.keys(f1.befund)) if (k !== geaendert && f0.befund[k] === undefined) assert.equal(z2.befund[k], undefined, k);
  // Nichts mehr zurückzunehmen: derselbe Fall.
  assert.equal(schrittZuruecknehmen(f0, f0, f1), f0);
  // Seite und Person ebenso.
  const s1 = mitSeite(f0, "links");
  assert.equal(schrittZuruecknehmen(s1, f0, s1).seite, f0.seite);
  // Fremder Fall: unverändert.
  const anderer = { ...f1, id: "x" };
  assert.equal(schrittZuruecknehmen(anderer, f0, f1), anderer);
});

test("Ziffernreihe: nach einer Antwort die nächste Angabe in Lesereihenfolge, auch vorbelegt, nie zurück (PS-N01)", () => {
  const reihe = { knoepfe: true, offen: false };
  const offeneReihe = { knoepfe: true, offen: true };
  const feld = { knoepfe: false, offen: false };
  const offenesFeld = { knoepfe: false, offen: true };
  // SHT „Kontrolle“: wann offen, wo vorbelegt. Nach der ersten Ziffer nimmt „wo“ die Ziffern, nicht wieder „wann“.
  assert.equal(naechsteAngabe([offeneReihe, reihe], new Set([0]), 0), 1);
  // OSG „Kontrolle“: beide offen, dasselbe Ergebnis.
  assert.equal(naechsteAngabe([offeneReihe, offeneReihe], new Set([0]), 0), 1);
  // Kopfplatzwunde, drei Reihen: 1, 1, 2 geht Reihe für Reihe.
  assert.equal(naechsteAngabe([reihe, reihe, reihe], new Set([0]), 0), 1);
  assert.equal(naechsteAngabe([reihe, reihe, reihe], new Set([0, 1]), 1), 2);
  // Ein freiwilliges Textfeld dazwischen wird übersprungen, ein verlangtes nicht.
  assert.equal(naechsteAngabe([reihe, feld, reihe], new Set([0]), 0), 2);
  assert.equal(naechsteAngabe([reihe, offenesFeld, reihe], new Set([0]), 0), 1);
  // Unten nichts mehr: zur ersten offenen Angabe, sonst zur ersten unbeantworteten Reihe, nie auf eine beantwortete.
  assert.equal(naechsteAngabe([offeneReihe, reihe], new Set([1]), 1), 0);
  assert.equal(naechsteAngabe([reihe, reihe], new Set([1]), 1), 0);
  assert.equal(naechsteAngabe([reihe, reihe], new Set([0, 1]), 1), null);
  // Schon beantwortete Reihe darunter (vorher mit Pfeiltaste gewählt): übersprungen.
  assert.equal(naechsteAngabe([reihe, reihe, reihe], new Set([0, 1]), 0), 2);
  // Nach einem Klick zuerst die offene Angabe (QA-24, Tibiakopf „Physiotherapie“: Inhalt, Häufigkeit vorbelegt, Verordnung offen).
  assert.equal(naechsteAngabe([reihe, reihe, offeneReihe], new Set([0]), 0, false), 2);
  assert.equal(naechsteAngabe([reihe, reihe, offeneReihe], new Set([0]), 0, true), 1);
  // Nach einem Klick ohne offene Angabe wie nach einer Ziffer.
  assert.equal(naechsteAngabe([reihe, reihe], new Set([0]), 0, false), 1);
});

test("Satz mit Angaben: Antworten auf alle Knopfreihen machen einen grauen Satz zur Aussage, eine nur vorbelegte hält ihn grau (PS-N01)", () => {
  const kontrolle: Segment = {
    art: "option",
    id: "kontrolle",
    label: "Kontrolle",
    an: true,
    text: "Kontrolle {wann} {wo}.",
    slots: [
      { art: "auswahl", id: "wann", label: "wann", required: true, optionen: ["", "am Folgetag", "nach 1 Woche"] },
      { art: "auswahl", id: "wo", label: "wo", optionen: ["beim Hausarzt", "beim Durchgangsarzt"], default: 0 },
    ],
  } as Segment;
  const idx = testIndex([baustein("t-pr", "procedere", [kontrolle])]);
  const zustand = (f: Fall) => ab(f, idx, "procedere").tokens.find((t) => t.key === "t-pr/kontrolle")?.zustand;
  let fall = fallMit(idx, { procedere: ["t-pr"] });
  assert.equal(zustand(fall), "offen");
  fall = mitAngabe(fall, "t-pr/kontrolle", "t-pr/kontrolle/wann", "1");
  // „wo“ steht nur aus dem Hausstandard: Der Satz bleibt Vorschlag, die Ziffernreihe rückt dorthin.
  assert.equal(zustand(fall), "vorschlag");
  fall = mitAngabe(fall, "t-pr/kontrolle", "t-pr/kontrolle/wo", "1");
  assert.equal(zustand(fall), "gesetzt");
});

// --- Tipp-Kette (E-45) -------------------------------------------------------

test("Tipp-Kette: eine verworfene Taste kurz nach einem Befehl heißt blind getippt; Text nur in der Schreckzeit oder im Takt", () => {
  let k = neueKette<string>(0);
  assert.equal(blind(k, "verworfen", 10, false), false, "ohne wirksamen Befehl nichts zurückzunehmen");
  k = mitBefehl(k, "Seite", 100);
  assert.deepEqual(k.befehle, ["Seite"]);
  assert.equal(blind(k, "verworfen", 100 + KETTE_MS - 1, false), true, "Fenster der Kette");
  assert.equal(blind(k, "verworfen", 100 + KETTE_MS, false), false, "danach bewusst");
  // Text in einem Feld: in der Schreckzeit nach dem Sprung immer blind; ohne Text davor danach nie.
  assert.equal(blind(k, "text", 600, false), false, "Arbeit nach einer Pause bleibt schnell");
  assert.equal(blind(k, "text", 600, true), true);
  // OSG „gestern“ mit 400 ms je Taste, Enter, 0,35 s, „1“ wirkt, „4“ 400 ms danach im nächsten Feld: im Takt, also blind.
  let t = neueKette<string>(0);
  for (const zeit of [0, 400, 800, 1200, 1600, 2000, 2400]) t = nachText(nachTaste(t, zeit).kette, zeit);
  assert.deepEqual(t.luecken, [400, 400, 400]);
  assert.equal(textFenster(t), 800);
  t = mitBefehl(nachTaste(nachTaste(t, 2800).kette, 3150).kette, "Arbeitsunfall", 3150);
  assert.equal(blind(t, "text", 3550, false), true, "„4“ im Takt nach dem Befehl");
  assert.equal(blind(t, "text", 3150 + 800, false), false, "doppelter Takt vorbei: hingesehen");
  // Schnelles Schreiben hat einen kurzen Takt: Danach gilt nur die Schreckzeit, bewusstes Weiterschreiben bleibt frei.
  let s = neueKette<string>(0);
  for (const zeit of [0, 120, 260, 380]) s = nachText(nachTaste(s, zeit).kette, zeit);
  assert.equal(textFenster(s), SCHRECKZEIT_MS);
  // Ein einzelnes Zeichen hat keinen Takt; ein Befehl dazwischen beginnt einen neuen Text.
  assert.equal(textFenster(nachText(neueKette<string>(0), 0)), SCHRECKZEIT_MS);
  const mitBefehlDazwischen = nachText(mitBefehl(nachText(neueKette<string>(0), 0), "x", 100), 200);
  assert.deepEqual(mitBefehlDazwischen.luecken, []);
  assert.deepEqual(mitBefehlDazwischen.befehle, [], "Text beginnt einen neuen Zug");
  // Höchstens KETTE_MS, auch bei sehr langsamem Schreiben.
  let l = neueKette<string>(0);
  for (const zeit of [0, 1400, 2800]) l = nachText(nachTaste(l, zeit).kette, zeit);
  assert.equal(textFenster(l), KETTE_MS);
  // Ein Befehl ohne Wirkung zählt für das Fenster, steht aber nicht in der Liste; die Wirkung kommt danach.
  let w = mitBefehl(neueKette<string>(0), null, 50);
  assert.equal(blind(w, "verworfen", 60, false), false);
  w = mitWirkung(w, "Person");
  assert.equal(blind(w, "verworfen", 60, false), true);
  assert.equal(w.letzterBefehl, 50);
});

test("Tipp-Kette: eine Pause von KETTE_MS beendet die Kette; Schreckzeit, Leertaste und Enter beim Namen", () => {
  // Jede Taste, auch die des Befehls, geht erst durch nachTaste; gemessen wird ab der letzten Taste.
  let k = mitBefehl(nachTaste(neueKette<string>(0), 10).kette, "a", 10);
  let r = nachTaste(k, 10 + KETTE_MS - 1);
  assert.deepEqual(r.beendet, []);
  assert.deepEqual(r.kette.befehle, ["a"]);
  k = r.kette;
  r = nachTaste(k, k.letzteTaste + KETTE_MS);
  assert.deepEqual(r.beendet, ["a"], "die alte Kette geht als beendet zurück (für „Eben gesetzt“)");
  assert.deepEqual(r.kette.befehle, []);
  assert.equal(r.kette.textZeit, null);
  // Schreckzeit: noch nicht gezeichnet oder kürzer als SCHRECKZEIT_MS zu sehen.
  assert.equal(inSchreckzeit(nachSprung(FREI), 99999), true);
  assert.equal(inSchreckzeit({ sichtbarAb: 1000, gesperrt: false }, 1000 + SCHRECKZEIT_MS - 1), true);
  assert.equal(inSchreckzeit({ sichtbarAb: 1000, gesperrt: false }, 1000 + SCHRECKZEIT_MS), false);
  assert.equal(inSchreckzeit(FREI, 0), false);
  assert.ok(KETTE_MS >= 3 * 400, "deckt langsames Tippen ab");
  assert.ok(BILD_ERSATZ_MS > SCHRECKZEIT_MS && BILD_ERSATZ_MS <= 1000);
  assert.equal(verworfenWort("↵"), "Enter");
  assert.equal(verworfenWort(" "), "Leertaste");
  assert.equal(verworfenWort("x"), "„x“");
});

test("schrittZuruecknehmen: eine seither gewählte Angabe hält ihren Satz als Aussage (CR-TS10); schritteZuruecknehmen nimmt eine ganze Kette zurück", () => {
  const satz = {
    art: "option",
    id: "kontrolle",
    label: "Kontrolle",
    an: true,
    text: "Kontrolle {wo}.",
    slots: [{ art: "auswahl", id: "wo", label: "wo", optionen: ["beim Hausarzt", "beim Durchgangsarzt"], default: 0 }],
  } as Segment;
  const idx = testIndex([baustein("t-pr", "procedere", [satz])]);
  const zustand = (f: Fall) => ab(f, idx, "procedere").tokens.find((t) => t.key === "t-pr/kontrolle")?.zustand;
  const f0 = fallMit(idx, { procedere: ["t-pr"] });
  assert.equal(zustand(f0), "vorschlag");
  const f1 = uebernehmen(f0, ["t-pr/kontrolle"], idx);
  assert.equal(zustand(f1), "gesetzt");
  assert.equal(zustand(schrittZuruecknehmen(f1, f0, f1)), "vorschlag", "ohne spätere Angabe wieder grau");
  // Danach eine Angabe im übernommenen Satz gewählt: Die Übernahme zurückzunehmen lässt diese Wahl schwarz.
  const f2 = mitAngabe(f1, "t-pr/kontrolle", "t-pr/kontrolle/wo", "1");
  const z = schrittZuruecknehmen(f2, f0, f1);
  assert.equal(zustand(z), "gesetzt");
  assert.equal(z.slots["t-pr/kontrolle/wo"], "1");
  // Ebenso nach eigenem Wortlaut im Satz.
  const f3 = mitEigenemText(f1, "t-pr/kontrolle", "Kontrolle in der Sprechstunde.");
  assert.equal(schrittZuruecknehmen(f3, f0, f1).optionen["t-pr/kontrolle"], true);
  // Kette: Seite, dann Übernahme. Beide zurück, der letzte zuerst.
  const k1 = mitSeite(f0, "links");
  const k2 = uebernehmen(k1, ["t-pr/kontrolle"], idx);
  const zk = schritteZuruecknehmen(k2, [
    { vorher: f0, nachher: k1 },
    { vorher: k1, nachher: k2 },
  ]);
  assert.equal(zk.seite, f0.seite);
  assert.equal(zustand(zk), "vorschlag");
  assert.equal(schritteZuruecknehmen(k2, []), k2);
});

test("beendetZug: nur eine geänderte, schon gewählte Seite des Briefs oder Person beendet den Tipp-Zug (PS-N11)", () => {
  const idx = testIndex([baustein("t-pr", "procedere", [{ art: "fest", id: "s", text: "Satz." } as Segment])]);
  const f0 = fallMit(idx, { procedere: ["t-pr"] });
  assert.equal(f0.seite, null);
  assert.equal(f0.geschlecht, null);
  // Erste Wahl: kein Ende, die Rücknahme führt zu „offen“.
  const rechts = mitSeite(f0, "rechts");
  assert.equal(beendetZug(f0, rechts), false);
  const patient = mitPerson(rechts, "m", "");
  assert.equal(beendetZug(rechts, patient), false);
  // Wechsel: Ende des Zugs.
  assert.equal(beendetZug(patient, mitSeite(patient, "links")), true);
  assert.equal(beendetZug(patient, mitSeite(patient, "ohne")), true);
  assert.equal(beendetZug(patient, mitPerson(patient, "w", "")), true);
  // Gleich bleibend, nur das Alter oder eine andere Stelle: kein Ende.
  assert.equal(beendetZug(patient, mitSeite(patient, "rechts")), false);
  assert.equal(beendetZug(patient, mitPerson(patient, "m", "42")), false);
  assert.equal(beendetZug(patient, mitWert(patient, "t-pr/x", "y")), false);
  // PS-R4-1: Die Seite eines Bausteins, die er im Brief schon trug (eigene oder die des Briefs), wechselt: Ende des Zugs.
  const links = mitSeite(patient, "links", "t-pr");
  assert.equal(beendetZug(patient, links), true);
  assert.equal(beendetZug(links, mitSeite(links, "beidseits", "t-pr")), true);
  assert.equal(beendetZug(links, mitSeite(links, null, "t-pr")), true, "wieder wie der Brief ist auch ein Wechsel");
  // Dieselbe Seite wie der Brief als eigene Seite ändert im Brief nichts; ohne Seite des Briefs ist es die erste Wahl.
  assert.equal(beendetZug(patient, mitSeite(patient, "rechts", "t-pr")), false);
  assert.equal(beendetZug(f0, mitSeite(f0, "links", "t-pr")), false);
});

test("enthaeltNoch: Rückgängig nach „Ersetzt“ nur, solange die Stelle genau den Schnellwert enthält (PS-N10)", () => {
  const satz = {
    art: "option",
    id: "allergie",
    label: "Allergien",
    an: true,
    text: "Allergien: {was}.",
    slots: [{ art: "detail", id: "was", label: "Allergien" }],
  } as Segment;
  const idx = testIndex([baustein("t-an", "anamnese", [satz])]);
  const f0 = fallMit(idx, { anamnese: ["t-an"] });
  const k = "t-an/allergie/was";
  const f1 = mitSlot(f0, k, "keine bekannt");
  assert.equal(enthaeltNoch(f1, "angabe", k, "keine bekannt"), true);
  assert.equal(enthaeltNoch(mitSlot(f1, k, "Penicillin, Latex"), "angabe", k, "keine bekannt"), false);
  assert.equal(enthaeltNoch(mitSlot(f1, k, "keine bekannt "), "angabe", k, "keine bekannt"), false, "genau, auch ohne Leerzeichen am Ende");
  assert.equal(enthaeltNoch(mitSlot(f1, k, undefined), "angabe", k, "keine bekannt"), false);
  assert.equal(enthaeltNoch(f1, "wert", k, "keine bekannt"), false, "Feld und Angabe getrennt");
  // Feld des Falls, etwa „heute“ im Unfallzeitpunkt.
  const w = mitWert(f0, "t-an/zeit", "08.11.2026");
  assert.equal(enthaeltNoch(w, "wert", "t-an/zeit", "08.11.2026"), true);
  assert.equal(enthaeltNoch(mitWert(w, "t-an/zeit", "gestern"), "wert", "t-an/zeit", "08.11.2026"), false);
});

test("Meldetexte: neuer Stand nach dem Zurücknehmen (MT-03), Gesetztes im Wortlaut des Briefs (MT-07, QA-29), Aufzählung (MT-09)", () => {
  const brief = (f: Fall) => renderBrief(f, index, { listen: "striche" });
  const f0 = neu(V_ENTSCHEIDEN);
  const seite = mitSeite(f0, "links");
  assert.equal(gesetztText(f0, brief(f0), seite, brief(seite)), "Seite „links“");
  assert.equal(aenderungJetzt(seite, brief(seite), f0, brief(f0)).text, "Seite (jetzt: nicht gewählt)");
  const person = mitPerson(f0, "m");
  assert.equal(gesetztText(f0, brief(f0), person, brief(person)), "Person „Patient“");
  assert.equal(aenderungJetzt(person, brief(person), f0, brief(f0)).text, "Person (jetzt: nicht gewählt)");
  // Befund: unauffällig heißt so, auffällig nennt den Satz.
  const ok = mitBefund(seite, "t-osg/ds", "ok");
  assert.equal(gesetztText(seite, brief(seite), ok, brief(ok)), "Druckschmerz Außenknöchel „unauffällig“");
  const abw = mitBefund(seite, "t-osg/ds", "abw");
  assert.equal(gesetztText(seite, brief(seite), abw, brief(abw)), "Druckschmerz Außenknöchel „Druckschmerz über dem Außenknöchel.“");
  // Nach dem Zurücknehmen der neue Stand, nie der alte; mehrere Stellen: die erste und die Zahl der übrigen.
  const zurueck = aenderungJetzt(ok, brief(ok), seite, brief(seite));
  assert.match(zurueck.text, /^Druckschmerz Außenknöchel \(jetzt: wieder (Vorschlag|offen)\)$/);
  assert.deepEqual(zurueck.keys, ["t-osg/ds"]);
  assert.deepEqual(geaenderteStellen(brief(seite), brief(ok)), ["t-osg/ds"], "auch bei geändertem Fallkopf: nur Stellen im Brief");
  const paket = mitBefund(ok, "t-osg/haut", "ok");
  assert.match(aenderungJetzt(paket, brief(paket), seite, brief(seite)).text, / und 1 weitere$/);
  assert.equal(aenderungJetzt(f0, brief(f0), f0, brief(f0)).text, "", "nichts geändert");
  assert.equal(aenderungJetzt(f0, brief(f0), { ...f0, id: "anders" }, brief(f0)).text, "", "anderer Fall");
  // Entweder-oder-Stelle: genannt wird der Text des eingefügten Bausteins unter dem Namen der Lücke.
  const roentgen = baustein("roentgen", "diagnostik", [{ art: "text", text: "Röntgen oberes Sprunggelenk ohne Fraktur." }]);
  const verzicht = baustein("verzicht", "diagnostik", [{ art: "text", text: "Kein Röntgen." }]);
  const v = vorlage("v", {}, { wahl: [{ abschnitt: "diagnostik", label: "Röntgen oder Verzicht?", bausteine: ["roentgen", "verzicht"] }] });
  const widx = testIndex([roentgen, verzicht], [v]);
  const w0 = mitVorlage(neuerFall("zna", widx), v, widx);
  const w1 = mitWahl(w0, "wahl/diagnostik/0", "roentgen", widx);
  const wb = (f: Fall) => renderBrief(f, widx, { listen: "striche" });
  assert.equal(gesetztText(w0, wb(w0), w1, wb(w1)), "Röntgen oder Verzicht? „Röntgen oberes Sprunggelenk ohne Fraktur.“");
  assert.equal(kurz("a  b\nc"), "a b c");
  assert.equal(kurz("x".repeat(80)).length, 70);
  assert.equal(aufzaehlen(["a"]), "a");
  assert.equal(aufzaehlen(["a", "", "b"]), "a und b");
  assert.equal(aufzaehlen(["a", "b", "c"]), "a, b und c");
  assert.equal(aufzaehlen(["a", "b", "c", "d", "e"]), "a, b, c und 2 weitere");
});

test("zurueckgenommenText: jede Stelle einmal, mit dem Stand nach der Rücknahme des ganzen Zugs (QA-31), alle genannt (QA-32)", () => {
  const brief = (f: Fall) => renderBrief(f, index, { listen: "striche" });
  const satz = (vor: Fall, nach: Fall) => zurueckgenommenText(vor, nach, brief);
  const f0 = mitSeite(neu(V_ENTSCHEIDEN), "links");
  // Zug aus zwei Befehlen wie „u“, „n“ in der Befundliste: Druckschmerz unauffällig, dann Haut. Die Meldung nennt den
  // Stand nach der Rücknahme, nicht den Zwischenstand nach dem ersten Befehl, und beide Stellen beim Namen.
  const f1 = mitBefund(f0, "t-osg/ds", "ok");
  const f2 = mitBefund(f1, "t-osg/haut", "ok");
  const zurueck = schritteZuruecknehmen(f2, [
    { vorher: f0, nachher: f1 },
    { vorher: f1, nachher: f2 },
  ]);
  const stand = ab(f0, index, "befund").tokens.find((t) => t.key === "t-osg/ds")?.zustand === "offen" ? "wieder offen" : "wieder Vorschlag";
  assert.equal(satz(f2, zurueck), `„Haut“ und „Druckschmerz Außenknöchel“ (jetzt: ${stand})`);
  // Dieselbe Stelle zweimal geändert (erst unauffällig, dann auffällig): einmal genannt.
  const g1 = mitBefund(f0, "t-osg/ds", "ok");
  const g2 = mitBefund(g1, "t-osg/ds", "abw");
  assert.equal(satz(g2, f0), `„Druckschmerz Außenknöchel“ (jetzt: ${stand})`);
  // Zwei Stellen unter demselben Namen mit demselben Stand (wie „Kontrolle“ in zwei Sätzen): einmal genannt.
  const gleicherName = (f: Fall) => {
    const b = brief(f)!;
    return { ...b, abschnitte: b.abschnitte.map((a) => ({ ...a, tokens: a.tokens.map((t) => (t.key === "t-osg/ds" || t.key === "t-osg/haut" ? { ...t, label: "Kontrolle" } : t)) })) };
  };
  assert.equal(zurueckgenommenText(f2, zurueck, gleicherName), `„Kontrolle“ (jetzt: ${stand})`);
  // Verschiedene Stände durch Semikolon; der Fallkopf zuerst.
  const k1 = mitPerson(f0, "w", "");
  const k2 = mitBefund(k1, "t-osg/ds", "ok");
  assert.equal(satz(k2, f0), `Person (jetzt: nicht gewählt); „Druckschmerz Außenknöchel“ (jetzt: ${stand})`);
  // Ab vier Stellen die Zahl davor; jede Stelle mit Namen, kein „und N weitere“.
  let viele = f0;
  for (const id of ["schwellung", "haut", "ds", "schublade"]) viele = mitBefund(viele, `t-osg/${id}`, "ok");
  const text = satz(viele, f0);
  assert.match(text, /^4 Stellen: /);
  for (const name of ["Schwellung", "Haut", "Druckschmerz Außenknöchel", "Talusvorschub"]) assert.ok(text.includes(`„${name}“`), `${name} fehlt: ${text}`);
  assert.doesNotMatch(text, /weitere/);
  // Nichts geändert, anderer Fall, Stellen, die sich nur im Leerraum unterscheiden.
  assert.equal(satz(f0, f0), "");
  assert.equal(zurueckgenommenText(f0, { ...f0, id: "anders" }, brief), "");
  const b0 = brief(f0)!;
  const leer = { ...b0, abschnitte: b0.abschnitte.map((a) => ({ ...a, tokens: a.tokens.map((t) => (t.key === "t-osg/ds" ? { ...t, t: ` ${t.t}  ` } : t)) })) };
  const nachLeer = { ...f0, geaendert: f0.geaendert + 1 };
  assert.equal(zurueckgenommenText(f0, nachLeer, (f) => (f.geaendert === nachLeer.geaendert ? leer : brief(f))), "", "nur Leerraum");
  // Seite zurück: einmal „Seite“, nicht noch jede Seitenangabe im Brief, die nur ihretwegen anders aussieht.
  const ohneSeite = mitSeite(f2, null);
  assert.equal(satz(f2, ohneSeite), "Seite (jetzt: nicht gewählt)");
  // Seite und ein Befund zusammen zurück: beide, der Befund mit dem Stand danach.
  assert.equal(satz(f1, mitBefund(mitSeite(f1, null), "t-osg/ds", undefined)), `Seite (jetzt: nicht gewählt); „Druckschmerz Außenknöchel“ (jetzt: ${stand})`);
  // Ein Name mit Komma und „und“ bleibt als ein Name erkennbar (CR-TS20).
  const kommaName = (f: Fall) => {
    const b = brief(f)!;
    return { ...b, abschnitte: b.abschnitte.map((a) => ({ ...a, tokens: a.tokens.map((t) => (t.key === "t-osg/ds" ? { ...t, label: "Wundgrund, Fremdkörper und Tiefe" } : t)) })) };
  };
  assert.equal(zurueckgenommenText(f2, zurueck, kommaName), `„Haut“ und „Wundgrund, Fremdkörper und Tiefe“ (jetzt: ${stand})`);
});

test("sicherZuruecknehmen: eine Aussage von vorher wird offen, nicht wieder schwarz (E-48, CR-TS13); Zusätze bleiben (PS-N13)", () => {
  const brief = (f: Fall) => renderBrief(f, index, { listen: "striche" });
  const f0 = mitSeite(neu(V_ENTSCHEIDEN), "links");
  // CR-TS13: „DS Außenknöchel“ war unauffällig (Aussage), der Zug setzt „nicht untersucht“. Zurück heißt offen.
  const a0 = mitBefund(f0, "t-osg/ds", "ok");
  const a1 = mitBefund(a0, "t-osg/ds", "weg");
  assert.equal(schritteZuruecknehmen(a1, [{ vorher: a0, nachher: a1 }]).befund["t-osg/ds"], "ok", "bisher: alte Aussage zurück");
  const r = sicherZuruecknehmen(a1, [{ vorher: a0, nachher: a1 }], brief);
  assert.equal(r.fall.befund["t-osg/ds"], undefined);
  assert.deepEqual(r.behalten, []);
  // Vorher offen: wie bisher zurück auf offen; eine spätere eigene Änderung an anderer Stelle bleibt.
  const b1 = mitBefund(f0, "t-osg/haut", "ok");
  const b2 = mitBefund(b1, "t-osg/schwellung", "abw");
  const rb = sicherZuruecknehmen(b2, [{ vorher: f0, nachher: b1 }], brief);
  assert.equal(rb.fall.befund["t-osg/haut"], undefined);
  assert.equal(rb.fall.befund["t-osg/schwellung"], "abw");
  // Feld, Angabe und Auswahl mit einer Aussage von vorher: leer statt alter Wert.
  const c0 = mitAuswahl(mitSlot(mitWert(f0, "allergien", "Penicillin"), "t-osg/x/y", "3"), "t-osg/w", 0);
  const c1 = mitAuswahl(mitSlot(mitWert(c0, "allergien", "keine bekannt"), "t-osg/x/y", "4"), "t-osg/w", 1);
  const rc = sicherZuruecknehmen(c1, [{ vorher: c0, nachher: c1 }]).fall;
  assert.equal(rc.werte.allergien, undefined);
  assert.equal(rc.slots["t-osg/x/y"], undefined);
  assert.equal(rc.auswahl["t-osg/w"], undefined);
  // Seite: eine gewählte Seite kommt nicht wieder, die Rücknahme führt zu „nicht gewählt“.
  const s1 = mitSeite(f0, "rechts");
  assert.equal(sicherZuruecknehmen(s1, [{ vorher: f0, nachher: s1 }]).fall.seite, null);
  // Zusatz als Satz („+ Kein Sturz auf den Kopf“): Mit `brief` bleibt er und wird genannt, ohne wird er entfernt.
  const o0 = mitSeite(neu(V), "links");
  const o1 = mitOption(o0, "t-ana/kopf", true);
  const o2 = mitBefund(o1, "t-osg/haut", "ok");
  const ro = sicherZuruecknehmen(o2, [{ vorher: o0, nachher: o1 }, { vorher: o1, nachher: o2 }], brief);
  assert.deepEqual(ro.behalten, ["Kein Sturz auf den Kopf"]);
  assert.equal(ro.fall.optionen["t-ana/kopf"], true);
  assert.equal(ro.fall.befund["t-osg/haut"], undefined);
  assert.equal(sicherZuruecknehmen(o1, [{ vorher: o0, nachher: o1 }]).fall.optionen["t-ana/kopf"], undefined);
  // Nur ein Zusatz im Zug: Der Fall bleibt derselbe, gemeldet wird der Zusatz.
  const nur = sicherZuruecknehmen(o1, [{ vorher: o0, nachher: o1 }], brief);
  assert.equal(nur.fall, o1);
  assert.deepEqual(nur.behalten, ["Kein Sturz auf den Kopf"]);
  // Ein grauer Satz, den Ü bestätigt hat, ist kein Zusatz: Er geht zurück auf grau.
  const g0 = mitSeite(neu(V), "links");
  const g1 = mitOption(g0, "t-proc/kuehlen", true);
  const rg = sicherZuruecknehmen(g1, [{ vorher: g0, nachher: g1 }], brief);
  assert.deepEqual(rg.behalten, []);
  assert.equal(rg.fall.optionen["t-proc/kuehlen"], undefined);
  // Ein angefügter Baustein (auch die Wahl an einer Entweder-oder-Stelle) ist kein Satz-Zusatz: Er geht zurück.
  const z1 = mitBaustein(f0, "t-th2", index, "therapie");
  const rz = sicherZuruecknehmen(z1, [{ vorher: f0, nachher: z1 }], brief);
  assert.deepEqual(rz.behalten, []);
  assert.ok(!rz.fall.bausteine.therapie?.includes("t-th2"));
  // Nichts zurückzunehmen: derselbe Fall.
  assert.equal(sicherZuruecknehmen(f0, [{ vorher: f0, nachher: b1 }], brief).fall, f0);
});

test("sicherZuruecknehmen, Runde 5: Satz aus einer zurückgenommenen Wahl bleibt nicht (CR-R4-01); entfernter Satz wird genannt (CR-R4-02); Wortlaut, Zusatz, Alter leer und genannt; Bausteinseite bleibt (PS-R4-1)", () => {
  // CR-R4-01: Wahl an einer Entweder-oder-Stelle, dann Ü auf ihren grauen Satz, dann Rücknahme des Zugs.
  const keine = baustein("keine-wunde", "befund", [{ art: "option", id: "satz", label: "Keine Wunde", an: true, text: "Keine Wunde im Bereich der Fraktur. " }]);
  const wunde = baustein("wunde", "befund", [{ art: "option", id: "satz", label: "Wunde", an: true, text: "Wunde über der Fraktur. " }]);
  const kopf = baustein("kopf", "befund", [{ art: "text", text: "Befund: " }]);
  const vw = vorlage("v-wunde", { befund: ["kopf"] }, { wahl: [{ abschnitt: "befund", label: "Wunde im Bereich der Fraktur?", bausteine: ["keine-wunde", "wunde"] }] });
  const iw = testIndex([keine, wunde, kopf], [vw]);
  const briefW = (f: Fall) => renderBrief(f, iw, { listen: "striche" });
  const w0 = mitSeite(mitVorlage(neuerFall("zna", iw), vw, iw), "links");
  const w1 = mitWahl(w0, "wahl/befund/0", "keine-wunde", iw);
  const w2 = uebernehmen(w1, ["keine-wunde/satz"], iw);
  assert.equal(w2.optionen["keine-wunde/satz"], true);
  const rw = sicherZuruecknehmen(w2, [{ vorher: w0, nachher: w1 }, { vorher: w1, nachher: w2 }], briefW);
  assert.deepEqual(rw.behalten, [], "der Satz steht ohne seinen Baustein nicht im Brief");
  assert.equal(rw.fall.optionen["keine-wunde/satz"], undefined, "kein Vermerk ohne Baustein");
  assert.ok(!rw.fall.bausteine.befund?.includes("keine-wunde"));
  // Dieselbe Wahl später erneut: Der Satz ist grau, nicht schwarz.
  const wieder = mitWahl(rw.fall, "wahl/befund/0", "keine-wunde", iw);
  assert.equal(briefW(wieder)!.abschnitte.flatMap((a) => a.tokens).find((t) => t.key === "keine-wunde/satz")?.zustand, "vorschlag");

  const brief = (f: Fall) => renderBrief(f, index, { listen: "striche" });
  const f0 = mitPerson(mitSeite(neu(V), "links"), "m", "34");
  // CR-R4-02 (a): „+ Kein Sturz auf den Kopf“ stand schwarz im Brief, der Zug entfernt den Satz („Satz entfernen“).
  const a0 = mitEigenemText(mitOption(f0, "t-ana/kopf", true), "t-ana/kopf", "Kein Kopfanprall.");
  const a1 = mitEigenemText(mitOption(a0, "t-ana/kopf", false), "t-ana/kopf", undefined);
  const ra = sicherZuruecknehmen(a1, [{ vorher: a0, nachher: a1 }], brief);
  assert.equal(ra.fall.optionen["t-ana/kopf"], undefined);
  assert.deepEqual(ra.entfernt, ["Kein Sturz auf den Kopf"]);
  assert.deepEqual(ra.geleert, [{ name: "Kein Sturz auf den Kopf", vorher: "Kein Kopfanprall." }]);
  // Ein Satz, den die Vorlage vorschlägt, wird grau: nicht entfernt.
  const g0 = mitOption(f0, "t-proc/kuehlen", true);
  const g1 = mitOption(g0, "t-proc/kuehlen", false);
  assert.deepEqual(sicherZuruecknehmen(g1, [{ vorher: g0, nachher: g1 }], brief).entfernt, []);
  // Eigener Wortlaut an einer Auswahl: Der Zug wählt eine Option (der Wortlaut fällt weg); zurück heißt offen, nicht der alte Wortlaut.
  const e0 = mitEigenemText(f0, "t-dgn/ergebnis", "Fissur, keine Dislokation.");
  const e1 = mitAuswahl(e0, "t-dgn/ergebnis", 0);
  const re = sicherZuruecknehmen(e1, [{ vorher: e0, nachher: e1 }], brief);
  assert.equal(re.fall.eigen["t-dgn/ergebnis"], undefined);
  assert.equal(re.fall.auswahl["t-dgn/ergebnis"], undefined);
  assert.equal(ab(re.fall, index, "diagnostik").tokens.find((t) => t.key === "t-dgn/ergebnis")?.zustand, "offen");
  assert.deepEqual(re.geleert, [{ name: "Röntgenbefund", vorher: "Fissur, keine Dislokation." }]);
  // Getipptes Feld (Hinweis des Code-Reviews): leer und genannt.
  const p0 = mitWert(f0, "t-ana/hergang", "Sturz vom Fahrrad");
  const p1 = mitWert(p0, "t-ana/hergang", "Umknicktrauma");
  assert.deepEqual(sicherZuruecknehmen(p1, [{ vorher: p0, nachher: p1 }], brief).geleert, [{ name: "Unfallhergang", vorher: "Sturz vom Fahrrad" }]);
  // Freier Zusatz und Alter: leer statt alter Text, genannt.
  const z0 = mitZusatz(f0, "procedere", "Wiedervorstellung bei Fieber.");
  const z1 = mitZusatz(z0, "procedere", "");
  const rz = sicherZuruecknehmen(z1, [{ vorher: z0, nachher: z1 }], brief);
  assert.equal(rz.fall.zusatz.procedere, "");
  assert.deepEqual(rz.geleert, [{ name: "Ergänzung Procedere", vorher: "Wiedervorstellung bei Fieber." }]);
  const al1 = mitPerson(f0, "m", "43");
  const ral = sicherZuruecknehmen(al1, [{ vorher: f0, nachher: al1 }], brief);
  assert.equal(ral.fall.alter, "");
  assert.deepEqual(ral.geleert, [{ name: "Alter", vorher: "34" }]);
  // PS-R4-1: Seite eines Bausteins, die er vorher trug: bleibt, wird genannt; ohne Seite davor geht sie zurück auf offen.
  const s0 = mitSeite(f0, "rechts", "t-osg");
  const s1 = mitSeite(s0, "links", "t-osg");
  const rs = sicherZuruecknehmen(s1, [{ vorher: s0, nachher: s1 }], brief);
  assert.equal(rs.fall.seiteBaustein["t-osg"], "links");
  assert.equal(rs.fall, s1, "nichts geändert");
  assert.deepEqual(rs.seiteBleibt, [{ name: "t-osg", seite: "links" }]);
  const s2 = mitSeite(s0, "beidseits", "t-osg");
  const rs2 = sicherZuruecknehmen(s2, [{ vorher: s0, nachher: s2 }], brief);
  assert.equal(rs2.fall.seiteBaustein["t-osg"], "beidseits");
  assert.equal(schritteZuruecknehmen(s2, [{ vorher: s0, nachher: s2 }]).seiteBaustein["t-osg"], "rechts", "bisher: alte Seite zurück");
  const ohneSeite = mitSeite(f0, null);
  const o1 = mitSeite(ohneSeite, "rechts", "t-osg");
  const ro = sicherZuruecknehmen(o1, [{ vorher: ohneSeite, nachher: o1 }], brief);
  assert.equal(ro.fall.seiteBaustein["t-osg"], undefined);
  assert.deepEqual(ro.seiteBleibt, []);
});

test("Meldung zur Seite eines Bausteins nennt den Baustein (PS-R4-1)", () => {
  const brief = (f: Fall) => renderBrief(f, index, { listen: "striche" });
  const f0 = mitSeite(neu(V), "links");
  const f1 = mitSeite(f0, "rechts", "t-osg");
  assert.equal(zurueckgenommenText(f1, f0, brief), "„Seite (t-osg)“ (jetzt: „links“)");
  assert.equal(gesetztText(f0, brief(f0), f1, brief(f1)), "Seite (t-osg) „rechts“");
});

test("ohneDoppelteEinheit: „3 cm“ in einem Feld, hinter dem der Text „cm“ schreibt, wird „3“ (H-R3-1)", () => {
  assert.equal(ohneDoppelteEinheit("3 cm", "cm"), "3");
  assert.equal(ohneDoppelteEinheit("3cm", "cm"), "3");
  assert.equal(ohneDoppelteEinheit("3,5 CM", "cm"), "3,5");
  assert.equal(ohneDoppelteEinheit("ca. 3 cm.", "cm"), "ca. 3");
  assert.equal(ohneDoppelteEinheit("38,5 °C", "°C"), "38,5");
  assert.equal(ohneDoppelteEinheit("3", "cm"), "3");
  assert.equal(ohneDoppelteEinheit("3 cm", undefined), "3 cm");
  assert.equal(ohneDoppelteEinheit("cm", "cm"), "cm", "ohne Zahl bleibt alles");
  assert.equal(ohneDoppelteEinheit("3 mm", "cm"), "3 mm", "andere Einheit bleibt");
  // CR-R4-03: Einheit ohne Leerzeichen dahinter („{w}°.“, „{w}/min.“).
  assert.equal(einheitDahinter("°. "), "°");
  assert.equal(einheitDahinter("/min. "), "/min");
  assert.equal(einheitDahinter(" cm Länge."), "cm");
  assert.equal(einheitDahinter(". "), undefined);
  assert.equal(einheitDahinter("{b}. "), undefined, "eine neue Stelle ist keine Einheit");
  assert.equal(ohneDoppelteEinheit("90°", "°"), "90");
  assert.equal(ohneDoppelteEinheit("40/0/70 °", "°"), "40/0/70");
  assert.equal(ohneDoppelteEinheit("80/min", "/min"), "80");
  assert.equal(ohneDoppelteEinheit("80", "/min"), "80");
});

test("anleitungVonSelbst: nur beim allerersten Start und nur mit dauerhaftem Speicher (D-05)", () => {
  assert.equal(anleitungVonSelbst(false, true), true);
  assert.equal(anleitungVonSelbst(true, true), false);
  // Gesperrter Speicher: Sie ginge sonst bei jedem Start auf.
  assert.equal(anleitungVonSelbst(false, false), false);
  assert.equal(anleitungVonSelbst(true, false), false);
});

test("trefferNachBereich: eigener Bereich zuerst in unveränderter Reihenfolge, freie Plätze für den anderen (Runde 4, C)", () => {
  const t = (id: string, setting: "zna" | "station", punkte: number) => ({ vorlage: { id, setting } as Vorlage, punkte });
  const ids = (vs: Vorlage[]) => vs.map((v) => v.id);
  // Nur der andere Bereich findet etwas: Er bekommt die Liste, unter eigener Überschrift.
  const nurAndere = trefferNachBereich([t("station-hueft-tep", "station", 30)], "zna");
  assert.deepEqual(ids(nurAndere.eigene), []);
  assert.deepEqual(ids(nurAndere.andere), ["station-hueft-tep"]);
  // Reihenfolge der eigenen bleibt die der Suche; andere füllen nur, was frei ist.
  const gemischt = trefferNachBereich([t("a", "zna", 1030), t("b", "zna", 1010), t("x", "station", 50), t("y", "station", 40)], "zna", 3);
  assert.deepEqual(ids(gemischt.eigene), ["a", "b"]);
  assert.deepEqual(ids(gemischt.andere), ["x"]);
  // Volle Liste aus dem eigenen Bereich: nichts vom anderen.
  const voll = trefferNachBereich(Array.from({ length: TREFFER_MAX + 2 }, (_, i) => t(`z${i}`, "zna", 1100 - i)).concat([t("s", "station", 90)]), "zna");
  assert.equal(voll.eigene.length, TREFFER_MAX);
  assert.deepEqual(voll.andere, []);
  // Andersherum auf Station.
  assert.deepEqual(ids(trefferNachBereich([t("s1", "station", 1020), t("z1", "zna", 20)], "station").andere), ["z1"]);
});

test("Normalwerte: Karte über Fundstellen, mehrere Einträge je Feld, ganze Tabelle nach Gelenk; Zeile und Überschrift", () => {
  const f = (baustein: string, segment: string, slot?: string) => ({ datei: "x.json", baustein, segment, ...(slot ? { slot } : {}) });
  const n: Normwerte = {
    freigegeben: true,
    quelle: "q",
    eintraege: [
      { schluessel: "s-abd", gelenk: "Schultergelenk", bewegung: "Abduktion/Adduktion", normal: "150–180/0/20–40°", hinweis: "h1", fundstellen: [f("sch", "abd"), f("prell", "bew", "detail")] },
      { schluessel: "s-rot", gelenk: "Schultergelenk", bewegung: "Außenrotation/Innenrotation", stellungen: [{ stellung: "Oberarm anliegend", normal: "40–60/0/90–95°" }, { stellung: "in 90° Abduktion", normal: "70–90/0/60–70°" }], hinweis: "h2", fundstellen: [f("prell", "bew", "detail")] },
      { schluessel: "knie", gelenk: "Kniegelenk", bewegung: "Extension/Flexion", normal: "0–10/0/120–150°", hinweis: "h3", fundstellen: [f("k", "extflex")] },
      { schluessel: "fba", gelenk: "Wirbelsäule und Hüfte", bewegung: "Finger-Boden-Abstand", normal: "0–10 cm", hinweis: "h4", fundstellen: [] },
    ],
    tabelle: [f("mono", "extflex")],
  };
  const k = normwertKarte(n);
  // Zuordnung über Baustein und Feld, nicht über das Label; ein Slot hängt an seinem Feld.
  assert.deepEqual(k.get("sch/abd"), { art: "einzeln", eintraege: [n.eintraege[0]] });
  const prell = k.get("prell/bew");
  assert.ok(prell?.art === "einzeln");
  assert.deepEqual(prell.eintraege.map((e) => e.schluessel), ["s-abd", "s-rot"]);
  assert.equal(k.has("knie/extflex"), false);
  const mono = k.get("mono/extflex");
  assert.ok(mono?.art === "tabelle");
  assert.deepEqual(mono.gruppen.map((g) => [g.gelenk, g.eintraege.length]), [["Schultergelenk", 2], ["Kniegelenk", 1], ["Wirbelsäule und Hüfte", 1]]);
  assert.equal(normZeile(n.eintraege[2]), "Extension/Flexion 0–10/0/120–150°");
  assert.equal(normZeile(n.eintraege[1]), "Außenrotation/Innenrotation: Oberarm anliegend 40–60/0/90–95°; in 90° Abduktion 70–90/0/60–70°");
  assert.equal(normTitel(n.eintraege.slice(0, 3)), "Normalwerte (Neutral-Null)");
  assert.equal(normTitel(n.eintraege), "Normalwerte");
});

// --- Runde 5: Ausgangsstellung, Handbearbeitung vor dem Klären -----------------------------------------------------

test("Ausgangsstellung am Messfeld (R4-D3): in Klammern hinter der Einheit, in derselben Stelle; nur angebotene; bleibt bei neuer Katalogfassung", () => {
  const rot = baustein("t-schulter", "befund", [
    { art: "messwert", id: "rot", label: "Außenrotation/Innenrotation", gruppe: "Beweglichkeit", vorlage: "Außenrotation/Innenrotation {w}°. ", stellungen: ["Oberarm anliegend", "in 90° Abduktion"] },
    { art: "messwert", id: "puls", label: "Puls", vorlage: "Puls {w}/min. " },
  ]);
  const iv = testIndex([rot]);
  const k = "t-schulter/rot";
  let f = mitWert(fallMit(iv, { befund: ["t-schulter"] }), k, "40/0/70");
  assert.equal(ab(f, iv, "befund").text, "Außenrotation/Innenrotation 40/0/70°.");
  f = mitSlot(f, `${k}/${STELLUNG}`, "in 90° Abduktion");
  const a = ab(f, iv, "befund");
  assert.equal(a.text, "Außenrotation/Innenrotation 40/0/70° (in 90° Abduktion).");
  // Wert und Stellung sind eine Stelle: Eine Meldung über die Stelle nennt beides.
  assert.deepEqual(a.tokens.filter((t) => t.key === k).map((t) => t.t), ["40/0/70° (in 90° Abduktion)"]);
  // Mit Einheit getippt: keine doppelte Einheit, die Klammer bleibt dahinter.
  assert.equal(ab(mitWert(f, k, "40/0/70°"), iv, "befund").text, "Außenrotation/Innenrotation 40/0/70° (in 90° Abduktion).");
  // Ohne Wert steht auch die Stellung nicht im Brief.
  assert.equal(ab(mitWert(f, k, undefined), iv, "befund").text, "");
  // Eine Stellung, die das Feld nicht anbietet, gilt nicht; ein Feld ohne Stellungen kennt keine.
  assert.equal(stellungVon(mitSlot(f, `${k}/${STELLUNG}`, "im Stehen"), k, rot.segmente[0] as { stellungen?: string[] }), undefined);
  assert.equal(ab(mitSlot(f, `${k}/${STELLUNG}`, "im Stehen"), iv, "befund").text, "Außenrotation/Innenrotation 40/0/70°.");
  const p = mitSlot(mitWert(f, "t-schulter/puls", "80"), `t-schulter/puls/${STELLUNG}`, "in 90° Abduktion");
  assert.match(ab(p, iv, "befund").text, /Puls 80\/min\.$/);
  // Neue Katalogfassung: Die Stellung bleibt, solange es sie gibt; sonst geht sie mit den übrigen Wahlen.
  const neu1 = testIndex([rot], [], 9);
  assert.equal(nachKatalogwechsel(f, neu1).slots[`${k}/${STELLUNG}`], "in 90° Abduktion");
  const ohne = baustein("t-schulter", "befund", [{ ...(rot.segmente[0] as Extract<Segment, { art: "messwert" }>), stellungen: ["Oberarm anliegend"] }]);
  assert.equal(nachKatalogwechsel(f, testIndex([ohne], [], 9)).slots[`${k}/${STELLUNG}`], undefined);
  // Rücknahme in die sichere Richtung: Die Stellung geht, der Wert vor dem Zug bleibt, die Meldung nennt die Stellung.
  const vorher = mitWert(fallMit(iv, { befund: ["t-schulter"] }), k, "40/0/70");
  const nachher = mitSlot(vorher, `${k}/${STELLUNG}`, "Oberarm anliegend");
  const zwei = mitSlot(nachher, `${k}/${STELLUNG}`, "in 90° Abduktion");
  const r = sicherZuruecknehmen(zwei, [{ vorher: nachher, nachher: zwei }], (x) => renderBrief(x, iv, { listen: "striche" }));
  assert.equal(r.fall.slots[`${k}/${STELLUNG}`], undefined);
  assert.equal(r.fall.werte[k], "40/0/70");
  assert.deepEqual(r.geleert, [{ name: "Außenrotation/Innenrotation", vorher: "Oberarm anliegend" }]);
});

test("Normalwerte für die gewählte Ausgangsstellung (R4-D3): nur deren Wert; ohne Wahl oder ohne passende Stellung alles", () => {
  const e = { schluessel: "s-rot", gelenk: "Schultergelenk", bewegung: "Außenrotation/Innenrotation", stellungen: [{ stellung: "Oberarm anliegend", normal: "40–60/0/90–95°" }, { stellung: "in 90° Abduktion", normal: "70–90/0/60–70°" }], hinweis: "h", fundstellen: [] };
  const x = { schluessel: "s-abd", gelenk: "Schultergelenk", bewegung: "Abduktion/Adduktion", normal: "150–180/0/20–40°", hinweis: "h", fundstellen: [] };
  const anz = { art: "einzeln" as const, eintraege: [e, x] };
  const gew = fuerStellung(anz, "in 90° Abduktion");
  assert.ok(gew.art === "einzeln");
  assert.equal(normZeile(gew.eintraege[0]), "Außenrotation/Innenrotation: in 90° Abduktion 70–90/0/60–70°");
  assert.equal(gew.eintraege[1], x);
  assert.equal(fuerStellung(anz, undefined), anz);
  assert.deepEqual(fuerStellung(anz, "im Stehen"), anz);
  const tab = { art: "tabelle" as const, gruppen: [] };
  assert.equal(fuerStellung(tab, "in 90° Abduktion"), tab);
});

test("Handtext vor dem Klären (M-18 Station): Vorschlag und offene Stelle in ‹…›, gesetzter Text unverändert; zählt als Lücke", () => {
  const t: Token[] = [
    { t: "Befund: ", art: "fix" },
    { t: "Keine Schwellung. ", art: "befund", key: "b/s", zustand: "vorschlag", label: "Schwellung" },
    { t: "Druckschmerz über dem Außenknöchel. ", art: "befund", key: "b/d", zustand: "abw", label: "Druckschmerz" },
    { t: "‹Hämatom?›", art: "befund", key: "b/h", zustand: "offen", label: "Hämatom" },
    { t: " Stabil", art: "option", key: "b/st", zustand: "offen", label: "Stabilität" },
    { t: "", art: "messwert", key: "b/m", zustand: "offen", label: "Umfang" },
  ];
  const h = handtext(t);
  assert.equal(h, "Befund: ‹Vorschlag: Keine Schwellung.› Druckschmerz über dem Außenknöchel. ‹Hämatom?› ‹Stabil›‹Umfang›");
  // Jede noch zu klärende Stelle bleibt eine Lücke und sperrt so das Kopieren.
  assert.equal((h.match(LUECKE) ?? []).length, 4);
  // Klammern im Vorschlag schließen die Lücke nicht vorzeitig.
  assert.equal(handtext([{ t: "Text › mit Klammer. ", art: "option", key: "x", zustand: "vorschlag" }]), "‹Vorschlag: Text  mit Klammer.› ");
  // Fertiger Text bleibt, wie er ist.
  assert.equal(handtext(t.slice(0, 1).concat(t[2])), "Befund: Druckschmerz über dem Außenknöchel. ");
  // Im Brief: Ein von Hand übernommener Text mit diesen Lücken ist nicht fertig.
  let f = fallMit(index, { befund: ["t-osg"] });
  const a0 = ab(f, index, "befund");
  assert.equal(a0.fertig, false);
  f = mitManuell(f, "befund", handtext(a0.tokens));
  const a1 = ab(f, index, "befund");
  assert.equal(a1.fertig, false);
  assert.ok(a1.offen > 0);
  f = mitManuell(f, "befund", "Klinisch unauffällig.");
  assert.equal(ab(f, index, "befund").fertig, true);
});
