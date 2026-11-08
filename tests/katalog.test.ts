// Prüft die Katalogdaten gegen das Vorlagenformat (docs/04-technik/02-vorlagenformat.md)
// und gegen die Regeln aus der Sicherheitsprüfung (docs/03-inhalt/00-auftrag-inhaltsautoren.md, Nachtrag).
import { test } from "node:test";
import assert from "node:assert/strict";
import { KATALOG } from "../src/data/katalog.ts";
import { ALLE_ABSCHNITTE, abschnittVon } from "../src/model/types.ts";
import type { Baustein, BefundSlot, Fall, Vorlage } from "../src/model/types.ts";
import { BEZUG, briefText, indexiere, renderBrief } from "../src/engine/render.ts";
import { mitAngabe, mitAuswahl, mitBaustein, mitOption, mitPerson, mitSeite, mitVorlage, mitWahl, neuerFall } from "../src/engine/fall.ts";
import { mitSammelangabe, sammelSchritte } from "../src/engine/sammel.ts";
import { findeAbgleichhinweise } from "../src/engine/abgleich.ts";
import { ABGLEICHREGELN } from "../src/data/abgleich.ts";
import { istKisSicher } from "../src/engine/text.ts";
import { schnellwerteFehler, wahlPlatzFehler, weglassenFehler } from "../src/engine/vorlage.ts";

const index = indexiere(KATALOG);
const alle: Baustein[] = KATALOG.regionen.flatMap((r) => r.bausteine);
const STATUS = ["hausstandard", "geprueft", "entwurf"];

/** Zeigt höchstens die ersten Verstöße, damit die Ausgabe lesbar bleibt, und nennt die Gesamtzahl. */
function melde(fehler: string[]) {
  assert.equal(fehler.length, 0, `${fehler.length} Verstöße:\n  ${fehler.slice(0, 60).join("\n  ")}${fehler.length > 60 ? `\n  … und ${fehler.length - 60} weitere` : ""}`);
}

function slotStellen(vorlage: string): string[] {
  return [...vorlage.matchAll(/\{([a-zA-Z0-9_-]+)\}/g)].map((m) => m[1]).filter((n) => !(n in BEZUG));
}

function pruefeSlots(ort: string, vorlage: string, slots: BefundSlot[] | undefined, fehler: string[]) {
  const ids = new Set((slots ?? []).map((s) => s.id));
  for (const st of slotStellen(vorlage)) if (!ids.has(st)) fehler.push(`${ort}: Stelle {${st}} ohne Slot`);
  for (const s of slots ?? []) {
    if (s.id in BEZUG) fehler.push(`${ort}: Slot-ID ${s.id} ist für Seite und Person reserviert`);
    if (!vorlage.includes(`{${s.id}}`)) fehler.push(`${ort}: Slot ${s.id} kommt im Text nicht vor`);
    if (s.art === "auswahl") {
      if (s.optionen.filter((o) => o !== "").length < 1) fehler.push(`${ort}: Slot ${s.id} braucht mindestens eine Option mit Text`);
      if (s.default !== undefined && !(s.default >= 0 && s.default < s.optionen.length)) fehler.push(`${ort}: Slot ${s.id} hat eine ungültige Vorgabe`);
    }
  }
}

/** Alle Texte eines Bausteins mit Ort, für Prüfungen über den gesamten Wortlaut. */
function texte(b: Baustein): { ort: string; text: string; fest: boolean }[] {
  const aus: { ort: string; text: string; fest: boolean }[] = [];
  for (const p of b.platzhalter) {
    for (const t of [p.default, p.leerMarker, p.einheit, ...(p.vorschlaege ?? []), ...(p.optionen ?? [])]) if (t) aus.push({ ort: `${b.id}/${p.id}`, text: t, fest: false });
  }
  for (const s of b.segmente) {
    const ort = `${b.id}/${"id" in s ? s.id : s.art}`;
    const slots = "slots" in s ? (s.slots ?? []) : [];
    for (const sl of slots) if (sl.art === "auswahl") for (const o of sl.optionen) aus.push({ ort, text: o, fest: false });
    if (s.art === "text") aus.push({ ort, text: s.text, fest: true });
    if (s.art === "auswahl") for (const o of s.optionen) aus.push({ ort, text: o, fest: false });
    if (s.art === "befund") aus.push({ ort, text: s.normal, fest: false }, { ort, text: s.abweichung, fest: false });
    if (s.art === "option") aus.push({ ort, text: s.text, fest: false });
    if (s.art === "messwert") aus.push({ ort, text: s.vorlage, fest: false }, { ort, text: s.normal ?? "", fest: false });
  }
  return aus;
}

// --- Format --------------------------------------------------------------------

