// Anleitung als Seitenleiste (D-05): geht beim allerersten Start einmal von selbst auf, Knopf öffnet und schließt,
// Esc schließt, der Brief bleibt bedienbar. Bei gesperrtem Speicher geht sie nicht bei jedem Start auf.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ZUGANG_PRUEFWERT, ZUGANG_SCHLUESSEL } from "../../src/access.ts";
import { feldfenster, oeffneApp, stelle, abschnitt } from "./hilfen.ts";
import { vorlageMitKopf } from "./durchlauf.ts";

const leiste = (page: Page) => page.getByRole("complementary", { name: "Anleitung" });
const knopf = (page: Page) => page.getByRole("banner").getByRole("button", { name: "Anleitung", exact: true });

async function freigeschaltet(page: Page, speicherGesperrt = false) {
  await page.addInitScript(
    ([schluessel, code, gesperrt]) => {
      window.localStorage.setItem(schluessel as string, code as string);
      // Wie ein Browser, der der Seite das Speichern verweigert: Jeder Schreibversuch der App scheitert.
      if (gesperrt) {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k: string, v: string) {
          if (k.startsWith("kitteltext3.")) throw new DOMException("gesperrt", "SecurityError");
          return setItem.call(this, k, v);
        };
      }
    },
    [ZUGANG_SCHLUESSEL, ZUGANG_PRUEFWERT, speicherGesperrt],
  );
  await page.goto("");
  await page.getByRole("button", { name: "Verstanden" }).click();
  await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
}

test.describe("Anleitung (D-05)", () => {
  test("Erster Start: Die Anleitung geht einmal von selbst auf, ohne dem Suchfeld den Fokus zu nehmen; nach dem Neuladen bleibt sie zu", async ({ page }) => {
    await freigeschaltet(page);
    await expect(leiste(page)).toBeVisible();
    await expect(leiste(page).getByRole("heading", { level: 3 })).toHaveText([
      "Grau und Schwarz",
      "Ein Brief in vier Schritten",
      "Damit nichts fehlt",
      "Tastatur",
      "Datenschutz",
      "Vor dem ersten Dienst",
    ]);
    await expect(leiste(page)).toContainText("Strg+Umschalt+Enter");
    await expect(page.getByRole("combobox", { name: "Diagnose oder Kürzel" })).toBeFocused();
    await expect(knopf(page)).toHaveAttribute("aria-expanded", "true");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
    await expect(leiste(page)).toHaveCount(0);
    await expect(knopf(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("Gesperrter Speicher: Die Anleitung geht nicht von selbst auf, auch nicht nach dem Neuladen; der Knopf öffnet sie", async ({ page }) => {
    await freigeschaltet(page, true);
    // Probe, dass der Speicher wirklich gesperrt ist: Die App sagt es selbst.
    await expect(page.getByText("Dieser Browser speichert nichts")).toBeVisible();
    await expect(leiste(page)).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "Verstanden" }).click();
    await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
    await expect(leiste(page)).toHaveCount(0);
    await knopf(page).click();
    await expect(leiste(page)).toBeVisible();
  });

  test("Knopf öffnet und schließt, Esc schließt; der Fokus kommt zurück, und der Brief bleibt bedienbar", async ({ page }) => {
    await oeffneApp(page);
    await vorlageMitKopf(page, "osg", "OSG-Distorsion");
    // Öffnen per Knopf: Der Fokus steht auf der Überschrift der Leiste.
    await knopf(page).click();
    await expect(leiste(page)).toBeVisible();
    await expect(leiste(page).getByRole("heading", { name: "Anleitung", level: 2 })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(leiste(page)).toHaveCount(0);
    await expect(knopf(page)).toBeFocused();
    // Knopf schaltet: auf, zu.
    await knopf(page).click();
    await expect(leiste(page)).toBeVisible();
    await knopf(page).click();
    await expect(leiste(page)).toHaveCount(0);
    // Schließen-Knopf in der Leiste.
    await knopf(page).click();
    await leiste(page).getByRole("button", { name: "Anleitung schließen" }).click();
    await expect(leiste(page)).toHaveCount(0);
    // Nicht blockierend: Bei offener Leiste öffnet ein Klick auf eine Stelle ihr Fenster; Esc schließt zuerst das Fenster.
    await knopf(page).click();
    await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
    await expect(feldfenster(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(feldfenster(page)).toHaveCount(0);
    await expect(leiste(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(leiste(page)).toHaveCount(0);
  });

  test("Mit offener Anleitung unter 1080 px sagt die Kurzform des Kopierknopfs, was sie tut (MT-R6-19)", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await oeffneApp(page);
    await vorlageMitKopf(page, "osg", "OSG-Distorsion");
    await knopf(page).click();
    await expect(leiste(page)).toBeVisible();
    const ganz = page.getByRole("button", { name: /^Ganzen Brief kopieren/ });
    await expect(ganz).toBeVisible();
    await expect(ganz.locator(".kurz")).toBeVisible();
    await expect(ganz.locator(".kurz")).toHaveText("Brief kopieren");
  });
});
