// Kasten „Standardprotokoll“ im Procedere (E-49, E-52, E-54): Übernehmen, Entfernen, Wechsel der Variante, Lücke
// Gehhilfe, Seite, Tastatur und Kopieren des fertigen Briefs. Jeder Test vergleicht, wo es um „nichts geändert“ geht,
// den ganzen Brief vor und nach der Taste (`stand`).
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { abschnitt, aenderungen, bereit, feldfenster, meldung, nachDemNaechstenBild, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, setzeZwischenablage, stand, waehleZiffer, zwischenablage } from "./hilfen.ts";
import { lage, taste } from "./durchlauf.ts";

const SHF = { suche: "Schenkelhalsfraktur Duokopf", titel: "Schenkelhalsfraktur, Duokopf- oder Totalendoprothese" };
const DORSAL = "proc-st-protokoll-schenkelhalsfraktur-prothese-1";
const VORN = "proc-st-protokoll-schenkelhalsfraktur-prothese-2";
// Was #4 ersetzt (protokolle.json): Belastung, Gehhilfe, Bewegungsregeln, Röntgenkontrolle der Vorlage.
const ERSETZT = ["proc-st-belastung-hueftfraktur/bein", "proc-st-belastung/hilfsmittel", "proc-st-hueftprothese-luxation/regeln", "proc-st-kontrollen/roentgen", "proc-st-physio/physio"];

function kasten(page: Page): Locator {
  return abschnitt(page, "procedere").locator("[data-protokoll-kasten]");
}
function variante(page: Page, id: string): Locator {
  return kasten(page).locator(`[data-protokoll="${id}"]`);
}
function zeile(page: Page, id: string, nr: number): Locator {
  return abschnitt(page, "procedere").locator(`[data-key="${id}/z${nr}"]`);
}
/** Schlüssel der Textstellen im Brief, die zu einem Baustein gehören. */
function stellenVon(s: Record<string, string>, id: string): string[] {
  return Object.keys(s).filter((k) => k.startsWith(`${id}/`));
}

async function shf(page: Page, seite: "rechts" | "links" | "beidseits" | "ohne Seite" = "rechts") {
  await oeffneApp(page);
  await oeffneVorlage(page, SHF.suche, SHF.titel);
  await setzeSeiteUndPerson(page, seite, "Patientin");
}

test("Übernehmen: Zeilen schwarz zuoberst, ersetzte Sätze treten zurück und die Meldung nennt sie; Gehhilfe ist Lücke, bis gewählt", async ({ page }) => {
  await shf(page);
  const pro = abschnitt(page, "procedere");
  await expect(kasten(page).getByRole("heading", { name: "Standardprotokoll" })).toBeVisible();
  await expect(kasten(page)).toContainText("ärztlich freigegeben 08.11.2026");
  await expect(variante(page, DORSAL)).toContainText("Schenkelhalsfraktur mit Prothese, dorsaler Zugang: Vollbelastung, Luxationsregeln 6 Wochen");
  const vorher = await stand(page);
  for (const k of ERSETZT) expect(vorher[k], k).toBeTruthy();

  // Vorschau: grau, mit Seite und Lücke, nicht im Brief.
  await variante(page, DORSAL).getByRole("button", { name: "Vorschau" }).click();
  await expect(variante(page, DORSAL).getByRole("button", { name: "Vorschau schließen" })).toHaveAttribute("aria-expanded", "true");
  await expect(variante(page, DORSAL)).toContainText("1. bis 6. Woche nach der Operation: Vollbelastung des Beins rechts ‹Gehhilfe›.");
  await expect(pro.locator(".ab-text")).not.toContainText("Vollbelastung des Beins rechts");
  expect(aenderungen(vorher, await stand(page))).toEqual([]);

  await variante(page, DORSAL).getByRole("button", { name: "Übernehmen" }).click();
  // Die Gehhilfe fehlt: Ihr Fenster ist offen, der Satz ist Lücke, der Procedere nicht kopierbar.
  await expect(feldfenster(page)).toHaveAccessibleName("Protokoll: 1. bis 6. Woche nach der Operation");
  await expect(feldfenster(page).getByRole("radiogroup", { name: "Gehhilfe" })).toBeVisible();
  await expect(meldung(page)).toContainText(
    "Übernommen: Standardprotokoll „dorsaler Zugang“. Dafür nicht mehr im Brief: „Belastung Bein“, „Gehhilfe“, „Bewegungsregeln nach Hüftprothese“, „Röntgenkontrolle Arm oder Bein (Wochen)“, „Physiotherapie“.",
  );
  const mit = await stand(page);
  for (const k of ERSETZT) expect(mit[k], k).toBeUndefined();
  // E-71: Das Protokoll ersetzt nur den Inhaltssatz der Physiotherapie; die Frage nach der Verordnung bleibt.
  expect(mit["proc-st-physio/verordnung"], "proc-st-physio/verordnung").toBeTruthy();
  expect(mit[`${DORSAL}/z1`]).toMatch(/^z-offen \| .*, fehlt noch$/);
  for (const nr of [2, 3, 4, 5, 6]) expect(mit[`${DORSAL}/z${nr}`], `z${nr}`).toMatch(/^z-gesetzt \| /);
  // Zuoberst im Procedere: der erste Block des Abschnitts.
  await expect(pro.locator(".ab-text [data-block]").first()).toHaveAttribute("data-block", DORSAL);
  await expect(pro.getByRole("button", { name: /offen.*klären$/ })).toBeVisible();
  await expect(variante(page, DORSAL)).toContainText("im Brief");

  await feldfenster(page).getByRole("radiogroup", { name: "Gehhilfe" }).getByRole("radio", { name: /am Rollator/ }).click();
  await expect(zeile(page, DORSAL, 1)).toHaveText("1. bis 6. Woche nach der Operation: Vollbelastung des Beins rechts am Rollator.");
  expect((await stand(page))[`${DORSAL}/z1`]).toMatch(/^z-gesetzt \| /);
  await expect(zeile(page, DORSAL, 5)).toHaveText("Röntgenkontrolle der Hüfte rechts 6 Wochen nach der Operation in der unfallchirurgischen oder orthopädischen Praxis.");
});

