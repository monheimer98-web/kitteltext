import { signal } from "@preact/signals";
import { screen } from "../store.ts";
import { freigeschaltet, pruefeCode } from "../access.ts";
import { Home } from "./Home.tsx";
import { SeitenGate } from "./SeitenGate.tsx";
import { Composer } from "./Composer.tsx";
import { Review } from "./Review.tsx";
import { Uebergabe } from "./Uebergabe.tsx";
import { Settings } from "./Settings.tsx";
import { Editor } from "./Editor.tsx";
import { PcEmpfang } from "./PcEmpfang.tsx";

const ZWECK_KEY = "kitteltext.zweck.bestaetigt.v1";
const zweckBestaetigt = signal<boolean>(
  localStorage.getItem(ZWECK_KEY) === "1",
);

function bestaetigeZweck() {
  localStorage.setItem(ZWECK_KEY, "1");
  zweckBestaetigt.value = true;
}

const codeEingabe = signal("");
const codeFehler = signal(false);

function ZugangsGate() {
  function absenden() {
    if (!pruefeCode(codeEingabe.value)) {
      codeFehler.value = true;
    }
  }
  return (
    <div class="overlay">
      <div class="karte">
        <h2>Kitteltext</h2>
        <p>Bitte den Zugangscode eingeben, um fortzufahren.</p>
        <div class="feld">
          <input
            type="text"
            autofocus
            autocapitalize="off"
            autocomplete="off"
            spellcheck={false}
            placeholder="Zugangscode"
            value={codeEingabe.value}
            onInput={(e) => {
              codeEingabe.value = (e.target as HTMLInputElement).value;
              codeFehler.value = false;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") absenden();
            }}
          />
        </div>
        {codeFehler.value && (
          <p class="hinweis" style="color:var(--warn)">
            Code stimmt nicht.
          </p>
        )}
        <button class="cta" onClick={absenden}>
          Freischalten
        </button>
      </div>
    </div>
  );
}

export function App() {
  if (!freigeschaltet.value) {
    return <ZugangsGate />;
  }
  if (!zweckBestaetigt.value) {
    return (
      <div class="overlay">
        <div class="karte">
          <h2>Kitteltext</h2>
          <p>
            Eine Formulierungshilfe, die aus vorgegebenen Textbausteinen einen
            Untersuchungs- und Procedere-Text zusammensetzt. Zweck ist die
            reine Dokumentationsunterstützung.
          </p>
          <ul>
            <li>
              <strong>Keine Patientendaten.</strong> Kein Name, kein
              Geburtsdatum, keine Fallnummer. Der Personenbezug entsteht erst
              im KIS.
            </li>
            <li>
              Der erzeugte Text ist ärztlich zu prüfen und zu ergänzen, bevor
              er übernommen wird.
            </li>
            <li>
              Keine medizinische Entscheidung, keine Empfehlung – nur
              Textformatierung.
            </li>
          </ul>
          <button class="cta" onClick={bestaetigeZweck}>
            Verstanden
          </button>
        </div>
      </div>
    );
  }

  const inhalt = () => {
    switch (screen.value) {
      case "gate":
        return <SeitenGate />;
      case "composer":
        return <Composer />;
      case "review":
        return <Review />;
      case "uebergabe":
        return <Uebergabe />;
      case "settings":
        return <Settings />;
      case "editor":
        return <Editor />;
      case "pc-empfang":
        return <PcEmpfang />;
      default:
        return <Home />;
    }
  };
  // key = screen -> frischer Mount pro Screen -> Einblend-Animation
  return (
    <div class="screen" key={screen.value}>
      {inhalt()}
    </div>
  );
}
