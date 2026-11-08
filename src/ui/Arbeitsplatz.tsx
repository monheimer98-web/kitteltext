// Arbeitsplatz-Check: Mit drei Prüftexten findet der Arzt in zehn Minuten
// heraus, ob Kopieren und Einfügen an seinem Klinik-PC unverfälscht ankommt.

import { useEffect, useState } from "preact/hooks";
import { fuerZwischenablage } from "../engine/text.ts";
import { inZwischenablage } from "./kopieren.ts";
import { sitzungsspeicherGeht } from "../speicher.ts";

const ZEILEN = [
  "Z1 Umlaute: ä ö ü Ä Ö Ü ß, Größe, Übelkeit, Fußrücken, Gefäßstatus",
  "Z2 Anführung und Striche: „Sturz auf die rechte Hand“ – Schmerz seit 3–4 Tagen … zunehmend",
  "Z3 Maße: Flexion 120°, Fläche 2 cm², CRP 12 mg/l, 500 µg, 1,2 ‰, ± 5 mm",
  "Z4 Vergleiche: Hämoglobin ≥ 8 g/dl, Thrombozyten ≤ 150/nl",
  "Z5 Leerzeichen: 10 mg und 5 kg",
  "Z6 Aufzählung:",
  "- erster Punkt",
  "- zweiter Punkt",
  "Z7 Langer Absatz: Am Vortag sei der rechte Fuß beim Treppensteigen umgeknickt. Seitdem bestünden Schmerzen und eine Schwellung über dem Außenknöchel. Das Auftreten sei unter Schmerzen möglich gewesen. Voroperationen an diesem Gelenk habe es nicht gegeben.",
  "",
  "Z8 Diese Zeile steht nach genau einer Leerzeile.",
  "Z9 ENDE-7391",
];
const ORIGINAL = ZEILEN.join("\n");

function langerText(): string {
  const satz = "Kein Druckschmerz über dem Außenknöchel, periphere Durchblutung, Motorik und Sensibilität intakt. ";
  let t = "";
  for (let marke = 500; marke <= 6000; marke += 500) {
    while (t.length < marke - 7) t += satz;
    t = t.slice(0, marke - 7) + ` [${String(marke).padStart(4, "0")}]`;
  }
  return t + " ENDE-7391";
}

function arbeitsplatz(): string[] {
  const ua = navigator.userAgent;
  const browser = /Edg\/(\d+)/.exec(ua)
    ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`
    : /Firefox\/(\d+)/.exec(ua)
      ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
      : /Chrome\/(\d+)/.exec(ua)
        ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`
        : "anderer Browser";
  const speicher = sitzungsspeicherGeht() ? "ja" : "nein";
  return [
    browser,
    `Fenster ${window.innerWidth} × ${window.innerHeight}`,
    `Adresse ${location.protocol === "file:" ? "lokale Datei" : location.protocol.replace(":", "")}`,
    `sicherer Kontext ${window.isSecureContext ? "ja" : "nein"}`,
    `Kopierschnittstelle ${navigator.clipboard ? "ja" : "nein"}`,
    `Sitzungsspeicher ${speicher}`,
  ];
}

export function Arbeitsplatz({ onZu }: { onZu: () => void }) {
  const [stand, setStand] = useState<Record<string, "ok" | "fehler">>({});
  useEffect(() => {
    const taste = (e: KeyboardEvent) => e.key === "Escape" && onZu();
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, []);

  const sicher = fuerZwischenablage(ORIGINAL, { zeilenende: "lf", zeichen: "einfach" });
  const texte = [
    { id: "t1", titel: "Text 1 · Original", hilfe: "Mit allen Sonderzeichen. Zeigt, was das KIS verfälscht.", text: ORIGINAL, zeichen: "original" as const, zeige: ORIGINAL },
    { id: "t2", titel: "Text 2 · KIS-sicher", hilfe: "So kopiert Kitteltext in der Standardeinstellung. Muss Zeichen für Zeichen stimmen.", text: ORIGINAL, zeichen: "einfach" as const, zeige: sicher },
    { id: "t3", titel: "Text 3 · lang", hilfe: "6000 Zeichen mit Marken alle 500 Zeichen. Zeigt, ob das Feld Text abschneidet: letzte sichtbare Marke notieren.", text: langerText(), zeichen: "einfach" as const, zeige: "… [0500] … [1000] … bis [6000] ENDE-7391" },
  ];

  return (
    <div class="dialog-flaeche ueber" data-dialog onMouseDown={(e) => e.target === e.currentTarget && onZu()}>
      <div class="dialog-karte breit" role="dialog" aria-modal="true" aria-label="Arbeitsplatz-Check">
        <div class="es-kopf">
          <h1>Arbeitsplatz-Check</h1>
          <button type="button" class="knopf leise" onClick={onZu}>
            Schließen
          </button>
        </div>
        <p class="es-hilfe">
          Zehn Minuten am eigenen Klinik-PC: Jeden Text kopieren, im KIS in ein Freitextfeld eines Testpatienten einfügen, Zeile für Zeile vergleichen. Nicht in die Akte eines echten Patienten schreiben und nichts speichern.
        </p>
        <div class="es-gruppe">
          <h2>Dieser Arbeitsplatz</h2>
          <p class="es-test">{arbeitsplatz().join(" · ")}</p>
        </div>
        {texte.map((t) => (
          <div class="es-gruppe">
            <div class="es-zeile">
              <div>
                <div class="es-titel">{t.titel}</div>
                <div class="es-hilfe">{t.hilfe}</div>
              </div>
              <button
                type="button"
                class={stand[t.id] === "ok" ? "knopf kopieren kopiert" : "knopf"}
                onClick={async () => {
                  const ok = await inZwischenablage(fuerZwischenablage(t.text, { zeilenende: "crlf", zeichen: t.zeichen }));
                  setStand({ ...stand, [t.id]: ok ? "ok" : "fehler" });
                }}
              >
                {stand[t.id] === "ok" ? "✓ kopiert" : stand[t.id] === "fehler" ? "blockiert" : "Kopieren"}
              </button>
            </div>
            {stand[t.id] === "fehler" && <p class="fehlertext">Der Browser hat das Kopieren blockiert. Text unten von Hand markieren und Strg+C drücken; das Ergebnis notieren.</p>}
            <pre class="es-test">{t.zeige}</pre>
          </div>
        ))}
        <div class="es-gruppe">
          <h2>Notieren</h2>
          <ul>
            <li>Zeile „Dieser Arbeitsplatz" abschreiben.</li>
            <li>Je Text und je Programm (Notaufnahme, Station): Welche Zeilen stimmen nicht, und was steht stattdessen da?</li>
            <li>Bei Text 3: letzte sichtbare Marke.</li>
            <li>Öffnet sich beim Briefschreiben Word? Startet das KIS über Citrix oder Remotedesktop? Gemeinsames Windows-Konto in der Notaufnahme?</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
