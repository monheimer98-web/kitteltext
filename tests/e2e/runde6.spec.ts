// Runde 6, Befunde der Browserprüfung Runde 5 (QA-38 bis QA-43) und R5-01, R5-02. Je Befund ein Test; die Gegenprobe
// gegen den Stand 9177d53 steht im Bericht `docs/05-qualitaet/pruefberichte/r6-fixes-2026-11-10.md`.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { abschnitt, bereit, drueckeUe, feldfenster, meldung, nachDemNaechstenBild, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, stelle, tippe, waehleZiffer, warte } from "./hilfen.ts";
import { lage, taste, vorlageMitKopf } from "./durchlauf.ts";

const tok = (page: Page, key: string) => page.locator(`.tok[data-key="${key}"]`);

async function hueftTep(page: Page) {
  await oeffneApp(page);
  await oeffneVorlage(page, "Koxarthrose", "Koxarthrose, Hüft-Totalendoprothese");
}

/** Wählt an einer Auswahl im Brief eine Möglichkeit mit der Maus und schließt, was der Durchlauf danach öffnet. */
async function waehleImFenster(page: Page, key: string, rolle: "option" | "radio", name: string | RegExp) {
  await tok(page, key).click();
  await feldfenster(page).getByRole(rolle, { name }).click();
  await nachDemNaechstenBild(page);
  if (await feldfenster(page).count()) await page.keyboard.press("Escape");
  await expect(feldfenster(page)).toHaveCount(0);
}

test.describe("Runde 6, gekoppelte Angaben im Feldfenster (QA-38)", () => {
  test("Nahtfenster: Klammern aus dem Entlassbefund stehen markiert als Vorschlag; mit der Maus Wann und Wer: grau bis Ü", async ({ page }) => {
    await hueftTep(page);
    await waehleImFenster(page, "eb-st-wunde/naht", "option", "Hautklammern noch nicht entfernt.");
    const naht = tok(page, "proc-st-wunde/naht");
    await naht.click();
    const ff = feldfenster(page);
    const material = ff.getByRole("radiogroup", { name: "Material" });
    const klammern = material.getByRole("radio", { name: /der Hautklammern/ });
    // Markiert, aber als Vorschlag mit Herkunft; die Reihe sieht nicht offen aus.
    await expect(klammern).toHaveAttribute("aria-checked", "true");
    await expect(klammern).toHaveClass(/vorschlag/);
    await expect(ff.locator('[data-slot="0"]')).not.toHaveClass(/ff-offen/);
    await expect(ff.locator('[data-slot="0"] .ff-label')).toContainText("Vorschlag aus „Entlassbefund Operationsgebiet“");
    // Seit E-92 nimmt „Material“ die Ziffern wie ohne Kopplung (vorher „Wann“).
    await expect(material).toHaveClass(/ziffern-ziel/);
    await ff.getByRole("radiogroup", { name: "Wann" }).getByRole("radio", { name: /am 10\. Tag/ }).click();
    await ff.getByRole("radiogroup", { name: "Wer" }).getByRole("radio", { name: "in der Hausarztpraxis" }).click();
    await nachDemNaechstenBild(page);
    // Alle Pflichtangaben stehen; das Material ist weiter Vorschlag: Der Satz bleibt grau und wird nicht kopiert.
    await expect(naht).toHaveText("Entfernung der Hautklammern am 10. Tag nach der Operation in der Hausarztpraxis.");
    await expect(naht).toHaveClass(/z-vorschlag/);
    await expect(klammern).toHaveAttribute("aria-checked", "true");
    await expect(ff.locator(".ff-vorschlag")).toContainText("Angabe aus „Entlassbefund Operationsgebiet“. Grau wird nicht kopiert.");
    await expect(ff.locator("[data-uebertragen]")).toContainText("grau, bis du sie übernimmst");
    // Übernehmen auf demselben Weg wie im Brief: Ü.
    await bereit(page);
    await drueckeUe(page);
    await nachDemNaechstenBild(page);
    await expect(naht).toHaveClass(/z-gesetzt/);
    await expect(naht).toHaveText("Entfernung der Hautklammern am 10. Tag nach der Operation in der Hausarztpraxis.");
  });

  test("Entlassbefund als Liste: Die Klammern aus dem Procedere tragen „Vorschlag“, nicht die erste Möglichkeit", async ({ page }) => {
    await hueftTep(page);
    const naht = tok(page, "proc-st-wunde/naht");
    await naht.click();
    await feldfenster(page).getByRole("radiogroup", { name: "Material" }).getByRole("radio", { name: /der Hautklammern/ }).click();
    await page.keyboard.press("Escape");
    const eb = tok(page, "eb-st-wunde/naht");
    await expect(eb).toHaveText("Hautklammern noch nicht entfernt.");
    await expect(eb).toHaveClass(/z-vorschlag/);
    await eb.click();
    const liste = feldfenster(page).getByRole("listbox", { name: "Naht- oder Klammermaterial" });
    await expect(liste.getByRole("option", { name: /Hautklammern noch nicht entfernt\..*Vorschlag/ })).toBeVisible();
    await expect(liste.getByRole("option", { name: /^\d*\s*Hautnähte noch nicht entfernt\.\s*$/ })).toBeVisible();
    await expect(liste.locator(".bw-da")).toHaveCount(1);
  });

  test("Allergien: Der Wortlaut aus der Anamnese steht im Fenster der Medikation als Vorschlag zum Übernehmen", async ({ page }) => {
    await hueftTep(page);
    await tok(page, "ana-st-elektiv/allergien").click();
    await page.keyboard.type("Penicillin");
    await page.keyboard.press("Escape");
    const unv = tok(page, "med-st-entlassung/unvertraeglich");
    await expect(unv).toHaveText("Penicillin");
    await expect(unv).toHaveClass(/z-vorschlag/);
    await unv.click();
    const ff = feldfenster(page);
    // Seit PS-R6F-2 der erste Schnellwert, mit Herkunft (vorher ein Kasten mit „Übernehmen ✓“).
    const vorschlag = ff.locator("[data-uebertragen-wert]");
    await expect(vorschlag).toContainText("Penicillin");
    await expect(vorschlag).toContainText("Vorschlag aus „");
    // Das Feld bleibt leer: Der Vorschlag ist nicht die Eingabe des Arztes.
    await expect(ff.getByRole("textbox")).toHaveValue("");
    await vorschlag.click();
    await expect(unv).toHaveClass(/z-gesetzt/);
    await expect(abschnitt(page, "medikation")).toContainText("Penicillin");
  });

  test("Gehhilfe: Im Procedere ist die Gehhilfe aus dem Entlassbefund markiert und als Vorschlag beschriftet", async ({ page }) => {
    await hueftTep(page);
    await waehleImFenster(page, "eb-st-mobilitaet/gehen", "radio", "an Unterarmgehstützen");
    await tok(page, "proc-st-belastung/hilfsmittel").click();
    const reihe = feldfenster(page).locator('[data-slot="0"]');
    const knopf = reihe.getByRole("radio", { name: /Unterarmgehstützen/ });
    await expect(knopf).toHaveAttribute("aria-checked", "true");
    await expect(knopf).toHaveClass(/vorschlag/);
    await expect(reihe.locator(".ff-label")).toContainText("Vorschlag aus „Entlassbefund Mobilität und Schmerz“");
  });
});

/** Der Fokus liegt an einem Halt des Durchlaufs (Fenster, Befundliste, Block, Fallkopf) oder auf „… kopieren“. */
function amHalt(page: Page): Promise<boolean> {
  return page.evaluate(() => !!document.activeElement?.closest(".feldfenster, .befundliste, [data-block], [data-seitenwahl], [data-personwahl], [data-naechste-kopie]"));
}

