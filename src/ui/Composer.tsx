import { signal } from "@preact/signals";
import { katalog } from "../data/katalogStore.ts";
import { Baustein, BefundSlot, Segment } from "../model/types.ts";
import {
  entferneBaustein,
  fall,
  geheZu,
  neuerFall,
  setAuswahl,
  setBefundAbw,
  setBefundOk,
  setBefundSlot,
  setWert,
  sweepGruppe,
  toggleVersteckt,
} from "../store.ts";
import { MARKER_OFFEN, befundText, renderFall } from "../engine/render.ts";
import { BausteinPicker, pickerOffen } from "./BausteinPicker.tsx";
import { tick } from "./haptics.ts";
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
/** kollabierte Bausteine (Ansichts-Status, nicht im Fall) */
const kollabiert = signal<Record<string, boolean>>({});

type BefundSeg = Extract<Segment, { art: "befund" }>;

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

// zeichenklassen-gefilterter Detail-Freitext (nur klinische Angaben)
function filterDetail(s: string, maxLen: number): string {
  return s.replace(/[^\p{L}\p{N}\s°%\/.,()\-]/gu, "").slice(0, maxLen);
}

// ---------------------------------------------------------------- Slot-Steuerung
function SlotControl({ seg, slot }: { seg: BefundSeg; slot: BefundSlot }) {
  const f = fall.value;
  const key = `${seg.id}.${slot.id}`;

  if (slot.art === "auswahl") {
    const cur =
      f.befundSlots[key] != null && f.befundSlots[key] !== ""
        ? Number(f.befundSlots[key])
        : slot.default ?? 0;
    return (
      <div class="slot">
        <div class="slot-label">{slot.label}</div>
        <div class="pills">
          {slot.optionen.map((opt, i) => (
            <button
              key={i}
              class={"pill" + (cur === i ? " on" : "")}
              onClick={() => {
                tick();
                setBefundSlot(seg.id, slot.id, String(i));
              }}
            >
              {opt.trim() === "" ? "—" : opt.trim()}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (slot.art === "lokaleSeite") {
    const cur = f.befundSlots[key] ?? "";
    return (
      <div class="slot">
        <div class="slot-label">{slot.label}</div>
        <div class="pills">
          {["rechts", "links", "beidseits"].map((s) => (
            <button
              key={s}
              class={"pill" + (cur === s ? " on" : "")}
              onClick={() => {
                tick();
                setBefundSlot(seg.id, slot.id, cur === s ? "" : s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (slot.art === "zahl") {
    return (
      <div class="slot">
        <div class="slot-label">
          {slot.label}
          {slot.einheit && <span class="einheit">in {slot.einheit}</span>}
        </div>
        <input
          class="slot-input"
          type="text"
          inputMode="decimal"
          value={f.befundSlots[key] ?? ""}
          onInput={(e) =>
            setBefundSlot(seg.id, slot.id, (e.target as HTMLInputElement).value)
          }
        />
      </div>
    );
  }

  // detail
  return (
    <div class="slot">
      <div class="slot-label">{slot.label}</div>
      <input
        class="slot-input"
        type="text"
        maxLength={slot.maxLen}
        placeholder="z. B. lateral, 2 cm"
        value={f.befundSlots[key] ?? ""}
        onInput={(e) =>
          setBefundSlot(
            seg.id,
            slot.id,
            filterDetail((e.target as HTMLInputElement).value, slot.maxLen),
          )
        }
      />
      <div class="slot-hinweis">
        nur klinische Details – keine Namen/Patientenangaben
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Befundzeile
function Befundzeile({ seg }: { seg: BefundSeg }) {
  const f = fall.value;
  const status = f.befundStatus[seg.id]; // "ok" | "abw" | undefined(offen)
  const abw = status === "abw";
  const satz = abw ? befundText(seg, fall.value) : "";
  const offenerSatz = satz.includes(MARKER_OFFEN);

  return (
    <div class={"befundzeile " + (status ?? "offen")}>
      <div class="bz-kopf">
        <button
          class={"kreis " + (status ?? "offen")}
          aria-label="unauffällig bestätigen"
          onClick={() => {
            tick();
            setBefundOk(seg.id);
          }}
        >
          {status === "ok" ? "✓" : ""}
        </button>
        <button
          class="bz-body"
          onClick={() => {
            tick();
            setBefundAbw(seg.id);
          }}
        >
          <span class="bz-label">{seg.chip}</span>
          {abw && <span class="bz-chev">▾</span>}
        </button>
      </div>

      {abw && (
        <div class="bz-detail">
          {(seg.slots ?? []).map((slot) => (
            <SlotControl key={slot.id} seg={seg} slot={slot} />
          ))}
          <div class={"bz-satz" + (offenerSatz ? " offen" : "")}>
            {satz.split(MARKER_OFFEN).map((t, i, arr) => (
              <span key={i}>
                {t}
                {i < arr.length - 1 && <mark>?</mark>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Felder (Auswahl/Messwert/Platzhalter)
function Felder({ baustein }: { baustein: Baustein }) {
  const f = fall.value;
  const auswahlSegs = baustein.segmente.filter(
    (s): s is Extract<Segment, { art: "auswahl" }> => s.art === "auswahl",
  );
  const messwertSegs = baustein.segmente.filter(
    (s): s is Extract<Segment, { art: "messwert" }> => s.art === "messwert",
  );

  return (
    <>
      {messwertSegs.map((seg) => {
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

// ---------------------------------------------------------------- Baustein-Block
function BausteinBlock({ baustein }: { baustein: Baustein }) {
  const f = fall.value;
  const befunde = baustein.segmente.filter(
    (s): s is BefundSeg => s.art === "befund",
  );
  const abwZahl = befunde.filter(
    (b) => f.befundStatus[b.id] === "abw",
  ).length;
  const eingeklappt = !!kollabiert.value[baustein.id] && abwZahl === 0;

  // Gruppen in Auftrittsreihenfolge
  const gruppen: string[] = [];
  for (const b of befunde) {
    const g = b.gruppe ?? "Befund";
    if (!gruppen.includes(g)) gruppen.push(g);
  }

  return (
    <div class="baustein-block">
      <button
        class="bb-kopf"
        onClick={() =>
          (kollabiert.value = {
            ...kollabiert.value,
            [baustein.id]: !kollabiert.value[baustein.id],
          })
        }
      >
        <h3>{baustein.titel}</h3>
        {abwZahl > 0 ? (
          <span class="bb-badge abw">{abwZahl} auffällig</span>
        ) : (
          <span class="bb-badge">unauffällig ✓</span>
        )}
        <span class="bb-chev">{eingeklappt ? "▸" : "▾"}</span>
      </button>

      {!eingeklappt && (
        <>
          {gruppen.map((g) => {
            const inGruppe = befunde.filter((b) => (b.gruppe ?? "Befund") === g);
            const offenInGruppe = inGruppe.filter(
              (b) => f.befundStatus[b.id] == null,
            ).length;
            return (
              <div class="chip-gruppe" key={g}>
                <div class="g-kopf">
                  <span class="g-label">{g}</span>
                  {offenInGruppe > 0 && (
                    <button
                      class="g-sweep"
                      onClick={() => {
                        tick();
                        sweepGruppe(baustein.id, g);
                      }}
                    >
                      alle o.B. ✓
                    </button>
                  )}
                </div>
                {inGruppe.map((b) => (
                  <Befundzeile key={b.id} seg={b} />
                ))}
              </div>
            );
          })}
          <Felder baustein={baustein} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Composer
export function Composer() {
  const f = fall.value;
  const erg = renderFall(f, katalog.value);
  const bausteine = f.bausteinIds
    .map(findeBaustein)
    .filter((b): b is Baustein => !!b);

  let abwGesamt = 0;
  let offenGesamt = 0;
  for (const b of bausteine)
    for (const s of b.segmente)
      if (s.art === "befund") {
        const st = f.befundStatus[s.id];
        if (st === "abw") abwGesamt++;
        else if (st == null) offenGesamt++;
      }

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
            {abwGesamt === 0 ? "keine Abweichung" : `${abwGesamt} auffällig`}
            {offenGesamt > 0 ? ` · ${offenGesamt} offen` : ""}
          </div>
        </div>
      </div>

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
              <strong>Kreis = unauffällig bestätigen, Zeile = auffällig.</strong>{" "}
              Nur „auffällig" ändert den Text; tippe dann Details an.
            </div>
            <button onClick={tipWeg} aria-label="verstanden">
              ✕
            </button>
          </div>
        )}
        {bausteine.map((b) => (
          <BausteinBlock key={b.id} baustein={b} />
        ))}
      </div>

      <div class="vorschau">
        <div class="v-label">
          Vorschau{abwGesamt > 0 ? ` · ${abwGesamt} Abweichung${abwGesamt === 1 ? "" : "en"}` : ""}
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
