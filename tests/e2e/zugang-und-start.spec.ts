import { expect, test } from "@playwright/test";
import { abschnitt, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, stelle, tastenSalve, zugangscode } from "./hilfen.ts";

test("Zugang: falscher Code wird abgewiesen, der richtige schaltet frei und gilt nach dem Neuladen weiter", async ({ page }) => {
  await page.goto("");
  const feld = page.getByLabel("Zugangscode");
  await expect(feld).toBeFocused();
  await feld.fill("falsch");
  await feld.press("Enter");
  await expect(page.getByText("Der Code stimmt nicht.")).toBeVisible();
  // Groß- und Kleinschreibung und Leerraum am Rand zählen nicht.
  await feld.fill(` ${zugangscode.toUpperCase()} `);
  await page.getByRole("button", { name: "Freischalten" }).click();
  await expect(page.getByText("Grau ist ein Vorschlag der Vorlage, schwarz ist deine Aussage.")).toBeVisible();
  // Nach dem Freischalten liegt der Fokus auf „Verstanden“, nicht auf der Seite (QA-09).
  await expect(page.getByRole("button", { name: "Verstanden" })).toBeFocused();
  await page.getByRole("button", { name: "Verstanden" }).click();
  await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Diagnose oder Kürzel" })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
  await expect(page.getByLabel("Zugangscode")).toHaveCount(0);
});

test("Vorlage suchen und öffnen: Kürzel mit Seite, Pfeiltasten, Enter; Tippfehler und Regionenliste", async ({ page }) => {
  await oeffneApp(page);
  const suche = page.getByRole("combobox", { name: "Diagnose oder Kürzel" });
  await suche.fill("osg re");
  await expect(page.getByText("Seite: rechts")).toBeVisible();
  const treffer = page.getByRole("listbox").getByRole("option");
  await expect(treffer.first()).toContainText("OSG-Distorsion");
  await expect(treffer.first()).toHaveAttribute("aria-selected", "true");
  await suche.press("ArrowDown");
  await expect(treffer.nth(1)).toHaveAttribute("aria-selected", "true");
  await suche.press("ArrowUp");
  await suche.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("OSG-Distorsion RECHTS");
  await expect(page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: "rechts" })).toBeChecked();
  await expect(abschnitt(page, "diagnose").getByRole("paragraph")).toHaveText("Distorsion des oberen Sprunggelenks rechts");

  // Zweiter Fall über Strg+K, mit Tippfehler.
  await page.keyboard.press("Control+k");
  await expect(suche).toBeFocused();
  await suche.fill("platzwnde");
  await expect(treffer.first()).toContainText("Kopfplatzwunde");
  // Ohne Treffer bleibt der leere Brief. Der Eintrag ist ein Knopf, keine Option der Liste, und schließt mit geradem
  // Anführungszeichen (beides Befunde im Prüfbericht); daher der Ausdruck.
  await suche.fill("xyzq");
  await expect(page.getByRole("listbox").getByRole("button", { name: /^Keine Vorlage für „xyzq.\s·\sLeeren Brief beginnen/ })).toBeVisible();
  // Die Regionenliste öffnet per Klick.
  await suche.fill("");
  await page.getByRole("button", { name: "Kopfplatzwunde", exact: false }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kopfplatzwunde");
  await expect(page.getByRole("navigation", { name: "Offene Fälle" }).getByRole("button", { name: /^Fall \d+ schließen$/ })).toHaveCount(2);
});

test("CR-K06 langsamer Rechner: Pfeil und Enter direkt nach dem Tippen gelten der Trefferliste des getippten Texts", async ({ page }) => {
  await oeffneApp(page);
  const suche = page.getByRole("combobox", { name: "Diagnose oder Kürzel" });
  // Welcher Treffer an zweiter Stelle steht, ohne Eile ermittelt; danach dasselbe in einem Zug getippt.
  await suche.fill("osg re");
  const zweiter = ((await page.getByRole("listbox").getByRole("option").nth(1).locator(".st-titel").textContent()) ?? "").trim();
  expect(zweiter).not.toBe("");
  await suche.fill("");
  await tastenSalve(page, ["o", "s", "g", " ", "r", "e", "ArrowDown", "Enter"]);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(zweiter);
});

test("CR-K06 langsamer Rechner: nach einem Pfeil springt die Markierung beim Weitertippen im selben Zug auf den ersten Treffer", async ({ page }) => {
  await oeffneApp(page);
  const suche = page.getByRole("combobox", { name: "Diagnose oder Kürzel" });
  const titel = page.getByRole("listbox").getByRole("option").locator(".st-titel");
  await suche.fill("radiusf");
  const erster = ((await titel.first().textContent()) ?? "").trim();
  // Szenario aus dem Code-Review: „radius“, Pfeil ab, dann „f“ und Enter, bevor neu gezeichnet ist.
  await suche.fill("radius");
  await suche.press("ArrowDown");
  await expect(page.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await tastenSalve(page, ["f", "Enter"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(erster);
});

test("Seite und Person setzen: erste Wahl ein Klick, Seitenwechsel braucht die Bestätigung", async ({ page }) => {
  await oeffneApp(page);
  await oeffneVorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
  const seite = page.getByRole("radiogroup", { name: "Seite", exact: true });
  await expect(page.getByText("● Seite wählen")).toBeVisible();
  await expect(stelle(abschnitt(page, "diagnose"), /^Seite: ‹Seite›, fehlt noch$/)).toBeVisible();

  await setzeSeiteUndPerson(page, "rechts", "Patientin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Schnittwunde, Riss-Quetschwunde RECHTS");
  await expect(stelle(abschnitt(page, "diagnose"), "Seite: rechts")).toBeVisible();
  await expect(stelle(abschnitt(page, "anamnese"), "Patient/Patientin: Die Patientin")).toBeVisible();

  // Ein Klick auf „links“ fragt nur nach; erst der zweite dreht den Brief.
  await seite.getByRole("radio", { name: "links" }).click();
  await expect(seite.getByRole("radio", { name: "auf „links“ ändern?" })).toBeVisible();
  await expect(stelle(abschnitt(page, "diagnose"), "Seite: rechts")).toBeVisible();
  await seite.getByRole("radio", { name: "auf „links“ ändern?" }).click();
  await expect(seite.getByRole("radio", { name: "links" })).toBeChecked();
  await expect(stelle(abschnitt(page, "diagnose"), "Seite: links")).toBeVisible();

  await page.getByRole("textbox", { name: "Alter" }).fill("47");
  await expect(stelle(abschnitt(page, "anamnese"), "Patient/Patientin: Die 47-jährige Patientin")).toBeVisible();
  await page.getByRole("radiogroup", { name: "Patient oder Patientin" }).getByRole("radio", { name: "Patient", exact: true }).click();
  await expect(stelle(abschnitt(page, "anamnese"), "Patient/Patientin: Der 47-jährige Patient")).toBeVisible();
});