test("IDs sind eindeutig", () => {
  const ids = alle.map((b) => b.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  const v = KATALOG.vorlagen.map((x) => x.id);
  assert.deepEqual(v.filter((id, i) => v.indexOf(id) !== i), []);
});

test("Bausteine sind formal gültig", () => {
  const fehler: string[] = [];
  for (const b of alle) {
    if (!/^[a-z0-9-]+$/.test(b.id)) fehler.push(`${b.id}: ID nur aus a-z, 0-9 und Bindestrich`);
    if (b.id.startsWith("eigen-")) fehler.push(`${b.id}: Die Vorsilbe „eigen-“ gehört den Bausteinen des Arztes`);
    if (!b.titel) fehler.push(`${b.id}: Titel fehlt`);
    if (!b.status || !STATUS.includes(b.status)) fehler.push(`${b.id}: Prüfstatus fehlt (hausstandard, entwurf oder geprueft)`);
    if (!ALLE_ABSCHNITTE.includes(abschnittVon(b))) fehler.push(`${b.id}: Abschnitt unbekannt`);
    if (!b.segmente.length) fehler.push(`${b.id}: keine Segmente`);
    const ph = new Set(b.platzhalter.map((p) => p.id));
    if (ph.size !== b.platzhalter.length) fehler.push(`${b.id}: doppelte Platzhalter-ID`);
    const benutzt = new Set<string>();
    const segIds = new Set<string>();
    for (const s of b.segmente) {
      if ("id" in s) {
        if (s.id.includes("/")) fehler.push(`${b.id}/${s.id}: Schrägstrich in ID`);
        if (segIds.has(s.id) || ph.has(s.id)) fehler.push(`${b.id}/${s.id}: ID doppelt`);
        segIds.add(s.id);
      }
      switch (s.art) {
        case "platzhalter":
          if (!ph.has(s.ref)) fehler.push(`${b.id}: Platzhalter ${s.ref} nicht definiert`);
          benutzt.add(s.ref);
          break;
        case "auswahl":
          if (s.optionen.length < 2) fehler.push(`${b.id}/${s.id}: Auswahl braucht mindestens zwei Optionen`);
          if (s.default !== undefined && !(s.default >= 0 && s.default < s.optionen.length)) fehler.push(`${b.id}/${s.id}: ungültige Vorgabe`);
          break;
        case "befund":
          if (!s.chip) fehler.push(`${b.id}/${s.id}: Kurzbezeichnung fehlt`);
          if (!s.abweichung.trim()) fehler.push(`${b.id}/${s.id}: Abweichungstext fehlt`);
          pruefeSlots(`${b.id}/${s.id}`, s.abweichung, s.slots, fehler);
          break;
        case "option":
          if (!s.label || !s.text.trim()) fehler.push(`${b.id}/${s.id}: Bezeichnung oder Text fehlt`);
          pruefeSlots(`${b.id}/${s.id}`, s.text, s.slots, fehler);
          break;
        case "messwert":
          if (!s.vorlage.includes("{w}")) fehler.push(`${b.id}/${s.id}: {w} fehlt`);
          break;
      }
    }
    for (const p of b.platzhalter) if (!benutzt.has(p.id)) fehler.push(`${b.id}: Platzhalter ${p.id} unbenutzt`);
  }
  melde(fehler);
});

test("Vorlagen verweisen nur auf vorhandene Bausteine im passenden Abschnitt", () => {
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    if (!/^(zna|station)-[a-z0-9-]+$/.test(v.id)) fehler.push(`${v.id}: ID beginnt mit zna- oder station-`);
    if (!STATUS.includes(v.status)) fehler.push(`${v.id}: Prüfstatus ungültig`);
    const typ = KATALOG.brieftypen.find((t) => t.setting === v.setting);
    if (!typ) fehler.push(`${v.id}: kein Brieftyp für ${v.setting}`);
    const gesehen = new Set<string>();
    for (const [abschnitt, ids] of Object.entries(v.abschnitte)) {
      if (typ && !typ.abschnitte.some((a) => a.id === abschnitt)) fehler.push(`${v.id}: Abschnitt ${abschnitt} gibt es im Brieftyp nicht`);
      for (const id of ids ?? []) {
        if (!index.bausteine.has(id)) fehler.push(`${v.id}: Baustein ${id} fehlt`);
        if (gesehen.has(id)) fehler.push(`${v.id}: Baustein ${id} doppelt`);
        gesehen.add(id);
      }
    }
    // Entweder-oder-Stellen: mindestens zwei Bausteine, die es gibt und die nicht schon fest in der Vorlage stehen.
    for (const w of v.wahl ?? []) {
      if (!w.label.trim().endsWith("?")) fehler.push(`${v.id}: Wahlstelle „${w.label}“ ist als Frage zu benennen`);
      if (typ && !typ.abschnitte.some((a) => a.id === w.abschnitt)) fehler.push(`${v.id}: Wahlstelle in Abschnitt ${w.abschnitt}, den es im Brieftyp nicht gibt`);
      if (w.bausteine.length < 2) fehler.push(`${v.id}: Wahlstelle „${w.label}“ braucht mindestens zwei Bausteine`);
      for (const id of w.bausteine) {
        if (!index.bausteine.has(id)) fehler.push(`${v.id}: Wahlstelle „${w.label}“: Baustein ${id} fehlt`);
        if (gesehen.has(id)) fehler.push(`${v.id}: Wahlstelle „${w.label}“: Baustein ${id} steht schon in der Vorlage`);
        gesehen.add(id);
      }
    }
  }
  melde(fehler);
});

test("Vorlagen und Entweder-oder-Stellen haben nur bekannte Felder (CR-T1-03)", () => {
  // Ein falsch geschriebenes Feld („Vor“, „nach“, „vor “) wirkt nicht, und kein anderer Test sähe es: Die Stelle stünde
  // still am Ende des Abschnitts. Die Listen folgen `Vorlage` und `Wahlstelle` in `src/model/types.ts`.
  const VORLAGE = new Set(["id", "titel", "suchbegriffe", "kuerzel", "region", "setting", "abschnitte", "entscheiden", "ohne", "vorgaben", "weglassen", "schnellwerte", "wahl", "status", "quelle"]);
  const STELLE = new Set(["abschnitt", "label", "bausteine", "vor"]);
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    for (const k of Object.keys(v)) if (!VORLAGE.has(k)) fehler.push(`${v.id}: unbekanntes Feld „${k}“`);
    for (const w of v.wahl ?? []) for (const k of Object.keys(w)) if (!STELLE.has(k)) fehler.push(`${v.id}: Stelle „${w.label}“: unbekanntes Feld „${k}“`);
  }
  melde(fehler);
});

test("Platz einer Entweder-oder-Stelle: `vor` zeigt auf einen festen Baustein im Abschnitt der Stelle", () => {
  // Läuft die Angabe ins Leere, stünde die Stelle still am Ende des Abschnitts statt an dem Platz, den die Redaktion meint.
  melde(KATALOG.vorlagen.flatMap((v) => wahlPlatzFehler(v, index)));
});

