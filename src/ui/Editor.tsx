import { signal } from "@preact/signals";
import { Baustein, BausteinTyp, Region, Segment } from "../model/types.ts";
import {
  bearbeiteKatalog,
  exportJson,
  importJson,
  katalog,
  resetKatalog,
} from "../data/katalogStore.ts";
import { geheZu } from "../store.ts";
import { kopiereText } from "./clipboard.ts";

// interne Editor-Navigation
type View =
  | { v: "root" }
  | { v: "stapel" }
  | { v: "regionen" }
  | { v: "baustein"; id: string };
const view = signal<View>({ v: "root" });

function neueId(praefix: string): string {
  // deterministisch genug: Praefix + laufender Zaehler ueber vorhandene IDs
  let n = 1;
  const alle = new Set<string>();
  for (const r of katalog.value.regionen)
    for (const b of r.bausteine) alle.add(b.id);
  for (const s of katalog.value.stapel) alle.add(s.id);
  while (alle.has(`${praefix}-${n}`)) n++;
  return `${praefix}-${n}`;
}

function findeBaustein(id: string): { region: Region; baustein: Baustein } | null {
  for (const r of katalog.value.regionen) {
    const b = r.bausteine.find((x) => x.id === id);
    if (b) return { region: r, baustein: b };
  }
  return null;
}

// ----------------------------------------------------------------- Root
function Root() {
  const info = { ...zaehle() };
  return (
    <div class="content">
      <p class="hinweis">
        Änderungen bleiben nur auf diesem Gerät. Der eingebaute Standardkatalog
        lässt sich jederzeit wiederherstellen.
      </p>
      <div class="liste">
        <button class="zeile" onClick={() => (view.value = { v: "stapel" })}>
          Stapel verwalten
          <span class="typ">{katalog.value.stapel.length}</span>
        </button>
        <button class="zeile" onClick={() => (view.value = { v: "regionen" })}>
          Bausteine bearbeiten
          <span class="typ">{info.bausteine}</span>
        </button>
      </div>

      <div class="label">Sichern & Übertragen</div>
      <ImportExport />
    </div>
  );
}

function zaehle() {
  let bausteine = 0;
  for (const r of katalog.value.regionen) bausteine += r.bausteine.length;
  return { bausteine };
}

// ----------------------------------------------------------------- Stapel
function StapelView() {
  const stapel = katalog.value.stapel;
  return (
    <div class="content">
      <p class="hinweis">
        Ein Stapel lädt mehrere Bausteine mit einem Tap – deine eigenen
        Kombinationen (z. B. „OSG-Distorsion" = Untersuchung + Procedere).
      </p>
      <div class="liste">
        {stapel.map((s) => (
          <div key={s.id} class="edit-karte">
            <input
              class="edit-titel"
              value={s.name}
              onInput={(e) =>
                bearbeiteKatalog((k) => {
                  const t = k.stapel.find((x) => x.id === s.id);
                  if (t) t.name = (e.target as HTMLInputElement).value;
                })
              }
            />
            <div class="chips" style="margin:8px 0">
              {alleBausteineFlach().map((b) => {
                const drin = s.bausteinIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    class={"chip" + (drin ? " on" : "")}
                    onClick={() =>
                      bearbeiteKatalog((k) => {
                        const t = k.stapel.find((x) => x.id === s.id);
                        if (!t) return;
                        if (drin)
                          t.bausteinIds = t.bausteinIds.filter(
                            (x) => x !== b.id,
                          );
                        else t.bausteinIds.push(b.id);
                      })
                    }
                  >
                    {b.titel}
                  </button>
                );
              })}
            </div>
            <button
              class="mini-del"
              onClick={() =>
                bearbeiteKatalog((k) => {
                  k.stapel = k.stapel.filter((x) => x.id !== s.id);
                })
              }
            >
              Stapel löschen
            </button>
          </div>
        ))}
      </div>
      <button
        class="cta"
        style="margin-top:14px"
        onClick={() =>
          bearbeiteKatalog((k) => {
            k.stapel.push({
              id: neueId("stapel"),
              name: "Neuer Stapel",
              bausteinIds: [],
            });
          })
        }
      >
        + Neuer Stapel
      </button>
    </div>
  );
}

function alleBausteineFlach(): Baustein[] {
  const out: Baustein[] = [];
  for (const r of katalog.value.regionen) out.push(...r.bausteine);
  return out;
}