test("Entfernen: ein Klick; der Brief steht genau wie vorher da, auch eine vorher gewählte Belastung; Rückgängig bringt das Protokoll grau", async ({ page }) => {
  await shf(page);
  // Vorher wählt der Arzt die Belastung selbst.
  await abschnitt(page, "procedere").locator('[data-key="proc-st-belastung-hueftfraktur/bein"]').click();
  await waehleZiffer(page, "1");
  await waehleZiffer(page, "1");
  await page.keyboard.press("Escape");
  await nachDemNaechstenBild(page);
  const vorher = await stand(page);
  expect(vorher["proc-st-belastung-hueftfraktur/bein"]).toMatch(/^z-gesetzt \| /);

  await variante(page, DORSAL).getByRole("button", { name: "Übernehmen" }).click();
  await feldfenster(page).getByRole("radiogroup", { name: "Gehhilfe" }).getByRole("radio", { name: /an Unterarmgehstützen/ }).click();
  expect((await stand(page))["proc-st-belastung-hueftfraktur/bein"]).toBeUndefined();

  await variante(page, DORSAL).getByRole("button", { name: "Entfernen" }).click();
  expect(aenderungen(vorher, await stand(page))).toEqual([]);
  await expect(meldung(page)).toContainText("Entfernt: Standardprotokoll „dorsaler Zugang“. Wieder im Brief: „Belastung Bein“, „Gehhilfe“, „Bewegungsregeln nach Hüftprothese“, „Röntgenkontrolle Arm oder Bein (Wochen)“, „Physiotherapie“.");
  // Der Fokus liegt auf dem Kasten, nicht auf „Übernehmen“: Ein zweites Enter setzt nichts.
  await expect(kasten(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await nachDemNaechstenBild(page);
  expect(aenderungen(vorher, await stand(page))).toEqual([]);

  // Rückgängig in der Meldung nur in die sichere Richtung (E-48): Das Protokoll steht wieder da, aber grau, nicht schwarz.
  await page.keyboard.press("Escape");
  await variante(page, DORSAL).getByRole("button", { name: "Übernehmen" }).click();
  await feldfenster(page).getByRole("radiogroup", { name: "Gehhilfe" }).getByRole("radio", { name: /am Gehwagen/ }).click();
  await variante(page, DORSAL).getByRole("button", { name: "Entfernen" }).click();
  await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
  await expect(meldung(page)).toContainText("Zurückgenommen: Entfernen von Standardprotokoll „dorsaler Zugang“. „dorsaler Zugang“ steht grau im Brief; Ü übernimmt.");
  const zurueck = await stand(page);
  const zeilen = stellenVon(zurueck, DORSAL);
  expect(zeilen.length).toBe(6);
  for (const k of zeilen) expect(zurueck[k], k).toMatch(/^z-(vorschlag|offen) \| /);
});

test("Variante wechseln: ein Klick, nur eine Variante im Brief, die gewählte Gehhilfe geht mit, der Fokus liegt auf dem Kasten", async ({ page }) => {
  await shf(page);
  await variante(page, DORSAL).getByRole("button", { name: "Übernehmen" }).click();
  await feldfenster(page).getByRole("radiogroup", { name: "Gehhilfe" }).getByRole("radio", { name: /am Rollator/ }).click();
  await expect(variante(page, VORN).getByRole("button", { name: "Stattdessen übernehmen" })).toBeVisible();
  await variante(page, VORN).getByRole("button", { name: "Stattdessen übernehmen" }).click();
  await expect(meldung(page)).toContainText("Übernommen: Standardprotokoll „vorderer oder seitlicher Zugang“ statt „dorsaler Zugang“.");
  const s = await stand(page);
  expect(stellenVon(s, DORSAL)).toEqual([]);
  expect(stellenVon(s, VORN).length).toBe(6);
  await expect(zeile(page, VORN, 1)).toHaveText("1. bis 6. Woche nach der Operation: Vollbelastung des Beins rechts am Rollator.");
  await expect(zeile(page, VORN, 2)).toContainText("Hüfte rechts nicht überstrecken und das Bein nicht nach außen drehen.");
  await expect(feldfenster(page)).toHaveCount(0);
  await expect(kasten(page)).toBeFocused();
  await expect(variante(page, VORN)).toContainText("im Brief");
  await expect(variante(page, DORSAL).getByRole("button", { name: "Stattdessen übernehmen" })).toBeVisible();
});

test("Seite: links in Vorschau und Brief; Wechsel der Seite des Briefs dreht die Zeilen; ohne Seite kein Seitenwort; Vermerk ohne Leitlinie sichtbar", async ({ page }) => {
  await shf(page, "links");
  await variante(page, DORSAL).getByRole("button", { name: "Vorschau" }).click();
  await expect(variante(page, DORSAL)).toContainText("Röntgenkontrolle der Hüfte links 6 Wochen nach der Operation");
  await variante(page, DORSAL).getByRole("button", { name: "Übernehmen" }).click();
  await feldfenster(page).getByRole("radiogroup", { name: "Gehhilfe" }).getByRole("radio", { name: /am Rollator/ }).click();
  await expect(zeile(page, DORSAL, 1)).toHaveText("1. bis 6. Woche nach der Operation: Vollbelastung des Beins links am Rollator.");
  await expect(zeile(page, DORSAL, 2)).toContainText("Hüfte links nicht über 90° beugen");
  const kopf = page.getByRole("radiogroup", { name: "Seite", exact: true });
  await kopf.getByRole("radio", { name: "rechts", exact: true }).click();
  await kopf.getByRole("radio", { name: "auf „rechts“ ändern?" }).click();
  await expect(meldung(page)).toContainText("Seite des ganzen Briefs: rechts (vorher links)");
  await expect(zeile(page, DORSAL, 1)).toHaveText("1. bis 6. Woche nach der Operation: Vollbelastung des Beins rechts am Rollator.");
  await expect(zeile(page, DORSAL, 5)).toHaveText("Röntgenkontrolle der Hüfte rechts 6 Wochen nach der Operation in der unfallchirurgischen oder orthopädischen Praxis.");
  await kopf.getByRole("radio", { name: "ohne Seite", exact: true }).click();
  await kopf.getByRole("radio", { name: "auf „ohne Seite“ ändern?" }).click();
  await expect(zeile(page, DORSAL, 1)).toHaveText("1. bis 6. Woche nach der Operation: Vollbelastung des Beins am Rollator.");

  // Protokolle ohne Leitlinie tragen den Vermerk im Kasten, nicht im Brief.
  await page.getByRole("button", { name: "+ Neuer Fall" }).click();
  await oeffneVorlage(page, "periprothetische femurfraktur", "Periprothetische Femurfraktur bei Hüftprothese");
  await expect(kasten(page)).toContainText("(ohne Leitlinie, Hausschema empfohlen)");
  await variante(page, "proc-st-protokoll-periprothetische-femurfraktur-huefte-1").getByRole("button", { name: "Übernehmen" }).click();
  await page.keyboard.press("Escape");
  await expect(abschnitt(page, "procedere").locator(".ab-text")).not.toContainText("Leitlinie");
});

test("Tastatur: F2 hält nie im Kasten; Tab erreicht „Übernehmen“, Enter übernimmt dort; Enter auf dem Kasten setzt nichts", async ({ page }) => {
  await shf(page);
  // Durchlauf: alle Halte einmal, keiner im Kasten (E-54: kein Halt).
  const besucht: string[] = [];
  for (let i = 0; i < 80; i++) {
    await taste(page, "F2");
    const ziel = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      const offen = document.querySelector<HTMLElement>(".tok-aktiv")?.dataset.key;
      const liste = document.querySelector(".befundliste")?.getAttribute("aria-label");
      return { imKasten: !!a?.closest("[data-protokoll-kasten]"), wo: offen ?? liste ?? a?.getAttribute("data-key") ?? a?.closest("[data-block]")?.getAttribute("data-block") ?? a?.getAttribute("aria-label") ?? a?.tagName ?? "" };
    });
    expect(ziel.imKasten, `F2 Nr. ${i + 1} im Kasten`).toBe(false);
    if (besucht.includes(ziel.wo)) break;
    besucht.push(ziel.wo);
  }
  expect(besucht.length).toBeGreaterThan(10);
  await page.keyboard.press("Escape");

  // Enter auf dem Kasten selbst: nichts gesetzt, ein Hinweis.
  const vorher = await stand(page);
  await kasten(page).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press(" ");
  await nachDemNaechstenBild(page);
  expect(aenderungen(vorher, await stand(page))).toEqual([]);
  await expect(meldung(page)).toContainText("Enter übernimmt hier nichts. Tab führt zu „Übernehmen“, F2 zur nächsten Stelle.");

  // Tab vom Kopierknopf des Procedere: Vorschau, dann Übernehmen.
  await abschnitt(page, "procedere").locator("header .kopieren").focus();
  await page.keyboard.press("Tab");
  await expect(variante(page, DORSAL).getByRole("button", { name: "Vorschau" })).toBeFocused();
  await page.keyboard.press("Tab");
  const knopf = variante(page, DORSAL).getByRole("button", { name: "Übernehmen" });
  await expect(knopf).toBeFocused();
  await expect(knopf).toHaveAccessibleDescription(/dorsaler Zugang/);
  await bereit(page);
  await page.keyboard.press("Enter");
  await expect(feldfenster(page).getByRole("radiogroup", { name: "Gehhilfe" })).toBeVisible();
  await waehleZiffer(page, "2");
  await expect(zeile(page, DORSAL, 1)).toHaveText("1. bis 6. Woche nach der Operation: Vollbelastung des Beins rechts am Rollator.");

  // Entfernen mit der Tastatur: danach Fokus auf dem Kasten, nie auf „Übernehmen“.
  const entfernen = variante(page, DORSAL).getByRole("button", { name: "Entfernen" });
  await entfernen.focus();
  await bereit(page);
  await page.keyboard.press("Enter");
  await expect(kasten(page)).toBeFocused();
  expect(stellenVon(await stand(page), DORSAL)).toEqual([]);
});