test("Probelauf T1 (Kopien, Katalog unverändert): Unfall oder Beschwerden an erster Stelle, der Einleitungssatz steht vorn", () => {
  // Wie die Redaktion die drei Stationsvorlagen umbauen will (Redaktion 15, Teil A): `ana-st-unfall` aus `abschnitte`, dafür eine Stelle.
  const fehler: string[] = [];
  for (const id of ["station-beckenringfraktur-konservativ", "station-periprothetische-femurfraktur-huefte", "station-periprothetische-fraktur-knie"]) {
    const orig = index.vorlagen.get(id);
    assert.ok(orig, id);
    const rest = (orig.abschnitte.anamnese ?? []).filter((b) => b !== "ana-st-unfall");
    assert.ok(rest.length > 0 && rest.length < (orig.abschnitte.anamnese ?? []).length, `${id}: Ausgangslage hat sich geändert`);
    const nr = (orig.wahl ?? []).length;
    const key = `wahl/anamnese/${nr}`;
    const kopie = (vor?: string): Vorlage => ({
      ...orig,
      id: `${id}-t1${vor ? "" : "-ende"}`,
      abschnitte: { ...orig.abschnitte, anamnese: rest },
      wahl: [...(orig.wahl ?? []), { abschnitt: "anamnese", label: "Unfall oder Beschwerden ohne Unfall?", bausteine: ["ana-st-unfall", "ana-st-beschwerden"], ...(vor ? { vor } : {}) }],
    });
    const mit = kopie(rest[0]);
    const ohne = kopie();
    const idx = indexiere({ ...KATALOG, vorlagen: [...KATALOG.vorlagen, mit, ohne] });
    if (wahlPlatzFehler(mit, idx).length) fehler.push(...wahlPlatzFehler(mit, idx));
    const start = (v: Vorlage) => mitPerson(mitSeite(mitVorlage(neuerFall("station", idx), v, idx), "links"), "w", "82");
    const anamnese = (f: Fall) => renderBrief(f, idx).abschnitte.find((a) => a.id === "anamnese")!;
    const offen = anamnese(start(mit));
    if (offen.tokens[0]?.key !== key) fehler.push(`${id}: offene Stelle steht nicht am Anfang: ${offen.text.slice(0, 80)}`);
    for (const bid of ["ana-st-unfall", "ana-st-beschwerden"]) {
      const a = anamnese(mitWahl(start(mit), key, bid, idx));
      if (a.tokens[0]?.bausteinId !== bid || !a.text.startsWith("Die 82-jährige Patientin stellte sich ‹Art der Vorstellung› in unserer Notaufnahme vor.")) {
        fehler.push(`${id} mit ${bid}: Einleitungssatz nicht am Anfang: ${a.text.slice(0, 80)}`);
      }
      // Gegenprobe ohne `vor`: das alte Verhalten, das die Redaktion blockiert hat.
      const alt = anamnese(mitWahl(start(ohne), key, bid, idx));
      if (alt.tokens[0]?.bausteinId === bid) fehler.push(`${id} ohne vor: Gegenprobe greift nicht`);
      if (alt.text.split("\n").filter((z) => z.startsWith("Die 82-jährige Patientin stellte sich")).length !== 1) fehler.push(`${id} ohne vor: Einleitungssatz fehlt`);
    }
  }
  melde(fehler);
});

test("Vorgaben und zu entscheidende Befunde zeigen auf vorhandene Stellen der Vorlage", () => {
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    const eigene = new Set([...Object.values(v.abschnitte).flat(), ...(v.wahl ?? []).flatMap((w) => w.bausteine)]);
    const pruefe = (art: string, key: string, erwartet: string[]) => {
      const [bid, id, slotId] = key.split("/");
      const b = index.bausteine.get(bid);
      if (!b || !eigene.has(bid)) return void fehler.push(`${v.id}: ${art} ${key}: Baustein gehört nicht zur Vorlage`);
      const seg = b.segmente.find((s) => "id" in s && s.id === id);
      if (!seg || !erwartet.includes(seg.art)) return void fehler.push(`${v.id}: ${art} ${key}: kein passendes Segment`);
      if (slotId !== undefined) {
        const slots = "slots" in seg ? (seg.slots ?? []) : [];
        const slot = slots.find((s) => s.id === slotId);
        if (!slot || slot.art !== "auswahl") return void fehler.push(`${v.id}: ${art} ${key}: Auswahl-Slot fehlt`);
        const wahl = v.vorgaben?.slots?.[key];
        if (wahl === undefined || !(wahl >= 0 && wahl < slot.optionen.length) || slot.optionen[wahl] === "") fehler.push(`${v.id}: ${art} ${key}: Vorgabe zeigt auf keine Option`);
      }
      // Ein Befund ohne Normaltext darf Pflichtlücke sein (Stabilitätstest, Bewegungsausmaß): Der Arzt gibt ihn an oder kennzeichnet ihn als nicht untersucht.
      if (art === "entscheiden" && seg.art === "befund" && seg.selten) fehler.push(`${v.id}: entscheiden ${key}: ein selten erhobener Befund kann nicht Pflicht sein`);
    };
    for (const k of v.entscheiden ?? []) pruefe("entscheiden", k, ["befund", "messwert"]);
    for (const k of [...(v.vorgaben?.an ?? []), ...(v.vorgaben?.aus ?? [])]) pruefe("Vorgabe", k, ["option"]);
    for (const k of Object.keys(v.vorgaben?.slots ?? {})) {
      if (k.split("/").length !== 3) fehler.push(`${v.id}: Vorgabe ${k}: Slot-Schlüssel braucht drei Teile`);
      else pruefe("Vorgabe", k, ["option"]);
    }
    for (const [k, wahl] of Object.entries(v.vorgaben?.auswahl ?? {})) {
      pruefe("Vorgabe", k, ["auswahl"]);
      const [bid, id] = k.split("/");
      const seg = index.bausteine.get(bid)?.segmente.find((s) => "id" in s && s.id === id);
      if (seg?.art === "auswahl" && !(wahl >= 0 && wahl < seg.optionen.length)) fehler.push(`${v.id}: Vorgabe ${k} zeigt auf keine Option`);
    }
  }
  melde(fehler);
});

