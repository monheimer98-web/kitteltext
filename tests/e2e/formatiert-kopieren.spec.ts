// Formatiertes Kopieren (E-61), strukturierte Medikation (E-62) und Unterpunkte (E-63) im echten Browser:
// Die Zwischenablage bekommt reinen Text und HTML; ohne ClipboardItem oder mit ausgeschalteter Einstellung nur Text.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { abschnitt, feldfenster, meldung, oeffneApp, setzeZwischenablage, stelle } from "./hilfen.ts";
import { vorlageMitKopf } from "./durchlauf.ts";

/** Alle Fassungen in der Zwischenablage, nach Typ. */
async function ablage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const aus: Record<string, string> = {};
    for (const item of await navigator.clipboard.read()) {
      for (const typ of item.types) aus[typ] = await (await item.getType(typ)).text();
    }
    return aus;
  });
}

async function commotio(page: Page) {
  await page.getByRole("radio", { name: "Station" }).click();
  await vorlageMitKopf(page, "commotio", "Commotio cerebri Überwachung");
}

const ZEILE = "Ibuprofen 600 mg Tablette, 1-0-1-0, für 7 Tage. NEU.";

/** Eine Arzneimittelzeile über das Feldfenster eintragen: Tab von Feld zu Feld, Bindestrich im Schema springt weiter. */
async function ibuprofen(page: Page) {
  const med = abschnitt(page, "medikation");
  await stelle(med, /^Arzneimittel \(je Zeile/).click();
  const ff = feldfenster(page);
  const wirkstoff = ff.getByRole("textbox", { name: "Zeile 1: Wirkstoff" });
  await expect(wirkstoff).toBeFocused();
  await page.keyboard.type("Ibuprofen");
  await page.keyboard.press("Tab");
  await expect(ff.getByRole("textbox", { name: "Zeile 1: Stärke/Form" })).toBeFocused();
  await page.keyboard.type("600 mg Tablette");
  await page.keyboard.press("Tab");
  await expect(ff.getByRole("textbox", { name: "Zeile 1: morgens" })).toBeFocused();
  // Halb getippt ist das Schema eine Lücke, nichts wird mit 0 aufgefüllt.
  await page.keyboard.type("1-0");
  await expect(ff.getByRole("textbox", { name: "Zeile 1: mittags" })).toHaveValue("0");
  await expect(ff).toContainText("fehlt: Schema abends, nachts");
  // Im Brief steht die Zeile als Lücke (die Anzeige kürzt „‹?›“ zu „…“).
  await expect(med.getByRole("button", { name: /: Ibuprofen 600 mg Tablette, 1-0-‹\?›-‹\?›\., fehlt noch/ })).toBeVisible();
  await page.keyboard.type("-1-0");
  await expect(ff.getByRole("textbox", { name: "Zeile 1: nachts" })).toHaveValue("0");
  await page.keyboard.press("Tab");
  await expect(ff.getByRole("textbox", { name: "Zeile 1: Hinweis, Dauer" })).toBeFocused();
  await page.keyboard.type("für 7 Tage");
  await ff.getByRole("combobox", { name: "Zeile 1: Status" }).selectOption("NEU");
  await expect(med).toContainText(`- ${ZEILE}`);
}

/** Medikation fertig: Zeile, Unverträglichkeiten, Mitgegebenes, Legende übernommen. */
async function medikationFertig(page: Page) {
  await ibuprofen(page);
  const med = abschnitt(page, "medikation");
  // Enter geht weiter zur nächsten Lücke.
  await feldfenster(page).getByRole("combobox", { name: "Zeile 1: Status" }).press("Enter");
  await expect(feldfenster(page).getByRole("textbox", { name: "Arzneimittelunverträglichkeiten" })).toBeFocused();
  await feldfenster(page).getByRole("button", { name: "keine bekannt", exact: true }).click();
  await expect(feldfenster(page).getByRole("textbox", { name: "Mitgegebene Arzneimittel" })).toBeFocused();
  await feldfenster(page).getByRole("button", { name: "keine", exact: true }).click();
  await med.getByRole("button", { name: /übernehmen ✓$/i }).first().click();
  await expect(med.getByRole("button", { name: "Kopieren", exact: true })).toBeEnabled();
}

const TEXT = [
  "Schema: morgens-mittags-abends-nachts.",
  `- ${ZEILE}`,
  "",
  "Arzneimittelunverträglichkeiten: keine bekannt. Mitgegebene Arzneimittel: keine.",
].join("\r\n");

test("E-62/E-61: Medikation strukturiert eintragen; Kopieren legt reinen Text (KIS-sicher) und HTML mit Tabelle ab", async ({ page }) => {
  await oeffneApp(page);
  await commotio(page);
  await medikationFertig(page);
  const med = abschnitt(page, "medikation");
  await med.getByRole("button", { name: "Kopieren", exact: true }).click();
  await expect(meldung(page)).toContainText("Medikation bei Entlassung kopiert");
  await expect.poll(async () => (await ablage(page))["text/plain"]).toBe(TEXT);
  const html = (await ablage(page))["text/html"];
  expect(html).toContain("<table");
  expect(html).toMatch(/<th[^>]*>Wirkstoff<\/th>/);
  // CR-R5-02: Das Schema steht in einer Zelle, wie im Text.
  expect(html).toMatch(/<td[^>]*>Ibuprofen<\/td><td[^>]*>600 mg Tablette<\/td><td[^>]*>1-0-1-0<\/td><td[^>]*>für 7 Tage\. NEU<\/td>/);
  expect(html).toContain("Arzneimittelunverträglichkeiten: keine bekannt.");
  expect(html).not.toMatch(/font-family|color:/);
  await expect(page.getByRole("complementary", { name: "Prüfen und kopieren" })).toContainText("formatiert und als Text (abschalten: Einstellungen → Formatiert kopieren)");
});

test("E-61 Rückfall: ohne ClipboardItem (älterer Browser) geht nur der reine Text in die Zwischenablage, und die App sagt es", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error: Der Test nimmt dem Browser die Schnittstelle, wie in Firefox ESR 115 ohne Freischaltung.
    delete window.ClipboardItem;
  });
  await oeffneApp(page);
  await commotio(page);
  await medikationFertig(page);
  await setzeZwischenablage(page, "Text des vorigen Patienten");
  await abschnitt(page, "medikation").getByRole("button", { name: "Kopieren", exact: true }).click();
  await expect.poll(() => ablage(page)).toEqual({ "text/plain": TEXT });
  await expect(page.getByRole("complementary", { name: "Prüfen und kopieren" })).toContainText("nur als Text");
});

