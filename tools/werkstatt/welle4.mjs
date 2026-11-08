// Fachdurchsicht vom 12.10.2026, offene schwere Befunde der Stationsvorlagen (einmal gelaufen am 13.10.2026).
// F-04, F-23, F-31, F-32, F-34, F-35, F-42, F-45, F-59, F-60, F-62, F-87.
import fs from "node:fs";
const C = "src/data/corpus/", V = "src/data/vorlagen/";
const datei = (p, fn) => { const roh = fs.readFileSync(p, "utf8"); const j = JSON.parse(roh); fn(j); fs.writeFileSync(p, JSON.stringify(j, null, 2) + (roh.endsWith("\n") ? "\n" : "")); };
const baustein = (j, id) => { for (const r of j.regionen) for (const b of r.bausteine) if (b.id === id) return b; throw new Error("Baustein fehlt: " + id); };
const seg = (b, id) => b.segmente.find((s) => s.id === id) ?? (() => { throw new Error(`${b.id}/${id} fehlt`); })();
const slot = (s, id) => s.slots.find((x) => x.id === id) ?? (() => { throw new Error(`Angabe ${id} fehlt`); })();
const dazu = (liste, ...neu) => { for (const o of neu) if (!liste.includes(o)) liste.push(o); };
const vorlage = (j, id) => j.vorlagen.find((v) => v.id === id) ?? (() => { throw new Error("Vorlage fehlt: " + id); })();
const region = (j, id) => j.regionen.find((r) => r.id === id) ?? (() => { throw new Error("Region fehlt: " + id); })();
const neu = (r, b) => { const i = r.bausteine.findIndex((x) => x.id === b.id); if (i >= 0) r.bausteine[i] = b; else r.bausteine.push(b); };
const text = (t) => ({ art: "text", text: t });
const seite = { art: "seite" };
const datum = { id: "datum", typ: "datum", label: "OP-Datum", required: true };
const befundung = { art: "option", id: "befundung", label: "Befundung durch", text: " {wer}", slots: [{ art: "auswahl", id: "wer", label: "Befundung", optionen: ["Fachradiologisch befundet.", "Fachradiologischer Befund ausstehend."] }] };