test("Weglassen: nur zuwählbare Sätze, jeder mit Ersatzstellen, die Pflichtauswahlen anderer Bausteine der Vorlage sind", () => {
  // Ein weggelassener Satz ist für den Arzt unsichtbar. Er darf nichts sein, was ohne Klick im Brief stünde, was die Vorlage
  // verlangt oder worauf ein Knopf baut; und er fehlt nur, solange eine Pflichtauswahl dieselbe Aussage abfragt.
  melde(KATALOG.vorlagen.flatMap((v) => weglassenFehler(v, index)));
});

test("Weglassen: den allgemeinen Tetanussatz ersetzt nur eine Auswahl, die eine Impfung ausdrücklich anbietet", () => {
  // „Keine Auffrischung nötig“ ersetzt den Satz „Tetanusschutz nach Aufklärung aufgefrischt.“ nicht; gesucht ist die gegebene Impfung.
  const impfung = /impfung.*nach Aufklärung verabreicht/i;
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    for (const stelle of v.weglassen?.["th-zna/tetanus"] ?? []) {
      const [bid, id] = stelle.split("/");
      const seg = index.bausteine.get(bid)?.segmente.find((s) => "id" in s && s.id === id);
      if (seg?.art !== "auswahl" || !seg.optionen.some((o) => impfung.test(o))) fehler.push(`${v.id}: Ersatzstelle ${stelle} bietet keine Tetanusimpfung an`);
    }
  }
  melde(fehler);
});

test("Schnellwerte je Vorlage: nur an Freitext- und Begriffsfeldern und Angaben `detail` der Vorlage, sauber, ohne Seitenwort, nicht an einer Sammelangabe", () => {
  melde(KATALOG.vorlagen.flatMap((v) => schnellwerteFehler(v, index)));
});

test("Unfallhergang: jede Vorlage mit Unfallanamnese hat eigene Schnellwerte oder nutzt die Katalogliste ausdrücklich", () => {
  // Die Katalogliste ist allgemein gehalten (Fachdurchsicht Schnellwerte, 04.11.2026). Eine neue Vorlage ohne eigene
  // Liste böte sonst Hergänge anderer Diagnosen zum Anklicken an.
  const KATALOGLISTE: Record<string, string[]> = {
    "ana-trauma/hergang": ["zna-frei"],
    "ana-st-unfall/hergang": ["station-frei", "station-frei-konservativ"],
  };
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    const ids = new Set([...Object.values(v.abschnitte).flat(), ...(v.wahl ?? []).flatMap((w) => w.bausteine)]);
    for (const [feld, ausnahmen] of Object.entries(KATALOGLISTE)) {
      if (!ids.has(feld.split("/")[0]) || ausnahmen.includes(v.id)) continue;
      if (!v.schnellwerte?.[feld]) fehler.push(`${v.id}: ${feld} ohne eigene Schnellwerte`);
    }
  }
  melde(fehler);
});

test("Sammelangaben: nur Pflichtfelder ohne Vorbelegung und nur Schnellwerte, die es am Feld schon gibt", () => {
  // Leer heißt beim Knopf: eine offene Lücke. Vorbelegung, Ersatztext oder eine Vorgabe der Vorlage machten daraus
  // einen grauen Vorschlag oder festen Text, und der Knopf verschwände still in genau dieser Vorlage.
  const fehler: string[] = [];
  const vorgegeben = new Set(KATALOG.vorlagen.flatMap((v) => [...(v.vorgaben?.an ?? []), ...(v.vorgaben?.aus ?? []), ...Object.keys(v.vorgaben?.auswahl ?? {}), ...Object.keys(v.vorgaben?.slots ?? {})]));
  for (const b of alle) {
    if (!b.sammelangabe) continue;
    const ort = `${b.id} (sammelangabe)`;
    const angaben = b.sammelangabe.angaben ?? [];
    // Für eine einzelne Angabe gibt es den Schnellwert am Feld; der Knopf lohnt erst ab zwei.
    if (angaben.length < 2) fehler.push(`${ort}: mindestens zwei Angaben`);
    const refs = angaben.map((t) => t.ref);
    for (const r of refs.filter((r, i) => refs.indexOf(r) !== i)) fehler.push(`${ort}: ${r} doppelt`);
    for (const t of angaben) {
      if (!/^keine /.test(t.aussage ?? "")) fehler.push(`${ort}: ${t.ref}: Aussage „${t.aussage}“ beginnt nicht mit „keine“`);
      const def = b.platzhalter.find((p) => p.id === t.ref);
      if (!def || !b.segmente.some((s) => s.art === "platzhalter" && s.ref === t.ref)) {
        fehler.push(`${ort}: ${t.ref} ist kein Feld im Text des Bausteins`);
        continue;
      }
      if (!def.required) fehler.push(`${ort}: ${t.ref} ist keine Pflichtangabe`);
      if (def.default !== undefined) fehler.push(`${ort}: ${t.ref} hat eine Vorbelegung (default)`);
      if (def.leerMarker !== undefined) fehler.push(`${ort}: ${t.ref} hat einen Ersatztext (leerMarker)`);
      if (!(def.vorschlaege ?? []).includes(t.wert)) fehler.push(`${ort}: „${t.wert}“ ist kein Schnellwert von ${t.ref}`);
      for (const k of vorgegeben) if (k === `${b.id}/${t.ref}` || k.startsWith(`${b.id}/${t.ref}/`)) fehler.push(`${ort}: ${t.ref} hat eine Vorgabe in einer Vorlage (${k})`);
    }
  }
  melde(fehler);
});

