// Knopf „Eintragen: keine Vorerkrankungen, keine Dauermedikation, keine Allergien“ (E-39).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { abschnitt, feldfenster, meldung, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, stelle } from "./hilfen.ts";

const KNOPF = "Eintragen: keine Vorerkrankungen, keine Dauermedikation, keine Allergien";
const OFFEN = ["Vorerkrankungen: ‹Vorerkrankungen›, fehlt noch", "Dauermedikation: ‹Dauermedikation›, fehlt noch", "Allergien: ‹Allergien›, fehlt noch"];
const GESETZT = ["Vorerkrankungen: keine bekannt", "Dauermedikation: keine", "Allergien: keine bekannt"];

async function wunde(page: Page) {
  await oeffneApp(page);
  await oeffneVorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
  await setzeSeiteUndPerson(page, "rechts", "Patient");
  return abschnitt(page, "anamnese");
}

test("Leere Vorgeschichte: eine ausgefüllte Angabe (Allergien) nimmt den Knopf weg, Rückgängig bringt ihn wieder", async ({ page }) => {
  const an = await wunde(page);
  const knopf = an.getByRole("button", { name: KNOPF });
  await expect(knopf).toBeVisible();
  await stelle(an, OFFEN[2]).click();
  await feldfenster(page).getByRole("textbox", { name: "Allergien" }).fill("Penicillin");
  await page.keyboard.press("Escape");
  await expect(stelle(an, "Allergien: Penicillin")).toBeVisible();
  await expect(knopf).toHaveCount(0);
  // Nimmt der Arzt die Eingabe zurück, ist auch der Knopf wieder da.
  await page.getByRole("banner").getByRole("button", { name: "Rückgängig" }).click();
  await expect(stelle(an, OFFEN[2])).toBeVisible();
  await expect(knopf).toBeVisible();
});

test("Leere Vorgeschichte: ein Doppelklick setzt die Angaben nur einmal, in einem Rückgängig-Schritt, ohne Fenster darüber", async ({ page }) => {
  const an = await wunde(page);
  await an.getByRole("button", { name: KNOPF }).dblclick();
  for (const s of GESETZT) await expect(stelle(an, s)).toHaveCount(1);
  const vorgeschichte = an.getByRole("paragraph").first();
  // Kein vierter Punkt nach den Auslassungspunkten (Design-Review 10.11.2026, Nr. 1); hinter ● steht ein geschütztes Leerzeichen.
  await expect(vorgeschichte).toContainText("Vorerkrankungen: keine bekannt. Dauermedikation: keine. ● Gerinnungshemmende Medikamente: … Allergien: keine bekannt.");
  expect((await vorgeschichte.textContent())?.match(/keine bekannt/g)).toHaveLength(2);
  const erledigt = an.getByText("Eingetragen: keine Vorerkrankungen, keine Dauermedikation, keine Allergien");
  await expect(erledigt).toBeVisible();
  await expect(erledigt).toBeFocused();
  await expect(an.getByRole("button", { name: KNOPF })).toHaveCount(0);
  await expect(feldfenster(page)).toHaveCount(0);
  await expect(meldung(page)).toContainText("Eingefügt in Fall 1: Vorerkrankungen: keine bekannt · Dauermedikation: keine · Allergien: keine bekannt");
  await expect(meldung(page).getByRole("button", { name: "Rückgängig" })).toBeVisible();
  // Ein Schritt im Verlauf: Rückgängig im Kopf nimmt alle drei zurück.
  await page.getByRole("banner").getByRole("button", { name: "Rückgängig" }).click();
  for (const s of OFFEN) await expect(stelle(an, s)).toBeVisible();
  await expect(stelle(page, "Patient/Patientin: Der Patient")).toBeVisible();
});

test("Leere Vorgeschichte: zweimal Enter auf dem Knopf setzt die Angaben nur einmal; das zweite Enter trifft nichts", async ({ page }) => {
  const an = await wunde(page);
  await an.getByRole("button", { name: KNOPF }).focus();
  await page.keyboard.press("Enter");
  const erledigt = an.getByText("Eingetragen: keine Vorerkrankungen, keine Dauermedikation, keine Allergien");
  await expect(erledigt).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(erledigt).toBeFocused();
  await expect(feldfenster(page)).toHaveCount(0);
  for (const s of GESETZT) await expect(stelle(an, s)).toHaveCount(1);
  await expect(meldung(page)).toContainText("Eingefügt in Fall 1: Vorerkrankungen: keine bekannt");
});

test("Leere Vorgeschichte: „Rückgängig“ in der Meldung legt den Fokus auf Vorerkrankungen, Enter öffnet das Feld", async ({ page }) => {
  const an = await wunde(page);
  await an.getByRole("button", { name: KNOPF }).click();
  await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
  await expect(meldung(page)).toHaveText("Zurückgenommen in Fall 1: Vorerkrankungen, Dauermedikation, Allergien");
  for (const s of OFFEN) await expect(stelle(an, s)).toBeVisible();
  await expect(stelle(an, OFFEN[0])).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(feldfenster(page).getByRole("textbox", { name: "Vorerkrankungen" })).toBeFocused();
});
