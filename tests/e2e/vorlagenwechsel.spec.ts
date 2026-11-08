// Vorlagenwechsel nach „nichts davon“ (CR-02): Die Frage gleicher Nummer der neuen Vorlage bleibt gestellt.
import { expect, test } from "@playwright/test";
import { abschnitt, feldfenster, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, stelle } from "./hilfen.ts";

test("Vorlagenwechsel nach „nichts davon“: die Entweder-oder-Stelle der neuen Vorlage ist offen", async ({ page }) => {
  await oeffneApp(page);
  await oeffneVorlage(page, "fremdkörper", "Fremdkörper in den Weichteilen");
  await setzeSeiteUndPerson(page, "rechts", "Patient");
  const dg = abschnitt(page, "diagnostik");
  await stelle(dg, "Röntgen, Sonografie oder Verzicht?: ‹Röntgen, Sonografie oder Verzicht?›, fehlt noch").click();
  await feldfenster(page).getByRole("button", { name: "nichts davon, Stelle leer lassen" }).click();
  await expect(stelle(dg, /Verzicht\?/)).toHaveCount(0);
  await expect(dg.getByText("Noch leer. Baustein einfügen oder frei schreiben.")).toBeVisible();

  await page.getByRole("button", { name: "Vorlage wechseln" }).click();
  await expect(page.getByRole("heading", { name: "Andere Vorlage für diesen Fall" })).toBeVisible();
  const suche = page.getByRole("combobox", { name: "Diagnose oder Kürzel" });
  await suche.fill("panaritium");
  await expect(page.getByRole("option").first()).toContainText("Panaritium");
  await suche.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Panaritium RECHTS");
  // Seite und Person bleiben, die neue Frage steht als Lücke da und sperrt das Kopieren.
  await expect(page.getByRole("radiogroup", { name: "Patient oder Patientin" }).getByRole("radio", { name: "Patient", exact: true })).toBeChecked();
  await expect(stelle(dg, "Röntgen oder Verzicht?: ‹Röntgen oder Verzicht?›, fehlt noch")).toBeVisible();
  await expect(dg.getByRole("button", { name: "● 1 offen · klären" })).toBeVisible();
  await expect(stelle(abschnitt(page, "therapie"), /^Spaltung oder konservative Behandlung\?: .*fehlt noch$/)).toBeVisible();
  // „Rückgängig“ im Kopf nimmt den Wechsel zurück; „nichts davon“ der alten Vorlage gilt dort wieder.
  await page.getByRole("banner").getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fremdkörper in den Weichteilen RECHTS");
  await expect(dg.getByText("Noch leer. Baustein einfügen oder frei schreiben.")).toBeVisible();
});
