import { signal } from "@preact/signals";
import { katalog } from "../data/katalogStore.ts";
import { BAUSTEIN_TYP_LABEL, Baustein } from "../model/types.ts";
import { geheZu, offeneRegion, starteFall } from "../store.ts";
import { letzte } from "../recent.ts";

const suche = signal("");

interface Treffer {
  bausteinIds: string[];
  titel: string;
  unterzeile: string;
}

function suchTreffer(q: string): Treffer[] {
  const norm = q.trim().toLowerCase();
  if (!norm) return [];
  const KAT = katalog.value;
  const treffer: Treffer[] = [];
  // Stapel zuerst
  for (const s of KAT.stapel) {
    if (s.name.toLowerCase().includes(norm))
      treffer.push({
        bausteinIds: s.bausteinIds,
        titel: s.name,
        unterzeile: "Stapel",
      });
  }
  // dann einzelne Bausteine
  for (const r of KAT.regionen) {
    for (const b of r.bausteine) {
      if (
        b.titel.toLowerCase().includes(norm) ||
        r.name.toLowerCase().includes(norm)
      )
        treffer.push({
          bausteinIds: [b.id],
          titel: b.titel,
          unterzeile: `${r.name} · ${BAUSTEIN_TYP_LABEL[b.typ]}`,
        });
    }
  }
  return treffer.slice(0, 40);
}

export function Home() {
  const KAT = katalog.value;
  const region = offeneRegion.value
    ? KAT.regionen.find((r) => r.id === offeneRegion.value)
    : null;
  const q = suche.value;
  const treffer = suchTreffer(q);
  const zuletzt = letzte.value;

  return (
    <>
      <div class="topbar">
        {region && (
          <button
            class="btn-back"
            onClick={() => (offeneRegion.value = null)}
            aria-label="Zurück"
          >
            ‹
          </button>
        )}
        <div>
          <h1>{region ? region.name : "Kitteltext"}</h1>
          <div class="sub">
            {region ? "Baustein wählen" : "Baustein in wenigen Taps"}
          </div>
        </div>
        {!region && (
          <>
            <div class="spacer" />
            <button
              class="btn-back"
              onClick={() => geheZu("settings")}
              aria-label="Einstellungen"
            >
              ⚙
            </button>
          </>
        )}
      </div>

      <div class="content">
        {!region && (
          <>
            <input
              class="suchfeld"
              type="search"
              placeholder="Suchen (z. B. OSG, Fraktur, Procedere)…"
              value={q}
              onInput={(e) => (suche.value = (e.target as HTMLInputElement).value)}
            />

            {q ? (
              <div class="liste" style="margin-top:12px">
                {treffer.length === 0 && (
                  <p class="hinweis">Keine Treffer für „{q}".</p>
                )}
                {treffer.map((t, i) => (
                  <button
                    key={i}
                    class="zeile"
                    onClick={() => {
                      suche.value = "";
                      starteFall(t.bausteinIds, t.titel);
                    }}
                  >
                    <div>
                      {t.titel}
                      <div class="zeile-sub">{t.unterzeile}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {zuletzt.length > 0 && (
                  <>
                    <div class="label">Zuletzt</div>
                    <div class="stapel-row">
                      {zuletzt.map((z, i) => (
                        <button
                          key={i}
                          class="stapel grau"
                          onClick={() => starteFall(z.bausteinIds)}
                        >
                          {z.titel}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {KAT.stapel.length > 0 && (
                  <>
                    <div class="label">Stapel · ein Tap</div>
                    <div class="stapel-row">
                      {KAT.stapel.map((s) => (
                        <button
                          key={s.id}
                          class="stapel"
                          onClick={() => starteFall(s.bausteinIds, s.name)}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div class="label">Regionen</div>
                <div class="grid">
                  {KAT.regionen.map((r) => (
                    <button
                      key={r.id}
                      class="kachel"
                      onClick={() => (offeneRegion.value = r.id)}
                    >
                      <span class="emoji">{r.kuerzel}</span>
                      {r.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {region && (
          <div class="liste">
            {region.bausteine.map((b: Baustein) => (
              <button
                key={b.id}
                class="zeile"
                onClick={() => starteFall([b.id], b.titel)}
              >
                {b.titel}
                <span class="typ">{BAUSTEIN_TYP_LABEL[b.typ]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
