// Vorlagen passen gemeinsame Bausteine an (E-40): weglassen mit Ersatzstelle, Schnellwerte je Vorlage.
import { expect, test } from "@playwright/test";
import { abschnitt, feldfenster, meldung, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, stelle } from "./hilfen.ts";

test("Tetanussatz: in zna-wunde nicht unter „+ …“, nach Entfernen des Wundbausteins wieder da", async ({ page }) => {
  await oeffneApp(page);
  await oeffneVorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
  await setzeSeiteUndPerson(page, "rechts", "Patient");
  const th = abschnitt(page, "therapie");
  const zuwahl = th.getByRole("button", { name: "+ Tetanusimpfung" });
  // Die Tetanuswahl des Wundbausteins ist die Ersatzstelle.
  await expect(stelle(th, "Tetanus: ‹Tetanus›, fehlt noch")).toBeVisible();
  await expect(th.getByRole("button", { name: "+ Untersuchung und Beratung" })).toBeVisible();
  await expect(zuwahl).toHaveCount(0);

  await th.getByRole("button", { name: "Weitere Aktionen für Therapie" }).click();
  await th.getByRole("menu").getByRole("button", { name: "„Wundversorgung mit Wundverschluss als Pflichtwahl\" entfernen" }).click();
  await expect(stelle(th, /^Tetanus: /)).toHaveCount(0);
  await expect(zuwahl).toBeVisible();
  await expect(zuwahl).toHaveAttribute("title", "Fügt ein: „Tetanusschutz nach Aufklärung aufgefrischt.“");
  // Rückgängig bringt den Wundbaustein zurück, der allgemeine Satz verschwindet wieder.
  await page.getByRole("banner").getByRole("button", { name: "Rückgängig" }).click();
  await expect(stelle(th, "Tetanus: ‹Tetanus›, fehlt noch")).toBeVisible();
  await expect(zuwahl).toHaveCount(0);
  await page.getByRole("banner").getByRole("button", { name: "Wiederholen" }).click();
  await expect(zuwahl).toBeVisible();
  await zuwahl.click();
  await expect(meldung(page)).toContainText("Eingefügt: „Tetanusschutz nach Aufklärung aufgefrischt.“");
  await expect(stelle(th, "Tetanusimpfung: Tetanusschutz nach Aufklärung aufgefrischt.")).toBeVisible();
});

test("Schnellwerte je Vorlage: Hergang bei Verbrennung ohne Umknicken, bei OSG-Distorsion mit", async ({ page }) => {
  await oeffneApp(page);
  await oeffneVorlage(page, "verbrennung", "Verbrennung außerhalb der Hand");
  await setzeSeiteUndPerson(page, "rechts", "Patient");
  await stelle(abschnitt(page, "anamnese"), /^Unfallhergang: /).click();
  const fenster = feldfenster(page);
  await expect(fenster.getByRole("button", { name: "Beim Kochen sei heißes Wasser über die Haut gelaufen." })).toBeVisible();
  await expect(fenster.getByRole("button", { name: "Beim Gehen sei der Fuß nach außen umgeknickt." })).toHaveCount(0);
  await expect(fenster.getByRole("button", { name: /umgeknickt/ })).toHaveCount(0);
  // Pfeil ab aus dem leeren Feld führt zum ersten Schnellwert; Enter setzt ihn.
  await fenster.getByRole("textbox", { name: "Unfallhergang" }).press("ArrowDown");
  await expect(fenster.getByRole("button", { name: "Beim Kochen sei heißes Wasser über die Haut gelaufen." })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(stelle(abschnitt(page, "anamnese"), "Unfallhergang: Beim Kochen sei heißes Wasser über die Haut gelaufen.")).toBeVisible();

  // Gegenprobe im zweiten Fall: Die Liste der OSG-Distorsion bietet das Umknicken an.
  await page.keyboard.press("Control+k");
  await oeffneVorlage(page, "osg re", "OSG-Distorsion");
  await page.getByRole("radiogroup", { name: "Patient oder Patientin" }).getByRole("radio", { name: "Patient", exact: true }).click();
  await stelle(abschnitt(page, "anamnese"), /^Unfallhergang: /).click();
  await expect(feldfenster(page).getByRole("button", { name: "Beim Gehen sei der Fuß nach außen umgeknickt." })).toBeVisible();
  await expect(feldfenster(page).getByRole("button", { name: /heiß/ })).toHaveCount(0);
});
