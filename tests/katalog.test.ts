// Prüft die Katalogdaten gegen das Vorlagenformat (docs/04-technik/02-vorlagenformat.md)
// und gegen die Regeln aus der Sicherheitsprüfung (docs/03-inhalt/00-auftrag-inhaltsautoren.md, Nachtrag).
import { test } from "node:test";
import assert from "node:assert/strict";
import { KATALOG } from "../src/data/katalog.ts";
import { ALLE_ABSCHNITTE, abschnittVon } from "../src/model/types.ts";
import type { Baustein, BefundSlot, Fall, Vorlage } from "../src/model/types.ts";
import { BEZUG, briefText, indexiere, renderBrief } from "../src/engine/render.ts";
import { mitAngabe, mitAuswahl, mitBaustein, mitOption, mitPerson, mitSeite, mitVorlage, mitWahl, neuerFall, uebernehmen } from "../src/engine/fall.ts";
import { mitSammelangabe, sammelSchritte } from "../src/engine/sammel.ts";
import { findeAbgleichhinweise } from "../src/engine/abgleich.ts";
import { ABGLEICHREGELN } from "../src/data/abgleich.ts";
import { istKisSicher } from "../src/engine/text.ts";
import { istFragesatz, schnellwerteFehler, wahlPlatzFehler, weglassenFehler } from "../src/engine/vorlage.ts";

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
  const STELLE = new Set(["abschnitt", "label", "bausteine", "vor", "pflicht"]);
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    for (const k of Object.keys(v)) if (!VORLAGE.has(k)) fehler.push(`${v.id}: unbekanntes Feld „${k}“`);
    for (const w of v.wahl ?? []) for (const k of Object.keys(w)) if (!STELLE.has(k)) fehler.push(`${v.id}: Stelle „${w.label}“: unbekanntes Feld „${k}“`);
  }
  melde(fehler);
});

test("Pflichtstelle (PS-T1-01): jede Entweder-oder-Stelle, deren Baustein die Gerinnungshemmung fragt, ist `pflicht`", () => {
  // Sonst nähme „nichts davon“ Gerinnungshemmung, Allergien und Art der Vorstellung mit einem Klick aus dem Brief, und
  // die übrigen Bausteine des Abschnitts ließen ihn vollständig aussehen.
  const GERINNUNG = /gerinnung|antikoag/i;
  // Nur die Anamnese fragt; Bausteine im Procedere nennen die Gerinnungshemmung als Anweisung (pausieren, wieder beginnen).
  const fragtGerinnung = (bid: string) =>
    index.bausteine.get(bid)?.typ === "anamnese" &&
    (index.bausteine.get(bid)?.segmente ?? []).some(
      (s) =>
        "id" in s &&
        GERINNUNG.test(`${s.id} ${"label" in s ? s.label : ""}`) &&
        ((s.art === "option" && istFragesatz(`${bid}/${s.id}`, index)) || (s.art === "auswahl" && s.pflicht === true)),
    );
  const fehler: string[] = [];
  const gefunden: string[] = [];
  for (const v of KATALOG.vorlagen) {
    for (const w of v.wahl ?? []) {
      if (!w.bausteine.some(fragtGerinnung)) continue;
      gefunden.push(v.id);
      if (w.pflicht !== true) fehler.push(`${v.id}: Stelle „${w.label}“ fragt die Gerinnungshemmung und ist nicht pflicht`);
    }
  }
  // Gegenprobe gegen einen Test ohne Aussage: Die Stationsanamnese fragt die Gerinnungshemmung.
  assert.ok(gefunden.includes("station-frei") && gefunden.includes("station-kyphoplastie"), `gefunden: ${gefunden.join(", ")}`);
  melde(fehler);
});