test("Die Gerinnungshemmung gehört in keinem Baustein zur Sammelangabe", () => {
  // E-39: In vielen Lagen entscheidet sie über das Procedere (Kopf, Hämatom, Operation, Prothese). Sie bleibt überall eine eigene Frage.
  const fehler: string[] = [];
  for (const b of alle) {
    for (const t of b.sammelangabe?.angaben ?? []) {
      const def = b.platzhalter.find((p) => p.id === t.ref);
      if (/gerinnung|antikoag|blutverdünn|marcumar|thrombozyt/i.test(`${t.ref} ${t.aussage} ${def?.label ?? ""}`)) fehler.push(`${b.id}: ${t.ref} („${t.aussage}“)`);
    }
  }
  melde(fehler);
});

test("Sammelangabe: jede Gerinnungshemmung im selben Baustein blendet den Knopf aus, sobald sie etwas außer „keine“ nennt", () => {
  // Nachprüfung Patientensicherheit vom 03.11.2026, N-1: sonst stünde „Dauermedikation: keine“ neben einem gewählten Wirkstoff.
  const fehler: string[] = [];
  for (const b of alle) {
    if (!b.sammelangabe) continue;
    const sperren = b.sammelangabe.ausblendenBei ?? [];
    for (const sp of sperren) {
      const [id, slotId] = sp.ref.split("/");
      const seg = b.segmente.find((s) => s.art === "option" && s.id === id);
      const slot = seg?.art === "option" ? seg.slots?.find((s) => s.id === slotId) : undefined;
      const def = slotId === undefined ? b.platzhalter.find((p) => p.id === id) : undefined;
      if (slotId === undefined ? !def || !b.segmente.some((s) => s.art === "platzhalter" && s.ref === id) : !slot) {
        fehler.push(`${b.id}: ausblendenBei ${sp.ref} gibt es im Baustein nicht`);
        continue;
      }
      for (const w of sp.ausser ?? []) {
        const gibt = slot?.art === "auswahl" ? slot.optionen.some((o) => o.trim() === w.trim()) : (def?.vorschlaege ?? []).includes(w);
        if (!gibt) fehler.push(`${b.id}: ausblendenBei ${sp.ref}: „${w}“ ist dort kein wählbarer Wert`);
      }
    }
    // Vollständig: jeder Satz und jedes Feld zur Gerinnungshemmung im Baustein steht in der Liste.
    for (const seg of b.segmente) {
      if (seg.art === "option" && /gerinnungshemm|antikoag/i.test(`${seg.label ?? ""} ${seg.text}`)) {
        for (const sl of seg.slots ?? []) if (!sperren.some((sp) => sp.ref === `${seg.id}/${sl.id}`)) fehler.push(`${b.id}: ${seg.id}/${sl.id} fehlt in ausblendenBei`);
      }
    }
    for (const p of b.platzhalter) if (/gerinnungshemm|antikoag/i.test(p.label) && !sperren.some((sp) => sp.ref === p.id)) fehler.push(`${b.id}: ${p.id} fehlt in ausblendenBei`);
  }
  melde(fehler);
  // Im echten Katalog: Apixaban gewählt, kein Knopf; „keine“ gewählt, Knopf mit allen drei Angaben.
  const osg = index.vorlagen.get("zna-osg-distorsion")!;
  const start = mitVorlage(neuerFall("zna", index), osg, index);
  assert.deepEqual(sammelSchritte(mitAngabe(start, "ana-trauma/antikoagulation", "ana-trauma/antikoagulation/was", "3"), "ana-trauma", index), []);
  assert.equal(sammelSchritte(mitAngabe(start, "ana-trauma/antikoagulation", "ana-trauma/antikoagulation/was", "1"), "ana-trauma", index).length, 3);
});

test("Leere Vorgeschichte in jeder Vorlage: der Klick schließt genau diese Lücken, die Gerinnungshemmung bleibt offen, der Text bleibt sauber", () => {
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    let fall = mitPerson(mitSeite(mitVorlage(neuerFall(v.setting, index), v, index), "links"), "w", "52");
    for (const bid of Object.values(v.abschnitte).flat()) {
      const b = index.bausteine.get(bid);
      if (!b?.sammelangabe) continue;
      const schritte = sammelSchritte(fall, bid, index);
      if (schritte.length !== b.sammelangabe.angaben.length) fehler.push(`${v.id}: Knopf von ${bid} setzt ${schritte.length} von ${b.sammelangabe.angaben.length} Angaben`);
      const vorher = renderBrief(fall, index).abschnitte.flatMap((a) => a.tokens);
      fall = mitSammelangabe(fall, bid, index).fall;
      const nachher = renderBrief(fall, index).abschnitte.flatMap((a) => a.tokens);
      for (const s of schritte) {
        const t = nachher.find((x) => x.key === s.key);
        if (t?.zustand !== "gesetzt") fehler.push(`${v.id}: ${s.key} nach dem Klick ${t?.zustand ?? "nicht im Brief"}`);
      }
      // Nichts außer den genannten Angaben ändert sich, auch nicht die Gerinnungshemmung.
      for (const t of nachher) {
        if (!t.key || schritte.some((s) => s.key === t.key)) continue;
        const alt = vorher.find((x) => x.key === t.key);
        if (alt && alt.zustand !== t.zustand) fehler.push(`${v.id}: ${t.key} von ${alt.zustand} zu ${t.zustand}`);
      }
      if (sammelSchritte(fall, bid, index).length > 0) fehler.push(`${v.id}: ${bid} hat nach dem Klick noch einen Knopf`);
    }
    const text = briefText(renderBrief(fall, index));
    if (/ {2}| [.,;:]|\.\./.test(text.replace(/‹[^›]*›/g, "X"))) fehler.push(`${v.id}: Text nach dem Klick nicht sauber`);
  }
  melde(fehler);
});

