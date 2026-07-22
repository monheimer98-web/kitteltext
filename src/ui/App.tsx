import { signal } from "@preact/signals";
import { screen } from "../store.ts";
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

export function App() {
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
}
