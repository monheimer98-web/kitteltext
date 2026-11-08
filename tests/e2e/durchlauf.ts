// Durchlauf eines Briefs nur mit der Tastatur: was hat gerade den Fokus, und welche Taste ist dort die naheliegende.
// Gemeinsam für den Gewohnheitslauf „Ziffer, Enter“, den Lauf „nur Enter“ und den Hauptweg.
import type { Page } from "@playwright/test";
import { aenderungen, bereit, drueckeUe, nachDemNaechstenBild, oeffneVorlage, stand } from "./hilfen.ts";

export type Lage =
  | { art: "eingabe"; kennung: string; mehrzeilig: boolean; leer: boolean; schnellwerte: boolean }
  | { art: "wahl"; kennung: string }
  | { art: "lesen"; kennung: string }
  | { art: "liste"; kennung: string; zeile: string | null; normal: boolean; offen: number; inAngabe: boolean; imFeld: boolean }
  | { art: "block"; kennung: string }
  | { art: "seite" | "person"; kennung: string }
  | { art: "ende"; kennung: string }
  | { art: "sonst"; kennung: string };

/** Was den Fokus hat, unabhängig davon, ob er auf dem Fenster, einer Gruppe oder einem Knopf darin liegt. */
export function lage(page: Page): Promise<Lage> {
  return page.evaluate((): Lage => {
    const a = document.activeElement as HTMLElement | null;
    const ff = document.querySelector<HTMLElement>(".feldfenster");
    if (ff) {
      const titel = ff.getAttribute("aria-label") ?? "";
      if (a && ff.contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) {
        const e = a as HTMLInputElement;
        return { art: "eingabe", kennung: `${titel} / ${e.getAttribute("aria-label")}`, mehrzeilig: e.tagName === "TEXTAREA", leer: !e.value, schnellwerte: !!ff.querySelector(".ff-vorschlaege button.pille") };
      }
      if (ff.querySelector(".ff-liste") || ff.querySelector(".ff-offen [role=radiogroup], [data-ziffern]")) return { art: "wahl", kennung: titel };
      return { art: "lesen", kennung: titel };
    }
    const bl = document.querySelector<HTMLElement>(".befundliste");
    if (bl) {
      const z = a?.closest<HTMLElement>("[data-zeile]") ?? null;
      return {
        art: "liste",
        kennung: bl.getAttribute("aria-label") ?? "",
        zeile: z ? z.className : null,
        normal: z ? [...z.querySelectorAll(".bz-wahl button")].some((b) => (b.textContent ?? "").includes("unauffällig")) : false,
        offen: bl.querySelectorAll(".bz-offen, .bz-vorschlag, .bz-luecke, .bz-einstufig").length,
        inAngabe: !!a?.closest(".pillen, input"),
        imFeld: a?.tagName === "INPUT",
      };
    }
    if (a?.closest("[data-seitenwahl]")) return { art: "seite", kennung: "seite" };
    if (a?.closest("[data-personwahl]")) return { art: "person", kennung: "person" };
    const block = a?.closest<HTMLElement>("[data-block]");
    if (block && (a?.hasAttribute("data-uebernehmen") || a === block)) return { art: "block", kennung: `block ${block.dataset.block}` };
    if (a?.hasAttribute("data-naechste-kopie")) return { art: "ende", kennung: a.textContent ?? "" };
    return { art: "sonst", kennung: a ? `${a.tagName}.${a.className} ${(a.textContent ?? "").slice(0, 40)}` : "nichts" };
  });
}

/**
 * Eine Taste wie ein Arzt, der hinsieht: Befehlstasten (Ziffer, Ü, U, A, N) erst, wenn der Halt sie annimmt (E-44).
 * Wer das Vorausgetippte prüft, nimmt `page.keyboard` oder `tastenSalve`.
 */
export async function taste(page: Page, k: string) {
  if (/^[1-9üuan]$/.test(k)) await bereit(page);
  if (k === "ü") await drueckeUe(page);
  else await page.keyboard.press(k);
  await nachDemNaechstenBild(page);
}

/** Vorlage öffnen; Seite und Person mit der Maus, wenn gefragt (der Lauf prüft die Tasten danach). */
export async function vorlageMitKopf(page: Page, suche: string, titel: string) {
  await oeffneVorlage(page, suche, titel);
  const seite = page.getByRole("radiogroup", { name: "Seite", exact: true });
  if (await seite.count()) await seite.getByRole("radio", { name: "rechts", exact: true }).click();
  const person = page.getByRole("radiogroup", { name: "Patient oder Patientin" });
  if (await person.count()) await person.getByRole("radio", { name: "Patient", exact: true }).click();
}