test("Abgleich im echten Katalog: leere Vorgeschichte aus dem Knopf gegen eine einzeln genannte Gerinnungshemmung", () => {
  const gerinnung = (f: Fall) =>
    findeAbgleichhinweise(renderBrief(f, index), ABGLEICHREGELN)
      .map((h) => h.text)
      .filter((t) => t.startsWith("Gerinnungshemmung:"));
  // Notaufnahme: Knopf, dann Apixaban einzeln gewählt.
  const osg = index.vorlagen.get("zna-osg-distorsion")!;
  let fall = mitSammelangabe(mitSeite(mitVorlage(neuerFall("zna", index), osg, index), "rechts"), "ana-trauma", index).fall;
  assert.deepEqual(gerinnung(fall), []);
  fall = mitAngabe(fall, "ana-trauma/antikoagulation", "ana-trauma/antikoagulation/was", "3");
  assert.match(renderBrief(fall, index).abschnitte.find((a) => a.id === "anamnese")!.text, /Dauermedikation: keine\. Gerinnungshemmende Medikamente: Apixaban\./);
  assert.deepEqual(gerinnung(fall), ["Gerinnungshemmung: Die Anamnese nennt keine Dauermedikation, aber ein gerinnungshemmendes Medikament."]);
  // Kopfverletzung: Gerinnungshemmung einzeln verneint, Diagnose und Procedere setzen eine voraus.
  const sht = index.vorlagen.get("zna-schaedel-hirn-trauma")!;
  fall = mitSammelangabe(mitVorlage(neuerFall("zna", index), sht, index), "ana-trauma", index).fall;
  fall = mitAngabe(fall, "ana-trauma/antikoagulation", "ana-trauma/antikoagulation/was", "1");
  assert.deepEqual(gerinnung(fall), []);
  fall = mitAuswahl(fall, "dx-sht-leicht/zusatz", 1);
  fall = mitAngabe(fall, "sht-procedere/gerinnung", "sht-procedere/gerinnung/weiter", "1");
  assert.deepEqual(gerinnung(fall), [
    "Gerinnungshemmung: Die Anamnese verneint gerinnungshemmende Medikamente, das Procedere setzt eine Gerinnungshemmung voraus.",
    "Gerinnungshemmung: Die Anamnese verneint gerinnungshemmende Medikamente, die Diagnose nennt eine gerinnungshemmende Medikation.",
  ]);
});

test("Abgleich im echten Katalog: zwei Tetanusaussagen werden gemeldet; jede Option jeder Tetanus-Pflichtwahl allein meldet nichts", () => {
  const tetanus = (f: Fall) =>
    findeAbgleichhinweise(renderBrief(f, index), ABGLEICHREGELN)
      .map((h) => h.text)
      .filter((t) => t.startsWith("Tetanus:"));
  // Ohne den allgemeinen Satz: keine Option einer eigenen Tetanuswahl darf anschlagen (Gegenprobe zu PS-01).
  const fehler: string[] = [];
  let geprueft = 0;
  for (const v of KATALOG.vorlagen) {
    const wahlAbschnitt = new Map((v.wahl ?? []).flatMap((w) => w.bausteine.map((bid) => [bid, w.abschnitt] as const)));
    const ids = [...Object.values(v.abschnitte).flat(), ...wahlAbschnitt.keys()];
    for (const bid of ids) {
      const seg = index.bausteine.get(bid)?.segmente.find((s) => s.art === "auswahl" && s.id === "tetanus");
      if (seg?.art !== "auswahl") continue;
      for (let i = 0; i < seg.optionen.length; i++) {
        let fall = mitSeite(mitVorlage(neuerFall(v.setting, index), v, index), "links");
        const ab = wahlAbschnitt.get(bid);
        if (ab) fall = mitBaustein(fall, bid, index, ab);
        fall = mitAuswahl(fall, `${bid}/tetanus`, i);
        geprueft++;
        const h = tetanus(fall);
        if (h.length) fehler.push(`${v.id} ${bid} Option ${i}: ${h.join(" ")}`);
      }
    }
  }
  assert.ok(geprueft > 100, `nur ${geprueft} Fälle geprüft`);
  melde(fehler);
  // Der allgemeine Satz neben einer eigenen Wahl, in Therapie und im Procedere.
  const wunde = index.vorlagen.get("zna-wunde")!;
  let fall = mitOption(mitSeite(mitVorlage(neuerFall("zna", index), wunde, index), "links"), "th-zna/tetanus", true);
  fall = mitAuswahl(fall, "th-wunde-versorgung/tetanus", 0);
  assert.deepEqual(tetanus(fall), ["Tetanus: Die Therapie nennt zwei Tetanusaussagen."]);
  const finger = index.vorlagen.get("zna-fingerfraktur-konservativ")!;
  fall = mitOption(mitSeite(mitVorlage(neuerFall("zna", index), finger, index), "rechts"), "th-zna/tetanus", true);
  fall = mitAuswahl(mitBaustein(fall, "proc-fraktur-hand-offen-ohne-antibiotikum", index, "procedere"), "proc-fraktur-hand-offen-ohne-antibiotikum/tetanus", 0);
  assert.deepEqual(tetanus(fall), ["Tetanus: Therapie und Procedere nennen je eine Tetanusaussage."]);
});

