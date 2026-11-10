// Runde 5, Falldaten und doppelte Eingaben: Daten des Aufenthalts im Fallkopf (M-13, E-58), Datum in Klammern hinter
// Fristen (E-59), einmal eingeben (M-14, E-60), F2 in der Befundliste (M-15), Folgeangaben (M-24, E-60).
// Gegenprobe: Die Tests zu M-13, E-59, M-14 und M-15 sind auf dem Stand v2 (4cad8e6) rot.
// Gegenprobe PS-R5-1 (P52/P53): auf dem Stand 67e5f40 rot, dort nahm das Débridement das OP-Datum der Endoprothese.
// Gegenprobe CR-R5-01: ohne `key` an `Falldaten` rot, dort zeigte Fall 2 den Entwurf „31.11.“ aus Fall 1.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { abschnitt, bereit, feldfenster, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, stelle, zwischenablage } from "./hilfen.ts";

// Sonntag, 08.11.2026: „5.11.“ ist dann Donnerstag, 05.11.2026.
const HEUTE = new Date("2026-11-08T09:30:00+01:00");

async function hueftTep(page: Page) {
  await page.clock.setFixedTime(HEUTE);
  await oeffneApp(page);
  await oeffneVorlage(page, "Koxarthrose", "Koxarthrose, Hüft-Totalendoprothese");
}

const kopf = (page: Page) => page.locator(".fallkopf");
const datumsfeld = (page: Page, name: string) => kopf(page).getByRole("textbox", { name, exact: true });
const tok = (page: Page, key: string) => page.locator(`.tok[data-key="${key}"]`);

/** Mit Tab ins Feld wie am Klinik-PC: Der Inhalt ist dann markiert und wird überschrieben. */
async function setzeDatum(page: Page, name: string, eingabe: string) {
  const feld = datumsfeld(page, name);
  await feld.focus();
  await expect(feld).toBeFocused();
  expect(await feld.evaluate((el: HTMLInputElement) => el.selectionStart === 0 && el.selectionEnd === el.value.length)).toBe(true);
  await page.keyboard.type(eingabe);
  await page.keyboard.press("Enter");
}