/** Abschnitt und Stelle, an der der Durchlauf steht: die Stelle eines offenen Fensters, sonst das Element mit dem Fokus. */
function wohinGesprungen(page: Page): Promise<string> {
  return page.evaluate(() => {
    const ziel = document.querySelector<HTMLElement>(".feldfenster") ? document.querySelector<HTMLElement>(".tok-aktiv") : (document.activeElement as HTMLElement | null);
    if (!ziel || ziel === document.body) return "nichts (BODY)";
    const abschnitt = ziel.closest("[data-abschnitt]")?.getAttribute("data-abschnitt") ?? "außerhalb";
    return `${abschnitt} ${ziel.dataset.key ?? ziel.closest<HTMLElement>("[data-block]")?.dataset.block ?? ziel.tagName}`;
  });
}

test.describe("Runde 6, Fokus und Durchlauf (QA-41, QA-42, R5-01)", () => {
  test("QA-42: Nach dem Nahtfenster geht der Durchlauf im Procedere weiter, nicht zurück zum grauen Übertrag im Entlassbefund", async ({ page }) => {
    await hueftTep(page);
    await setzeSeiteUndPerson(page, "rechts", "Patientin");
    await expect(tok(page, "eb-st-wunde/naht")).toHaveClass(/z-offen/);
    await tok(page, "proc-st-wunde/naht").click();
    const ff = feldfenster(page);
    await ff.getByRole("radiogroup", { name: "Material" }).getByRole("radio", { name: /der Hautklammern/ }).click();
    await ff.getByRole("radiogroup", { name: "Wann" }).getByRole("radio", { name: /am 12\. Tag/ }).click();
    await ff.getByRole("radiogroup", { name: "Wer" }).getByRole("radio", { name: "in der Hausarztpraxis" }).click();
    await nachDemNaechstenBild(page);
    await expect(tok(page, "proc-st-wunde/naht")).toHaveClass(/z-gesetzt/);
    // Die Kopplung hat im Entlassbefund einen grauen Übertrag erzeugt; der Durchlauf bleibt trotzdem im Procedere.
    await expect(tok(page, "eb-st-wunde/naht")).toHaveClass(/z-vorschlag/);
    expect(await wohinGesprungen(page)).toMatch(/^procedere /);
  });

  /** OSG-Distorsion mit Tetanusschutz, Fenster am Satz offen. */
  async function tetanusFenster(page: Page) {
    await oeffneApp(page);
    await vorlageMitKopf(page, "osg", "OSG-Distorsion");
    await page.getByRole("button", { name: "+ Tetanusschutz" }).click();
    await taste(page, "ArrowDown");
    await taste(page, "2");
    await page.keyboard.press("Escape");
    await warte(page, 1600);
    await stelle(page, /^Tetanusschutz: /).first().click();
    await expect(feldfenster(page)).toBeVisible();
  }

  test("R5-01: „Satz entfernen“ per Tastatur führt zum nächsten Halt; dort wirkt die nächste Taste", async ({ page }) => {
    await tetanusFenster(page);
    await feldfenster(page).getByRole("button", { name: "Satz entfernen" }).focus();
    await bereit(page);
    await page.keyboard.press("Enter");
    await nachDemNaechstenBild(page);
    await expect(stelle(page, /^Tetanusschutz: /)).toHaveCount(0);
    expect(await amHalt(page)).toBe(true);
    // Der nächste Halt ist die Befundliste der Untersuchung (Probe P5); ↓ geht dort zur nächsten Zeile (CR-R6F-06).
    const vorher = await lage(page);
    expect(vorher).toMatchObject({ art: "liste" });
    const zeile = vorher.art === "liste" ? vorher.zeilenKey : null;
    expect(zeile).not.toBeNull();
    await bereit(page);
    await page.keyboard.press("ArrowDown");
    await nachDemNaechstenBild(page);
    const nachher = await lage(page);
    expect(nachher).toMatchObject({ art: "liste" });
    expect(nachher.art === "liste" ? nachher.zeilenKey : null).not.toBe(zeile);
  });

  test("QA-41: Nach Mausklick auf „Satz entfernen“ steht der Fokus am nächsten Halt, nicht auf BODY", async ({ page }) => {
    await tetanusFenster(page);
    await feldfenster(page).getByRole("button", { name: "Satz entfernen" }).click();
    await nachDemNaechstenBild(page);
    await expect(stelle(page, /^Tetanusschutz: /)).toHaveCount(0);
    expect(await amHalt(page)).toBe(true);
  });

  test("QA-41: Nach Mausklick auf „ohne Datum“ bleibt der Fokus im Nahtfenster; Rückweg „wieder vorschlagen“ ebenso", async ({ page }) => {
    await hueftTep(page);
    const op = page.locator(".fallkopf").getByRole("textbox", { name: "OP-Datum", exact: true });
    await op.fill("8.11.2026");
    await op.press("Enter");
    const naht = tok(page, "proc-st-wunde/naht");
    await naht.click();
    const ff = feldfenster(page);
    await ff.getByRole("radio", { name: "der Hautnähte" }).click();
    await ff.getByRole("radio", { name: "am 12. Tag nach der Operation" }).click();
    await ff.getByRole("radio", { name: "in der Hausarztpraxis" }).click();
    await page.keyboard.press("Escape");
    await naht.click();
    await ff.locator(".ff-frist").getByRole("button", { name: "ohne Datum" }).click();
    await nachDemNaechstenBild(page);
    await expect(naht).toHaveText("Entfernung der Hautnähte am 12. Tag nach der Operation in der Hausarztpraxis.");
    await expect(ff).toBeFocused();
    await ff.getByRole("button", { name: "wieder vorschlagen" }).click();
    await nachDemNaechstenBild(page);
    await expect(naht.locator(".tok-frist.z-vorschlag")).toHaveText("(20.11.2026)");
    await expect(ff).toBeFocused();
  });
});