test("Tipp-Zug: Text gleich nach dem Übernehmen nimmt es ganz zurück, kein Satz bleibt als „im Brief geblieben“ stehen", async ({ page }) => {
  await shf(page);
  const vorher = await stand(page);
  await variante(page, DORSAL).getByRole("button", { name: "Übernehmen" }).focus();
  await bereit(page);
  // Enter übernimmt, das „x“ danach galt nicht dem Fenster der Gehhilfe: Der Zug war blind (E-45).
  await page.keyboard.press("Enter");
  await page.keyboard.press("x");
  await nachDemNaechstenBild(page);
  await expect(meldung(page)).toContainText("Zurückgenommen");
  await expect(meldung(page)).not.toContainText("Im Brief geblieben");
  expect(aenderungen(vorher, await stand(page))).toEqual([]);
  await expect(variante(page, DORSAL).getByRole("button", { name: "Übernehmen" })).toBeVisible();
});

/**
 * Macht den Procedere fertig, wie ein Arzt mit der Tastatur: „klären“ führt zur ersten offenen Stelle, dort die
 * naheliegende Taste (Wahl „1“, Text „x“ und Enter, grauer Block Ü). Der ganze Stationsbrief ist für `hauptweg` zu lang.
 */
async function procedereFertig(page: Page) {
  const knopf = abschnitt(page, "procedere").locator("header .kopieren");
  for (let i = 0; i < 40; i++) {
    if ((await knopf.textContent())?.trim() === "Kopieren") return;
    const l = await lage(page);
    const imProcedere = await page.evaluate(() => {
      const a = document.activeElement;
      const key = document.querySelector<HTMLElement>(".tok-aktiv")?.dataset.key;
      const ort = key ? document.querySelector(`[data-key="${CSS.escape(key)}"]`) : a;
      return !!ort?.closest('section[data-abschnitt="procedere"]');
    });
    if (!imProcedere || l.art === "sonst" || l.art === "ende") {
      await knopf.click();
      continue;
    }
    if (l.art === "wahl") await taste(page, "1");
    else if (l.art === "block" || l.art === "lesen") await taste(page, "ü");
    else if (l.art === "eingabe") {
      await bereit(page);
      await page.keyboard.type("x");
      await taste(page, l.mehrzeilig ? "Control+Enter" : "Enter");
    } else throw new Error(`Unerwartet im Procedere: ${l.art} ${l.kennung}`);
  }
  throw new Error("Procedere nicht fertig geworden");
}