test.describe("Falldaten und doppelte Eingaben (Runde 5)", () => {
  test("M-13: OP-Datum im Fallkopf, „5.11.“ genügt; die Therapiezeile setzt es ein, Unlesbares wird nicht gesetzt", async ({ page }) => {
    await hueftTep(page);
    await expect(datumsfeld(page, "Aufnahmedatum")).toBeVisible();
    await expect(datumsfeld(page, "Entlassdatum")).toBeVisible();
    const datum = tok(page, "th-st-hueft-tep/datum");
    await expect(datum).toHaveText("[OP-DATUM]");
    await expect(datum).toHaveAttribute("aria-label", "OP-Datum: [OP-DATUM], OP-Datum fehlt im Fallkopf, Platzhalter fürs KIS");

    await datumsfeld(page, "OP-Datum").click();
    await page.keyboard.type("5.11.");
    await expect(kopf(page).locator("#fd-op-vorschau")).toHaveText("Do 05.11.2026");
    await expect(datum).toHaveText("[OP-DATUM]");
    await page.keyboard.press("Enter");
    await expect(datumsfeld(page, "OP-Datum")).toHaveValue("05.11.2026");
    await expect(datum).toHaveText("05.11.2026");
    await expect(datum).toHaveClass(/z-gesetzt/);
    await expect(abschnitt(page, "therapie")).toContainText("Hüft-Totalendoprothese");
    await expect(abschnitt(page, "therapie")).toContainText("am 05.11.2026");

    // „gestern“ gilt; „31.02.“ nicht: markiert, gemeldet, nichts gesetzt.
    await setzeDatum(page, "Aufnahmedatum", "gestern");
    await expect(datumsfeld(page, "Aufnahmedatum")).toHaveValue("07.11.2026");
    await datumsfeld(page, "Entlassdatum").click();
    await page.keyboard.type("31.02.");
    await page.keyboard.press("Enter");
    await expect(datumsfeld(page, "Entlassdatum")).toHaveAttribute("aria-invalid", "true");
    await expect(kopf(page).locator("#fd-entlassung-vorschau")).toHaveText("nicht erkannt");
    // Hinweis bei unpassender Reihenfolge, ohne etwas zu ändern.
    await setzeDatum(page, "Aufnahmedatum", "6.11.");
    await setzeDatum(page, "OP-Datum", "4.11.");
    await expect(kopf(page).locator(".fd-hinweis")).toHaveText("OP-Datum liegt vor dem Aufnahmedatum.");
    await expect(datum).toHaveText("04.11.2026");
    // Mit der Maus in ein gefülltes Feld und tippen ersetzt das Datum, statt mitten hinein zu schreiben (Durchgang im
    // gebauten Stand: „03.1116.20“).
    await datumsfeld(page, "OP-Datum").click();
    await page.keyboard.type("6.11.");
    await page.keyboard.press("Enter");
    await expect(datumsfeld(page, "OP-Datum")).toHaveValue("06.11.2026");
    await expect(datum).toHaveText("06.11.2026");
  });

  test("M-13: Ohne OP-Datum bleibt [OP-DATUM] als Platzhalter fürs KIS stehen, wird mitkopiert und sperrt das Kopieren nicht", async ({ page }) => {
    await hueftTep(page);
    await setzeSeiteUndPerson(page, "rechts", "Patient");
    const th = abschnitt(page, "therapie");
    await stelle(th, /^Verankerung: /).click();
    await expect(feldfenster(page)).toBeVisible();
    await bereit(page);
    await page.keyboard.press("1");
    await page.keyboard.press("Escape");
    await th.locator('[data-block="th-st-weitere"] [data-uebernehmen]').click();
    const kopieren = th.getByRole("button", { name: "Kopieren", exact: true });
    await expect(kopieren).toBeEnabled();
    await kopieren.click();
    // Seit dem formatierten Kopieren (E-61) schreibt die App die Zwischenablage asynchron: warten statt sofort lesen.
    await expect.poll(() => zwischenablage(page)).toContain("Hüft-Totalendoprothese rechts am [OP-DATUM]");
    await expect(page.locator(".lk-kopf", { hasText: "Im KIS zu ergänzen" })).toBeVisible();
    await expect(page.locator(".lk-kopf", { hasText: "Im KIS zu ergänzen" }).locator("xpath=..")).toContainText("[OP-DATUM]");
    // Wer das Datum nachträgt, bekommt es an der Stelle; der Platzhalter verschwindet aus der Liste.
    await setzeDatum(page, "OP-Datum", "5.11.");
    await expect(tok(page, "th-st-hueft-tep/datum")).toHaveText("05.11.2026");
    await expect(page.locator(".lk-kopf", { hasText: "Im KIS zu ergänzen" })).toHaveCount(0);
  });

  test("E-59: Hinter „am 12. Tag nach der Operation“ steht das Datum grau in Klammern; Übernehmen macht es schwarz, ein neues OP-Datum wieder grau", async ({ page }) => {
    await hueftTep(page);
    await setzeDatum(page, "OP-Datum", "8.11.");
    const naht = tok(page, "proc-st-wunde/naht");
    await naht.click();
    const ff = feldfenster(page);
    await ff.getByRole("radio", { name: "der Hautnähte" }).click();
    await ff.getByRole("radio", { name: "am 12. Tag nach der Operation" }).click();
    await ff.getByRole("radio", { name: "in der Hausarztpraxis" }).click();
    await page.keyboard.press("Escape");
    await expect(naht).toHaveText("Entfernung der Hautnähte am 12. Tag nach der Operation (20.11.2026) in der Hausarztpraxis.");
    await expect(naht.locator(".tok-frist.z-vorschlag")).toHaveText("(20.11.2026)");
    await expect(naht).toHaveAttribute("aria-label", /Datum in Klammern errechnet, noch nicht übernommen$/);
    await expect(abschnitt(page, "procedere").locator('[data-block="proc-st-wunde"]')).toContainText("Datum errechnet aus dem Fallkopf");

    await naht.click();
    await expect(ff.locator(".ff-frist")).toContainText("Errechnetes Datum: 20.11.2026, Freitag (OP-Datum + 12 Tage)");
    await ff.locator(".ff-frist").getByRole("button", { name: "Übernehmen ✓" }).click();
    await page.keyboard.press("Escape");
    await expect(naht.locator(".tok-frist.z-gesetzt")).toHaveText("(20.11.2026)");

    await setzeDatum(page, "OP-Datum", "9.11.");
    await expect(naht.locator(".tok-frist.z-vorschlag")).toHaveText("(21.11.2026)");
    await naht.click();
    await ff.locator(".ff-frist").getByRole("button", { name: "ohne Datum" }).click();
    await expect(naht).toHaveText("Entfernung der Hautnähte am 12. Tag nach der Operation in der Hausarztpraxis.");
    await expect(ff.getByRole("button", { name: "wieder vorschlagen" })).toBeVisible();
  });

  test("E-59: Mit „+ weitere OP“ bekommt keine Frist „nach der Operation“ ein Datum, weil offen ist, welche gemeint ist", async ({ page }) => {
    await hueftTep(page);
    await setzeDatum(page, "OP-Datum", "8.11.");
    const naht = tok(page, "proc-st-wunde/naht");
    await naht.click();
    const ff = feldfenster(page);
    await ff.getByRole("radio", { name: "der Hautnähte" }).click();
    await ff.getByRole("radio", { name: "am 12. Tag nach der Operation" }).click();
    await ff.getByRole("radio", { name: "in der Hausarztpraxis" }).click();
    await page.keyboard.press("Escape");
    await expect(naht.locator(".tok-frist")).toHaveText("(20.11.2026)");

    await kopf(page).getByRole("button", { name: "+ weitere OP" }).click();
    await expect(datumsfeld(page, "Datum der weiteren Operation")).toBeFocused();
    await expect(naht).toHaveText("Entfernung der Hautnähte am 12. Tag nach der Operation in der Hausarztpraxis.");
    await expect(naht.locator(".tok-frist")).toHaveCount(0);
    await page.keyboard.type("11.11.");
    await page.keyboard.press("Enter");
    await expect(datumsfeld(page, "Datum der weiteren Operation")).toHaveValue("11.11.2026");
    await expect(naht.locator(".tok-frist")).toHaveCount(0);
  });

  test("PS-R5-1 (P52/P53): Ein zweiter OP-Baustein nimmt das Datum der 2. OP, nicht das erste; Fristen „nach der Operation“ verlieren ihr Datum", async ({ page }) => {
    await hueftTep(page);
    await setzeSeiteUndPerson(page, "rechts", "Patientin");
    await setzeDatum(page, "Aufnahmedatum", "1.11.");
    await setzeDatum(page, "OP-Datum", "2.11.");
    const naht = tok(page, "proc-st-wunde/naht");
    await naht.click();
    const ff = feldfenster(page);
    await ff.getByRole("radio", { name: "der Hautnähte" }).click();
    await ff.getByRole("radio", { name: "am 12. Tag nach der Operation" }).click();
    await ff.getByRole("radio", { name: "in der Hausarztpraxis" }).click();
    await page.keyboard.press("Escape");
    await expect(naht.locator(".tok-frist")).toHaveText("(14.11.2026)");
    const tep = tok(page, "th-st-hueft-tep/datum");
    await expect(tep).toHaveText("02.11.2026");

    // P52: Débridement über „+ Baustein“. Vorher stand dort schwarz dasselbe OP-Datum wie bei der Endoprothese.
    const th = abschnitt(page, "therapie");
    await th.getByRole("button", { name: "+ Baustein" }).click();
    await th.getByRole("searchbox", { name: "Baustein suchen" }).fill("Débridement");
    await th.locator(".bausteinwahl .ff-option", { hasText: "Operation: Débridement" }).click();
    const deb = tok(page, "th-st-debridement/datum");
    await expect(deb).toHaveText("[OP-DATUM]");
    await expect(deb).toHaveClass(/z-spaeter/);
    await expect(deb).toHaveAttribute("aria-label", /Datum der weiteren Operation fehlt im Fallkopf, Platzhalter fürs KIS/);
    await expect(datumsfeld(page, "Datum der weiteren Operation")).toBeVisible();
    await expect(datumsfeld(page, "Datum der weiteren Operation")).toHaveValue("");
    await expect(tep).toHaveText("02.11.2026");
    await expect(tep).toHaveClass(/z-gesetzt/);
    await expect(naht).toHaveText("Entfernung der Hautnähte am 12. Tag nach der Operation in der Hausarztpraxis.");
    await expect(naht.locator(".tok-frist")).toHaveCount(0);

    // P53: Das Datum am Débridement korrigieren. Vorher änderte das auch das Datum der Endoprothese.
    await deb.click();
    await expect(ff.locator(".ff-label").first()).toHaveText("Datum der weiteren Operation · gilt für den ganzen Brief");
    await page.keyboard.type("10.11.");
    await page.keyboard.press("Enter");
    await expect(datumsfeld(page, "OP-Datum")).toHaveValue("02.11.2026");
    await expect(datumsfeld(page, "Datum der weiteren Operation")).toHaveValue("10.11.2026");
    await expect(deb).toHaveText("10.11.2026");
    await expect(deb).toHaveAttribute("aria-label", /aus dem Fallkopf, Datum der weiteren Operation/);
    await expect(tep).toHaveText("02.11.2026");
    await expect(th).toContainText("am 02.11.2026");
    await expect(th).toContainText("10.11.2026");
    await expect(naht.locator(".tok-frist")).toHaveCount(0);
  });

  test("CR-R5-01: Ein unlesbarer Datumsentwurf bleibt beim Wechsel des Falls nicht stehen; eine Korrektur landet nicht im falschen Fall", async ({ page }) => {
    await hueftTep(page);
    await setzeDatum(page, "Aufnahmedatum", "3.11.");
    await expect(datumsfeld(page, "Aufnahmedatum")).toHaveValue("03.11.2026");
    await page.keyboard.press("Control+k");
    await oeffneVorlage(page, "Koxarthrose", "Koxarthrose, Hüft-Totalendoprothese");
    await setzeDatum(page, "Aufnahmedatum", "6.11.");
    await expect(datumsfeld(page, "Aufnahmedatum")).toHaveValue("06.11.2026");
    const reiter = page.locator(".reiter-knopf");
    await reiter.nth(0).click();
    await expect(datumsfeld(page, "Aufnahmedatum")).toHaveValue("03.11.2026");

    // Tippfehler in Fall 1, dann mit der Maus zu Fall 2: Fall 2 zeigt sein eigenes Datum, nicht den Entwurf.
    await datumsfeld(page, "Aufnahmedatum").click();
    await page.keyboard.type("31.11.");
    await reiter.nth(1).click();
    await expect(reiter.nth(1)).toHaveAttribute("aria-current", "true");
    await expect(datumsfeld(page, "Aufnahmedatum")).toHaveValue("06.11.2026");
    await expect(datumsfeld(page, "Aufnahmedatum")).not.toHaveAttribute("aria-invalid", "true");
    await expect(kopf(page).locator("#fd-aufnahme-vorschau")).not.toHaveText("nicht erkannt");
    // Zurück in Fall 1 steht sein gesetztes Datum; der unlesbare Entwurf ist verworfen wie mit Escape.
    await reiter.nth(0).click();
    await expect(datumsfeld(page, "Aufnahmedatum")).toHaveValue("03.11.2026");
    await expect(datumsfeld(page, "Aufnahmedatum")).not.toHaveAttribute("aria-invalid", "true");
    await reiter.nth(1).click();
    await expect(datumsfeld(page, "Aufnahmedatum")).toHaveValue("06.11.2026");
  });

  test("M-14: Gehhilfe im Entlassbefund steht im Procedere grau mit Herkunft; eine eigene Wahl dort geht vor", async ({ page }) => {
    await hueftTep(page);
    await tok(page, "eb-st-mobilitaet/gehen").click();
    await feldfenster(page).getByRole("radio", { name: "an Unterarmgehstützen" }).click();
    await page.keyboard.press("Escape");
    const proc = tok(page, "proc-st-belastung/hilfsmittel");
    await expect(proc).toHaveText("Gehen an Unterarmgehstützen.");
    await expect(proc).toHaveClass(/z-vorschlag/);
    await expect(proc).toHaveAttribute("aria-label", /Angabe aus „Entlassbefund Mobilität und Schmerz“, noch nicht übernommen$/);
    // Der Block und das Fenster nennen die Herkunft, nicht „Vorschlag der Vorlage“ (Durchgang im gebauten Stand).
    const block = abschnitt(page, "procedere").locator('[data-block="proc-st-belastung"]');
    await expect(block.locator(".block-etikett")).toHaveText("Angabe aus „Entlassbefund Mobilität und Schmerz“ · grau wird nicht kopiert");
    await proc.click();
    await expect(feldfenster(page).locator(".ff-vorschlag")).toContainText("Angabe aus „Entlassbefund Mobilität und Schmerz“. Grau wird nicht kopiert.");
    await expect(feldfenster(page).locator("[data-uebertragen]")).toContainText("Angabe aus „Entlassbefund Mobilität und Schmerz“: grau, bis du sie übernimmst");
    await feldfenster(page).getByRole("radio", { name: "am Rollator" }).click();
    await page.keyboard.press("Escape");
    await expect(proc).toHaveText("Gehen am Rollator.");
    await expect(proc).toHaveClass(/z-gesetzt/);
  });

  test("M-15: Nach „A“ auf „Druckschmerz Leiste“ führt F2 zur offenen Zeile „Bewegungsschmerz Hüfte“, nicht aus der Liste", async ({ page }) => {
    await hueftTep(page);
    await setzeSeiteUndPerson(page, "rechts", "Patient");
    await tok(page, "bef-st-huefte-elektiv/druckschmerz").click();
    const liste = page.locator(".befundliste");
    await expect(liste).toBeVisible();
    const zeiger = () => page.evaluate(() => (document.activeElement?.closest("[data-zeile]") as HTMLElement | null)?.dataset.zeile ?? document.activeElement?.className ?? "");
    await expect.poll(zeiger).toBe("bef-st-huefte-elektiv/druckschmerz");
    await bereit(page);
    await page.keyboard.press("a");
    await expect(liste.locator('[data-zeile="bef-st-huefte-elektiv/druckschmerz"]')).toHaveClass(/bz-luecke/);
    await page.keyboard.press("F2");
    await expect.poll(zeiger).toBe("bef-st-huefte-elektiv/bewegungsschmerz");
    await expect(feldfenster(page)).toHaveCount(0);
    // Umschalt+F2 zurück zur übersprungenen Zeile; sie ist noch offen.
    await page.keyboard.press("Shift+F2");
    await expect.poll(zeiger).toBe("bef-st-huefte-elektiv/druckschmerz");
  });

  test("M-24: Nach dem getippten Hämoglobin steht der Satz mit „g/dl“ schwarz, ohne Ü", async ({ page }) => {
    await hueftTep(page);
    await abschnitt(page, "diagnostik").getByRole("button", { name: /Hämoglobin bei Aufnahme/ }).click();
    await expect(feldfenster(page)).toBeVisible();
    await page.keyboard.type("11,2");
    await page.keyboard.press("Enter");
    const hb = tok(page, "dgn-st-labor/hb-aufnahme");
    await expect(hb).toHaveText("Hämoglobin bei Aufnahme 11,2 g/dl.");
    await expect(hb).toHaveClass(/z-gesetzt/);
  });

  test("Speicherformat: Ein Fall aus v2 ohne Falldaten lädt weiter, die Datumsfelder sind leer", async ({ page }) => {
    await hueftTep(page);
    await setzeDatum(page, "OP-Datum", "5.11.");
    // Den gespeicherten Fall auf den Stand v2 zurücksetzen: ohne Formatangabe, ohne Falldaten.
    const geaendert = await page.evaluate(() => {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)!;
        if (!k.includes("sitzung")) continue;
        const s = JSON.parse(sessionStorage.getItem(k)!);
        delete s.format;
        for (const f of s.faelle) {
          delete f.daten;
          delete f.fristen;
        }
        sessionStorage.setItem(k, JSON.stringify(s));
        return true;
      }
      return false;
    });
    expect(geaendert).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Koxarthrose, Hüft-Totalendoprothese");
    await expect(datumsfeld(page, "OP-Datum")).toHaveValue("");
    await expect(tok(page, "th-st-hueft-tep/datum")).toHaveText("[OP-DATUM]");
  });
});
