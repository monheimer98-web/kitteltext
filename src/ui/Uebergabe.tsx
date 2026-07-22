import { signal } from "@preact/signals";
import { katalog } from "../data/katalogStore.ts";
import { fall, geheZu, neuerFall } from "../store.ts";
import { settings } from "../settings.ts";
import { renderFall } from "../engine/render.ts";
import { encode, gruppiere } from "../engine/statecode.ts";
import { kopiereText } from "./clipboard.ts";

const codeKopiert = signal(false);
const textKopiert = signal(false);

export function Uebergabe() {
  const f = fall.value;
  const erg = renderFall(f, katalog.value);
  const code = encode(f, katalog.value);
  const s = settings.value;

  async function codeKopieren() {
    if (await kopiereText(code)) {
      codeKopiert.value = true;
      setTimeout(() => (codeKopiert.value = false), 1800);
    }
  }

  async function textKopieren() {
    if (await kopiereText(erg.text)) {
      textKopiert.value = true;
      setTimeout(() => (textKopiert.value = false), 1800);
    }
  }

  function perMail() {
    const to = encodeURIComponent(s.klinikMail);
    const betreff = encodeURIComponent(s.mailBetreff || "Befundtext");
    // Outlook-feste Umbrueche: mailto nutzt %0D%0A
    const body = encodeURIComponent(erg.text);
    const zuLang = erg.text.length > 1800;
    if (
      zuLang &&
      !confirm(
        "Der Text ist lang – manche Mail-Programme kürzen ihn. Trotzdem als E-Mail öffnen? (Alternativ Zustandscode oder Text kopieren nutzen.)",
      )
    ) {
      return;
    }
    location.href = `mailto:${to}?subject=${betreff}&body=${body}`;
  }

  return (
    <>
      <div class="topbar">
        <button
          class="btn-back"
          onClick={() => geheZu("review")}
          aria-label="Zurück"
        >
          ‹
        </button>
        <div>
          <h1>An PC übergeben</h1>
          <div class="sub">anonymer Text · Name erst im KIS</div>
        </div>
      </div>

      <div class="content">
        <div class="label">Weg 1 · Zustandscode → PC-Zwilling</div>
        <p class="hinweis">
          Kitteltext am Klinik-PC im Browser öffnen und diesen Code eingeben –
          der PC zeigt denselben Text mit Kopier-Knopf.
        </p>
        <div class="codebox">{gruppiere(code)}</div>
        <button class="cta" onClick={codeKopieren}>
          {codeKopiert.value ? "✓ Code kopiert" : "Code kopieren"}
        </button>

        <div class="label">Weg 2 · E-Mail an eigenes Postfach</div>
        {s.klinikMail ? (
          <>
            <p class="hinweis">
              Öffnet eine Mail an <strong>{s.klinikMail}</strong> mit dem Text
              im Nachrichtentext. Am PC öffnen, Text kopieren, ins KIS einfügen.
            </p>
            <button class="cta" onClick={perMail}>
              Per E-Mail senden
            </button>
          </>
        ) : (
          <p class="hinweis">
            Kein Klinik-Postfach hinterlegt.{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                geheZu("settings");
              }}
              style="color:var(--accent)"
            >
              In den Einstellungen setzen
            </a>
            .
          </p>
        )}

        <div class="label">Weg 3 · Text direkt kopieren</div>
        <p class="hinweis">
          Wenn du am selben Gerät weiterarbeitest oder die Zwischenablage
          gerätübergreifend synchronisiert.
        </p>
        <button class="cta" onClick={textKopieren}>
          {textKopiert.value ? "✓ Text kopiert" : "Volltext kopieren"}
        </button>

        <p class="datenschutz-zeile">
          Keine Patientendaten · Text ärztlich prüfen und im KIS ergänzen
        </p>
      </div>

      <div class="vorschau">
        <button
          class="cta"
          style="background:transparent;color:var(--text-dim)"
          onClick={neuerFall}
        >
          Fertig · neuer Fall
        </button>
      </div>
    </>
  );
}