datei(C + "station-diagnosen.json", (j) => {
  // F-04: Röntgen bei Gelenkersatz ohne Frakturbefunde.
  neu(region(j, "huefte"), { id: "dgn-st-hueft-tep", titel: "Röntgen Hüfte vor und nach Gelenkersatz", typ: "diagnostik", status: "entwurf", platzhalter: [], segmente: [
    text("Röntgen Beckenübersicht und Hüfte "), seite, text(" axial vor der Operation: "),
    { art: "auswahl", id: "vorher", label: "Röntgenbefund vor der Operation", pflicht: true, optionen: ["fortgeschrittene Koxarthrose mit verschmälertem Gelenkspalt, Osteophyten und subchondraler Sklerosierung.", "Koxarthrose bei Hüftdysplasie.", "Hüftkopfnekrose mit Einbruch der Gelenkfläche.", "posttraumatische Koxarthrose."] },
    text("\nRöntgen Beckenübersicht und Hüfte "), seite, text(" axial nach der Operation: "),
    { art: "auswahl", id: "nachher", label: "Röntgenbefund nach der Operation", pflicht: true, optionen: ["regelrechte Stellung der Prothese, kein Hinweis auf eine Fraktur.", "regelrechte Stellung der Prothese, Fissur am proximalen Femur."] },
    befundung ] });
  neu(region(j, "knie"), { id: "dgn-st-knie-tep", titel: "Röntgen Knie vor und nach Gelenkersatz", typ: "diagnostik", status: "entwurf", platzhalter: [], segmente: [
    text("Röntgen Knie "), seite, text(" in 2 Ebenen und Patella tangential vor der Operation: "),
    { art: "auswahl", id: "vorher", label: "Röntgenbefund vor der Operation", pflicht: true, optionen: ["fortgeschrittene Gonarthrose mit verschmälertem Gelenkspalt, Osteophyten und subchondraler Sklerosierung.", "fortgeschrittene, medial betonte Gonarthrose.", "fortgeschrittene, lateral betonte Gonarthrose.", "posttraumatische Gonarthrose."] },
    { art: "option", id: "ganzbein", label: "Ganzbeinaufnahme", text: "\nGanzbeinaufnahme im Stehen: {achse}.", slots: [{ art: "auswahl", id: "achse", label: "Beinachse", required: true, optionen: ["", "Varusachse", "Valgusachse", "gerade Beinachse"] }] },
    text("\nRöntgen Knie "), seite, text(" in 2 Ebenen nach der Operation: "),
    { art: "auswahl", id: "nachher", label: "Röntgenbefund nach der Operation", pflicht: true, optionen: ["regelrechte Stellung der Prothese, kein Hinweis auf eine Fraktur."] },
    befundung ] });
  // F-23: Diagnose der Radiusfraktur erklärt die Operation.
  neu(region(j, "handgelenk"), { id: "dx-st-radius", titel: "Diagnose distale Radiusfraktur (Station)", typ: "diagnose", status: "entwurf", platzhalter: [], segmente: [
    text("Distale Radiusfraktur "), seite,
    { art: "auswahl", id: "gelenk", label: "Gelenkbeteiligung", pflicht: true, optionen: [", extraartikulär", ", intraartikulär"] },
    { art: "auswahl", id: "verschiebung", label: "Verschiebung", pflicht: true, optionen: [", nach dorsal verschoben", ", nach palmar verschoben", ", verkürzt und nach dorsal verschoben", ", nicht wesentlich verschoben"] },
    { art: "option", id: "ulna", label: "Abriss Processus styloideus ulnae", text: ", mit Abriss des Processus styloideus ulnae" },
    { art: "option", id: "ao", label: "AO-Klassifikation", text: " (AO {klasse})", slots: [{ art: "detail", id: "klasse", label: "AO-Klassifikation, z. B. 2R3A2", maxLen: 12, required: true }] },
    { art: "auswahl", id: "ereignis", label: "Ereignis", optionen: ["", ", Sturz auf die ausgestreckte Hand", ", häuslicher Sturz", ", Sportunfall", ", Verkehrsunfall"], default: 0 } ] });
  // F-31, F-32: Diagnose und Verfahren am Sprunggelenk frei kombinierbar.
  const osg = region(j, "osg");
  neu(osg, { id: "dx-st-osg-fraktur", titel: "Diagnose Sprunggelenkfraktur (Station)", typ: "diagnose", status: "entwurf", platzhalter: [], segmente: [
    { art: "auswahl", id: "art", label: "Diagnose", pflicht: true, optionen: ["Außenknöchelfraktur", "Innenknöchelfraktur", "Bimalleoläre Sprunggelenkfraktur", "Trimalleoläre Sprunggelenkfraktur", "Bimalleoläre Luxationsfraktur des Sprunggelenks", "Trimalleoläre Luxationsfraktur des Sprunggelenks", "Maisonneuve-Fraktur"] },
    text(" "), seite,
    { art: "auswahl", id: "weber", label: "Höhe der Fibulafraktur", pflicht: true, optionen: [" (Weber A)", " (Weber B)", " (Weber C)", ""] },
    { art: "option", id: "syndesmose", label: "Syndesmosenverletzung", text: ", mit Verletzung der Syndesmose" },
    { art: "option", id: "deltaband", label: "Deltabandruptur", text: ", mit Ruptur des Deltabands" },
    { art: "option", id: "offen", label: "Offene Fraktur", text: ", offen ({grad})", slots: [{ art: "detail", id: "grad", label: "Grad der offenen Fraktur", maxLen: 40, required: true }] },
    { art: "auswahl", id: "ereignis", label: "Ereignis", optionen: ["", ", Umknicktrauma", ", Sturz", ", Sportunfall", ", Verkehrsunfall"], default: 0 } ] });
  neu(osg, { id: "th-st-osg-osteosynthese", titel: "Operation: Osteosynthese am Sprunggelenk", typ: "therapie", status: "entwurf", platzhalter: [datum], segmente: [
    { art: "auswahl", id: "was", label: "Hauptverfahren", pflicht: true, optionen: ["Offene Reposition und Plattenosteosynthese der distalen Fibula", "Offene Reposition und Schraubenosteosynthese des Innenknöchels", "Offene Reposition und Zuggurtungsosteosynthese des Innenknöchels", "Geschlossene Reposition und Anlage eines Fixateur externe"] },
    text(" "), seite, text(" am "), { art: "platzhalter", ref: "datum" },
    { art: "option", id: "innenknoechel", label: "Zusätzlich Innenknöchel", text: "\n{was} des Innenknöchels", slots: [{ art: "auswahl", id: "was", label: "Verfahren", required: true, optionen: ["", "Schraubenosteosynthese", "Zuggurtungsosteosynthese"] }] },
    { art: "option", id: "hinterkante", label: "Hinteres Kantenfragment", text: "\nVerschraubung des hinteren Kantenfragments" },
    { art: "option", id: "syndesmose", label: "Stabilisierung der Syndesmose", text: "\nStabilisierung der Syndesmose mit {womit}", slots: [{ art: "auswahl", id: "womit", label: "Womit", required: true, optionen: ["", "einer Stellschraube", "zwei Stellschrauben", "einem Fadenzugsystem"] }] },
    { art: "option", id: "zweizeitig", label: "Zweizeitiges Vorgehen", text: "\nEndgültige Osteosynthese nach Abschwellung der Weichteile am {wann}", slots: [{ art: "detail", id: "wann", label: "Datum der zweiten Operation", maxLen: 20, required: true }] },
    { art: "option", id: "reposition", label: "Reposition in der Notaufnahme", text: "\nGeschlossene Reposition und Ruhigstellung in der Unterschenkelgipsschiene am Aufnahmetag" } ] });
  // F-42: Klassifikation der Wirbelkörperfraktur.
  const dxw = baustein(j, "dx-st-wirbelkoerperfraktur");
  if (!dxw.segmente.some((s) => s.id === "klasse")) {
    const i = dxw.segmente.findIndex((s) => s.id === "ereignis");
    dxw.segmente.splice(i, 0,
      { art: "auswahl", id: "klasse", label: "Klassifikation", optionen: ["", " (OF 1)", " (OF 2)", " (OF 3)", " (OF 4)", " (AO Spine A1)", " (AO Spine A2)", " (AO Spine A3)", " (AO Spine A4)"], default: 0 },
      { art: "option", id: "neuro", label: "Ohne neurologisches Defizit", an: true, text: ", ohne neurologisches Defizit" });
  }
});