test("Kopieren: Procedere mit Standardprotokoll fertig machen und kopieren; nichts aus dem Kasten im Text, auch nicht beim Markieren", async ({ page }) => {
  test.setTimeout(90_000);
  await oeffneApp(page);
  await oeffneVorlage(page, "tibiakopffraktur konservativ", "Tibiakopffraktur konservativ");
  await setzeSeiteUndPerson(page, "rechts", "Patient");
  const id = "proc-st-protokoll-tibiakopffraktur-konservativ-1";
  await variante(page, id).getByRole("button", { name: "Vorschau" }).click();
  await variante(page, id).getByRole("button", { name: "Übernehmen" }).click();
  // Ohne Pflichtfeld: kein Fenster, Fokus auf dem Kasten.
  await expect(kasten(page)).toBeFocused();
  await procedereFertig(page);
  const pro = abschnitt(page, "procedere");
  await pro.locator("header .kopieren").click();
  await expect(pro.locator("header .kopieren")).toContainText("kopiert");
  const text = await zwischenablage(page);
  const zeilen = [
    "1. bis 6. Woche nach dem Unfall: Teilbelastung des Beins rechts mit 15 kg an Unterarmgehstützen im Dreipunktegang.",
    "Knieorthese ohne Bewegungsgrenze beim Gehen und nachts tragen, zur Körperpflege und für die Übungen abnehmen.",
    "Röntgenkontrollen des Kniegelenks rechts 1, 2 und 6 Wochen nach dem Unfall in der unfallchirurgischen oder orthopädischen Praxis.",
    "Abweichungen nach Maßgabe der weiterbehandelnden unfallchirurgischen oder orthopädischen Praxis.",
  ];
  let davor = -1;
  for (const z of zeilen) {
    const stelle = text.indexOf(z);
    expect(stelle, z).toBeGreaterThan(davor);
    davor = stelle;
  }
  expect(text.indexOf(zeilen[0])).toBeLessThan(10);
  for (const fremd of ["Standardprotokoll", "Vorschau", "ärztlich freigegeben", "Übernehmen", "im Brief", "‹", "›"]) expect(text, fremd).not.toContain(fremd);

  // Markieren vom Kasten bis zum Ende des Procedere und Strg+C: nur der Text des Briefs, nichts aus dem Kasten.
  await page.evaluate(() => {
    const von = document.querySelector('section[data-abschnitt="procedere"] [data-protokoll-kasten]')!;
    const bis = document.querySelector('section[data-abschnitt="procedere"] .ab-text')!;
    const r = document.createRange();
    r.setStartBefore(von);
    r.setEndAfter(bis);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
  });
  // Erst etwas anderes in die Zwischenablage, damit der Test nicht den Text des Kopierknopfs von eben liest.
  await setzeZwischenablage(page, "LEER");
  await page.keyboard.press("ControlOrMeta+c");
  await expect.poll(() => zwischenablage(page)).not.toBe("LEER");
  const markiert = await zwischenablage(page);
  expect(markiert).toContain(zeilen[0]);
  for (const fremd of ["Standardprotokoll", "Vorschau", "ärztlich freigegeben", "Tibiakopffraktur konservativ: Teilbelastung"]) expect(markiert, fremd).not.toContain(fremd);
});

