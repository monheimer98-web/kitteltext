import { katalog } from "../data/katalogStore.ts";
import { fall, geheZu, neuerFall } from "../store.ts";
import {
  MARKER_OFFEN,
  exportErlaubt,
  renderFall,
} from "../engine/render.ts";

export function Review() {
  const f = fall.value;
  const erg = renderFall(f, katalog.value);
  const erlaubt = exportErlaubt(erg);
  const teile = erg.text.split(MARKER_OFFEN);

  return (
    <>
      <div class="topbar">
        <button
          class="btn-back"
          onClick={() => geheZu("composer")}
          aria-label="Zurück"
        >
          ‹
        </button>
        <div>
          <h1>Prüfen</h1>
          <div class="sub">vor der Übernahme ins KIS</div>
        </div>
      </div>

      <div class="content">
        {!erlaubt && (
          <div class="offene-box">
            <div class="o-titel">
              ⚠ Noch offen – Export gesperrt
            </div>
            {erg.seiteFehlt && (
              <button onClick={() => geheZu("gate")}>
                › Seite (rechts/links) nicht gesetzt
              </button>
            )}
            {erg.offene.map((o) => (
              <button key={o.id} onClick={() => geheZu("composer")}>
                › {o.label} – {o.bausteinTitel}
              </button>
            ))}
          </div>
        )}

        <div class="review-text">
          {teile.map((t, i) => (
            <span key={i}>
              {t}
              {i < teile.length - 1 && <mark>offen</mark>}
            </span>
          ))}
        </div>

        <p class="datenschutz-zeile">
          Keine Patientendaten · Personenbezug erst im KIS · Text ärztlich
          prüfen
        </p>
      </div>

      <div class="vorschau">
        <button
          class={"cta" + (erlaubt ? " gruen" : "")}
          disabled={!erlaubt}
          onClick={() => geheZu("uebergabe")}
        >
          {erlaubt ? "An PC übergeben ›" : "Erst offene Punkte lösen"}
        </button>
        <button
          class="cta"
          style="background:transparent;color:var(--text-dim);min-height:44px;margin-top:6px"
          onClick={neuerFall}
        >
          Neuer Fall
        </button>
      </div>
    </>
  );
}