datei(C + "station-zusatz.json", (j) => {
  const st = region(j, "brief-station");
  // F-59: Lunge im Entlassbefund.
  neu(st, { id: "eb-st-lunge", titel: "Entlassbefund Lunge", typ: "befund", abschnitt: "entlassbefund", status: "entwurf", platzhalter: [], segmente: [
    { art: "befund", id: "lunge", chip: "Atmung und Atemgeräusch", gruppe: "Lunge", normal: "Keine Atemnot in Ruhe, Atemgeräusch seitengleich. ", abweichung: "{was}. ", slots: [{ art: "detail", id: "was", label: "Befund der Lunge", maxLen: 160, required: true }] },
    { art: "messwert", id: "spo2", label: "Sauerstoffsättigung ohne Sauerstoffgabe", gruppe: "Lunge", vorlage: "Sauerstoffsättigung {w} % ohne Sauerstoffgabe. ", normal: "" } ] });
  // F-87: Opioid bei Entlassung braucht einen Plan.
  const v = baustein(j, "proc-st-verhalten");
  if (!v.segmente.some((s) => s.id === "opioid")) v.segmente.push({ art: "punkt" }, { art: "option", id: "opioid", label: "Opioid verringern und absetzen", text: "{wirkstoff} innerhalb von {frist} nach der Entlassung in der Hausarztpraxis schrittweise verringern und absetzen. Solange {wirkstoff} eingenommen wird, kein Führen von Fahrzeugen. ", slots: [
    { art: "detail", id: "wirkstoff", label: "Opioid (Wirkstoff)", maxLen: 40, required: true },
    { art: "auswahl", id: "frist", label: "Frist", required: true, optionen: ["", "7 Tagen", "14 Tagen", "4 Wochen"] } ] });
});

