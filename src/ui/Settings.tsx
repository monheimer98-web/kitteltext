import { KATALOG } from "../data/katalog.ts";
import { geheZu } from "../store.ts";
import { settings, setSetting } from "../settings.ts";
import { ladeKatalogInfo } from "../data/katalogStore.ts";
import { themeWahl, setTheme, ThemeWahl } from "../theme.ts";

const THEMES: { wert: ThemeWahl; label: string }[] = [
  { wert: "system", label: "System" },
  { wert: "hell", label: "Hell" },
  { wert: "dunkel", label: "Dunkel" },
];

export function Settings() {
  const s = settings.value;
  const info = ladeKatalogInfo();

  return (
    <>
      <div class="topbar">
        <button
          class="btn-back"
          onClick={() => geheZu("home")}
          aria-label="Zurück"
        >
          ‹
        </button>
        <div>
          <h1>Einstellungen</h1>
          <div class="sub">gerätelokal · keine Cloud</div>
        </div>
      </div>

      <div class="content">
        <div class="label">Darstellung</div>
        <div class="segmented">
          {THEMES.map((t) => (
            <button
              key={t.wert}
              class={"seg-opt" + (themeWahl.value === t.wert ? " aktiv" : "")}
              onClick={() => setTheme(t.wert)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p class="hinweis">
          „System" folgt dem Gerät – dunkel im Nachtdienst, hell am Tag.
        </p>

        <div class="label">Übergabe</div>
        <button class="cta" onClick={() => geheZu("pc-empfang")}>
          Diesen Rechner als PC-Empfänger
        </button>
        <p class="hinweis">
          Am Klinik-PC öffnen, um den Code vom iPhone in Text zu verwandeln.
        </p>

        <div class="label">E-Mail-Fallback</div>
        <div class="feld">
          <label>Eigenes Klinik-Postfach</label>
          <input
            type="email"
            inputMode="email"
            placeholder="vorname.nachname@klinikum.de"
            value={s.klinikMail}
            onInput={(e) =>
              setSetting("klinikMail", (e.target as HTMLInputElement).value)
            }
          />
        </div>
        <div class="feld">
          <label>Betreff der Fallback-Mail</label>
          <input
            type="text"
            value={s.mailBetreff}
            onInput={(e) =>
              setSetting("mailBetreff", (e.target as HTMLInputElement).value)
            }
          />
        </div>
        <p class="hinweis">
          Die eigene dienstliche Adresse – kein Patientendatum. Wird nur als
          Empfänger vorbelegt.
        </p>

        <div class="label">Katalog</div>
        <p class="hinweis">
          {info.regionen} Regionen · {info.bausteine} Bausteine ·{" "}
          {info.eigen ? "eigener (bearbeiteter) Katalog" : `Standard v${KATALOG.version}`}
        </p>
        <button class="cta" onClick={() => geheZu("editor")}>
          Bausteine & Stapel bearbeiten
        </button>

        <div class="label">Über</div>
        <p class="hinweis">
          Kitteltext ist eine Formulierungshilfe: sie setzt vorgegebene
          Textbausteine zusammen. Keine medizinische Entscheidung, keine
          Empfehlung, kein KI-Anteil. Der Text ist ärztlich zu prüfen. Es werden
          keine Patientendaten erfasst oder gespeichert.
        </p>
      </div>
    </>
  );
}
