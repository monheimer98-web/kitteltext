import { signal } from "@preact/signals";
import { katalog } from "../data/katalogStore.ts";
import { geheZu } from "../store.ts";
import { fingerprint, decode } from "../engine/statecode.ts";
import { renderFall } from "../engine/render.ts";
import { kopiereText } from "./clipboard.ts";

// In-App-Empfang: dasselbe wie der Single-File-Zwilling, aber innerhalb der App
// erreichbar. Für den Fall, dass der Klinik-PC die App-Adresse im Browser
// öffnen kann (dann braucht es keine separate Datei).
const code = signal("");
const text = signal("");
const fehler = signal("");
const kopiert = signal(false);

function verarbeite() {
  const res = decode(code.value, katalog.value);
  if (!res.ok) {
    text.value = "";
    fehler.value = res.meldung;
    return;
  }
  const erg = renderFall(res.fall, katalog.value);
  if (erg.offene.length > 0 || erg.seiteFehlt) {
    text.value = "";
    fehler.value = "Der Code enthält offene Pflichtangaben.";
    return;
  }
  fehler.value = "";
  text.value = erg.text;
}

export function PcEmpfang() {
  const KAT = katalog.value;
  return (
    <>
      <div class="topbar">
        <button
          class="btn-back"
          onClick={() => geheZu("settings")}
          aria-label="Zurück"
        >
          ‹
        </button>
        <div>
          <h1>PC-Empfang</h1>
          <div class="sub">
            Katalog v{KAT.version} · Prüf-ID {fingerprint(KAT).slice(0, 6)}
          </div>
        </div>
      </div>

      <div class="content">
        <p class="hinweis">
          Diesen Bildschirm am Klinik-PC im Browser öffnen und den Code vom
          iPhone eingeben. (Alternativ die eigenständige Datei{" "}
          <code>kitteltext-pc.html</code> verwenden.)
        </p>

        <div class="feld">
          <label>Zustandscode</label>
          <input
            type="text"
            autocapitalize="characters"
            spellcheck={false}
            placeholder="KT…"
            value={code.value}
            onInput={(e) => (code.value = (e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") verarbeite();
            }}
          />
        </div>
        <button class="cta" onClick={verarbeite}>
          Anzeigen
        </button>

        {fehler.value && (
          <div class="offene-box" style="margin-top:16px">
            <div class="o-titel">⚠ {fehler.value}</div>
          </div>
        )}

        {text.value && (
          <>
            <div class="label">Text</div>
            <div class="review-text">{text.value}</div>
            <button
              class="cta gruen"
              style="margin-top:12px"
              onClick={async () => {
                if (await kopiereText(text.value)) {
                  kopiert.value = true;
                  setTimeout(() => (kopiert.value = false), 1800);
                }
              }}
            >
              {kopiert.value ? "✓ Kopiert" : "Alles kopieren"}
            </button>
            <p class="datenschutz-zeile">
              Kein Patientendatum · Name und Zahlen im KIS ergänzen · ärztlich
              prüfen.
            </p>
          </>
        )}
      </div>
    </>
  );
}