test("Jede Vorlage ergibt einen sauberen Text", () => {
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    for (const liste of ["striche", "fliesstext"] as const) {
      let fall = mitVorlage(neuerFall(v.setting, index), v, index);
      fall = mitPerson(mitSeite(fall, "links"), "w", "52");
      const text = briefText(renderBrief(fall, index, { listen: liste }));
      const ohneLuecken = text.replace(/‹[^›]*›/g, "X");
      if (!text.trim()) fehler.push(`${v.id}: leerer Brief`);
      if (/ {2}/.test(text)) fehler.push(`${v.id}: doppeltes Leerzeichen`);
      if (/ [.,;:]/.test(text)) fehler.push(`${v.id}: Leerzeichen vor Satzzeichen`);
      if (/\{[a-zA-Z0-9_-]+\}/.test(text)) fehler.push(`${v.id}: unaufgelöste Slot-Stelle`);
      if (/\.\.|,,|\(\s*\)/.test(ohneLuecken)) fehler.push(`${v.id}: doppelte Satzzeichen oder leere Klammer`);
      if (/[a-zäöüß)]\.[A-ZÄÖÜ]/.test(ohneLuecken)) fehler.push(`${v.id}: Sätze kleben zusammen`);
      if (/(XXX|___|SEITE)/.test(text)) fehler.push(`${v.id}: Platzhalter aus dem Hausdokument im Text`);
    }
  }
  melde([...new Set(fehler)]);
});

test("Alle Katalogtexte kommen in jedem Klinikprogramm unverändert an", () => {
  const fehler: string[] = [];
  for (const b of alle) for (const t of texte(b)) if (!istKisSicher(t.text)) fehler.push(`${t.ort}: Zeichen außerhalb des sicheren Vorrats in „${t.text.slice(0, 50)}“`);
  melde(fehler);
});

// --- Regeln aus der Sicherheitsprüfung -------------------------------------------

/**
 * Sätze eines Bausteins, die vollständig aus festem Text bestehen. Ein Satz mit
 * einem Feld, einer Auswahl, einem Befund oder einer Option ist keiner: Ihn
 * muss der Arzt ausfüllen, wählen oder übernehmen.
 */
function festeSaetze(b: Baustein): string[] {
  const geruest = b.segmente.map((s) => (s.art === "text" ? s.text : s.art === "punkt" || s.art === "absatz" ? "\n" : "§")).join("");
  return geruest
    .split(/(?<=[.!?])\s+|\n/)
    .map((x) => x.trim())
    .filter((x) => !x.includes("§") && /\p{L}{3,}/u.test(x) && /[.!?]$/.test(x) && x.split(/\s+/).length >= 2);
}

test("Regel 1: kein Satz aus rein festem Text in Befund, Therapie, Verlauf, Procedere, Medikation", () => {
  // Fester Text steht sofort schwarz im Brief. Jede Aussage über den Patienten muss deshalb ein Befund,
  // eine Option oder ein Satz mit Pflichtangabe sein, damit der Arzt sie übernimmt, wählt oder einträgt.
  const fehler: string[] = [];
  const betroffen = ["befund", "entlassbefund", "therapie", "verlauf", "procedere", "medikation"];
  for (const b of alle) {
    if (!betroffen.includes(abschnittVon(b))) continue;
    for (const satz of festeSaetze(b)) fehler.push(`${b.id}: fester Satz „${satz.slice(0, 70)}“`);
  }
  melde(fehler);
});

test("Regel 2: jeder Befund gehört zu einer Untersuchungsgruppe", () => {
  const fehler: string[] = [];
  for (const b of alle) for (const s of b.segmente) if (s.art === "befund" && !s.gruppe?.trim()) fehler.push(`${b.id}/${s.id}: gruppe fehlt`);
  melde(fehler);
});

test("Regel 3: ein Befund ohne Normaltext trägt als Abweichung keinen Normalbefund", () => {
  const fehler: string[] = [];
  for (const b of alle) {
    for (const s of b.segmente) {
      if (s.art === "befund" && !s.normal.trim() && /^\s*(Unauffällig|Kein|Keine|Ohne|Nicht|Regelrecht|Intakt|Frei|Stabil)/i.test(s.abweichung)) {
        fehler.push(`${b.id}/${s.id}: „${s.abweichung.trim().slice(0, 50)}“ ist ein Normalbefund. Als normal eintragen und selten: true setzen.`);
      }
    }
  }
  melde(fehler);
});

test("Regel 6: kein Normalbefund trägt einen Skalenwert, der gemessen sein müsste (Glasgow Coma Scale, Kraftgrad)", () => {
  const fehler: string[] = [];
  for (const b of alle) {
    for (const s of b.segmente) {
      if (s.art === "befund" && /Glasgow Coma Scale \d|\b\d\/5\b/.test(s.normal)) fehler.push(`${b.id}/${s.id}: „${s.normal.trim()}“. Skalenwerte als Messwert oder in Worten.`);
    }
  }
  melde(fehler);
});

test("Regel 4: jede Auswahl sagt, was sie ist: Pflicht, Vorschlag (default) oder Formulierungsvariante", () => {
  // Ohne Angabe behandelt die Engine eine Auswahl als Pflicht. Die Angabe wird trotzdem verlangt,
  // damit die Redaktion bei jeder Auswahl entschieden hat, ob sie etwas vorschlägt.
  const fehler: string[] = [];
  for (const b of alle) {
    for (const s of b.segmente) {
      if (s.art !== "auswahl") continue;
      const angaben = [s.pflicht, s.variante, s.default !== undefined].filter(Boolean).length;
      if (angaben !== 1) fehler.push(`${b.id}/${s.id}: genau eines von pflicht, variante, default angeben (jetzt ${angaben})`);
    }
  }
  melde(fehler);
});