// ----------------------------------------------------------------- Regionen
function RegionenView() {
  return (
    <div class="content">
      {katalog.value.regionen.map((r) => (
        <div key={r.id} class="baustein-block">
          <h3>
            {r.kuerzel} {r.name}
          </h3>
          <div class="liste">
            {r.bausteine.map((b) => (
              <button
                key={b.id}
                class="zeile"
                onClick={() => (view.value = { v: "baustein", id: b.id })}
              >
                {b.titel}
                <span class="typ">{b.typ}</span>
              </button>
            ))}
            <button
              class="zeile neu"
              onClick={() =>
                bearbeiteKatalog((k) => {
                  const reg = k.regionen.find((x) => x.id === r.id);
                  reg?.bausteine.push({
                    id: neueId(r.id),
                    titel: "Neuer Baustein",
                    typ: "befund",
                    platzhalter: [],
                    segmente: [{ art: "text", text: "" }],
                  });
                })
              }
            >
              + Baustein in {r.name}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- Baustein
const TYPEN: BausteinTyp[] = [
  "anamnese",
  "untersuchung",
  "befund",
  "procedere",
  "anordnung",
];

function BausteinView({ id }: { id: string }) {
  const found = findeBaustein(id);
  if (!found) {
    return (
      <div class="content">
        <p class="hinweis">Baustein nicht gefunden.</p>
      </div>
    );
  }
  const b = found.baustein;

  function mutiere(fn: (b: Baustein) => void) {
    bearbeiteKatalog((k) => {
      for (const r of k.regionen) {
        const bb = r.bausteine.find((x) => x.id === id);
        if (bb) {
          fn(bb);
          return;
        }
      }
    });
  }

  return (
    <div class="content">
      <div class="feld">
        <label>Titel</label>
        <input
          value={b.titel}
          onInput={(e) =>
            mutiere((bb) => (bb.titel = (e.target as HTMLInputElement).value))
          }
        />
      </div>
      <div class="feld">
        <label>Typ</label>
        <select
          value={b.typ}
          onChange={(e) =>
            mutiere(
              (bb) =>
                (bb.typ = (e.target as HTMLSelectElement).value as BausteinTyp),
            )
          }
        >
          {TYPEN.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div class="label">Textbausteine & Befunde</div>
      {b.segmente.map((seg, i) => (
        <SegmentEditor
          key={i}
          seg={seg}
          index={i}
          anzahl={b.segmente.length}
          mutiere={mutiere}
        />
      ))}

      <div class="chips" style="margin-top:10px">
        <button
          class="chip"
          onClick={() =>
            mutiere((bb) => bb.segmente.push({ art: "text", text: "" }))
          }
        >
          + Text
        </button>
        <button
          class="chip"
          onClick={() =>
            mutiere((bb) =>
              bb.segmente.push({
                art: "befund",
                id: `${id}-bef-${bb.segmente.length}`,
                chip: "Neuer Befund",
                normal: "",
                abweichung: "",
              }),
            )
          }
        >
          + Befund (Negativ-Default)
        </button>
        <button
          class="chip"
          onClick={() =>
            mutiere((bb) => bb.segmente.push({ art: "seite" }))
          }
        >
          + Seite
        </button>
      </div>

      <button
        class="mini-del"
        style="margin-top:18px"
        onClick={() => {
          if (!confirm("Diesen Baustein löschen?")) return;
          bearbeiteKatalog((k) => {
            for (const r of k.regionen)
              r.bausteine = r.bausteine.filter((x) => x.id !== id);
            k.stapel.forEach(
              (s) => (s.bausteinIds = s.bausteinIds.filter((x) => x !== id)),
            );
          });
          view.value = { v: "regionen" };
        }}
      >
        Baustein löschen
      </button>
    </div>
  );
}

function SegmentEditor({
  seg,
  index,
  anzahl,
  mutiere,
}: {
  seg: Segment;
  index: number;
  anzahl: number;
  mutiere: (fn: (b: Baustein) => void) => void;
}) {
  function set(fn: (s: any) => void) {
    mutiere((b) => fn(b.segmente[index] as any));
  }
  function move(d: number) {
    mutiere((b) => {
      const j = index + d;
      if (j < 0 || j >= b.segmente.length) return;
      const tmp = b.segmente[index];
      b.segmente[index] = b.segmente[j];
      b.segmente[j] = tmp;
    });
  }
  function del() {
    mutiere((b) => b.segmente.splice(index, 1));
  }

  return (
    <div class="seg">
      <div class="seg-kopf">
        <span class="seg-art">{segLabel(seg)}</span>
        <div class="spacer" />
        <button class="seg-btn" disabled={index === 0} onClick={() => move(-1)}>
          ↑
        </button>
        <button
          class="seg-btn"
          disabled={index === anzahl - 1}
          onClick={() => move(1)}
        >
          ↓
        </button>
        <button class="seg-btn del" onClick={del}>
          ✕
        </button>
      </div>

      {seg.art === "text" && (
        <textarea
          class="seg-text"
          rows={2}
          value={seg.text}
          onInput={(e) =>
            set((s) => (s.text = (e.target as HTMLTextAreaElement).value))
          }
        />
      )}

      {seg.art === "befund" && (
        <>
          <input
            class="seg-input"
            placeholder="Chip-Label"
            value={seg.chip}
            onInput={(e) =>
              set((s) => (s.chip = (e.target as HTMLInputElement).value))
            }
          />
          <input
            class="seg-input"
            placeholder="Gruppe (optional)"
            value={seg.gruppe ?? ""}
            onInput={(e) =>
              set((s) => (s.gruppe = (e.target as HTMLInputElement).value))
            }
          />
          <textarea
            class="seg-text"
            rows={2}
            placeholder="Normalbefund (Default)"
            value={seg.normal}
            onInput={(e) =>
              set((s) => (s.normal = (e.target as HTMLTextAreaElement).value))
            }
          />
          <textarea
            class="seg-text abw"
            rows={2}
            placeholder="Abweichung (angetippt)"
            value={seg.abweichung}
            onInput={(e) =>
              set(
                (s) => (s.abweichung = (e.target as HTMLTextAreaElement).value),
              )
            }
          />
        </>
      )}

      {seg.art === "seite" && (
        <div class="hinweis">Fügt die gewählte Körperseite ein.</div>
      )}
      {seg.art === "auswahl" && (
        <div class="hinweis">
          Auswahl „{seg.label}" mit {seg.optionen.length} Optionen (im
          Volleditor bearbeitbar).
        </div>
      )}
      {seg.art === "platzhalter" && (
        <div class="hinweis">Platzhalter-Verweis: {seg.ref}</div>
      )}
    </div>
  );
}

function segLabel(seg: Segment): string {
  switch (seg.art) {
    case "text":
      return "Text";
    case "befund":
      return "Befund";
    case "seite":
      return "Seite";
    case "auswahl":
      return "Auswahl";
    case "platzhalter":
      return "Platzhalter";
  }
}

// ----------------------------------------------------------------- Import/Export
const importFehler = signal<string>("");
const kopiert = signal(false);

function ImportExport() {
  async function kopieren() {
    if (await kopiereText(exportJson())) {
      kopiert.value = true;
      setTimeout(() => (kopiert.value = false), 1800);
    }
  }
  function datei(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importJson(String(reader.result));
        importFehler.value = "";
        view.value = { v: "root" };
      } catch (err) {
        importFehler.value = "Import fehlgeschlagen: " + String(err);
      }
    };
    reader.readAsText(f);
  }
  return (
    <div class="liste">
      <button class="cta" onClick={kopieren}>
        {kopiert.value ? "✓ Katalog kopiert" : "Katalog als JSON kopieren"}
      </button>
      <label class="cta" style="text-align:center">
        Katalog aus Datei importieren
        <input
          type="file"
          accept="application/json,.json"
          style="display:none"
          onChange={datei}
        />
      </label>
      {importFehler.value && (
        <p class="hinweis" style="color:var(--warn)">
          {importFehler.value}
        </p>
      )}
      <button
        class="mini-del"
        onClick={() => {
          if (confirm("Auf eingebauten Standardkatalog zurücksetzen? Eigene Änderungen gehen verloren.")) {
            resetKatalog();
            view.value = { v: "root" };
          }
        }}
      >
        Auf Standard zurücksetzen
      </button>
    </div>
  );
}

// ----------------------------------------------------------------- Rahmen
export function Editor() {
  const v = view.value;
  const titel =
    v.v === "root"
      ? "Editor"
      : v.v === "stapel"
        ? "Stapel"
        : v.v === "regionen"
          ? "Bausteine"
          : findeBaustein(v.id)?.baustein.titel ?? "Baustein";

  function zurueck() {
    if (v.v === "root") geheZu("settings");
    else if (v.v === "baustein") view.value = { v: "regionen" };
    else view.value = { v: "root" };
  }

  return (
    <>
      <div class="topbar">
        <button class="btn-back" onClick={zurueck} aria-label="Zurück">
          ‹
        </button>
        <div>
          <h1>{titel}</h1>
          <div class="sub">Katalog bearbeiten</div>
        </div>
      </div>
      {v.v === "root" && <Root />}
      {v.v === "stapel" && <StapelView />}
      {v.v === "regionen" && <RegionenView />}
      {v.v === "baustein" && <BausteinView id={v.id} />}
    </>
  );
}