test("Eigene Vorlage mit Standardprotokoll: im neuen Fall grau vorbelegt, Ü übernimmt; der Kasten zeigt die Variante als im Brief", async ({ page }) => {
  await shf(page);
  await variante(page, VORN).getByRole("button", { name: "Übernehmen" }).click();
  await feldfenster(page).getByRole("radiogroup", { name: "Gehhilfe" }).getByRole("radio", { name: /am Rollator/ }).click();
  await page.getByRole("button", { name: "als eigene Vorlage speichern" }).click();
  await page.getByRole("textbox", { name: "Name der eigenen Vorlage" }).fill("SHF vorn, mein Schema");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await page.getByRole("button", { name: "+ Neuer Fall" }).click();
  const eigene = page.locator(".region", { has: page.getByRole("heading", { name: "Eigene", level: 3 }) });
  await eigene.getByRole("button", { name: "SHF vorn, mein Schema" }).click();
  await setzeSeiteUndPerson(page, "links", "Patient");
  await expect(variante(page, VORN)).toContainText("im Brief");
  const s = await stand(page);
  // Gehhilfe gehört zum Patienten: wieder Lücke. Die übrigen Zeilen grau, die Ersetzten fehlen weiter.
  expect(s[`${VORN}/z1`]).toMatch(/^z-offen \| /);
  for (const nr of [2, 3, 4, 5, 6]) expect(s[`${VORN}/z${nr}`], `z${nr}`).toMatch(/^z-vorschlag \| /);
  for (const k of ERSETZT) expect(s[k], k).toBeUndefined();
  await expect(zeile(page, VORN, 5)).toHaveText("Röntgenkontrolle der Hüfte links 6 Wochen nach der Operation in der unfallchirurgischen oder orthopädischen Praxis.");
  await abschnitt(page, "procedere").locator(`[data-block="${VORN}"]`).getByRole("button", { name: /übernehmen ✓/ }).click();
  const nach = await stand(page);
  for (const nr of [2, 3, 4, 5, 6]) expect(nach[`${VORN}/z${nr}`], `z${nr}`).toMatch(/^z-gesetzt \| /);
});

