// Runde 5: Ausgangsstellung an den Rotationsfeldern (R4-D3), sichere Rücknahme (CR-R4-01, CR-R4-02, PS-R4-1), doppelte
// Einheit (CR-R4-03), Zeichen auf dem „i“ (PS-R4-2), Rückgängig in der Seitenmeldung (H-R4-1), Meldung nach Ü (H-R4-4),
// Handbearbeitung vor dem Klären (M-18 Station), Abgleich an beiden Abschnitten und Kopierstatus (M-27 Station).
// Je Befund ein Test; jeder vergleicht den Brief vor und nach den Tasten oder prüft den Wortlaut im Brief.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { abschnitt, aenderungen, bereit, feldfenster, meldung, nachDemNaechstenBild, oeffneApp, oeffneVorlage, stand, stelle, tippe, warte } from "./hilfen.ts";
import { taste, vorlageMitKopf } from "./durchlauf.ts";

async function vorlage(page: Page, suche: string, titel: string) {
  await oeffneApp(page);
  await vorlageMitKopf(page, suche, titel);
}

/** Vorlage auf Station: Einsatzort umstellen, suchen, Seite und Person mit der Maus. */
async function stationsvorlage(page: Page, suche: string, titel: string) {
  await oeffneApp(page);
  await page.getByRole("radiogroup", { name: "Einsatzort" }).getByRole("radio", { name: "Station", exact: true }).click();
  await oeffneVorlage(page, suche, titel);
  const seite = page.getByRole("radiogroup", { name: "Seite", exact: true });
  if (await seite.count()) await seite.getByRole("radio", { name: "rechts", exact: true }).click();
  const person = page.getByRole("radiogroup", { name: "Patient oder Patientin" });
  if (await person.count()) await person.getByRole("radio", { name: "Patientin", exact: true }).click();
}

/** Befundliste des Blocks, der die Zeile trägt. */
async function listeMit(page: Page, zeile: string) {
  const block = page.locator(`[data-block="${zeile.split("/")[0]}"]`);
  await block.locator("[data-pruefen]").first().click();
  await expect(page.locator(`.befundliste [data-zeile="${zeile}"]`)).toBeVisible();
  return page.locator(`.befundliste [data-zeile="${zeile}"]`);
}

/** Exakter Text der Meldung; `toContainText` zöge Leerraum zusammen. */
const text = async (page: Page) => (await meldung(page).textContent()) ?? "";
const fokusIn = (page: Page, selektor: string) => page.evaluate((s) => !!document.activeElement?.closest(s), selektor);

test.describe("Runde 5, Ausgangsstellung an den Rotationsfeldern (R4-D3)", () => {
  test("Schulter (Station, Rotatorenmanschette) per Tastatur: Wert, Enter, Ziffer; im Brief in Klammern; das „i“ zeigt nur die gewählte Stellung", async ({ page }) => {
    await stationsvorlage(page, "rotatorenmanschette", "Schulterarthroskopie, Naht der Rotatorenmanschette");
    const zeile = await listeMit(page, "bef-st-schulter-rm/rotation");
    const reihe = zeile.getByRole("radiogroup", { name: "Ausgangsstellung Außenrotation/Innenrotation" });
    await expect(reihe.getByRole("radio")).toHaveText([/Oberarm anliegend/, /in 90° Abduktion/]);
    await zeile.locator("input").click();
    await tippe(page, "40/0/70⏎");
    await nachDemNaechstenBild(page);
    // Noch keine Stellung: Der Zeiger bleibt auf der Zeile, ihre Ziffern wählen die Stellung; der Brief nennt den Wert ohne Klammer.
    await expect(zeile).toBeFocused();
    await expect(zeile).toContainText("Ausgangsstellung nicht angegeben");
    await expect(abschnitt(page, "befund")).toContainText("Außenrotation/Innenrotation 40/0/70°.");
    await bereit(page);
    const vor = await stand(page);
    await taste(page, "2");
    await expect(reihe.getByRole("radio", { name: /in 90° Abduktion/ })).toHaveAttribute("aria-checked", "true");
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert, geaendert.join("\n")).toHaveLength(1);
    expect(geaendert[0]).toContain("40/0/70° (in 90° Abduktion)");
    await expect(abschnitt(page, "befund")).toContainText("Außenrotation/Innenrotation 40/0/70° (in 90° Abduktion).");
    // Danach eine Zeile tiefer wie nach jeder Angabe der Liste; die Zeile hat keinen Hinweis mehr.
    await expect(zeile).not.toBeFocused();
    await expect(zeile).not.toContainText("Ausgangsstellung nicht angegeben");
    // Gewohnheit „Ziffer, Enter“: Das Enter nach der Ziffer ändert nichts.
    const nachZiffer = await stand(page);
    await taste(page, "Enter");
    expect(aenderungen(nachZiffer, await stand(page))).toEqual([]);
    await zeile.getByRole("button", { name: "Normalwerte zu Außenrotation/Innenrotation" }).hover();
    const box = page.getByRole("tooltip");
    await expect(box).toContainText("Außenrotation/Innenrotation: in 90° Abduktion 70–90/0/60–70°");
    await expect(box).not.toContainText("Oberarm anliegend");
  });

  test("Hüfte (Station, Hüft-TEP) mit der Maus; ohne Stellung geht Enter auf der Zeile weiter und setzt nichts", async ({ page }) => {
    await stationsvorlage(page, "hüft-tep", "Koxarthrose, Hüft-Totalendoprothese");
    const zeile = await listeMit(page, "bef-st-huefte-elektiv/rotation");
    await zeile.locator("input").click();
    await tippe(page, "30/0/20⏎");
    await nachDemNaechstenBild(page);
    await expect(zeile).toBeFocused();
    await bereit(page);
    const vor = await stand(page);
    await taste(page, "Enter");
    // Enter auf der Zeile wählt keine Stellung: hinweisen statt zwingen.
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    await expect(zeile).not.toBeFocused();
    await expect(abschnitt(page, "befund")).toContainText("Außenrotation/Innenrotation 30/0/20°.");
    await zeile.getByRole("radio", { name: /in Streckung/ }).click();
    await expect(abschnitt(page, "befund")).toContainText("Außenrotation/Innenrotation 30/0/20° (in Streckung).");
    await zeile.getByRole("button", { name: "Normalwerte zu Außenrotation/Innenrotation" }).hover();
    await expect(page.getByRole("tooltip")).toContainText("in Streckung 30–40/0/30–40°");
    await expect(page.getByRole("tooltip")).not.toContainText("Hüftbeugung");
  });
});

