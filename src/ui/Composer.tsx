import { katalog } from "../data/katalogStore.ts";
import { Baustein, Segment } from "../model/types.ts";
import {
  entferneBaustein,
  fall,
  geheZu,
  neuerFall,
  setAuswahl,
  setWert,
  toggleBefund,
  toggleVersteckt,
} from "../store.ts";
import { MARKER_OFFEN, renderFall } from "../engine/render.ts";
import { BausteinPicker, pickerOffen } from "./BausteinPicker.tsx";
import { tick } from "./haptics.ts";
import { signal } from "@preact/signals";
import { speichereAlsStapel } from "../data/katalogStore.ts";

const TIP_KEY = "kitteltext.tip.composer.v1";
const tipGesehen = signal(localStorage.getItem(TIP_KEY) === "1");
function tipWeg() {
  localStorage.setItem(TIP_KEY, "1");
  tipGesehen.value = true;
}

const stapelDialog = signal(false);
const stapelName = signal("");
const stapelToast = signal(false);

function findeBaustein(id: string): Baustein | undefined {
  for (const r of katalog.value.regionen) {
    const b = r.bausteine.find((x) => x.id === id);
    if (b) return b;
  }
  return undefined;
}

function inputMode(typ: string): string {
  return typ === "zahl" || typ === "zeitraum" || typ === "rom"
    ? "decimal"
    : "text";
}

