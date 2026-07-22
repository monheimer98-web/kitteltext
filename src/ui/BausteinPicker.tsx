import { signal } from "@preact/signals";
import { katalog } from "../data/katalogStore.ts";
import { BAUSTEIN_TYP_LABEL } from "../model/types.ts";
import { fall, fuegeBausteinHinzu } from "../store.ts";

export const pickerOffen = signal(false);
const pickerSuche = signal("");

export function BausteinPicker() {
  if (!pickerOffen.value) return null;
  const q = pickerSuche.value.trim().toLowerCase();
  const KAT = katalog.value;
  const imFall = new Set(fall.value.bausteinIds);

  const regionen = KAT.regionen
    .map((r) => ({
      r,
      bausteine: r.bausteine.filter(
        (b) =>
          !q ||
          b.titel.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q),
      ),
    }))
    .filter((x) => x.bausteine.length > 0);

  return (
    <div class="overlay picker">
      <div class="picker-kopf">
        <input
          class="suchfeld"
          type="search"
          autofocus
          placeholder="Baustein suchen…"
          value={pickerSuche.value}
          onInput={(e) =>
            (pickerSuche.value = (e.target as HTMLInputElement).value)
          }
        />
        <button
          class="btn-back"
          onClick={() => {
            pickerOffen.value = false;
            pickerSuche.value = "";
          }}
          aria-label="Schließen"
        >
          ✕
        </button>
      </div>
      <div class="picker-liste">
        {regionen.map(({ r, bausteine }) => (
          <div key={r.id} class="picker-region">
            <div class="g-label">
              {r.kuerzel} {r.name}
            </div>
            {bausteine.map((b) => {
              const drin = imFall.has(b.id);
              return (
                <button
                  key={b.id}
                  class={"zeile" + (drin ? " drin" : "")}
                  disabled={drin}
                  onClick={() => fuegeBausteinHinzu(b.id)}
                >
                  <div>
                    {b.titel}
                    <div class="zeile-sub">{BAUSTEIN_TYP_LABEL[b.typ]}</div>
                  </div>
                  <span class="typ">{drin ? "✓ im Fall" : "+ dazu"}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