datei(C + "brief-station.json", (j) => {
  // F-35: Verbleib der Stellschraube sagbar.
  const metall = baustein(j, "proc-st-metall");
  if (!metall.segmente.some((s) => s.id === "stellschraube-bleibt")) metall.segmente.push({ art: "punkt" }, { art: "option", id: "stellschraube-bleibt", label: "Stellschraube wird belassen", text: "Die Stabilisierung der Syndesmose wird belassen, eine Entfernung ist nicht geplant. " });
  // F-60: Röntgenbefund des Brustkorbs mit beiden Aussagen.
  dazu(seg(baustein(j, "dgn-st-roentgen-ohne-seite"), "ergebnis").optionen, "Fraktur wie unter Diagnosen beschrieben, kein Pneumothorax, kein Erguss.", "Fraktur wie unter Diagnosen beschrieben, Pneumothorax.", "Fraktur wie unter Diagnosen beschrieben, Pleuraerguss.");
  // F-62: Warnzeichen der verzögerten Blutung bei Frakturen der unteren Rippen.
  dazu(slot(seg(baustein(j, "proc-st-sicherheitsnetz"), "sicherheitsnetz"), "zeichen").optionen,
    "zunehmender Atemnot, plötzlichem stechendem Brustschmerz, Fieber über 38,5 °C, Husten mit gelbem oder blutigem Auswurf, zunehmenden Schmerzen trotz Schmerzmittel, Schmerzen im Oberbauch, Schwindel oder Kreislaufschwäche");
});

datei(V + "station-diagnosen.json", (j) => {
  const h = vorlage(j, "station-hueft-tep");
  h.abschnitte.diagnostik = ["dgn-st-hueft-tep", "dgn-st-labor", "dgn-st-weitere"];
  delete h.vorgaben.auswahl;
  const k = vorlage(j, "station-knie-tep");
  k.abschnitte.diagnostik = ["dgn-st-knie-tep", "dgn-st-labor", "dgn-st-weitere"];
  delete k.vorgaben.auswahl;
  const o = vorlage(j, "station-osg-fraktur-osteosynthese");
  o.vorgaben.an = [...new Set([...o.vorgaben.an, "proc-st-belastung/bewegung"])];   // F-34: Beweglichkeit ist eine Lücke
  const w = vorlage(j, "station-wirbelkoerperfraktur-konservativ");
  w.vorgaben.an = [...new Set([...w.vorgaben.an, "verl-st-konservativ/roentgen"])];   // F-45
  w.vorgaben.slots["proc-st-kontrollen/roentgen-ohne-seite/stand"] = 1;
  const r = vorlage(j, "station-rippenserienfraktur");
  r.abschnitte.entlassbefund = ["eb-st-allgemein", "eb-st-lunge", "eb-st-mobilitaet"];
  r.entscheiden = [...new Set([...r.entscheiden, "eb-st-lunge/lunge"])];
  r.vorgaben.slots["proc-st-sicherheitsnetz/sicherheitsnetz/zeichen"] = 11;
});
console.log("Welle 4 eingearbeitet");