function BefundChips({ baustein }: { baustein: Baustein }) {
  const f = fall.value;
  const befunde = baustein.segmente.filter(
    (s): s is Extract<Segment, { art: "befund" }> => s.art === "befund",
  );
  if (befunde.length === 0) return null;

  const gruppen: string[] = [];
  for (const b of befunde) {
    const g = b.gruppe ?? "Befund";
    if (!gruppen.includes(g)) gruppen.push(g);
  }

  return (
    <>
      {gruppen.map((g) => (
        <div class="chip-gruppe" key={g}>
          <div class="g-label">{g}</div>
          <div class="chips">
            {befunde
              .filter((b) => (b.gruppe ?? "Befund") === g)
              .map((b) => (
                <button
                  key={b.id}
                  class={"chip" + (f.befunde[b.id] ? " on" : "")}
                  onClick={() => {
                    tick();
                    toggleBefund(b.id);
                  }}
                >
                  {b.chip}
                </button>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Felder({ baustein }: { baustein: Baustein }) {
  const f = fall.value;

  const auswahlSegs = baustein.segmente.filter(
    (s): s is Extract<Segment, { art: "auswahl" }> => s.art === "auswahl",
  );

  return (
    <>
      {auswahlSegs.map((seg) => (
        <div class="feld" key={seg.id}>
          <label>{seg.label}</label>
          <select
            value={String(f.auswahl[seg.id] ?? seg.default ?? 0)}
            onChange={(e) =>
              setAuswahl(seg.id, Number((e.target as HTMLSelectElement).value))
            }
          >
            {seg.optionen.map((opt, i) => (
              <option value={String(i)} key={i}>
                {opt.trim() === "" ? "— (weglassen) —" : opt.trim()}
              </option>
            ))}
          </select>
        </div>
      ))}

      {baustein.segmente
        .filter(
          (s): s is Extract<Segment, { art: "messwert" }> =>
            s.art === "messwert",
        )
        .map((seg) => {
          const versteckt = !!f.versteckt[seg.id];
          return (
            <div class="feld" key={seg.id}>
              <label class="mess-label">
                <span>{seg.label}</span>
                <label class="mess-aus">
                  <input
                    type="checkbox"
                    checked={versteckt}
                    onChange={() => toggleVersteckt(seg.id)}
                  />
                  ausblenden
                </label>
              </label>
              {!versteckt && (
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={seg.normal ?? "…"}
                  value={f.werte[seg.id] ?? seg.normal ?? ""}
                  onInput={(e) =>
                    setWert(seg.id, (e.target as HTMLInputElement).value)
                  }
                />
              )}
            </div>
          );
        })}

      {baustein.platzhalter.map((p) => {
        const wert = f.werte[p.id] ?? p.default ?? "";
        const offen = !!p.required && wert.trim() === "";
        return (
          <div class="feld" key={p.id}>
            <label>
              {p.label}
              {p.einheit && <span class="einheit">in {p.einheit}</span>}
              {offen && <span class="pflicht-offen">· auszufüllen</span>}
            </label>
            <input
              class={offen ? "offen" : ""}
              type="text"
              inputMode={inputMode(p.typ) as any}
              placeholder={p.typ === "rom" ? "z. B. 0/0/140" : ""}
              value={f.werte[p.id] ?? p.default ?? ""}
              onInput={(e) =>
                setWert(p.id, (e.target as HTMLInputElement).value)
              }
            />
          </div>
        );
      })}
    </>
  );
}

export function Composer() {
  const f = fall.value;
  const erg = renderFall(f, katalog.value);
  const bausteine = f.bausteinIds
    .map(findeBaustein)
    .filter((b): b is Baustein => !!b);

  // aktive Abweichungen im aktuellen Fall zählen
  const befundIdsImFall = new Set<string>();
  for (const b of bausteine)
    for (const s of b.segmente) if (s.art === "befund") befundIdsImFall.add(s.id);
  const abweichungen = Object.entries(f.befunde).filter(
    ([id, v]) => v && befundIdsImFall.has(id),
  ).length;

  const vorschauTeile = erg.text.split(MARKER_OFFEN);

  return (
    <>
      <div class="topbar">
        <button class="btn-back" onClick={neuerFall} aria-label="Abbrechen">
          ‹
        </button>
        <div>
          <h1>Befund</h1>
          <div class="sub">
            {f.seite ? `Seite: ${f.seite} · ` : ""}
            {abweichungen === 0
              ? "alles unauffällig"
              : `${abweichungen} Abweichung${abweichungen === 1 ? "" : "en"}`}
          </div>
        </div>
      </div>

      {/* Fall-Leiste: Bausteine im Fall, entfernbar, + hinzufügen */}
      <div class="fall-leiste">
        {bausteine.map((b) => (
          <span key={b.id} class="fall-chip">
            {b.titel}
            {bausteine.length > 1 && (
              <button
                class="fall-chip-x"
                onClick={() => entferneBaustein(b.id)}
                aria-label="entfernen"
              >
                ✕
              </button>
            )}
          </span>
        ))}
        <button class="fall-add" onClick={() => (pickerOffen.value = true)}>
          + Baustein
        </button>
        {bausteine.length >= 2 && (
          <button
            class="fall-add stern"
            onClick={() => {
              stapelName.value = "";
              stapelDialog.value = true;
            }}
          >
            ★ als Stapel
          </button>
        )}
      </div>

      <div class="content">
        {!tipGesehen.value && (
          <div class="tip">
            <div>
              <strong>Normalbefund ist vorausgewählt.</strong> Tippe nur die
              Abweichungen an – der Rest bleibt unauffällig.
            </div>
            <button onClick={tipWeg} aria-label="verstanden">
              ✕
            </button>
          </div>
        )}
        {bausteine.map((b) => (
          <div class="baustein-block" key={b.id}>
            <h3>{b.titel}</h3>
            <BefundChips baustein={b} />
            <Felder baustein={b} />
          </div>
        ))}
      </div>

      <div class="vorschau">
        <div class="v-label">
          Vorschau{abweichungen > 0 ? ` · ${abweichungen} angetippt` : ""}
        </div>
        <div class="v-text">
          {vorschauTeile.map((t, i) => (
            <span key={i}>
              {t}
              {i < vorschauTeile.length - 1 && <mark>?</mark>}
            </span>
          ))}
        </div>
        <button class="cta" onClick={() => geheZu("review")}>
          Fertig · prüfen
        </button>
      </div>

      <BausteinPicker />

      {stapelDialog.value && (
        <div class="overlay">
          <div class="karte">
            <h2>Als Stapel speichern</h2>
            <p>
              Diese {bausteine.length} Bausteine als eigene Ein-Tap-Kombination
              sichern – erscheint künftig oben auf der Startseite.
            </p>
            <div class="feld">
              <input
                type="text"
                autofocus
                placeholder="Name, z. B. „OSG-Distorsion“"
                value={stapelName.value}
                onInput={(e) =>
                  (stapelName.value = (e.target as HTMLInputElement).value)
                }
              />
            </div>
            <button
              class="cta"
              disabled={!stapelName.value.trim()}
              onClick={() => {
                speichereAlsStapel(stapelName.value, f.bausteinIds);
                stapelDialog.value = false;
                stapelToast.value = true;
                setTimeout(() => (stapelToast.value = false), 2200);
              }}
            >
              Speichern
            </button>
            <button
              class="cta"
              style="background:transparent;color:var(--text-dim);min-height:44px;margin-top:6px"
              onClick={() => (stapelDialog.value = false)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {stapelToast.value && <div class="toast">★ Als Stapel gespeichert</div>}
    </>
  );
}
