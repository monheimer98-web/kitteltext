import { Seite } from "../model/types.ts";
import { geheZu, neuerFall, setSeite } from "../store.ts";
import { tock } from "./haptics.ts";

// Vollbild-Seiten-Gate: die einzige sicherheitskritische Entscheidung
// (rechts/links) – kein Default, grosse Ziele, erzwungen vor dem Composer.
export function SeitenGate() {
  function waehle(s: Seite) {
    tock();
    setSeite(s);
    geheZu("composer");
  }

  return (
    <>
      <div class="topbar">
        <button class="btn-back" onClick={neuerFall} aria-label="Abbrechen">
          ‹
        </button>
        <div>
          <h1>Seite</h1>
          <div class="sub">Sicherheitsabfrage</div>
        </div>
      </div>

      <div class="gate">
        <h2>Welche Seite?</h2>
        <p>Wird überall im Text eingesetzt. Keine Vorauswahl.</p>
        <div class="gate-buttons">
          <button class="gate-btn" onClick={() => waehle("rechts")}>
            rechts
          </button>
          <button class="gate-btn" onClick={() => waehle("links")}>
            links
          </button>
          <button
            class="gate-btn beidseits"
            onClick={() => waehle("beidseits")}
          >
            beidseits
          </button>
        </div>
      </div>
    </>
  );
}