test.describe("Runde 6, F2 im freien Text (R5-02)", () => {
  /** Ausgewählter Text im Feld mit dem Fokus. */
  const auswahl = (page: Page) =>
    page.evaluate(() => {
      const el = document.activeElement;
      return el instanceof HTMLTextAreaElement ? el.value.slice(el.selectionStart, el.selectionEnd) : null;
    });

  async function vonHand(page: Page) {
    await oeffneApp(page);
    await vorlageMitKopf(page, "osg", "OSG-Distorsion");
    const bf = abschnitt(page, "befund");
    await bf.getByRole("button", { name: "Weitere Aktionen für Befund" }).click();
    await page.getByRole("menu").getByRole("button", { name: "Von Hand bearbeiten" }).click();
    const feld = bf.getByRole("textbox", { name: "Befund von Hand bearbeiten" });
    const luecken = [...(await feld.inputValue()).matchAll(/‹[^›]*›/g)].map((m) => m[0]);
    expect(luecken.length).toBeGreaterThanOrEqual(2);
    return { feld, luecken };
  }

  test("Im Handtext wählt F2 die nächste ‹…›, Umschalt+F2 die vorige; hinter der letzten geht es zum nächsten Halt", async ({ page }) => {
    const { feld, luecken } = await vonHand(page);
    await feld.click();
    await feld.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
    await page.keyboard.press("F2");
    expect(await auswahl(page)).toBe(luecken[0]);
    await page.keyboard.press("F2");
    expect(await auswahl(page)).toBe(luecken[1]);
    await page.keyboard.press("Shift+F2");
    expect(await auswahl(page)).toBe(luecken[0]);
    // Tippen ersetzt die ausgewählte Lücke; der Zähler darunter geht um eins zurück.
    await page.keyboard.type("Keine Schwellung.");
    expect([...(await feld.inputValue()).matchAll(/‹[^›]*›/g)].length).toBe(luecken.length - 1);
    // Hinter der letzten Lücke: F2 verlässt das Feld zum nächsten Halt.
    await feld.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
    await page.keyboard.press("F2");
    await expect(feld).not.toBeFocused();
  });

  test("In der freien Ergänzung ebenso: F2 wählt die nächste ‹…›", async ({ page }) => {
    await oeffneApp(page);
    await vorlageMitKopf(page, "osg", "OSG-Distorsion");
    const bf = abschnitt(page, "befund");
    await bf.getByRole("button", { name: "+ frei ergänzen" }).click();
    const feld = bf.getByRole("textbox", { name: "Freie Ergänzung zu Befund" });
    await expect(feld).toBeFocused();
    await page.keyboard.insertText("Schwellung ‹Grad› und Hämatom ‹Ort›.");
    await feld.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
    await page.keyboard.press("F2");
    expect(await auswahl(page)).toBe("‹Grad›");
    await page.keyboard.press("F2");
    expect(await auswahl(page)).toBe("‹Ort›");
  });

  test("Der Durchlauf landet im Handtext mit der ersten ‹…› ausgewählt", async ({ page }) => {
    const { feld, luecken } = await vonHand(page);
    // Von einem Halt vor dem Befund vorwärts, bis der Fokus im Handtext steht.
    for (let i = 0; i < 12 && !(await feld.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("F2");
      await nachDemNaechstenBild(page);
      if (await feldfenster(page).count()) await expect(feldfenster(page)).toBeVisible();
    }
    await expect(feld).toBeFocused();
    expect(await auswahl(page)).toBe(luecken[0]);
  });
});

test.describe("Runde 6, Medikation (QA-43)", () => {
  async function medikation(page: Page) {
    await oeffneApp(page);
    await page.getByRole("radio", { name: "Station" }).click();
    await vorlageMitKopf(page, "commotio", "Commotio cerebri Überwachung");
    const med = abschnitt(page, "medikation");
    await stelle(med, /^Arzneimittel \(je Zeile/).click();
    const ff = feldfenster(page);
    await expect(ff.getByRole("textbox", { name: "Zeile 1: Wirkstoff" })).toBeFocused();
    await page.keyboard.type("Ibuprofen");
    const zeit = (n: string) => ff.getByRole("textbox", { name: `Zeile 1: ${n}` });
    return { med, ff, zeit };
  }

  test("„1-0-1-0“ ohne einzelne Tastendrücke eingegeben verteilt sich auf die vier Einnahmezeiten", async ({ page }) => {
    const { med, ff, zeit } = await medikation(page);
    await zeit("morgens").focus();
    await page.keyboard.insertText("1-0-1-0");
    await expect(zeit("morgens")).toHaveValue("1");
    await expect(zeit("mittags")).toHaveValue("0");
    await expect(zeit("abends")).toHaveValue("1");
    await expect(zeit("nachts")).toHaveValue("0");
    await expect(ff).not.toContainText("fehlt: Schema");
    await expect(med).toContainText("- Ibuprofen, 1-0-1-0.");
  });

  test("Ein vollständiges Schema in „abends“ steht ab morgens, nicht verschoben und nicht gekürzt; auch eingefügt", async ({ page }) => {
    const { med, zeit } = await medikation(page);
    await zeit("abends").focus();
    await page.keyboard.insertText("1/2-0-1/2-0");
    await expect(med).toContainText("- Ibuprofen, ½-0-½-0.");
    await zeit("nachts").focus();
    await page.evaluate(() => navigator.clipboard.writeText("1-1-1-1"));
    await page.keyboard.press("ControlOrMeta+v");
    await expect(med).toContainText("- Ibuprofen, 1-1-1-1.");
    // Zwei Teile passen ab „abends“; morgens und mittags nennt das Schema nicht: leer, also Lücke, und gemeldet (E-94).
    await zeit("abends").focus();
    await page.keyboard.insertText("0-2");
    await expect(zeit("morgens")).toHaveValue("");
    await expect(zeit("mittags")).toHaveValue("");
    await expect(zeit("abends")).toHaveValue("0");
    await expect(zeit("nachts")).toHaveValue("2");
    await expect(meldung(page)).toContainText("Schema „0-2“ ab abends eingesetzt. Geleert, weil es sie nicht nennt: morgens (vorher „1“), mittags (vorher „1“).");
  });
});

test.describe("Runde 6b, Schema über einem stehenden Schema (PS-R6F-3, CR-R6F-09, E-94)", () => {
  async function mitSchema(page: Page) {
    await oeffneApp(page);
    await page.getByRole("radio", { name: "Station" }).click();
    await vorlageMitKopf(page, "commotio", "Commotio cerebri Überwachung");
    const med = abschnitt(page, "medikation");
    await stelle(med, /^Arzneimittel \(je Zeile/).click();
    const ff = feldfenster(page);
    await expect(ff.getByRole("textbox", { name: "Zeile 1: Wirkstoff" })).toBeFocused();
    await page.keyboard.type("Ibuprofen");
    const zeit = (n: string) => ff.getByRole("textbox", { name: `Zeile 1: ${n}` });
    await zeit("morgens").focus();
    await page.keyboard.insertText("1-1-1-1");
    await expect(med).toContainText("- Ibuprofen, 1-1-1-1.");
    return { med, ff, zeit };
  }
  const werte = async (zeit: (n: string) => import("@playwright/test").Locator) =>
    Promise.all(["morgens", "mittags", "abends", "nachts"].map((n) => zeit(n).inputValue()));

  test("„0-0-1“ in „morgens“ über „1-1-1-1“: nachts wird leer und Lücke, mit Meldung; Rückgängig stellt das alte Schema her", async ({ page }) => {
    const { med, ff, zeit } = await mitSchema(page);
    await zeit("morgens").focus();
    await page.evaluate(() => navigator.clipboard.writeText("0-0-1"));
    await page.keyboard.press("ControlOrMeta+v");
    expect(await werte(zeit)).toEqual(["0", "0", "1", ""]);
    await expect(ff).toContainText("Schema nachts");
    await expect(med).not.toContainText("0-0-1-1");
    await expect(meldung(page)).toContainText("Schema „0-0-1“ ab morgens eingesetzt. Geleert, weil es sie nicht nennt: nachts (vorher „1“).");
    await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
    await expect(med).toContainText("- Ibuprofen, 1-1-1-1.");
  });

  test("Drei Teile in „mittags“ oder „nachts“ stehen ab morgens (CR-R6F-09); das Feld, in das eingefügt wurde, behält nichts Altes", async ({ page }) => {
    const { zeit } = await mitSchema(page);
    await zeit("mittags").focus();
    await page.evaluate(() => navigator.clipboard.writeText("1-0-1"));
    await page.keyboard.press("ControlOrMeta+v");
    expect(await werte(zeit)).toEqual(["1", "0", "1", ""]);
    await expect(meldung(page)).toContainText("Schema „1-0-1“ ab morgens eingesetzt. Geleert, weil es sie nicht nennt: nachts (vorher „1“).");
    await zeit("nachts").focus();
    await page.keyboard.insertText("2-0-2");
    expect(await werte(zeit)).toEqual(["2", "0", "2", ""]);
  });

  test("Gegenprobe: ein vollständiges Schema ersetzt alles, ohne Meldung", async ({ page }) => {
    const { med, zeit } = await mitSchema(page);
    await zeit("morgens").focus();
    await page.keyboard.insertText("1-0-1-0");
    expect(await werte(zeit)).toEqual(["1", "0", "1", "0"]);
    await expect(med).toContainText("- Ibuprofen, 1-0-1-0.");
    await expect(meldung(page).filter({ hasText: "Schema „" })).toHaveCount(0);
  });
});

test.describe("Runde 6, Sprungziele unter dem stehenden Fallkopf (QA-40, QA-45)", () => {
  /**
   * Ziel des letzten Sprungs und Unterkante des stehenden Kopfs, gemessen im Bild. Ziel ist die Stelle unter einem
   * offenen Feldfenster (das Fenster selbst liegt über dem Kopf), sonst, was den Fokus hat. Seite und Person liegen im
   * Kopf selbst und zählen nicht.
   */
  const lage = (page: Page) =>
    page.evaluate(() => {
      const rahmen = document.querySelector(".papier-rahmen")!;
      const kopf = [...rahmen.querySelectorAll<HTMLElement>(".fallkopf, .fk-titel")].find((e) => {
        const s = getComputedStyle(e);
        return s.position === "sticky" && s.display !== "contents";
      })!;
      const ziel = document.querySelector(".feldfenster") ? document.querySelector<HTMLElement>(".tok-aktiv") : (document.activeElement as HTMLElement | null);
      if (!ziel || !ziel.closest(".papier-rahmen") || ziel.closest(".fallkopf")) return null;
      const name = ziel.getAttribute("data-block") ?? ziel.getAttribute("data-key") ?? ziel.getAttribute("aria-label") ?? ziel.className;
      return { ziel: name, oben: ziel.getBoundingClientRect().top, kopfUnten: kopf.getBoundingClientRect().bottom };
    });

  async function behalteneHuefteMitAnleitung(page: Page) {
    await oeffneApp(page);
    const dialog = page.getByRole("dialog", { name: "Einstellungen" });
    await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
    await dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" }).getByRole("radio", { name: "an" }).click();
    await dialog.getByRole("group", { name: "Stationsfälle behalten einschalten?" }).getByRole("button", { name: "Einschalten" }).click();
    await dialog.getByRole("button", { name: "Schließen" }).click();
    await page.getByRole("radio", { name: "Station" }).click();
    await oeffneVorlage(page, "Koxarthrose", "Koxarthrose, Hüft-Totalendoprothese");
    const frage = page.getByRole("dialog", { name: "Fall behalten?" });
    await frage.getByRole("textbox", { name: "Kurzbezeichnung" }).fill("Zi 12 Fenster");
    await frage.getByRole("button", { name: "Behalten" }).click();
    await expect(frage).toHaveCount(0);
    await setzeSeiteUndPerson(page, "rechts", "Patientin");
    await page.getByRole("banner").getByRole("button", { name: "Anleitung", exact: true }).click();
  }

  for (const [breite, hoehe] of [
    [1366, 768],
    [1280, 890],
    [1024, 768],
    [1366, 630],
  ] as const) {
    test(`${breite} × ${hoehe}: Nach jedem Sprung mit F2 und Umschalt+F2 liegt das Ziel ganz unter dem Kopf`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: hoehe });
      await behalteneHuefteMitAnleitung(page);
      const verdeckt: string[] = [];
      let gemessen = 0;
      // Vorwärts durch den Brief, dann rückwärts: Rückwärts liegt das Ziel oben, wo der Kopf steht.
      for (const taste of [...Array(16).fill("F2"), ...Array(12).fill("Shift+F2")] as string[]) {
        await page.keyboard.press(taste);
        await nachDemNaechstenBild(page);
        const l = await lage(page);
        if (l) {
          gemessen++;
          if (l.oben < l.kopfUnten - 0.5) verdeckt.push(`${taste} ${l.ziel}: Oberkante ${Math.round(l.oben)} px, Kopf bis ${Math.round(l.kopfUnten)} px`);
        }
        if (await feldfenster(page).count()) await page.keyboard.press("Escape");
      }
      expect(gemessen).toBeGreaterThan(15);
      expect(verdeckt).toEqual([]);
    });
  }
});