test("E-61 Einstellung aus: nur reiner Text, kein Knopf für die Vorschau", async ({ page }) => {
  await oeffneApp(page);
  await page.getByRole("button", { name: "Einstellungen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einstellungen" });
  const wahl = dialog.getByRole("radiogroup", { name: "Formatiert kopieren" });
  await expect(wahl.getByRole("radio", { name: "an" })).toHaveAttribute("aria-checked", "true");
  await wahl.getByRole("radio", { name: "aus, nur Text" }).click();
  await page.keyboard.press("Escape");
  await commotio(page);
  await expect(page.getByRole("button", { name: "Vorschau formatiert" })).toHaveCount(0);
  await medikationFertig(page);
  // Vorher lag HTML in der Zwischenablage: Auch das muss weg (jedes Schreiben ersetzt die ganze Ablage).
  await page.evaluate(() => navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob(["alt"], { type: "text/plain" }), "text/html": new Blob(["<b>alt</b>"], { type: "text/html" }) })]));
  await abschnitt(page, "medikation").getByRole("button", { name: "Kopieren", exact: true }).click();
  await expect.poll(() => ablage(page)).toEqual({ "text/plain": TEXT });
});

test("E-63/E-61: Begleitdiagnose als eingerückter Unterpunkt; markiert und mit Strg+C kopiert als Text und als Liste", async ({ page }) => {
  await oeffneApp(page);
  await commotio(page);
  const dx = abschnitt(page, "diagnose");
  await dx.getByRole("button", { name: "+ Alkoholintoxikation" }).click();
  await expect(dx).toContainText("Leichtes Schädel-Hirn-Trauma (Commotio cerebri)\n  - Akute Alkoholintoxikation");
  // Den Text der Diagnose markieren, wie mit der Maus.
  await dx.evaluate((el) => {
    const text = el.querySelector(".abschnitt-text, .papier-text") ?? el.querySelector("[data-baustein]")?.parentElement ?? el;
    const r = document.createRange();
    r.selectNodeContents(text);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  await page.keyboard.press("ControlOrMeta+c");
  await expect.poll(async () => (await ablage(page))["text/plain"] ?? "").toContain("Leichtes Schädel-Hirn-Trauma (Commotio cerebri)\r\n  - Akute Alkoholintoxikation");
  const html = (await ablage(page))["text/html"];
  expect(html).toMatch(/<ul[^>]*><li[^>]*>Akute Alkoholintoxikation<\/li><\/ul>/);
});

test("E-61 Vorschau: zeigt die formatierte Fassung mit Unterpunkten; Escape schließt, der Fokus geht zurück", async ({ page }) => {
  await oeffneApp(page);
  await commotio(page);
  await abschnitt(page, "diagnose").getByRole("button", { name: "+ Alkoholintoxikation" }).click();
  await ibuprofen(page);
  await page.keyboard.press("Escape");
  const knopf = page.getByRole("button", { name: "Vorschau formatiert" });
  await knopf.click();
  const vorschau = page.getByRole("dialog", { name: "Vorschau: formatiert kopiert" });
  await expect(vorschau).toBeVisible();
  await expect(vorschau.getByRole("button", { name: "Schließen" })).toBeFocused();
  await expect(vorschau.locator("[data-vorschau=diagnose] li")).toHaveText(["Akute Alkoholintoxikation"]);
  await expect(vorschau.locator("[data-vorschau=medikation] table td").first()).toHaveText("Ibuprofen");
  await expect(vorschau.locator("[data-vorschau=medikation]")).toContainText("noch nicht fertig");
  await page.keyboard.press("Escape");
  await expect(vorschau).toHaveCount(0);
  await expect(knopf).toBeFocused();
});

test("E-62 Medikation: Schnellwert kommt als freie Zeile dazu, × entfernt eine Zeile; eingefügtes „½-0-½-0“ verteilt sich", async ({ page }) => {
  await oeffneApp(page);
  await commotio(page);
  await ibuprofen(page);
  const ff = feldfenster(page);
  const med = abschnitt(page, "medikation");
  await ff.getByRole("button", { name: "Vorbestehende Dauermedikation unverändert, siehe Medikationsplan." }).click();
  await expect(ff.getByRole("textbox", { name: "Zeile 2: freier Text" })).toHaveValue("Vorbestehende Dauermedikation unverändert, siehe Medikationsplan.");
  await expect(med).toContainText(`- ${ZEILE}\n- Vorbestehende Dauermedikation unverändert, siehe Medikationsplan.`);
  // Wer gleich nach dem Klick tippt, schreibt in die neue Zeile: kein Zeichen landet auf dem Knopf.
  await ff.getByRole("button", { name: "+ Arzneimittel" }).click();
  await page.keyboard.type("Metamizol");
  await expect(ff.getByRole("textbox", { name: "Zeile 3: Wirkstoff" })).toHaveValue("Metamizol");
  await ff.getByRole("textbox", { name: "Zeile 3: morgens" }).focus();
  await page.evaluate(() => navigator.clipboard.writeText("1/2-0-1/2-0"));
  await page.keyboard.press("ControlOrMeta+v");
  await expect(ff.getByRole("textbox", { name: "Zeile 3: abends" })).toHaveValue("1/2");
  await expect(med).toContainText("- Metamizol, ½-0-½-0.");
  await ff.getByRole("button", { name: "Zeile 1 entfernen (Ibuprofen)" }).click();
  await expect(med).not.toContainText("Ibuprofen");
  await expect(ff.getByRole("textbox", { name: "Zeile 1: freier Text" })).toBeVisible();
  // Rückgängig holt die Zeile zurück.
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(med).toContainText(ZEILE);
});

test("PS-R5-2 Medikation: Wirkstoff ohne Schema und ohne Hinweis ist eine Lücke; ein Hinweis wie „bei Bedarf“ schließt sie", async ({ page }) => {
  await oeffneApp(page);
  await commotio(page);
  const med = abschnitt(page, "medikation");
  await stelle(med, /^Arzneimittel \(je Zeile/).click();
  const ff = feldfenster(page);
  await expect(ff.getByRole("textbox", { name: "Zeile 1: Wirkstoff" })).toBeFocused();
  await page.keyboard.type("Metamizol");
  await expect(ff).toContainText("fehlt: Schema oder Hinweis");
  await expect(ff.getByRole("textbox", { name: "Zeile 1: morgens" })).toHaveAttribute("data-fehlt", "1");
  await expect(med.getByRole("button", { name: /: Metamizol, ‹Schema oder Hinweis›\., fehlt noch/ })).toBeVisible();
  await ff.getByRole("textbox", { name: "Zeile 1: Hinweis, Dauer" }).fill("bei Bedarf");
  await expect(ff).not.toContainText("fehlt:");
  await expect(med).toContainText("- Metamizol, bei Bedarf.");
});

test("CR-R5-03 Speicherformat: Eine Medikation mit Tabulatoren aus Format 1 lädt als freie Zeile, wie getippt", async ({ page }) => {
  await oeffneApp(page);
  await commotio(page);
  await ibuprofen(page);
  await page.keyboard.press("Escape");
  const geaendert = await page.evaluate(() => {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)!;
      if (!k.includes("sitzung")) continue;
      const s = JSON.parse(sessionStorage.getItem(k)!);
      delete s.format;
      for (const f of s.faelle) f.werte["med-st-entlassung/liste"] = "Ramipril\tDelix\t5 mg\tTbl\t1\t0\t1\t0\tStk\tmorgens nüchtern";
      sessionStorage.setItem(k, JSON.stringify(s));
      return true;
    }
    return false;
  });
  expect(geaendert).toBe(true);
  await page.reload();
  const med = abschnitt(page, "medikation");
  await expect(med).toContainText("- Ramipril Delix 5 mg Tbl 1 0 1 0 Stk morgens nüchtern");
  await expect(med).not.toContainText("5 mg-Tbl-1-0");
});
