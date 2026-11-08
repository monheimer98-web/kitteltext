// Befund K-01 (Prüfbericht klicktests-2026-11-07): Das Auswahl- und das Entweder-oder-Fenster
// hörten erst nach dem nächsten Bild auf Ziffern. Eine Ziffer, die vorher ankam, ging verloren; der Fokus stand dann
// auf Option 1, und ein Enter wählte sie. Seit E-43 wertet das Fenster Ziffern selbst aus und hat ab dem Einhängen
// den Fokus, ohne dass eine Möglichkeit markiert ist; die Tests halten das fest.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { abschnitt, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, stelle, zifferSobaldFensterErscheint } from "./hilfen.ts";

async function wunde(page: Page) {
  await oeffneApp(page);
  await oeffneVorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
  await setzeSeiteUndPerson(page, "rechts", "Patient");
}

test("K-01 Auswahlfenster: vorausgetippte Ziffer 2 wählt Option 2, ein Enter danach wählt nicht Option 1", async ({ page }) => {
  await wunde(page);
  const th = abschnitt(page, "therapie");
  const getippt = zifferSobaldFensterErscheint(page, "2");
  await stelle(th, /^Tetanus: /).click();
  // Die Ziffer kommt beim Fenster selbst an, nicht bei Option 1 (E-43).
  expect(await getippt).toEqual({ fenster: "Tetanus", fokus: "Fenster" });
  // Wer „2“ und dann Enter tippt, will die Auffrischimpfung; das Enter setzt danach nichts (ganzer Brief: tastatur.spec.ts, CR-K02).
  await page.keyboard.press("Enter");
  await expect(stelle(th, /^Tetanus: /)).toHaveAccessibleName("Tetanus: Tetanus-Auffrischimpfung nach Aufklärung verabreicht.", { timeout: 2_000 });
});

test("K-01 Entweder-oder-Fenster: vorausgetippte Ziffer 2 nimmt den zweiten Baustein", async ({ page }) => {
  await wunde(page);
  const pr = abschnitt(page, "procedere");
  const getippt = zifferSobaldFensterErscheint(page, "2");
  await stelle(pr, /^Ambulante Versorgung, Operation oder Verlegung\?: /).click();
  expect((await getippt).fenster).toBe("Ambulante Versorgung, Operation oder Verlegung?");
  // Gewählt ist der zweite Baustein (stationäre Aufnahme); danach öffnet sich dessen erste Lücke.
  await expect(pr).toContainText("Stationäre Aufnahme zur operativen Versorgung", { timeout: 2_000 });
  await expect(stelle(pr, /^Ambulante Versorgung, Operation oder Verlegung\?: /)).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Ambulante Versorgung, Operation oder Verlegung?" })).toHaveCount(0);
});

test("K-01 Gegenprobe: in der Knopfreihe einer Pflichtangabe wirkt dieselbe vorausgetippte Ziffer sofort", async ({ page }) => {
  await wunde(page);
  const th = abschnitt(page, "therapie");
  const getippt = zifferSobaldFensterErscheint(page, "1");
  await stelle(th, /^Lokalanästhesie: /).click();
  expect(await getippt).toEqual({ fenster: "Lokalanästhesie", fokus: "Fenster" });
  await expect(stelle(th, "Lokalanästhesie: Wundversorgung in Infiltrationsanästhesie.")).toBeVisible();
});