test.describe("Runde 6, Einstellungen (QA-39)", () => {
  for (const breite of [1366, 1024]) {
    test(`${breite} px: Kein Umschalter in den Einstellungen ist abgeschnitten`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 768 });
      await oeffneApp(page);
      await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Einstellungen" });
      await expect(dialog).toBeVisible();
      const befund = await dialog.evaluate((d) => {
        const aus: string[] = [];
        const kasten = d.getBoundingClientRect();
        const gruppen = [...d.querySelectorAll<HTMLElement>(".umschalter")];
        for (const g of gruppen) {
          const r = g.getBoundingClientRect();
          if (r.left < kasten.left - 0.5 || r.right > kasten.right + 0.5) aus.push(`${g.getAttribute("aria-label")}: ragt aus dem Dialog`);
          for (const k of g.querySelectorAll<HTMLElement>("button")) {
            const b = k.getBoundingClientRect();
            // Abgeschnitten heißt: Der Text ist breiter als der Knopf, oder der Knopf reicht über den Umschalter hinaus.
            if (k.scrollWidth > k.clientWidth + 0.5 || b.right > r.right + 0.5) aus.push(`${g.getAttribute("aria-label")}: „${k.textContent}“ abgeschnitten`);
          }
        }
        return { zahl: gruppen.length, aus };
      });
      expect(befund.zahl).toBeGreaterThanOrEqual(5);
      expect(befund.aus).toEqual([]);
    });
  }
});