test("Vorgaben gespiegelt (PS-T1-03): gleichnamige Sätze und Auswahlen der Bausteine einer Anamnese-Stelle haben in der Vorlage dieselben Vorgaben", () => {
  // Sonst fehlt auf einem Weg still, was die Vorlage auf dem anderen vorschlägt (Wohnsituation, Mobilität, Pflegegrad).
  const fehler: string[] = [];
  for (const v of KATALOG.vorlagen) {
    const g = v.vorgaben ?? {};
    const stand = (bid: string, id: string): string => {
      const k = `${bid}/${id}`;
      const slots = Object.entries(g.slots ?? {})
        .filter(([s]) => s.startsWith(`${k}/`))
        .map(([s, i]) => `${s.slice(k.length + 1)}=${i}`)
        .sort();
      return [g.an?.includes(k) ? "an" : "", g.aus?.includes(k) ? "aus" : "", g.auswahl?.[k] ?? "", ...slots].join("|");
    };
    // Nur die Anamnese: Im Procedere heißen Sätze verschiedener Wege gleich, sagen aber je Weg anderes (MRT ambulant oder
    // stationär, Belastung mit oder ohne Operation); dort sind verschiedene Vorgaben gewollt.
    for (const w of (v.wahl ?? []).filter((x) => x.abschnitt === "anamnese")) {
      const ids = w.bausteine.map((bid) => new Set((index.bausteine.get(bid)?.segmente ?? []).flatMap((s) => ("id" in s && (s.art === "option" || s.art === "auswahl") ? [s.id] : []))));
      w.bausteine.forEach((a, i) =>
        w.bausteine.forEach((b, j) => {
          if (j <= i) return;
          for (const id of ids[i]) {
            if (!ids[j].has(id)) continue;
            if (stand(a, id) !== stand(b, id)) fehler.push(`${v.id}: ${a}/${id} „${stand(a, id)}“, ${b}/${id} „${stand(b, id)}“`);
          }
        }),
      );
    }
  }
  melde(fehler);
});

test("Platz einer Entweder-oder-Stelle: `vor` zeigt auf einen festen Baustein im Abschnitt der Stelle", () => {
  // Läuft die Angabe ins Leere, stünde die Stelle still am Ende des Abschnitts statt an dem Platz, den die Redaktion meint.
  melde(KATALOG.vorlagen.flatMap((v) => wahlPlatzFehler(v, index)));
});