/**
 * Gewohnheit „Ziffer, Enter“ (Prüfskript P3 der Patientensicherheit): An jeder Wahl „1“ und danach Enter, Freitext
 * „x“ und F2, Befundlisten und Vorschlagsblöcke liest der Arzt und geht mit F2 weiter. Gibt jede Änderung zurück, die
 * ein Enter nach einer Ziffer am Brief bewirkt hat.
 */
export async function gewohnheitZifferEnter(page: Page): Promise<{ enter: number; ungewollt: string[]; rest: string[] }> {
  await taste(page, "F2");
  const ungewollt: string[] = [];
  const besucht = new Map<string, number>();
  let enter = 0;
  let ende = false;
  for (let i = 0; i < 90; i++) {
    const l = await lage(page);
    if (l.art === "ende") {
      ende = true;
      break;
    }
    const n = (besucht.get(l.art + l.kennung) ?? 0) + 1;
    besucht.set(l.art + l.kennung, n);
    if (n > 6) break;
    if (l.art === "eingabe") {
      // Wer hinsieht, schreibt erst, wenn das Feld zu sehen ist (E-45 Satz 4: Text in der Schreckzeit nimmt zurück).
      await bereit(page);
      await page.keyboard.type("x");
      await taste(page, "F2");
    } else if (l.art === "wahl") {
      await taste(page, "1");
      const vor = await stand(page);
      await taste(page, "Enter");
      enter++;
      const a = aenderungen(vor, await stand(page));
      if (a.length > 0) ungewollt.push(`nach „1“ an ${l.kennung}: ${a.join(" ‖ ")}`);
    } else {
      await taste(page, "F2");
    }
  }
  // Endet der Lauf an der Wiederholungsgrenze, dürfen nur Halte übrig sein, die er absichtlich überspringt: Befundlisten,
  // Vorschlagsblöcke und graue Sätze. Ein Fenster mit Wahl, ein Textfeld oder der Fallkopf heißt: Der Durchlauf ging im
  // Kreis (CR-TS02).
  const rest: string[] = [];
  const gesehen = new Set<string>();
  for (let i = 0; i < 30 && !ende; i++) {
    await taste(page, "F2");
    const l = await lage(page);
    if (l.art === "ende" || gesehen.has(l.art + l.kennung)) break;
    gesehen.add(l.art + l.kennung);
    if (!["liste", "block", "lesen"].includes(l.art)) rest.push(`${l.art}: ${l.kennung}`);
  }
  return { enter, ungewollt, rest };
}

/**
 * Hauptweg nur mit der Tastatur, je Halt die naheliegende Taste (QA-06): Seite, Person und Wahl „1“, Blöcke und graue
 * Sätze Ü, Textfelder Schnellwert oder „x“ und Enter. In der Befundliste je Zeile U oder N, graue Gruppen Ü, fehlende
 * Angaben „1“, ein Messwert „x“ und Enter; auf einer entschiedenen Zeile oder auf „Weiter“ Enter. Zählt jeden Tastendruck
 * bis zum Fokus auf „… kopieren“; getippte Zeichen zählen je eins.
 */
export async function hauptweg(page: Page): Promise<{ tasten: number; ende: boolean }> {
  let tasten = 0;
  for (let i = 0; i < 160; i++) {
    const l = await lage(page);
    if (l.art === "ende") return { tasten, ende: true };
    tasten++;
    switch (l.art) {
      case "seite":
      case "person":
      case "wahl":
        await taste(page, "1");
        break;
      case "block":
      case "lesen":
        await taste(page, "ü");
        break;
      case "eingabe":
        if (l.schnellwerte && l.leer) {
          await taste(page, "ArrowDown");
          await taste(page, "Enter");
          tasten++;
        } else {
          await bereit(page);
          await page.keyboard.type("x");
          await taste(page, l.mehrzeilig ? "Control+Enter" : "Enter");
          tasten++;
        }
        break;
      case "liste":
        if (l.imFeld) {
          // Messwert in der Liste: Wert eintragen, Enter (CR-TS04).
          await bereit(page);
          await page.keyboard.type("x");
          await taste(page, "Enter");
          tasten++;
        } else if (l.zeile === null || l.offen === 0) await taste(page, "Enter");
        else if (l.zeile.includes("bz-vorschlag")) await taste(page, "ü");
        else if (l.zeile.includes("bz-offen")) await taste(page, l.normal ? "u" : "n");
        else if (l.zeile.includes("bz-luecke") || l.zeile.includes("bz-einstufig")) await taste(page, "1");
        else await taste(page, "Enter");
        break;
      default:
        throw new Error(`Fokus ohne Ziel nach ${tasten - 1} Tasten: ${l.kennung}`);
    }
  }
  return { tasten, ende: false };
}