test.describe("Runde 6b, Allergie aus der Anamnese im Fenster der Medikation (PS-R6F-2)", () => {
  /** Hüft-TEP, Allergie in der Anamnese, Fenster der Arzneimittelunverträglichkeiten offen, Fokus im leeren Feld. */
  async function fenster(page: Page) {
    await hueftTep(page);
    await tok(page, "ana-st-elektiv/allergien").click();
    await page.keyboard.type("Penicillin (Exanthem)");
    await page.keyboard.press("Escape");
    const unv = tok(page, "med-st-entlassung/unvertraeglich");
    await expect(unv).toHaveClass(/z-vorschlag/);
    await unv.click();
    const ff = feldfenster(page);
    const feld = ff.getByRole("textbox", { name: "Arzneimittelunverträglichkeiten" });
    await expect(feld).toBeFocused();
    await bereit(page);
    return { ff, feld, unv };
  }

  test("↓ und Enter, der gewohnte Weg zu den Schnellwerten, übernehmen den Vorschlag, nicht „keine bekannt“", async ({ page }) => {
    const { ff, unv } = await fenster(page);
    await expect(ff.locator(".ff-vorschlaege .pille").first()).toHaveAttribute("data-uebertragen-wert");
    await expect(ff).toContainText("↓ Enter übernimmt den Vorschlag");
    await page.keyboard.press("ArrowDown");
    await expect(ff.locator("[data-uebertragen-wert]")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(unv).toHaveText("Penicillin (Exanthem)");
    await expect(unv).toHaveClass(/z-gesetzt/);
    await expect(page.getByRole("status").filter({ hasText: "Übernommen: Arzneimittelunverträglichkeiten: Penicillin (Exanthem)" })).toBeVisible();
  });

  // PS-R6C-1: Ü ist im Textfeld ein Buchstabe. Vorher übernahm ein langsam getipptes „Übelkeit …“ den Vorschlag, und der
  // Rest des Worts stand im nächsten Feld.
  test("Im leeren Feld mit Vorschlag ist Ü ein Buchstabe: „übelkeit unter Tramadol“ steht ganz im Feld, der Vorschlag wird nicht übernommen", async ({ page }) => {
    const { feld, unv } = await fenster(page);
    // Echter Tastendruck auf Ü (deutsche Belegung), dann der Rest des Worts im Tempo eines Zweifinger-Tippers.
    await drueckeUe(page);
    await warte(page, 350);
    await page.keyboard.type("belkeit unter Tramadol", { delay: 350 });
    await expect(feld).toHaveValue("übelkeit unter Tramadol");
    await expect(unv).toHaveText("übelkeit unter Tramadol");
    await expect(abschnitt(page, "medikation")).not.toContainText("Penicillin");
    await expect(abschnitt(page, "medikation")).not.toContainText("Arzneimittel: belkeit");
    await expect(page.getByRole("status").filter({ hasText: "Übernommen: Arzneimittelunverträglichkeiten" })).toHaveCount(0);
  });

  test("Getippt und wieder gelöscht: Der Vorschlag steht wieder da", async ({ page }) => {
    const { ff, feld, unv } = await fenster(page);
    await page.keyboard.type("x");
    await expect(feld).toHaveValue("x");
    await expect(ff.locator("[data-uebertragen-wert]")).toHaveCount(0);
    await page.keyboard.press("Backspace");
    await expect(ff.locator("[data-uebertragen-wert]")).toBeVisible();
    await expect(unv).toHaveText("Penicillin (Exanthem)");
    await expect(unv).toHaveClass(/z-vorschlag/);
  });

  test("„keine bekannt“ gegen die Allergie der Anamnese: Der Abgleich meldet es an beiden Abschnitten", async ({ page }) => {
    const { ff } = await fenster(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(ff.getByRole("button", { name: "keine bekannt", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    const hinweis = "Allergien: Die Anamnese nennt eine Allergie, die Medikation keine Arzneimittelunverträglichkeit.";
    await expect(abschnitt(page, "medikation")).toContainText(hinweis);
    await expect(abschnitt(page, "anamnese")).toContainText(hinweis);
  });
});

/** Meldung, Abgleichhinweis und Zustand nach einer Wahl an einer gekoppelten Angabe (E-92). */
const abweichend = (page: Page) => page.locator(".meldung").filter({ hasText: "Abweichend von" });

test.describe("Runde 6b, Ziffern an gekoppelten Angaben wie ohne Kopplung, Abweichung gemeldet (CR-R6F-01, PS-R6F-4, E-92)", () => {
  /** Hüft-TEP, Entlassbefund „am Rollator“, Fenster der Gehhilfe im Procedere offen. */
  async function gehhilfe(page: Page) {
    await hueftTep(page);
    await waehleImFenster(page, "eb-st-mobilitaet/gehen", "radio", "am Rollator");
    const proc = tok(page, "proc-st-belastung/hilfsmittel");
    await expect(proc).toHaveClass(/z-vorschlag/);
    await proc.click();
    const reihe = feldfenster(page).getByRole("radiogroup", { name: "Gehhilfe" });
    await expect(reihe.getByRole("radio", { name: /am Rollator/ })).toHaveClass(/vorschlag/);
    await expect(reihe).toHaveClass(/ziffern-ziel/);
    return proc;
  }
  const gehhilfeHinweis = "Gehhilfe: Entlassbefund nennt „Rollator“, Procedere nennt „Unterarmgehstützen“.";

  test("Gehhilfe „1“ gegen „Rollator“: gesetzt, stehende Meldung mit Rückgängig, Abgleich sofort; Rückgängig stellt den Vorschlag wieder her", async ({ page }) => {
    const proc = await gehhilfe(page);
    await waehleZiffer(page, "1");
    await nachDemNaechstenBild(page);
    await expect(proc).toHaveText("Gehen an Unterarmgehstützen.");
    await expect(proc).toHaveClass(/z-gesetzt/);
    await expect(abweichend(page)).toHaveText(/Abweichend von „am Rollator“ aus dem Entlassbefund gesetzt\./);
    // Der Satz im Entlassbefund hat noch Lücken; der Abgleich meldet trotzdem sofort.
    await expect(tok(page, "eb-st-mobilitaet/gehen")).toHaveClass(/z-offen/);
    await expect(abschnitt(page, "procedere")).toContainText(gehhilfeHinweis);
    await expect(abschnitt(page, "entlassbefund")).toContainText(gehhilfeHinweis);
    // Stehend: nach der üblichen Zeit einer Meldung mit Rückgängig (8 s) noch da.
    await warte(page, 8500);
    await expect(abweichend(page)).toBeVisible();
    await abweichend(page).getByRole("button", { name: "Rückgängig" }).click();
    await expect(proc).toHaveText("Gehen am Rollator.");
    await expect(proc).toHaveClass(/z-vorschlag/);
    await expect(page.locator("[data-abgleich]")).toHaveCount(0);
  });

  test("Gegenprobe Gehhilfe: „2“ wählt den Vorschlag „am Rollator“ und macht ihn zur Aussage, ohne Meldung und ohne Abgleich", async ({ page }) => {
    const proc = await gehhilfe(page);
    await waehleZiffer(page, "2");
    await nachDemNaechstenBild(page);
    await expect(proc).toHaveText("Gehen am Rollator.");
    await expect(proc).toHaveClass(/z-gesetzt/);
    await expect(abweichend(page)).toHaveCount(0);
    await expect(page.locator("[data-abgleich]")).toHaveCount(0);
  });

  /** Hüft-TEP, Entlassbefund „Hautklammern noch nicht entfernt.“, Nahtfenster im Procedere offen. */
  async function nahtfenster(page: Page) {
    await hueftTep(page);
    await waehleImFenster(page, "eb-st-wunde/naht", "option", "Hautklammern noch nicht entfernt.");
    const naht = tok(page, "proc-st-wunde/naht");
    await naht.click();
    await expect(feldfenster(page).getByRole("radiogroup", { name: "Material" })).toHaveClass(/ziffern-ziel/);
    return naht;
  }

  test("Naht „1, 1, 1“ gegen „Hautklammern“: Die erste Ziffer gilt dem Material wie ohne Kopplung; gemeldet und im Abgleich", async ({ page }) => {
    const naht = await nahtfenster(page);
    const ff = feldfenster(page);
    await waehleZiffer(page, "1");
    await nachDemNaechstenBild(page);
    await expect(ff.getByRole("radiogroup", { name: "Material" }).getByRole("radio", { name: /der Hautnähte/ })).toHaveAttribute("aria-checked", "true");
    await expect(abweichend(page)).toHaveText(/Abweichend von „der Hautklammern“ aus dem Entlassbefund gesetzt\./);
    // Wann und Wer sind noch offen; der Widerspruch steht trotzdem schon da, an der Kopplung.
    await expect(abschnitt(page, "procedere")).toContainText("Naht- oder Klammermaterial: Entlassbefund nennt „Klammern“, Procedere nennt „Nähte“.");
    await expect(ff.getByRole("radiogroup", { name: "Wann" })).toHaveClass(/ziffern-ziel/);
    await waehleZiffer(page, "1");
    await waehleZiffer(page, "1");
    await nachDemNaechstenBild(page);
    await expect(naht).toHaveText("Entfernung der Hautnähte am 10. Tag nach der Operation in der Hausarztpraxis.");
    await expect(naht).toHaveClass(/z-gesetzt/);
    // Der Satz ist fertig: Es meldet die Regel über den Text, nicht zweimal derselbe Widerspruch.
    await expect(abschnitt(page, "procedere").locator("[data-abgleich]")).toHaveText(/Nahtmaterial: Der Entlassbefund nennt Hautklammern, das Procedere Hautnähte\./);
    await expect(abschnitt(page, "procedere")).not.toContainText("Naht- oder Klammermaterial:");
    await expect(abweichend(page)).toBeVisible();
  });

  test("Gegenprobe Naht: „2 1 1“, die gewohnte Folge, ergibt Klammern, 10. Tag, Hausarzt; keine Meldung, kein Abgleich", async ({ page }) => {
    const naht = await nahtfenster(page);
    for (const z of ["2", "1", "1"]) await waehleZiffer(page, z);
    await nachDemNaechstenBild(page);
    await expect(naht).toHaveText("Entfernung der Hautklammern am 10. Tag nach der Operation in der Hausarztpraxis.");
    await expect(naht).toHaveClass(/z-gesetzt/);
    await expect(abweichend(page)).toHaveCount(0);
    await expect(page.locator("[data-abgleich]")).toHaveCount(0);
  });

  test("Naht: Ü an der grauen Reihe übernimmt den Vorschlag wie seine Ziffer; danach nehmen „Wann“ und „Wer“ die Ziffern", async ({ page }) => {
    const naht = await nahtfenster(page);
    const ff = feldfenster(page);
    await expect(ff).toContainText("Ü übernimmt");
    await bereit(page);
    await drueckeUe(page);
    await nachDemNaechstenBild(page);
    await expect(ff.getByRole("radiogroup", { name: "Material" }).getByRole("radio", { name: /der Hautklammern/ })).not.toHaveClass(/vorschlag/);
    await expect(ff.getByRole("radiogroup", { name: "Wann" })).toHaveClass(/ziffern-ziel/);
    await waehleZiffer(page, "1");
    await waehleZiffer(page, "1");
    await nachDemNaechstenBild(page);
    await expect(naht).toHaveText("Entfernung der Hautklammern am 10. Tag nach der Operation in der Hausarztpraxis.");
    await expect(naht).toHaveClass(/z-gesetzt/);
    await expect(abweichend(page)).toHaveCount(0);
  });

  /** Hüft-TEP, Procedere „der Hautklammern“ (Wann und Wer offen), Liste im Entlassbefund offen. */
  async function liste(page: Page) {
    await hueftTep(page);
    await tok(page, "proc-st-wunde/naht").click();
    await feldfenster(page).getByRole("radiogroup", { name: "Material" }).getByRole("radio", { name: /der Hautklammern/ }).click();
    await page.keyboard.press("Escape");
    const eb = tok(page, "eb-st-wunde/naht");
    await expect(eb).toHaveClass(/z-vorschlag/);
    await eb.click();
    await expect(feldfenster(page)).toContainText("Ü übernimmt den Vorschlag");
    return eb;
  }

  test("Liste im Entlassbefund: „1“ gegen die Klammern aus dem Procedere wird gesetzt und gemeldet, der Abgleich sofort", async ({ page }) => {
    const eb = await liste(page);
    await waehleZiffer(page, "1");
    await nachDemNaechstenBild(page);
    await expect(eb).toHaveText("Hautnähte noch nicht entfernt.");
    await expect(eb).toHaveClass(/z-gesetzt/);
    await expect(abweichend(page)).toHaveText(/Abweichend von „Hautklammern noch nicht entfernt\.“ aus dem Procedere gesetzt\./);
    await expect(abschnitt(page, "entlassbefund")).toContainText("Naht- oder Klammermaterial: Entlassbefund nennt „Nähte“, Procedere nennt „Klammern“.");
    await abweichend(page).getByRole("button", { name: "Rückgängig" }).click();
    await expect(eb).toHaveText("Hautklammern noch nicht entfernt.");
    await expect(eb).toHaveClass(/z-vorschlag/);
    await expect(page.locator("[data-abgleich]")).toHaveCount(0);
  });

  test("Gegenprobe Liste: Ü wählt die Möglichkeit mit „Vorschlag“ und macht sie zur Aussage, ohne Meldung", async ({ page }) => {
    const eb = await liste(page);
    await bereit(page);
    await drueckeUe(page);
    await nachDemNaechstenBild(page);
    await expect(eb).toHaveText("Hautklammern noch nicht entfernt.");
    await expect(eb).toHaveClass(/z-gesetzt/);
    await expect(abweichend(page)).toHaveCount(0);
    await expect(page.locator("[data-abgleich]")).toHaveCount(0);
  });
});

test.describe("Runde 6b, Lücke im freien Text nach dem Sprung (CR-R6F-02, PS-R6F-1, E-93)", () => {
  const luecken = (text: string) => (text.match(/‹[^›]*›/g) ?? []).length;
  const auswahl = (page: Page) =>
    page.evaluate(() => {
      const el = document.activeElement;
      return el instanceof HTMLTextAreaElement ? el.value.slice(el.selectionStart, el.selectionEnd) : null;
    });

  /** OSG-Distorsion, Befund von Hand, Allergien beantwortet; Fenster „Gerinnungshemmung“ offen und bereit. Danach springt der Durchlauf in den Handtext. */
  async function vorDemHandtext(page: Page) {
    await oeffneApp(page);
    await vorlageMitKopf(page, "osg", "OSG-Distorsion");
    const bf = abschnitt(page, "befund");
    await bf.getByRole("button", { name: "Weitere Aktionen für Befund" }).click();
    await page.getByRole("menu").getByRole("button", { name: "Von Hand bearbeiten" }).click();
    const feld = bf.getByRole("textbox", { name: "Befund von Hand bearbeiten" });
    const vorher = await feld.inputValue();
    await tok(page, "ana-trauma/allergien").click();
    await page.keyboard.type("keine bekannt");
    await page.keyboard.press("Escape");
    await expect(feldfenster(page)).toHaveCount(0);
    const gerinnung = tok(page, "ana-trauma/antikoagulation");
    await gerinnung.click();
    await expect(feldfenster(page)).toBeVisible();
    await bereit(page);
    return { feld, vorher, gerinnung };
  }

  test("„1, 1“ im Abstand von 40 ms: Die zweite Ziffer ersetzt die ausgewählte Lücke nicht, sie wird gemeldet, und die erste geht zurück", async ({ page }) => {
    const { feld, vorher, gerinnung } = await vorDemHandtext(page);
    await tippe(page, ["1", "1"], 40);
    await nachDemNaechstenBild(page);
    await nachDemNaechstenBild(page);
    expect(await feld.inputValue()).toBe(vorher);
    // Wie an jedem Halt: zu früh, verworfen, gemeldet; die Wahl im Fenster davor war blind und geht zurück (E-45). Der
    // Fokus steht wie nach jeder Rücknahme an der Stelle, die wieder offen ist.
    await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt: „Gerinnungshemmung“ (jetzt: wieder offen).");
    await expect(meldung(page)).toContainText("Verworfen: „1“ (zu früh nach dem Weiterspringen)");
    await expect(gerinnung).toHaveClass(/z-offen/);
    await expect(gerinnung).toBeFocused();
    // Weitere Zeichen ändern den Handtext nicht.
    await warte(page, 400);
    await page.keyboard.press("x");
    expect(await feld.inputValue()).toBe(vorher);
  });

  test("Gegenprobe: Wer nach dem Sprung hinsieht und dann tippt, ersetzt die ausgewählte Lücke", async ({ page }) => {
    const { feld, vorher, gerinnung } = await vorDemHandtext(page);
    await page.keyboard.press("1");
    await expect(feld).toBeFocused();
    await expect(gerinnung).toHaveClass(/z-gesetzt/);
    // Pause des Arztes: länger als ein Tipp-Zug (1,5 s), dann ein Zeichen.
    await warte(page, 1600);
    await page.keyboard.type("Keine Schwellung.");
    const nachher = await feld.inputValue();
    expect(luecken(nachher)).toBe(luecken(vorher) - 1);
    expect(nachher).toContain("Keine Schwellung.");
    await expect(gerinnung).toHaveClass(/z-gesetzt/);
  });

  test("F2 selbst im Handtext: Die nächste Lücke ist ohne Sperre ausgewählt, ein Zeichen gleich danach ersetzt sie", async ({ page }) => {
    const { feld, vorher } = await vorDemHandtext(page);
    await page.keyboard.press("1");
    await expect(feld).toBeFocused();
    await bereit(page);
    const erste = await auswahl(page);
    await tippe(page, ["F2", "x"], 20);
    const nachher = await feld.inputValue();
    expect(luecken(nachher)).toBe(luecken(vorher) - 1);
    expect(nachher).toContain(erste!);
    await expect(meldung(page).filter({ hasText: "Verworfen" })).toHaveCount(0);
  });

  test("F2 zu schnell nach dem Sprung: dieselbe Regel wie nach jedem Sprung, ein Zeichen gleich danach ersetzt die neue Lücke nicht", async ({ page }) => {
    const { feld, vorher } = await vorDemHandtext(page);
    await tippe(page, ["1", "F2", "x"], 40);
    await nachDemNaechstenBild(page);
    await nachDemNaechstenBild(page);
    await expect(feld).toBeFocused();
    expect(await feld.inputValue()).toBe(vorher);
    expect(await auswahl(page)).toMatch(/^‹.*›$/);
    await expect(meldung(page)).toContainText("Verworfen: „x“ (zu früh nach dem Weiterspringen)");
  });
});

test.describe("Runde 6b, ausgewählte Lücke im Bild (CR-R6F-03, PS-R6F-5, E-95)", () => {
  // Probe P6 der Code-Prüfung: 1366 × 630, Befund von Hand mit 41 Zeilen, die Lücke in der letzten.
  const lang = [...Array.from({ length: 40 }, (_, i) => `Zeile ${i + 1}: unauffälliger Befund ohne Besonderheiten.`), "Zeile 41: ‹Lücke unten›"].join("\n");

  /** Liegt die Auswahl im Textfeld mit dem Fokus im Bild, im Feld und im Brief unter dem stehenden Kopf? Unabhängig gemessen: Spiegel mit gleicher Schrift. */
  const auswahlImBild = (page: Page) =>
    page.evaluate(() => {
      const ta = document.activeElement as HTMLTextAreaElement;
      const s = getComputedStyle(ta);
      const spiegel = document.createElement("div");
      spiegel.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:content-box;border:0;font:${s.font};line-height:${s.lineHeight};padding:${s.padding};width:${ta.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)}px`;
      spiegel.textContent = ta.value.slice(0, ta.selectionStart);
      const m = document.createElement("span");
      m.textContent = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      spiegel.append(m);
      document.body.append(spiegel);
      const y = ta.getBoundingClientRect().top + ta.clientTop - ta.scrollTop + m.offsetTop;
      const h = m.offsetHeight;
      spiegel.remove();
      const rahmen = ta.closest(".papier-rahmen")!;
      const kopf = [...rahmen.querySelectorAll<HTMLElement>(".fallkopf, .fk-titel")].find((e) => getComputedStyle(e).position === "sticky" && getComputedStyle(e).display !== "contents");
      const oben = Math.max(rahmen.getBoundingClientRect().top, kopf?.getBoundingClientRect().bottom ?? 0);
      const t = ta.getBoundingClientRect();
      return {
        auswahl: ta.value.slice(ta.selectionStart, ta.selectionEnd),
        imFeld: y >= t.top + ta.clientTop && y + h <= t.top + ta.clientTop + ta.clientHeight,
        imBrief: y >= oben && y + h <= Math.min(window.innerHeight, rahmen.getBoundingClientRect().bottom),
      };
    });

  async function langerBefund(page: Page, text = lang) {
    await page.setViewportSize({ width: 1366, height: 630 });
    await oeffneApp(page);
    await vorlageMitKopf(page, "osg", "OSG-Distorsion");
    const bf = abschnitt(page, "befund");
    await bf.getByRole("button", { name: "Weitere Aktionen für Befund" }).click();
    await page.getByRole("menu").getByRole("button", { name: "Von Hand bearbeiten" }).click();
    const feld = bf.getByRole("textbox", { name: "Befund von Hand bearbeiten" });
    await feld.fill(text);
    return feld;
  }

  test("F2 im langen Handtext: Die Lücke in der letzten Zeile steht danach im Feld und im Brief im Bild", async ({ page }) => {
    const feld = await langerBefund(page);
    await feld.evaluate((el: HTMLTextAreaElement) => {
      el.setSelectionRange(0, 0);
      el.scrollTop = 0;
      el.closest(".papier-rahmen")!.scrollTop = 0;
    });
    await feld.focus();
    const vorher = await auswahlImBild(page);
    expect(vorher.imFeld && vorher.imBrief).toBe(false);
    await page.keyboard.press("F2");
    await nachDemNaechstenBild(page);
    expect(await auswahlImBild(page)).toEqual({ auswahl: "‹Lücke unten›", imFeld: true, imBrief: true });
  });

  test("Sprung des Durchlaufs in den langen Handtext: Die ausgewählte erste Lücke steht im Bild", async ({ page }) => {
    const feld = await langerBefund(page);
    // Nach dem Einfügen steht das Feld am Ende; der Arzt hat zuletzt oben gelesen.
    await feld.evaluate((el: HTMLTextAreaElement) => {
      el.setSelectionRange(0, 0);
      el.scrollTop = 0;
    });
    await tok(page, "ana-trauma/allergien").click();
    await page.keyboard.type("keine bekannt");
    await page.keyboard.press("Escape");
    await tok(page, "ana-trauma/antikoagulation").click();
    await expect(feldfenster(page)).toBeVisible();
    await bereit(page);
    await page.keyboard.press("1");
    await expect(feld).toBeFocused();
    await nachDemNaechstenBild(page);
    expect(await auswahlImBild(page)).toEqual({ auswahl: "‹Lücke unten›", imFeld: true, imBrief: true });
  });

  test("Gegenprobe: Steht die Lücke schon im Bild, rollt weder das Feld noch der Brief", async ({ page }) => {
    const feld = await langerBefund(page, "Zeile 1: ‹Lücke oben›\nZeile 2: unauffällig.");
    await feld.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
    await feld.focus();
    const stand = () => feld.evaluate((el) => [el.scrollTop, el.closest(".papier-rahmen")!.scrollTop]);
    const vorher = await stand();
    await page.keyboard.press("F2");
    await nachDemNaechstenBild(page);
    expect(await auswahlImBild(page)).toEqual({ auswahl: "‹Lücke oben›", imFeld: true, imBrief: true });
    expect(await stand()).toEqual(vorher);
  });
});

test.describe("Runde 6b, „Satz entfernen“ zurücknehmen (CR-R6F-04)", () => {
  /** OSG-Distorsion mit Tetanusschutz, Satz per Klick entfernt; der Durchlauf hat den nächsten Halt geöffnet. */
  async function satzEntfernt(page: Page) {
    await oeffneApp(page);
    await vorlageMitKopf(page, "osg", "OSG-Distorsion");
    await page.getByRole("button", { name: "+ Tetanusschutz" }).click();
    await taste(page, "ArrowDown");
    await taste(page, "2");
    await page.keyboard.press("Escape");
    await warte(page, 1600);
    const satz = (await stelle(page, /^Tetanusschutz: /).first().textContent())!.trim();
    await stelle(page, /^Tetanusschutz: /).first().click();
    await feldfenster(page).getByRole("button", { name: "Satz entfernen" }).click();
    await nachDemNaechstenBild(page);
    await expect(stelle(page, /^Tetanusschutz: /)).toHaveCount(0);
    expect(await amHalt(page)).toBe(true);
    return satz;
  }

  test("Die Meldung nennt den Satz; „Rückgängig“ holt ihn zurück", async ({ page }) => {
    const satz = await satzEntfernt(page);
    await expect(meldung(page)).toContainText(`Satz entfernt: „${satz}“`);
    await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
    await expect(stelle(page, /^Tetanusschutz: /)).toHaveCount(1);
    await expect(stelle(page, /^Tetanusschutz: /).first()).toHaveText(satz);
  });

  test("Strg+Z wirkt sofort, obwohl der nächste Halt offen ist", async ({ page }) => {
    const satz = await satzEntfernt(page);
    await page.keyboard.press("ControlOrMeta+z");
    await nachDemNaechstenBild(page);
    await expect(stelle(page, /^Tetanusschutz: /)).toHaveCount(1);
    await expect(stelle(page, /^Tetanusschutz: /).first()).toHaveText(satz);
    await expect(meldung(page)).toContainText("Zurückgenommen");
  });

  test("Gegenprobe: In einem Textfeld des Fensters gehört Strg+Z dem Feld, nicht dem Brief", async ({ page }) => {
    await satzEntfernt(page);
    await page.keyboard.press("Escape");
    await tok(page, "ana-trauma/allergien").click();
    const eingabe = feldfenster(page).locator("input, textarea").first();
    await expect(eingabe).toBeFocused();
    await page.keyboard.type("Penicillin");
    await page.keyboard.press("ControlOrMeta+z");
    await nachDemNaechstenBild(page);
    // Der entfernte Satz bleibt weg; die Rücknahme des Briefs hat nicht gegriffen.
    await expect(stelle(page, /^Tetanusschutz: /)).toHaveCount(0);
    await expect(meldung(page).filter({ hasText: "Zurückgenommen" })).toHaveCount(0);
  });
});

test.describe("Runde 6b, Kopf wächst im selben Schritt wie der Sprung (CR-R6F-05, PS-R6F-7)", () => {
  /**
   * Hüft-TEP, Aufnahme 6.11., Fenster am OP-Datum offen und das Datum getippt (vorgegeben „4.11.2026“). Enter setzt das Datum, im Kopf erscheint
   * „OP-Datum liegt vor dem Aufnahmedatum.“, und der Durchlauf springt zum grauen Block „th-st-weitere“. Der Block steht
   * vorher knapp unter dem Kopf, wo ihn der gewachsene Kopf verdeckt.
   */
  async function vorDemSprung(page: Page, abstand: number, datum = "4.11.2026") {
    await page.setViewportSize({ width: 1366, height: 768 });
    // Fester Tag: Sonst meldete der Kopf später „mehr als ein Jahr zurück“, auch in der Gegenprobe.
    await page.clock.setFixedTime(new Date("2026-11-08T09:30:00+01:00"));
    await hueftTep(page);
    await setzeSeiteUndPerson(page, "rechts", "Patientin");
    const aufnahme = page.locator(".fallkopf").getByRole("textbox", { name: "Aufnahmedatum", exact: true });
    await aufnahme.fill("6.11.2026");
    await aufnahme.press("Enter");
    await tok(page, "th-st-hueft-tep/datum").click();
    await expect(feldfenster(page)).toBeVisible();
    await page.keyboard.type(datum);
    const block = page.locator('[data-abschnitt="therapie"] [data-block="th-st-weitere"]');
    await block.evaluate((el, abstand) => {
      const rahmen = el.closest(".papier-rahmen")!;
      const kopf = document.querySelector(".fallkopf")!.getBoundingClientRect().bottom;
      rahmen.scrollTop += el.getBoundingClientRect().top - kopf - abstand;
    }, abstand);
    await nachDemNaechstenBild(page);
    return block;
  }

  const lageZumKopf = (page: Page) =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return { block: el.closest<HTMLElement>("[data-block]")?.dataset.block, abstand: Math.round(el.getBoundingClientRect().top - document.querySelector(".fallkopf")!.getBoundingClientRect().bottom) };
    });

  test("Enter setzt ein OP-Datum vor der Aufnahme: Der Hinweis macht den Kopf höher, der Block, zu dem es springt, steht trotzdem darunter", async ({ page }) => {
    const block = await vorDemSprung(page, 4);
    const kopfVorher = await page.locator(".fallkopf").evaluate((e) => e.getBoundingClientRect().height);
    await page.keyboard.press("Enter");
    await nachDemNaechstenBild(page);
    await expect(page.locator(".fallkopf .fd-hinweis")).toHaveText("OP-Datum liegt vor dem Aufnahmedatum.");
    expect(await page.locator(".fallkopf").evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(kopfVorher + 8);
    await expect(block).toBeFocused();
    const nachher = await lageZumKopf(page);
    expect(nachher.block).toBe("th-st-weitere");
    expect(nachher.abstand).toBeGreaterThanOrEqual(0);
  });

  test("Gegenprobe: Ohne Hinweis bleibt der Kopf gleich, und der Block steht ebenso darunter", async ({ page }) => {
    // Ein Datum nach der Aufnahme: kein Hinweis, der Kopf wächst nicht.
    const block = await vorDemSprung(page, 4, "7.11.2026");
    await page.keyboard.press("Enter");
    await nachDemNaechstenBild(page);
    await expect(page.locator(".fallkopf .fd-hinweis")).toHaveCount(0);
    await expect(block).toBeFocused();
    expect((await lageZumKopf(page)).abstand).toBeGreaterThanOrEqual(0);
  });
});

// --- Abschlussprüfung Runde 6 (11.11.2026) -------------------------------------------------------------------------

test.describe("Abschlussprüfung Runde 6", () => {
  // CR-R6C-02: „Ziffer, Enter“ ist Gewohnheit. Springt die Ziffer in einen von Hand bearbeiteten Abschnitt, ist dort die
  // erste Lücke ausgewählt; Enter, Rück- und Entfernentaste ersetzen sie auch nach der Schreckzeit nicht.
  for (const [name, key] of [["Enter", "Enter"], ["Rücktaste", "Backspace"], ["Entfernen", "Delete"]] as const) {
    test(`Vorausgewählte Lücke im Handtext: „1“, dann ${name} nach 600 ms lässt jede Lücke stehen`, async ({ page }) => {
      await oeffneApp(page);
      await vorlageMitKopf(page, "osg", "OSG-Distorsion");
      const bf = abschnitt(page, "befund");
      await bf.getByRole("button", { name: "Weitere Aktionen für Befund" }).click();
      await page.getByRole("menu").getByRole("button", { name: "Von Hand bearbeiten" }).click();
      const feld = bf.getByRole("textbox", { name: "Befund von Hand bearbeiten" });
      const vorher = await feld.inputValue();
      await tok(page, "ana-trauma/allergien").click();
      await page.keyboard.type("keine bekannt");
      await page.keyboard.press("Escape");
      await expect(feldfenster(page)).toHaveCount(0);
      await tok(page, "ana-trauma/antikoagulation").click();
      await expect(feldfenster(page)).toBeVisible();
      await bereit(page);
      await page.keyboard.press("1");
      await expect(feld).toBeFocused();
      await warte(page, 600);
      await page.keyboard.press(key);
      await nachDemNaechstenBild(page);
      expect(await feld.inputValue()).toBe(vorher);
      await expect(meldung(page)).toContainText("Die ausgewählte Lücke bleibt stehen");
      // Ein Zeichen ersetzt sie danach wie gewohnt.
      await page.keyboard.type("x");
      expect((await feld.inputValue()).length).toBeLessThan(vorher.length);
    });
  }

  // CR-R6C-01: Strg+Z bei offenem Fenster schließt es. Vorher blieb die Ziffernreihe bei „Wann“ stehen, und die nächste
  // „2“ setzte „am 12. Tag“, während das Material offen blieb.
  test("Nahtfenster: „2“, Strg+Z, „2“ setzt nichts; das Fenster ist zu, der Satz wie vorher", async ({ page }) => {
    await oeffneApp(page);
    await oeffneVorlage(page, "Koxarthrose", "Koxarthrose, Hüft-Totalendoprothese");
    await setzeSeiteUndPerson(page, "rechts", "Patientin");
    const naht = tok(page, "proc-st-wunde/naht");
    const vorher = await naht.textContent();
    await naht.click();
    await expect(feldfenster(page)).toBeVisible();
    await waehleZiffer(page, "2");
    await expect(naht).toContainText("Hautklammern");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(feldfenster(page)).toHaveCount(0);
    await expect(naht).toHaveText(vorher!);
    await bereit(page);
    await page.keyboard.press("2");
    await nachDemNaechstenBild(page);
    await expect(naht).toHaveText(vorher!);
  });
});