test.describe("Runde 5, Rücknahme und Meldungen", () => {
  test("CR-R4-03: Kniedistorsion „0/0/120°“ ergibt „0/0/120°.“, nicht „°°“", async ({ page }) => {
    await vorlage(page, "kniedistorsion", "Kniedistorsion");
    const zeile = await listeMit(page, "knie-untersuchung/knie_extflex");
    await zeile.locator("input").click();
    await tippe(page, "0/0/120°⏎");
    await nachDemNaechstenBild(page);
    const brief = (await abschnitt(page, "befund").textContent()) ?? "";
    expect(brief).toContain("0/0/120°.");
    expect(brief).not.toContain("°°");
  });

  test("CR-R4-01: Wahl „Keine Wunde“, Ü auf ihren Satz, Vertipper: Die Wahl geht zurück, und kein „Im Brief geblieben“ für einen Satz, der nicht mehr da ist", async ({ page }) => {
    await vorlage(page, "luxationsfraktur mittelgelenk", "Luxationsfraktur des Mittelgelenks");
    const pr = abschnitt(page, "procedere");
    await stelle(pr, /Wunde.*\?: .*fehlt noch$/).first().click();
    await expect(feldfenster(page)).toBeVisible();
    const vor = await stand(page);
    await bereit(page);
    await tippe(page, ["1", "ü", "x"], 500);
    await nachDemNaechstenBild(page);
    const t = await text(page);
    expect(t).toContain("Zurückgenommen, weil gleich weitergetippt:");
    expect(t).not.toContain("Im Brief geblieben");
    // Die Stelle ist wieder offen, der Satz steht nicht im Brief.
    await expect(stelle(pr, /Wunde.*\?: .*fehlt noch$/).first()).toBeVisible();
    await expect(pr).not.toContainText("Keine Wunde im Bereich der Fraktur");
    expect(aenderungen(vor, await stand(page))).toEqual([]);
  });

  test("PS-R4-1: Ein Wechsel der Seite eines Bausteins beendet den Tipp-Zug wie die Seite des Briefs; die Meldung nennt den Baustein; ein „x“ danach nimmt ihn nicht zurück", async ({ page }) => {
    await vorlage(page, "osg", "OSG-Distorsion");
    const dx = abschnitt(page, "diagnose");
    await stelle(dx, "Seite: rechts").first().click();
    await expect(feldfenster(page)).toBeVisible();
    await bereit(page);
    await tippe(page, ["2"]);
    await nachDemNaechstenBild(page);
    await expect(meldung(page)).toContainText(/Seite „[^“]+“: links \(vorher rechts\)/);
    await expect(stelle(dx, "Seite: links").first()).toBeVisible();
    // Ein Zeichen gleich danach auf der Stelle: Der Zug endete mit dem Seitenwechsel, also ist nichts blind zurückzunehmen.
    await warte(page, 400);
    const vor = await stand(page);
    await tippe(page, "x");
    await nachDemNaechstenBild(page);
    expect(await text(page)).not.toContain("Zurückgenommen");
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    await expect(stelle(dx, "Seite: links").first()).toBeVisible();
  });

  test("CR-R4-02: Getippter Wortlaut, den im Zug ein Schnellwert ersetzt hat, kommt bei der Rücknahme nicht zurück und wird genannt", async ({ page }) => {
    await vorlage(page, "osg", "OSG-Distorsion");
    const an = abschnitt(page, "anamnese");
    await stelle(an, /^Allergien: /).first().click();
    await page.keyboard.type("Penicillin");
    await page.keyboard.press("Escape");
    await expect(stelle(an, /^Allergien: Penicillin/)).toBeVisible();
    // Später: Fenster wieder auf, „keine bekannt“ markiert, Enter, und gleich danach ein Vertipper.
    await warte(page, 1600);
    await stelle(an, /^Allergien: Penicillin/).click();
    await feldfenster(page).getByRole("button", { name: "keine bekannt" }).focus();
    await bereit(page);
    await tippe(page, ["⏎", "x"], 150);
    await nachDemNaechstenBild(page);
    const t = await text(page);
    expect(t).toContain("Zurückgenommen, weil gleich weitergetippt");
    expect(t).toContain("Nicht wiederhergestellt: „Allergien“ war „Penicillin“.");
    // Sichere Richtung: weder „keine bekannt“ noch der alte Text stehen schwarz da; die Stelle ist offen.
    await expect(stelle(an, /^Allergien: .*fehlt noch$/)).toBeVisible();
  });

  // Seit R5-01 (Runde 6) führt „Satz entfernen“ zum nächsten Halt; damit ist der Weg aus CR-R4-02 über die Oberfläche
  // erreichbar: Das Zeichen danach nimmt den Zug zurück, der entfernte Satz kommt nicht still wieder und wird genannt.
  test("CR-R4-02, Rest: „Satz entfernen“ per Tastatur, ein Zeichen danach: Der Satz kommt nicht still wieder und wird genannt", async ({ page }) => {
    await vorlage(page, "osg", "OSG-Distorsion");
    await page.getByRole("button", { name: "+ Tetanusschutz" }).click();
    await taste(page, "ArrowDown");
    await taste(page, "2");
    await page.keyboard.press("Escape");
    await warte(page, 1600);
    await stelle(page, /^Tetanusschutz: /).first().click();
    await feldfenster(page).getByRole("button", { name: "Satz entfernen" }).focus();
    await bereit(page);
    await tippe(page, ["⏎", "x"], 400);
    await nachDemNaechstenBild(page);
    await expect(stelle(page, /^Tetanusschutz: /)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Tetanusschutz" })).toBeVisible();
    expect(await text(page)).toContain("Nicht wieder eingefügt: „Tetanusschutz“ (im Zug entfernt; bei Bedarf über „+ …“ wieder anfügen).");
  });

  test("PS-R4-2: Auf dem „i“ getippte Zeichen setzen nichts und stehen in der Meldung", async ({ page }) => {
    await vorlage(page, "kniedistorsion", "Kniedistorsion");
    const zeile = await listeMit(page, "knie-untersuchung/knie_extflex");
    await zeile.focus();
    // Tab vom Zeiger der Zeile: zuerst das „i“, dann das Feld.
    await page.keyboard.press("Tab");
    await expect(zeile.getByRole("button", { name: "Normalwerte zu Extension/Flexion" })).toBeFocused();
    const vor = await stand(page);
    await tippe(page, "0/0/1");
    await nachDemNaechstenBild(page);
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    expect(await text(page)).toContain("„0/0/1“ nicht eingetragen: Der Fokus liegt auf dem „i“ (Normalwerte zu Extension/Flexion). Zum Eintragen Tab ins Feld.");
    await page.keyboard.press("Tab");
    await expect(zeile.locator("input")).toBeFocused();
  });

  test("H-R4-1: Rückgängig in der Meldung zur Seite des Briefs meldet die Rücknahme und lässt den Fokus an der Seitenwahl", async ({ page }) => {
    await vorlage(page, "osg", "OSG-Distorsion");
    const seite = page.getByRole("radiogroup", { name: "Seite", exact: true });
    await seite.getByRole("radio", { name: "links" }).click();
    await seite.getByRole("radio", { name: "auf „links“ ändern?" }).click();
    await expect(meldung(page)).toContainText("Seite des ganzen Briefs: links (vorher rechts)");
    await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
    await expect(seite.getByRole("radio", { name: "rechts", exact: true })).toBeChecked();
    await expect(meldung(page)).toContainText("Zurückgenommen: Seite des ganzen Briefs wieder rechts (eben links)");
    await expect.poll(() => fokusIn(page, "[data-seitenwahl]")).toBe(true);
  });

  test("H-R4-4: Ü an einer Befundgruppe nennt jeden Normalbefund in Anführungszeichen, ohne „und 1 weitere“", async ({ page }) => {
    await vorlage(page, "lumbago", "Lumbago");
    await page.locator('[data-block="ws-rueckenschmerzen-untersuchung"] [data-pruefen]').first().click();
    await expect(page.locator(".befundliste")).toBeVisible();
    await page.locator('.befundliste [data-gruppe="Neurologie"].bz-vorschlag').first().focus();
    await taste(page, "ü");
    await expect(meldung(page)).toContainText("Übernommen:");
    const t = await text(page);
    const n = Number(/(\d+) Normalbefunde/.exec(t)?.[1]);
    expect(n, t).toBeGreaterThan(3);
    expect(t).not.toContain("weitere");
    const klammer = /\((.*)\)/.exec(t)?.[1] ?? "";
    expect(klammer.match(/„[^“]+“/g), t).toHaveLength(n);
  });
});

test.describe("Runde 5, Handbearbeitung und Abgleich (Abnahmetest Station)", () => {
  test("M-18: „Von Hand bearbeiten“ vor dem Klären; Vorschläge und Lücken stehen als ‹…› da und sperren das Kopieren, bis sie weg sind", async ({ page }) => {
    await vorlage(page, "osg", "OSG-Distorsion");
    const bf = abschnitt(page, "befund");
    await expect(bf.getByRole("button", { name: /klären$/ })).toBeVisible();
    await bf.getByRole("button", { name: "Weitere Aktionen für Befund" }).click();
    const knopf = page.getByRole("menu").getByRole("button", { name: "Von Hand bearbeiten" });
    await expect(knopf).toBeEnabled();
    await knopf.click();
    const feld = bf.getByRole("textbox", { name: "Befund von Hand bearbeiten" });
    const wert = await feld.inputValue();
    expect(wert).toContain("‹Vorschlag: ");
    await expect(bf.locator(".handtext-luecken")).toContainText("in ‹…›: ausfüllen, übernehmen (Klammern löschen) oder streichen");
    await expect(bf.getByRole("button", { name: /offen · klären$/ })).toBeVisible();
    // Ohne Klammern ist der Text fertig und lässt sich kopieren.
    await feld.fill(wert.replace(/‹Vorschlag: ([^›]*)›/g, "$1").replace(/‹[^›]*›/g, ""));
    await expect(bf.locator(".handtext-luecken")).toHaveCount(0);
    await expect(bf.getByRole("button", { name: "Kopieren", exact: true })).toBeVisible();
    // Andere Seite im freien Text: Warnung mit deutschem Schlusszeichen (MT-R6-20).
    await feld.fill(`${await feld.inputValue()} Schwellung links.`);
    await expect(bf.getByRole("alert").filter({ hasText: "Im frei geschriebenen Text" })).toContainText("Im frei geschriebenen Text steht „links“, die Seite des Falls ist rechts. Bitte prüfen.");
  });

  test("M-27: Abgleich-Hinweis an beiden Abschnitten; der schon kopierte Abschnitt ist danach nicht mehr grün „kopiert“", async ({ page }) => {
    await vorlage(page, "skaphoid", "Skaphoidfraktur konservativ");
    const dx = abschnitt(page, "diagnose");
    const dg = abschnitt(page, "diagnostik");
    await stelle(dx, /^Diagnose: /).first().click();
    await feldfenster(page).getByRole("option", { name: "1 Skaphoidfraktur", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(dx.getByRole("button", { name: "Kopieren", exact: true })).toBeVisible();
    await dx.getByRole("button", { name: "Kopieren", exact: true }).click();
    await expect(dx.getByRole("button", { name: /^✓ kopiert/ })).toBeVisible();
    await expect(dx.locator("[data-abgleich]")).toHaveCount(0);
    // Die Diagnostik sagt jetzt „kein Frakturnachweis“: Hinweis an beiden Abschnitten, jeweils mit dem anderen.
    await stelle(dg, /^Röntgenbefund: /).first().click();
    await feldfenster(page).getByRole("option", { name: /^\d kein Frakturnachweis\.$/ }).click();
    await page.keyboard.press("Escape");
    await expect(dx.locator("[data-abgleich]")).toContainText("Bitte abgleichen mit „Diagnostik“. Die Diagnose nennt eine Fraktur, die Diagnostik keinen Frakturnachweis.");
    await expect(dg.locator("[data-abgleich]")).toContainText("Bitte abgleichen mit „Diagnose“.");
    await expect(dx.getByRole("button", { name: /^✓ kopiert/ })).toHaveCount(0);
    await expect(dx.getByRole("button", { name: /^kopiert .* · Hinweis prüfen$/ })).toBeVisible();
    await expect(dx).not.toHaveClass(/\bkopiert\b/);
  });
});