test("T1 in Becken, Hüfte, Knie: Pflichtstelle zuerst in der Anamnese, Einleitungssatz auf beiden Wegen vorn (CR-T1-05)", () => {
  // Ersetzt den Probelauf mit Kopien: Die Redaktion hat `ana-st-unfall` durch die Stelle ersetzt (Prüfliste PS-T1, Punkte 4 bis 6).
  const fehler: string[] = [];
  for (const id of ["station-beckenringfraktur-konservativ", "station-periprothetische-femurfraktur-huefte", "station-periprothetische-fraktur-knie"]) {
    const v = index.vorlagen.get(id);
    assert.ok(v, id);
    const nr = (v.wahl ?? []).findIndex((w) => w.abschnitt === "anamnese");
    const w = v.wahl?.[nr];
    if (!w) {
      fehler.push(`${id}: keine Stelle in der Anamnese`);
      continue;
    }
    if (w.bausteine.join() !== "ana-st-unfall,ana-st-beschwerden") fehler.push(`${id}: Bausteine ${w.bausteine.join()}, erwartet Unfall als Option 1`);
    if (!w.pflicht) fehler.push(`${id}: Stelle ist nicht pflicht`);
    if ((v.abschnitte.anamnese ?? []).includes("ana-st-unfall")) fehler.push(`${id}: ana-st-unfall steht noch fest in der Anamnese`);
    if (w.vor !== v.abschnitte.anamnese?.[0]) fehler.push(`${id}: vor ${w.vor}, erwartet ${v.abschnitte.anamnese?.[0]}`);
    const key = `wahl/anamnese/${nr}`;
    const start = mitPerson(mitSeite(mitVorlage(neuerFall("station", index), v, index), "links"), "w", "82");
    const anamnese = (f: Fall) => renderBrief(f, index).abschnitte.find((a) => a.id === "anamnese")!;
    const offen = anamnese(start);
    if (offen.tokens[0]?.key !== key) fehler.push(`${id}: offene Stelle steht nicht am Anfang: ${offen.text.slice(0, 80)}`);
    if (mitWahl(start, key, null, index) !== start) fehler.push(`${id}: „nichts davon“ wirkt`);
    for (const bid of w.bausteine) {
      const a = anamnese(mitWahl(start, key, bid, index));
      if (a.tokens[0]?.bausteinId !== bid || !a.text.startsWith("Die 82-jährige Patientin stellte sich ‹Art der Vorstellung› in unserer Notaufnahme vor.")) {
        fehler.push(`${id} mit ${bid}: Einleitungssatz nicht am Anfang: ${a.text.slice(0, 80)}`);
      }
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

test("Abgleich im echten Katalog (PS-T1-02): jeder Weg der Anamnese-Stelle allein meldet nichts; Sturz, Sturzursache, Unfallanker und beide Wege zugleich werden gemeldet", () => {
  const UNFALL = ["ana-st-unfall", "ana-trauma"];
  const BESCHWERDEN = ["ana-st-beschwerden", "ana-beschwerden"];
  const unfall = (f: Fall) =>
    findeAbgleichhinweise(renderBrief(f, index), ABGLEICHREGELN)
      .map((h) => h.text)
      .filter((t) => t.startsWith("Unfall:"));
  // Wie „Übernehmen ✓“ überall: Der Abgleich liest nur, was der Arzt zu seiner Aussage gemacht hat.
  const alles = (f: Fall) =>
    uebernehmen(f, renderBrief(f, index).abschnitte.flatMap((a) => a.tokens.filter((t) => t.zustand === "vorschlag" && t.key).map((t) => t.key!)), index);
  const fehler: string[] = [];
  let wege = 0;
  let proben = 0;
  for (const v of KATALOG.vorlagen) {
    (v.wahl ?? []).forEach((w, nr) => {
      if (w.abschnitt !== "anamnese") return;
      const key = `wahl/anamnese/${nr}`;
      const start = () => mitPerson(mitSeite(mitVorlage(neuerFall(v.setting, index), v, index), "links"), "w", "82");
      for (const bid of w.bausteine) {
        wege++;
        const h = unfall(alles(mitWahl(start(), key, bid, index)));
        if (h.length) fehler.push(`${v.id} ${bid} allein: ${h.join(" ")}`);
      }
      const ohne = w.bausteine.find((b) => BESCHWERDEN.includes(b));
      const mit = w.bausteine.find((b) => UNFALL.includes(b));
      if (!ohne) return;
      const weg = alles(mitWahl(start(), key, ohne, index));
      // Beschwerdeweg auch ohne den grauen Satz „Ein Unfall sei nicht erinnerlich.“: Dann trägt „Beginn der Beschwerden:“.
      for (const [name, f] of [["mit Satz", weg], ["ohne Satz", mitOption(weg, `${ohne}/kein-unfall`, false)]] as const) {
        const meldet = (g: Fall, was: string, soll: boolean) => {
          proben++;
          const h = unfall(g);
          if (soll && !h.length) fehler.push(`${v.id} ${name}: ${was} meldet nichts`);
          if (!soll && h.length) fehler.push(`${v.id} ${name}: ${was} meldet ${h.join(" ")}`);
        };
        for (const bid of Object.values(v.abschnitte).flat()) {
          const b = index.bausteine.get(bid)!;
          for (const seg of b.segmente) {
            // Ereignis in der Diagnose: jede Option mit Sturz oder Unfall meldet, „ohne erinnerlich…“ und leer nicht.
            if (b.typ === "diagnose" && seg.art === "auswahl" && seg.id === "ereignis") {
              seg.optionen.forEach((o, i) => meldet(mitAuswahl(f, `${bid}/ereignis`, i), `Ereignis „${o}“`, /Sturz|[Uu]nfall/.test(o) && !/ohne erinnerlich/.test(o)));
            }
            if (seg.art !== "option") continue;
            for (const sl of seg.slots ?? []) {
              if (sl.art !== "auswahl") continue;
              sl.optionen.forEach((o, i) => {
                // Sturzursache in den Diagnosen, Zeitanker in Diagnostik und Procedere: jede Option mit Unfall meldet, „nach der Aufnahme“ und „vor der Fraktur“ nicht.
                const sturz = bid === "dx-st-neben" && seg.id === "sturzursache" && o !== "";
                const satz = seg.text.replace(`{${sl.id}}`, o);
                const anker = (b.typ === "procedere" || b.typ === "diagnostik") && /(nach|vor) (dem Unfall|der Aufnahme|der Fraktur)/.test(satz);
                if (!sturz && !anker) return;
                // Ein Satz mit offener Angabe zählt im Abgleich noch nicht; die übrigen Angaben des Satzes werden gefüllt.
                let g = mitAngabe(f, `${bid}/${seg.id}`, `${bid}/${seg.id}/${sl.id}`, String(i));
                for (const x of seg.slots ?? []) {
                  if (x.id === sl.id) continue;
                  const wert = x.art === "auswahl" ? String(x.optionen.findIndex((y) => y !== "")) : x.art === "zahl" ? "6" : x.art === "detail" ? "Probe" : "rechts";
                  g = mitAngabe(g, `${bid}/${seg.id}`, `${bid}/${seg.id}/${x.id}`, wert);
                }
                meldet(g, `${bid}/${seg.id} „${o}“`, sturz || /(nach|vor) dem Unfall/.test(satz));
              });
            }
          }
        }
        if (mit) meldet(mitBaustein(f, mit, index, "anamnese"), `beide Wege (${mit} dazu)`, true);
      }
    });
  }
  assert.ok(wege >= 9 && proben > 100, `nur ${wege} Wege, ${proben} Proben`);
  melde(fehler);
});

test("Abgleich im echten Katalog: Gehhilfe im Entlassbefund und im Procedere, jede Kombination; spätere Ziele im Procedere zählen nicht", () => {
  // Eigene Einteilung des Tests, unabhängig von den Mustern der Regel.
  const art = (o: string) =>
    /ohne (Hilfsmittel|Gehhilfe)/.test(o) ? "ohne" : /Unterarmgehstützen/.test(o) ? "Stützen" : /Rollator/.test(o) ? "Rollator" : /Gehwagen/.test(o) ? "Gehwagen" : /Gehstock/.test(o) ? "Gehstock" : null;
  const gehhilfe = (f: Fall) =>
    findeAbgleichhinweise(renderBrief(f, index), ABGLEICHREGELN)
      .map((h) => h.text)
      .filter((t) => t.startsWith("Gehhilfe:"));
  type Stelle = { bid: string; seg: Extract<Baustein["segmente"][number], { art: "option" }>; slot: string };
  // Ein Satz mit offener Angabe zählt im Abgleich noch nicht; die übrigen Angaben des Satzes werden gefüllt.
  const setze = (f: Fall, st: Stelle, slot: string, i: number) => {
    let g = mitAngabe(f, `${st.bid}/${st.seg.id}`, `${st.bid}/${st.seg.id}/${slot}`, String(i));
    for (const x of st.seg.slots ?? []) {
      if (x.id === slot) continue;
      const wert = x.art === "auswahl" ? String(x.optionen.findIndex((y) => y !== "")) : x.art === "zahl" ? "6" : x.art === "detail" ? "Probe" : "rechts";
      g = mitAngabe(g, `${st.bid}/${st.seg.id}`, `${st.bid}/${st.seg.id}/${x.id}`, wert);
    }
    return g;
  };
  const optionen = (st: Stelle) => {
    const sl = (st.seg.slots ?? []).find((x) => x.id === st.slot);
    return sl?.art === "auswahl" ? sl.optionen : [];
  };
  const stellen = (bids: string[]) =>
    bids.flatMap((bid) =>
      index.bausteine.get(bid)!.segmente.flatMap((seg) => {
        if (seg.art !== "option" || !/Gehen ?\{/.test(seg.text)) return [];
        const sl = (seg.slots ?? []).find((x) => ["hilfsmittel", "womit", "gehhilfe"].includes(x.id));
        return sl ? [{ bid, seg, slot: sl.id }] : [];
      }),
    );
  const fehler: string[] = [];
  let paare = 0;
  let ziele = 0;
  for (const v of KATALOG.vorlagen) {
    const eb = stellen(v.abschnitte.entlassbefund ?? []);
    const pr = stellen(v.abschnitte.procedere ?? []);
    if (!eb.length || !pr.length) continue;
    const start = () => mitPerson(mitSeite(mitVorlage(neuerFall(v.setting, index), v, index), "rechts"), "w", "82");
    for (const e of eb) {
      for (const p of pr) {
        optionen(e).forEach((oe, i) => {
          if (oe === "") return;
          if (!art(oe)) fehler.push(`${e.bid}: Gehhilfe „${oe}“ hat keine Einteilung im Test`);
          optionen(p).forEach((op, j) => {
            if (op === "") return;
            if (!art(op)) fehler.push(`${p.bid}: Gehhilfe „${op}“ hat keine Einteilung im Test`);
            paare++;
            const h = gehhilfe(setze(setze(start(), e, e.slot, i), p, p.slot, j));
            const soll = art(oe) !== art(op);
            if (soll && !h.length) fehler.push(`${v.id}: „${oe}“ gegen „${op}“ meldet nichts`);
            if (!soll && h.length) fehler.push(`${v.id}: „${oe}“ und „${op}“ melden ${h.join(" ")}`);
          });
        });
      }
      // Spätere Ziele im Procedere („…, Gehen ohne Gehhilfe bis zum Ende der 6. Woche“, „Gehstützen abtrainieren“) sind
      // keine Gehhilfe zur Entlassung: Mit jeder Gehhilfe im Entlassbefund und ohne Gehen-Satz im Procedere meldet keins.
      for (const bid of v.abschnitte.procedere ?? []) {
        for (const seg of index.bausteine.get(bid)!.segmente) {
          if (seg.art !== "option" || pr.some((p) => p.bid === bid && p.seg.id === seg.id)) continue;
          for (const sl of seg.slots ?? []) {
            if (sl.art !== "auswahl") continue;
            sl.optionen.forEach((o, k) => {
              if (!/Gehhilfe|[Gg]ehstützen|Rollator|Gehwagen|Gehstock|ohne Hilfsmittel/.test(o)) return;
              optionen(e).forEach((oe, i) => {
                if (oe === "") return;
                ziele++;
                const h = gehhilfe(setze(setze(start(), e, e.slot, i), { bid, seg, slot: sl.id }, sl.id, k));
                if (h.length) fehler.push(`${v.id}: „${oe}“ mit ${bid}/${seg.id} „${o}“ meldet ${h.join(" ")}`);
              });
            });
          }
        }
      }
    }
  }
  assert.ok(paare > 300 && ziele >= 20, `nur ${paare} Paare, ${ziele} Ziele`);
  melde(fehler);
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

// --- Normalwerte am Messfeld (E-48 (10)) -------------------------------------------------------------------------

test("Normalwerte: jede Fundstelle gibt es im Katalog, in der genannten Datei, mit Feld und gegebenenfalls Slot", async () => {
  const { readFileSync } = await import("node:fs");
  const { NORMWERTE } = await import("../src/data/normwerte.ts");
  const fehler: string[] = [];
  const stellen = [...NORMWERTE.eintraege.flatMap((e) => e.fundstellen.map((f) => ({ f, wo: e.schluessel }))), ...NORMWERTE.tabelle.map((f) => ({ f, wo: "tabelle" }))];
  for (const { f, wo } of stellen) {
    const datei = JSON.parse(readFileSync(new URL(`../src/data/corpus/${f.datei}`, import.meta.url), "utf8")) as { regionen: { bausteine: Baustein[] }[] };
    const b = datei.regionen.flatMap((r) => r.bausteine).find((x) => x.id === f.baustein);
    const seg = b?.segmente.find((s) => "id" in s && s.id === f.segment);
    if (!b) fehler.push(`${wo}: Baustein ${f.baustein} nicht in ${f.datei}`);
    else if (!seg) fehler.push(`${wo}: Feld ${f.baustein}/${f.segment} fehlt`);
    else if (f.slot && !("slots" in seg && seg.slots?.some((sl) => sl.id === f.slot))) fehler.push(`${wo}: Slot ${f.slot} fehlt in ${f.baustein}/${f.segment}`);
  }
  melde(fehler);
});

test("Normalwerte: jedes Messfeld mit einem Bewegungspaar im Label hat einen Eintrag (Zuordnung über Fundstellen)", async () => {
  const { NORMWERTE } = await import("../src/data/normwerte.ts");
  const { normwertKarte } = await import("../src/engine/normwerte.ts");
  const karte = normwertKarte(NORMWERTE);
  const PAAR = /\p{L}+(ion|-)\/\p{L}+/u;
  const fehler: string[] = [];
  let geprueft = 0;
  for (const b of alle) {
    for (const s of b.segmente) {
      if (!("id" in s)) continue;
      const labels = [(s.art === "messwert" || s.art === "option") && PAAR.test(s.label) ? s.label : "", ...("slots" in s ? (s.slots ?? []) : []).filter((sl) => PAAR.test(sl.label)).map((sl) => sl.label)].filter(Boolean);
      if (labels.length === 0) continue;
      geprueft++;
      if (!karte.has(`${b.id}/${s.id}`)) fehler.push(`${b.id}/${s.id}: „${labels[0]}“ ohne Normalwert`);
    }
  }
  assert.ok(geprueft >= 20, `nur ${geprueft} Messfelder gefunden`);
  melde(fehler);
});

test("Normalwerte: Entscheidungen der Auftraggeberin vom 08.11.2026 sind umgesetzt", async () => {
  const { NORMWERTE } = await import("../src/data/normwerte.ts");
  const eintrag = (s: string) => NORMWERTE.eintraege.find((e) => e.schluessel === s);
  assert.equal(NORMWERTE.freigegeben, true);
  assert.equal(NORMWERTE.quelle, "Richtwerte nach Neutral-Null-Methode (deutsches Fachwissen), ärztlich freigegeben 08.11.2026");
  // Engere deutsche Spanne am Handgelenk; ohne jeden Beleg: Rückneigen beim Kinn-Jugulum-Abstand, Drehung von BWS und LWS.
  assert.equal(eintrag("handgelenk-ext-flex")?.normal, "35–60/0/50–60°");
  assert.doesNotMatch(eintrag("kinn-jugulum")?.normal ?? "", /Rückneig/);
  assert.equal(eintrag("bws-lws-rotation"), undefined);
  // Der gespiegelte Sondereintrag entfällt; Schulter knapp heißt wie überall „Außenrotation/Innenrotation“.
  assert.equal(eintrag("schulter-ir-ar"), undefined);
  const knapp = index.bausteine.get("schulter-unt-knapp")?.segmente.find((s) => "id" in s && s.id === "schulter-knapp-rom-iroaro");
  assert.ok(knapp?.art === "messwert" && knapp.label === "Außenrotation/Innenrotation" && knapp.vorlage.startsWith("Außenrotation/Innenrotation "));
  // Rotation von Schulter und Hüfte: Werte je Ausgangsstellung.
  assert.deepEqual(eintrag("schulter-ar-ir")?.stellungen?.map((s) => s.stellung), ["Oberarm anliegend", "in 90° Abduktion"]);
  assert.deepEqual(eintrag("huefte-ar-ir")?.stellungen?.map((s) => s.stellung), ["in 90° Hüftbeugung", "in Streckung"]);
  // Das Eingabebeispiel liegt im Normbereich (vorher 40/0/50 bei der Radial-/Ulnarabduktion).
  const beispiel = (opt: string) => {
    const s = index.bausteine.get("hand-untersuchung")?.segmente.find((x) => "id" in x && x.id === opt);
    return s && "slots" in s ? (s.slots?.[0]?.label ?? "") : "";
  };
  const [radial, , ulnar] = (/(\d+)\/0\/(\d+)/.exec(beispiel("hand-us-rom-radulnar")) ?? []).slice(1).flatMap((x) => [Number(x), 0]);
  assert.ok(radial >= 25 && radial <= 30 && ulnar >= 30 && ulnar <= 40, beispiel("hand-us-rom-radulnar"));
  assert.match(beispiel("hand-us-rom-prosup"), /80\/0\/80/);
});