test("Regel 8: keine Zahl mit Einheit in festem Text von Therapie, Verlauf, Procedere, Medikation", () => {
  const fehler: string[] = [];
  const betroffen = ["therapie", "verlauf", "procedere", "medikation"];
  const muster = /\d+(?:[.,]\d+)?\s?(?:mg|g|ml|IE|kg|Tage?n?|Wochen?|Monate?n?|Stunden?)\b/;
  for (const b of alle) {
    if (!betroffen.includes(abschnittVon(b))) continue;
    for (const s of b.segmente) if (s.art === "text" && muster.test(s.text)) fehler.push(`${b.id}: „${s.text.trim().slice(0, 60)}“`);
  }
  melde(fehler);
});

test("Regel 9: kein fest geschriebenes „Patient“, „Patientin“ oder „Pat.“", () => {
  const fehler: string[] = [];
  for (const b of alle) for (const t of texte(b)) if (/\bPatient(in|en|innen)?\b|\bPat\./.test(t.text)) fehler.push(`${t.ort}: „${t.text.trim().slice(0, 60)}“`);
  melde(fehler);
});

const OHNE_LEITBEFUND = /-(frei|frei-konservativ)$|ganzkoerper|body-check/;

test("Regel 10: jede Vorlage mit Befundblock lässt mindestens einen Befund entscheiden", () => {
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    if (OHNE_LEITBEFUND.test(v.id)) continue;
    const hatBefund = [...(v.abschnitte.befund ?? []), ...(v.abschnitte.entlassbefund ?? [])].some((id) => index.bausteine.get(id)?.segmente.some((s) => s.art === "befund" && s.normal.trim() && !s.selten));
    if (hatBefund && !(v.entscheiden ?? []).length) fehler.push(`${v.id}: entscheiden ist leer`);
  }
  melde(fehler);
});

// Rippen und ausstrahlende Rückenschmerzen haben eine Seite; Kopf, Halswirbelsäule und der ganze Körper nicht.
const UNPAARIG = ["sht", "hws", "allgemeinbefund", "body-check"];

test("Regel 11: Vorlagen für unpaare Regionen verlangen keine Seite", () => {
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    if (!UNPAARIG.includes(v.region)) continue;
    const fall = mitPerson(mitVorlage(neuerFall(v.setting, index), v, index), "m", "50");
    const brief = renderBrief(fall, index);
    for (const a of brief.abschnitte) if (a.seiteFehlt) fehler.push(`${v.id}: Abschnitt ${a.titel} verlangt eine Seite`);
  }
  melde(fehler);
});

/** Wert, mit dem eine Angabe beantwortet ist: erste Möglichkeit mit Text, eine Zahl, ein Wort, eine Seite. */
function antwort(s: BefundSlot): string {
  if (s.art === "auswahl") return String(Math.max(0, s.optionen.findIndex((o) => o.trim() !== "")));
  if (s.art === "zahl") return "1";
  if (s.art === "lokaleSeite") return "rechts";
  return "x";
}

/** Text, den eine Angabe ohne Wahl des Arztes in den Satz schreibt (Vorgabe, sonst die erste Möglichkeit einer freiwilligen Auswahl). */
function textOhneWahl(s: BefundSlot): string {
  if (s.art === "auswahl") return s.optionen[s.default ?? (s.required ? -1 : 0)] ?? "";
  if (s.art === "zahl") return s.leerMarker ?? "";
  return "";
}

// R2-03 (Nachprüfung Patientensicherheit 08.11.2026), E-44 Satz 3 in der Fassung von E-45: Hinter der letzten
// Pflichtangabe eines gelben Satzes bekommt eine freiwillige Angabe keine Nummern, eine vorbelegte, die Text schreibt,
// schon. Die Nummernreihe läuft weiter, solange der Satz grau ist; der Test hält fest, dass jeder solche Satz nach den
// Pflichtangaben grau bleibt, und zählt beide Arten.
test("R2-03: vorbelegte Angaben hinter der letzten Pflichtangabe halten den Satz grau, freiwillige nicht", () => {
  const fehler: string[] = [];
  const vorbelegt = new Set<string>();
  const freiwillig = new Set<string>();
  const gesehen = new Set<string>();
  for (const b of alle) {
    if (gesehen.has(b.id)) continue;
    gesehen.add(b.id);
    for (const seg of b.segmente) {
      if (seg.art !== "option" || !seg.slots?.length) continue;
      const slots = seg.slots;
      const letzte = slots.map((s) => !!s.required).lastIndexOf(true);
      if (letzte < 0) continue;
      const dahinter = slots.slice(letzte + 1);
      const key = `${b.id}/${seg.id}`;
      const mitText = dahinter.filter((s) => textOhneWahl(s).trim() !== "");
      if (mitText.length > 0) vorbelegt.add(key);
      else if (dahinter.length > 0) freiwillig.add(key);
      if (mitText.length === 0) continue;
      let fall = mitSeite(mitBaustein(neuerFall("zna", index), b.id, index, abschnittVon(b)), "rechts");
      for (const s of slots.slice(0, letzte + 1)) if (s.required) fall = mitAngabe(fall, key, `${key}/${s.id}`, antwort(s));
      const t = renderBrief(fall, index)
        .abschnitte.flatMap((a) => a.tokens)
        .find((x) => x.key === key);
      if (t && t.zustand !== "vorschlag") fehler.push(`${key}: nach den Pflichtangaben ${t.zustand}, die vorbelegte Angabe bekäme keine Nummern`);
    }
  }
  melde(fehler);
  // Stand 08.11.2026; ändert sich der Katalog, ändern sich die Zahlen, und E-45 nennt sie neu.
  assert.equal(vorbelegt.size, 28, `vorbelegt: ${[...vorbelegt].join(", ")}`);
  assert.ok(freiwillig.size > 0);
  console.log(`R2-03: ${vorbelegt.size} Sätze mit vorbelegter Angabe hinter der letzten Pflichtangabe, ${freiwillig.size} mit nur freiwilligen`);
});
