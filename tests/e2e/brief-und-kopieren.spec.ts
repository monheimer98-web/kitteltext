import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { abschnitt, feldfenster, meldung, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, setzeZwischenablage, stelle, waehleZiffer, zwischenablage } from "./hilfen.ts";

async function wunde(page: Page) {
  await oeffneApp(page);
  await oeffneVorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
  await setzeSeiteUndPerson(page, "rechts", "Patient");
}

/** Therapie der Schnittwunde fertig machen: zwei Vorschläge übernehmen, drei Pflichtangaben per Ziffer. */
async function therapieFertig(page: Page) {
  const th = abschnitt(page, "therapie");
  await th.getByRole("button", { name: "2 übernehmen ✓" }).click();
  await expect(stelle(th, "Reinigung und Spülung: Wunde desinfiziert und gespült.")).toBeVisible();
  await expect(stelle(th, "Verband: Steriler Verband angelegt.")).toBeVisible();
  await expect(th.getByRole("button", { name: "● 3 offen · klären" })).toBeVisible();

  // Auswahl im Fenster: Die Ziffer wählt, das Fenster geht zur nächsten Stelle.
  await stelle(th, /^Wundverschluss: /).click();
  await expect(feldfenster(page)).toHaveAccessibleName("Wundverschluss");
  await waehleZiffer(page, "1");
  await expect(stelle(th, "Wundverschluss: Wundverschluss mit Einzelknopfnähten.")).toBeVisible();
  await expect(feldfenster(page)).toHaveAccessibleName("Tetanus");
  await waehleZiffer(page, "2");
  await expect(stelle(th, "Tetanus: Tetanus-Auffrischimpfung nach Aufklärung verabreicht.")).toBeVisible();

  // Pflichtangabe in einem Satz: Knöpfe mit Ziffer, solange der Fokus in der Gruppe steht.
  await stelle(th, /^Lokalanästhesie: /).click();
  // Das Fenster selbst hat den Fokus, keine Möglichkeit ist markiert (E-43); die Ziffer wählt.
  await expect(feldfenster(page)).toBeFocused();
  await page.keyboard.press("1");
  await expect(stelle(th, "Lokalanästhesie: Wundversorgung in Infiltrationsanästhesie.")).toBeVisible();
  await expect(th.getByRole("button", { name: "Kopieren", exact: true })).toBeEnabled();
}

test("Vorschlag übernehmen, Pflichtwahl per Ziffer: der Abschnitt wird fertig", async ({ page }) => {
  await wunde(page);
  const th = abschnitt(page, "therapie");
  await expect(th.getByRole("button", { name: "● 3 offen · ○ 2 Vorschläge · klären" })).toBeVisible();
  await expect(stelle(th, "Verband: Steriler Verband angelegt., Vorschlag der Vorlage, noch nicht übernommen")).toBeVisible();
  await therapieFertig(page);
  await expect(th.getByRole("button", { name: /übernehmen ✓/ })).toHaveCount(0);
});

test("Lücke füllen: im mehrzeiligen Feld geht Strg+Enter weiter; „erst im KIS ausfüllen“ setzt den Platzhalter", async ({ page }) => {
  await wunde(page);
  const an = abschnitt(page, "anamnese");
  await stelle(an, /^Unfallhergang: /).click();
  const hergang = feldfenster(page).getByRole("textbox", { name: "Unfallhergang" });
  await expect(hergang).toBeFocused();
  await hergang.pressSequentially("Beim Schneiden von Brot sei das Messer abgerutscht.");
  // Mehrzeiliges Feld: Enter wäre eine neue Zeile (E-43, Grundsatz 4).
  await hergang.press("Control+Enter");
  await expect(stelle(an, "Unfallhergang: Beim Schneiden von Brot sei das Messer abgerutscht.")).toBeVisible();
  // Weiter zur nächsten Lücke dahinter.
  const zeitpunkt = feldfenster(page).getByRole("textbox", { name: "Unfallzeitpunkt" });
  await expect(zeitpunkt).toBeFocused();
  await feldfenster(page).getByRole("button", { name: "erst im KIS ausfüllen" }).click();
  await expect(stelle(an, /^Unfallzeitpunkt: \[UNFALLZEITPUNKT\]/)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Prüfen und kopieren" })).toContainText("Im KIS zu ergänzen[UNFALLZEITPUNKT] Anamnese");
});

test("Abschnitt kopieren: unfertig entwertet Strg+Enter die Zwischenablage, fertig geht der Text des Abschnitts im KIS-Format hinein", async ({ page }) => {
  await wunde(page);
  await setzeZwischenablage(page, "Text des vorigen Patienten");
  // Fokus auf dem Brief, nicht in einem Eingabefeld: Strg+Enter kopiert den nächsten Abschnitt, hier die unfertige Diagnose.
  await abschnitt(page, "diagnose").getByRole("heading").click();
  await page.keyboard.press("Control+Enter");
  await expect(meldung(page)).toContainText("Nicht kopiert: Diagnose ist noch nicht fertig (2 offen).");
  // Die Meldung erscheint vor dem Ende des Schreibens; daher wird gewartet, bis der neue Text ankommt (CR-K11).
  await expect.poll(() => zwischenablage(page)).toBe("[Kitteltext: nichts kopiert, der Abschnitt ist noch nicht fertig]");

  await therapieFertig(page);
  const th = abschnitt(page, "therapie");
  await th.getByRole("button", { name: "Kopieren", exact: true }).click();
  await expect(meldung(page)).toContainText("Therapie kopiert · Fall 1 · Schnittwunde, Riss-Quetschwunde");
  await expect(th.getByRole("button", { name: /^✓ kopiert \d\d:\d\d$/ })).toBeVisible();
  // Kopierformat KIS-sicher mit Windows-Zeilenenden (Standard): Spiegelstriche statt Aufzählungszeichen.
  await expect.poll(() => zwischenablage(page)).toBe(
    [
      "- Wundversorgung in Infiltrationsanästhesie.",
      "- Wunde desinfiziert und gespült.",
      "- Wundverschluss mit Einzelknopfnähten.",
      "- Steriler Verband angelegt.",
      "- Tetanus-Auffrischimpfung nach Aufklärung verabreicht.",
    ].join("\r\n"),
  );
  const leiste = page.getByRole("complementary", { name: "Prüfen und kopieren" });
  await expect(leiste).toContainText("Zuletzt kopiert");
  await expect(leiste).toContainText("1 von 6 Abschnitten kopiert");
  // Eine Änderung danach fällt auf.
  await stelle(th, /^Tetanus: /).click();
  await waehleZiffer(page, "1");
  await expect(th.getByRole("button", { name: "seit Kopie geändert · neu kopieren" })).toBeVisible();
});
