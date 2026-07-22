// ============================================================================
// Kitteltext – PC-Zwilling (Single-File-HTML für den Klinik-PC)
// ----------------------------------------------------------------------------
// Nimmt den auf dem iPhone erzeugten Zustandscode entgegen, dekodiert ihn mit
// DEMSELBEN render.ts / statecode.ts und zeigt den identischen Volltext mit
// einem großen "Alles kopieren"-Knopf. Bei Versions-/Fingerprint-/Prüfziffer-
// Mismatch: rote Fehlermeldung, KEIN Text (nie stiller Falschtext).
//
// Enthält keine Patientendaten. Läuft offline, ohne Server, vom Netzlaufwerk.
// ============================================================================

import { KATALOG } from "../data/katalog.ts";
import { fingerprint, decode } from "../engine/statecode.ts";
import { renderFall } from "../engine/render.ts";
import { kopiereText } from "../ui/clipboard.ts";
import "./pc.css";

const app = document.getElementById("pc")!;

app.innerHTML = `
  <div class="wrap">
    <header>
      <h1>Kitteltext · PC</h1>
      <div class="meta">Katalog v${KATALOG.version} · ${KATALOG.regionen.length} Regionen · Prüf-ID ${fingerprint(KATALOG).slice(0, 6)}</div>
    </header>

    <label class="cap" for="code">Zustandscode vom iPhone eingeben</label>
    <div class="row">
      <input id="code" type="text" autocomplete="off" autocapitalize="characters"
             spellcheck="false" placeholder="KT…" />
      <button id="go">Anzeigen</button>
    </div>
    <div id="fehler" class="fehler" hidden></div>

    <div id="ergebnis" hidden>
      <div class="bar">
        <span class="ok">✓ Text erzeugt</span>
        <button id="copy" class="copy">Alles kopieren</button>
      </div>
      <textarea id="text" readonly rows="18"></textarea>
      <p class="note">Kein Patientendatum enthalten · Name und Zahlen im KIS ergänzen · ärztlich prüfen.</p>
    </div>

    <footer>Rein deterministische Formatierung · keine medizinische Empfehlung · keine Datenübertragung.</footer>
  </div>
`;

const input = app.querySelector<HTMLInputElement>("#code")!;
const goBtn = app.querySelector<HTMLButtonElement>("#go")!;
const fehlerBox = app.querySelector<HTMLDivElement>("#fehler")!;
const ergebnis = app.querySelector<HTMLDivElement>("#ergebnis")!;
const textArea = app.querySelector<HTMLTextAreaElement>("#text")!;
const copyBtn = app.querySelector<HTMLButtonElement>("#copy")!;

function zeigeFehler(msg: string) {
  ergebnis.hidden = true;
  textArea.value = ""; // keinen alten Text stehen lassen
  fehlerBox.hidden = false;
  fehlerBox.textContent = "⚠ " + msg;
}

function verarbeite() {
  const code = input.value.trim();
  if (!code) return;
  const res = decode(code, KATALOG);
  if (!res.ok) {
    zeigeFehler(res.meldung);
    return;
  }
  const erg = renderFall(res.fall, KATALOG);
  if (erg.offene.length > 0 || erg.seiteFehlt) {
    // Sollte nicht vorkommen (Export war auf dem iPhone gesperrt), aber sicher ist sicher.
    zeigeFehler(
      "Der Code enthält offene Pflichtangaben – bitte auf dem iPhone vervollständigen.",
    );
    return;
  }
  fehlerBox.hidden = true;
  ergebnis.hidden = false;
  textArea.value = erg.text;
  textArea.focus();
  textArea.select();
}

goBtn.addEventListener("click", verarbeite);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") verarbeite();
});

copyBtn.addEventListener("click", async () => {
  const ok = await kopiereText(textArea.value);
  copyBtn.textContent = ok ? "✓ Kopiert" : "Bitte manuell markieren";
  setTimeout(() => (copyBtn.textContent = "Alles kopieren"), 1800);
});

input.focus();