// QA-37: lange offene Stellen brechen um. Je Breite ein eigener Test, weil die App beim Öffnen den letzten Fall fortsetzt.
for (const breite of [1366, 1024]) {
  test(`QA-37 (${breite} px): nach Übernehmen und Entfernen des Hüft-TEP-Protokolls scrollt die Briefspalte nicht waagrecht`, async ({ page }) => {
    const HUEFT_TEP = "proc-st-protokoll-hueft-tep-1";
    // Wie weit ein Zeilenstück einer offenen Stelle rechts über ihre Textspalte hinausragt; ob die Seite dann
    // sichtbar scrollt, hängt vom Fenster ab. Erlaubt sind Innenabstand und Rahmen der Lücke (6 + 2 px), die der
    // Browser beim Umbruch nicht mitrechnet; vor QA-37 ragte die Röntgenzeile 123 px hinaus.
    const ueberstand = () =>
      page.evaluate(() =>
        Math.max(
          0,
          ...[...document.querySelectorAll<HTMLElement>(".ab-text .tok.z-offen")].flatMap((t) => {
            const rand = t.closest<HTMLElement>(".ab-text")!.getBoundingClientRect().right;
            return [...t.getClientRects()].map((r) => r.right - rand);
          }),
        ),
      );
    await page.setViewportSize({ width: breite, height: 768 });
    await oeffneApp(page);
    await oeffneVorlage(page, "Koxarthrose", "Koxarthrose, Hüft-Totalendoprothese");
    await setzeSeiteUndPerson(page, "rechts", "Patientin");
    await variante(page, HUEFT_TEP).getByRole("button", { name: "Übernehmen" }).click();
    await expect(variante(page, HUEFT_TEP)).toContainText("im Brief");
    expect(await ueberstand(), "mit Protokoll").toBeLessThanOrEqual(8.5);
    // QA-36: Die Röntgenzeile der Vorlage tritt hinter die radiologische Kontrolle des Protokolls zurück.
    expect((await stand(page))["proc-st-kontrollen/roentgen"]).toBeUndefined();
    await variante(page, HUEFT_TEP).getByRole("button", { name: "Entfernen" }).click();
    await expect(variante(page, HUEFT_TEP)).not.toContainText("im Brief");
    await nachDemNaechstenBild(page);
    expect(await ueberstand(), "nach Entfernen").toBeLessThanOrEqual(8.5);
    expect((await stand(page))["proc-st-kontrollen/roentgen"]).toBeTruthy();
    await expect(page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: "rechts", exact: true })).toBeInViewport();
  });
}
