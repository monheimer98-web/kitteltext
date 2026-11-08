// Eigene Vorlagen (E-21, E-35, G-56) und der Weg auf einen anderen Rechner (G-58).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { EIGENES_FORMAT } from "../../src/speicher.ts";
import { abschnitt, feldfenster, meldung, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, setzeZwischenablage, stelle, waehleZiffer, zwischenablage } from "./hilfen.ts";

/** Panaritium mit entschiedener Diagnostik-Stelle als eigene Vorlage speichern. */
async function eigeneVorlageAnlegen(page: Page, name: string) {
  await oeffneVorlage(page, "panaritium", "Panaritium");
  await setzeSeiteUndPerson(page, "rechts", "Patientin");
  const dg = abschnitt(page, "diagnostik");
  await stelle(dg, "Röntgen oder Verzicht?: ‹Röntgen oder Verzicht?›, fehlt noch").click();
  await expect(feldfenster(page)).toHaveAccessibleName("Röntgen oder Verzicht?");
  await waehleZiffer(page, "1");
  await expect(stelle(dg, /Röntgen oder Verzicht\?/)).toHaveCount(0);
  await page.getByRole("button", { name: "als eigene Vorlage speichern" }).click();
  const feld = page.getByRole("textbox", { name: "Name der eigenen Vorlage" });
  await expect(feld).toBeFocused();
  await expect(feld).toHaveValue("Panaritium (eigen)");
  await feld.fill(name);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(meldung(page)).toHaveText(`Eigene Vorlage „${name}“ gespeichert. Sie steht auf der Startseite unter „Eigene“.`);
}

test("Eigene Vorlage: speichern, auf der Startseite unter „Eigene“ öffnen; die Entweder-oder-Stelle ist wieder offen", async ({ page }) => {
  await oeffneApp(page);
  await eigeneVorlageAnlegen(page, "Panaritium Hand, mein Aufbau");

  // Neuladen: Die Vorlage liegt dauerhaft im Browser.
  await page.reload();
  await page.getByRole("button", { name: "+ Neuer Fall" }).click();
  // Die Gruppen der Startseite haben keine zugängliche Beschriftung (Befund); daher die Klasse.
  const eigene = page.locator(".region", { has: page.getByRole("heading", { name: "Eigene", level: 3 }) });
  await eigene.getByRole("button", { name: "Panaritium Hand, mein Aufbau" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Panaritium Hand, mein Aufbau");
  await expect(page.getByText("eigener Text, ungeprüft").first()).toBeVisible();
  const dg = abschnitt(page, "diagnostik");
  // Im ersten Fall entschieden, in der eigenen Vorlage wieder offen.
  await expect(stelle(dg, "Röntgen oder Verzicht?: ‹Röntgen oder Verzicht?›, fehlt noch")).toBeVisible();
  await expect(dg.getByRole("button", { name: "● 1 offen · klären" })).toBeVisible();
  // Die beiden anderen Stellen der Ausgangsvorlage sind ebenfalls da.
  await expect(stelle(abschnitt(page, "therapie"), /^Spaltung oder konservative Behandlung\?: .*fehlt noch$/)).toBeVisible();
  await expect(stelle(abschnitt(page, "procedere"), /^Ambulante Behandlung oder Operation\?: .*fehlt noch$/)).toBeVisible();
  // Nichts vom Patienten des ersten Falls: Seite und Person sind wieder zu wählen.
  await expect(page.getByText("● Seite wählen")).toBeVisible();
  await expect(page.getByText("● Person wählen")).toBeVisible();
});

test("Eigene Inhalte: „Als Text kopieren“ und „Aus Text einfügen“; Text aus einer neueren Fassung wird abgewiesen", async ({ page }) => {
  await oeffneApp(page);
  await eigeneVorlageAnlegen(page, "Panaritium eigen");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  await dialog.getByRole("button", { name: "Als Text kopieren" }).click();
  await expect(meldung(page)).toHaveText("Eigene Inhalte als Text kopiert. Auf dem anderen Rechner hier einfügen.");
  const roh = JSON.parse(await zwischenablage(page));
  // Ohne Platzangabe (`vor`) genügt Formatstand 2 (CR-T1-06).
  expect(roh.format).toBe(2);
  expect(roh.vorlagen.map((v: { titel: string }) => v.titel)).toEqual(["Panaritium eigen"]);
  expect(roh.vorlagen[0].wahl.map((w: { label: string }) => w.label)).toEqual(["Röntgen oder Verzicht?", "Spaltung oder konservative Behandlung?", "Ambulante Behandlung oder Operation?"]);

  await dialog.getByRole("button", { name: "Aus Text einfügen" }).click();
  const feld = dialog.getByRole("textbox", { name: "Eigene Inhalte einfügen" });
  const uebernehmen = dialog.getByRole("button", { name: "Übernehmen" });

  // Neuere Fassung: abgewiesen, der Bestand bleibt.
  await feld.fill(JSON.stringify({ ...roh, format: EIGENES_FORMAT + 1, vorlagen: [{ ...roh.vorlagen[0], titel: "Aus der Zukunft" }] }));
  await uebernehmen.click();
  await expect(meldung(page)).toContainText("Der Text stammt aus einer neueren Fassung von Kitteltext und lässt sich hier nicht einfügen.");
  await expect(dialog.getByText("Panaritium eigen", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Aus der Zukunft")).toHaveCount(0);

  // Kein gültiger Text.
  await feld.fill("Das ist kein Text aus Kitteltext.");
  await uebernehmen.click();
  await expect(meldung(page)).toContainText("Das ist kein gültiger Text aus „Als Text kopieren“.");

  // Gültiger Text gleichen Formats ersetzt den Bestand. Zum Einfügen per Strg+V über die Zwischenablage.
  await setzeZwischenablage(page, JSON.stringify({ ...roh, vorlagen: [{ ...roh.vorlagen[0], titel: "Panaritium vom anderen Rechner" }] }));
  await feld.fill("");
  await feld.press("ControlOrMeta+v");
  await uebernehmen.click();
  await expect(meldung(page)).toHaveText("1 Vorlage und 0 Bausteine übernommen.");
  await expect(dialog.getByText("Panaritium vom anderen Rechner")).toBeVisible();
  await expect(dialog.getByText("Panaritium eigen", { exact: true })).toHaveCount(0);
});

test("Eigene Vorlage löschen: erst Rückfrage, dann gelöscht mit Meldung; der Fokus bleibt im Dialog (QA-13)", async ({ page }) => {
  await oeffneApp(page);
  await eigeneVorlageAnlegen(page, "Panaritium weg");
  await page.getByRole("button", { name: "Einstellungen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  // Der Knopf nennt, was er löscht; der erste Druck fragt nur.
  await dialog.getByRole("button", { name: "Vorlage „Panaritium weg“ löschen" }).click();
  await expect(dialog.getByText("Panaritium weg", { exact: true })).toBeVisible();
  const frage = dialog.getByRole("button", { name: "Vorlage „Panaritium weg“ wirklich löschen?" });
  await expect(frage).toBeFocused();
  await frage.press("Enter");
  await expect(meldung(page)).toHaveText("Eigene Vorlage „Panaritium weg“ gelöscht.");
  await expect(dialog.getByText("Panaritium weg", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Aus Text einfügen" })).toBeFocused();
});
