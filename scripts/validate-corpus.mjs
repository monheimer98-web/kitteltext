// Struktur-Validator für die Katalog-JSONs. Prüft gegen die Erwartungen aus
// src/model/types.ts. Läuft mit: node scripts/validate-corpus.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, "..", "src", "data", "corpus");

const SEG_ARTEN = ["text", "seite", "platzhalter", "auswahl", "befund", "messwert"];
const PH_TYPEN = ["zahl", "rom", "zeitraum", "auswahl", "begriff"];
const B_TYPEN = ["anamnese", "untersuchung", "befund", "procedere", "anordnung"];

let fehler = 0;
let warn = 0;
const bausteinIds = new Set();
const alleIds = new Set();

function err(msg) {
  console.error("  ✗ " + msg);
  fehler++;
}
function warnung(msg) {
  console.warn("  ⚠ " + msg);
  warn++;
}
function uniq(id, ctx) {
  if (alleIds.has(id)) err(`Doppelte ID "${id}" (${ctx})`);
  alleIds.add(id);
}

const dateien = readdirSync(dir).filter((f) => f.endsWith(".json"));
for (const datei of dateien) {
  console.log("\n" + datei);
  const data = JSON.parse(readFileSync(join(dir, datei), "utf8"));
  if (!Array.isArray(data.regionen)) {
    err("kein regionen-Array");
    continue;
  }
  for (const r of data.regionen) {
    if (!r.id || !r.name || !r.kuerzel) err(`Region unvollständig: ${JSON.stringify(r.id)}`);
    uniq(r.id, "region");
    for (const b of r.bausteine ?? []) {
      if (!b.id) err("Baustein ohne id");
      uniq(b.id, "baustein");
      bausteinIds.add(b.id);
      if (!B_TYPEN.includes(b.typ)) err(`Baustein ${b.id}: ungültiger typ "${b.typ}"`);
      if (!Array.isArray(b.platzhalter)) err(`Baustein ${b.id}: platzhalter fehlt`);
      if (!Array.isArray(b.segmente) || b.segmente.length === 0)
        err(`Baustein ${b.id}: segmente leer`);
      const phIds = new Set((b.platzhalter ?? []).map((p) => p.id));
      for (const p of b.platzhalter ?? []) {
        if (!p.id || !p.label) err(`Baustein ${b.id}: Platzhalter unvollständig`);
        if (!PH_TYPEN.includes(p.typ)) err(`Baustein ${b.id}/${p.id}: typ "${p.typ}" ungültig`);
      }
      const usedRefs = new Set();
      for (const s of b.segmente ?? []) {
        if (!SEG_ARTEN.includes(s.art)) {
          err(`Baustein ${b.id}: Segment-art "${s.art}" ungültig`);
          continue;
        }
        if (s.art === "text" && typeof s.text !== "string")
          err(`Baustein ${b.id}: text-Segment ohne text`);
        if (s.art === "platzhalter") {
          if (!phIds.has(s.ref))
            err(`Baustein ${b.id}: platzhalter-ref "${s.ref}" nicht definiert`);
          usedRefs.add(s.ref);
        }
        if (s.art === "befund") {
          if (!s.id || !s.chip) err(`Baustein ${b.id}: befund unvollständig`);
          if (typeof s.normal !== "string" || typeof s.abweichung !== "string")
            err(`Baustein ${b.id}/${s.id}: normal/abweichung fehlt`);
          if (s.slots != null) {
            if (!Array.isArray(s.slots))
              err(`Baustein ${b.id}/${s.id}: slots kein Array`);
            const SLOT_ARTEN = ["auswahl", "zahl", "lokaleSeite", "detail"];
            for (const slot of s.slots ?? []) {
              if (!SLOT_ARTEN.includes(slot.art))
                err(`Baustein ${b.id}/${s.id}: slot-art "${slot.art}" ungültig`);
              if (!slot.id || !slot.label)
                err(`Baustein ${b.id}/${s.id}: slot unvollständig`);
              if (slot.art === "auswahl" && (!Array.isArray(slot.optionen) || !slot.optionen.length))
                err(`Baustein ${b.id}/${s.id}/${slot.id}: auswahl-slot ohne optionen`);
              // jeder Slot muss in der Abweichungs-Vorlage vorkommen
              if (!s.abweichung.includes(`{${slot.id}}`))
                warnung(`Baustein ${b.id}/${s.id}: slot "${slot.id}" nicht in abweichung-Vorlage`);
            }
          }
          // jeder {token} in abweichung braucht einen Slot
          for (const m of (s.abweichung.match(/\{([^}]+)\}/g) ?? [])) {
            const tok = m.slice(1, -1);
            if (!(s.slots ?? []).some((sl) => sl.id === tok))
              err(`Baustein ${b.id}/${s.id}: {${tok}} ohne passenden Slot`);
          }
        }
        if (s.art === "auswahl") {
          if (!s.id || !Array.isArray(s.optionen) || s.optionen.length === 0)
            err(`Baustein ${b.id}: auswahl unvollständig`);
        }
        if (s.art === "messwert") {
          if (!s.id || !s.label) err(`Baustein ${b.id}: messwert unvollständig`);
          if (typeof s.vorlage !== "string" || !s.vorlage.includes("{w}"))
            err(`Baustein ${b.id}/${s.id}: messwert.vorlage ohne {w}`);
        }
      }
      for (const p of b.platzhalter ?? []) {
        if (!usedRefs.has(p.id))
          warnung(`Baustein ${b.id}: Platzhalter "${p.id}" wird von keinem Segment benutzt`);
      }
    }
  }
  for (const s of data.stapel ?? []) {
    uniq(s.id, "stapel");
    for (const bid of s.bausteinIds ?? [])
      if (!bausteinIds.has(bid))
        err(`Stapel ${s.id}: unbekannter Baustein "${bid}"`);
  }
}

console.log(`\n${fehler} Fehler, ${warn} Warnungen, ${bausteinIds.size} Bausteine gesamt.`);
process.exit(fehler > 0 ? 1 : 0);
