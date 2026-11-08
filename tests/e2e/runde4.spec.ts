// Tastatur Runde 4 (E-48): Rücknahme nur in die sichere Richtung (CR-TS13, PS-N13), Befehlstaste ohne Bedeutung
// (CR-TS15), Wechsel der Person (QA-34), Fallwechsel (CR-TS17), Strg+Z (H-R3b-1), Namen in Anführungszeichen (CR-TS20),
// Einheit nicht doppelt (H-R3-1). Jeder Test vergleicht den Brief vor und nach den Tasten.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { abschnitt, aenderungen, bereit, feldfenster, meldung, nachDemNaechstenBild, oeffneApp, stand, stelle, tippe, tippzug, warte } from "./hilfen.ts";
import { taste, vorlageMitKopf } from "./durchlauf.ts";

async function vorlage(page: Page, suche: string, titel: string) {
  await oeffneApp(page);
  await vorlageMitKopf(page, suche, titel);
}

async function liste(page: Page) {
  await abschnitt(page, "befund").locator("[data-pruefen]").first().click();
  await expect(page.locator(".befundliste")).toBeVisible();
}

const zeileMit = (page: Page, text: string) => page.locator(".befundliste [data-zeile]").filter({ hasText: text }).first();

/** Exakter Text der Meldung; `toContainText` zöge Leerraum zusammen. */
const text = async (page: Page) => (await meldung(page).textContent()) ?? "";

test.describe("Runde 4, Tastatur (E-48)", () => {
  test("CR-TS13: Eine Aussage, die der Arzt eben bewusst geändert hat, kommt bei der Rücknahme nicht schwarz zurück, die Stelle wird offen", async ({ page }) => {
    await vorlage(page, "osg", "OSG-Distorsion");
    await liste(page);
    const z = zeileMit(page, "DS Außenknöchel");
    await z.getByRole("radio", { name: "unauffällig", exact: true }).click();
    await warte(page, 1600);
    await z.focus();
    await bereit(page);
    const vor = await stand(page);
    // Bewusst „nicht untersucht“, dann 0,7 s später ein Vertipper an der nächsten Zeile.
    await tippe(page, ["n", "j"], 700);
    await nachDemNaechstenBild(page);
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert, geaendert.join("\n")).toHaveLength(1);
    expect(geaendert[0]).toMatch(/: z-ok \|.*→ z-offen \|/);
    expect(await text(page)).toContain("Zurückgenommen, weil gleich weitergetippt: „DS Außenknöchel“ (jetzt: wieder offen).");
    expect(await tippzug(page)).toBe("gesperrt");
  });

  test("CR-TS15: Monarthritis „14⏎“: Die „4“ bedeutet im Fenster nichts und nimmt die „1“ zurück", async ({ page }) => {
    await vorlage(page, "monarthritis", "Akute Monarthritis");
    await stelle(abschnitt(page, "diagnostik"), /^Kreatinin: /).first().click();
    const vor = await stand(page);
    await tippe(page, "0,9 mg/dl⏎");
    await warte(page, 500);
    if ((await tippzug(page)) === "wartet") await bereit(page);
    await expect(feldfenster(page)).toHaveAttribute("aria-label", /^Punktion/);
    await tippe(page, ["1", "4", "⏎"], 400);
    await nachDemNaechstenBild(page);
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert, `${await text(page)}\n${geaendert.join("\n")}`).toHaveLength(1);
    expect(geaendert[0]).toContain("Kreatinin 0,9 mg/dl.");
    const t = await text(page);
    expect(t).toContain("Zurückgenommen, weil gleich weitergetippt:");
    expect(t).toContain("Verworfen: „4");
    expect(await tippzug(page)).toBe("gesperrt");
  });

  test("QA-34: Ein Wechsel der Person meldet sich wie ein Wechsel der Seite; ein „x“ gleich danach ist verworfen und nennt ihn", async ({ page }) => {
    await vorlage(page, "osg", "OSG-Distorsion");
    const person = page.getByRole("radiogroup", { name: "Patient oder Patientin" });
    await person.getByRole("radio", { name: "Patient", exact: true }).click();
    await bereit(page);
    await taste(page, "2");
    await expect(person.getByRole("radio", { name: "Patientin", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(meldung(page)).toContainText("Person: Patientin (vorher Patient)");
    await tippe(page, "x");
    await nachDemNaechstenBild(page);
    await expect(person.getByRole("radio", { name: "Patientin", exact: true })).toHaveAttribute("aria-checked", "true");
    const t = await text(page);
    expect(t).toContain("Verworfen: „x“");
    expect(t).toContain("Eben gesetzt: Person „Patientin“");
    expect(t).not.toContain("Zurückgenommen");
    expect(await tippzug(page)).toBe("gesperrt");
  });

  test("CR-TS17: Sperre und Sperrmeldung enden mit dem Wechsel zu einem neuen Fall", async ({ page }) => {
    await vorlage(page, "osg", "OSG-Distorsion");
    await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
    await taste(page, "1");
    await tippe(page, "x");
    await nachDemNaechstenBild(page);
    expect(await tippzug(page)).toBe("gesperrt");
    await expect(meldung(page)).toContainText("Kontrolle");
    await page.keyboard.press("Control+k");
    await page.keyboard.type("abszess");
    await page.keyboard.press("Enter");
    await expect(page.locator(".fall-titel, h1, [data-falltitel]").filter({ hasText: /Abszess/ }).first()).toBeVisible();
    await nachDemNaechstenBild(page);
    expect(await tippzug(page)).not.toBe("gesperrt");
    await expect(meldung(page).filter({ hasText: "Kontrolle" })).toHaveCount(0);
  });

  test("H-R3b-1: Strg+Z nennt jede Stelle, ohne „und 1 weitere“", async ({ page }) => {
    await vorlage(page, "osg", "OSG-Distorsion");
    await liste(page);
    const n = await page.locator(".befundliste [data-zeile]").count();
    await page.locator(".befundliste [data-zeile]").nth(n - 1).focus();
    await taste(page, "ü");
    await expect(meldung(page)).toContainText("Übernommen:");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+z");
    await expect(meldung(page)).toContainText("Zurückgenommen: „");
    const t = await text(page);
    expect(t).not.toContain("weitere");
    expect(t).toMatch(/„[^“]+“, „[^“]+“ und „[^“]+“ \(jetzt: wieder Vorschlag\)/);
  });

  test("H-R3-1: Schnittwunde „3 cm“ ergibt „Wunde von 3 cm Länge.“, nicht „3 cm cm“", async ({ page }) => {
    await vorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
    await liste(page);
    await zeileMit(page, "Wundlänge").locator("input").click();
    await tippe(page, "3 cm⏎");
    await nachDemNaechstenBild(page);
    const brief = (await abschnitt(page, "befund").textContent()) ?? "";
    expect(brief).toContain("Wunde von 3 cm Länge.");
    expect(brief).not.toContain("cm cm");
  });
});

test.describe("Runde 4, Vorlagensuche über beide Bereiche (Teil C)", () => {
  const suche = (page: Page) => page.getByRole("combobox", { name: "Diagnose oder Kürzel" });
  const einsatzort = (page: Page, name: "Notaufnahme" | "Station") => page.getByRole("radiogroup", { name: "Einsatzort" }).getByRole("radio", { name, exact: true });

  test("„Coxarthrose“ in der Notaufnahme zeigt die Hüft-TEP unter „Auf Station:“; Enter öffnet den Fall auf Station", async ({ page }) => {
    await oeffneApp(page);
    await expect(einsatzort(page, "Notaufnahme")).toHaveAttribute("aria-checked", "true");
    await suche(page).fill("Coxarthrose");
    const gruppe = page.getByRole("listbox").getByRole("group", { name: "Auf Station:" });
    await expect(gruppe).toBeVisible();
    await expect(gruppe.getByRole("option").first()).toContainText("Koxarthrose, Hüft-Totalendoprothese");
    await expect(gruppe.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    await suche(page).press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Koxarthrose");
    await page.keyboard.press("Control+k");
    await expect(einsatzort(page, "Station")).toHaveAttribute("aria-checked", "true");
  });

  test("„Schnittwunde“ auf Station zeigt die Vorlagen der Notaufnahme unter „In der Notaufnahme:“; ein Klick öffnet den Fall dort; eigene Treffer stehen darüber", async ({ page }) => {
    await oeffneApp(page);
    await einsatzort(page, "Station").click();
    await suche(page).fill("Schnittwunde");
    const gruppe = page.getByRole("listbox").getByRole("group", { name: "In der Notaufnahme:" });
    await expect(gruppe.getByRole("option", { name: /^Schnittwunde, Riss-Quetschwunde/ })).toBeVisible();
    // Mit eigenem Treffer: Er steht oben, außerhalb der Gruppe.
    await suche(page).fill("osg");
    await expect(page.getByRole("listbox").getByRole("option").first()).toContainText("OSG");
    await expect(page.getByRole("listbox").getByRole("group", { name: "In der Notaufnahme:" }).getByRole("option").first()).toContainText("OSG-Distorsion");
    await expect(page.getByRole("listbox").locator(":scope > [role=option]")).toHaveCount(1);
    await suche(page).fill("Schnittwunde");
    await gruppe.getByRole("option", { name: /^Schnittwunde, Riss-Quetschwunde/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Schnittwunde");
    await page.keyboard.press("Control+k");
    await expect(einsatzort(page, "Notaufnahme")).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("Runde 4, Normalwerte am Messfeld (Teil D)", () => {
  const box = (page: Page) => page.getByRole("tooltip");

  test("Befundliste: „i“ zeigt bei Zeigen, Klick und Enter die Normalwerte; Fokus, Brief und Tippen bleiben unberührt; Esc schließt nur die Box", async ({ page }) => {
    await vorlage(page, "kniedistorsion", "Kniedistorsion");
    await liste(page);
    const zeile = page.locator('.befundliste [data-zeile="knie-untersuchung/knie_extflex"]');
    const eingabe = zeile.locator("input");
    const i = zeile.getByRole("button", { name: "Normalwerte zu Extension/Flexion" });
    await eingabe.click();
    const vor = await stand(page);
    // Zeigen mit der Maus
    await i.hover();
    await expect(box(page)).toContainText("Normalwerte (Neutral-Null): Extension/Flexion 0–10/0/120–150°");
    await expect(box(page)).toContainText("Richtwerte");
    await page.getByRole("heading", { level: 1 }).hover();
    await expect(box(page)).toHaveCount(0);
    // Klick: Box auf, der Fokus bleibt in der Eingabe; die Box verdeckt die Eingabe nicht.
    await i.click();
    await expect(box(page)).toBeVisible();
    await expect(eingabe).toBeFocused();
    const b1 = (await box(page).boundingBox())!;
    const b2 = (await eingabe.boundingBox())!;
    const ueberlappt = b1.x < b2.x + b2.width && b2.x < b1.x + b1.width && b1.y < b2.y + b2.height && b2.y < b1.y + b1.height;
    expect(ueberlappt, JSON.stringify({ b1, b2 })).toBe(false);
    await page.mouse.move(0, 0);
    await page.keyboard.press("Escape");
    await expect(box(page)).toHaveCount(0);
    await expect(page.locator(".befundliste")).toBeVisible();
    await expect(eingabe).toBeFocused();
    // Tastatur: Enter und Leertaste schalten; Zeichen auf dem „i“ setzen nichts und sperren nichts.
    await i.focus();
    await page.keyboard.press("Enter");
    await expect(box(page)).toBeVisible();
    await page.keyboard.press(" ");
    await expect(box(page)).toHaveCount(0);
    await page.keyboard.press("Enter");
    await tippe(page, ["1", "u", "n"]);
    await nachDemNaechstenBild(page);
    expect(await tippzug(page)).not.toBe("gesperrt");
    await page.keyboard.press("Escape");
    await expect(box(page)).toHaveCount(0);
    await expect(page.locator(".befundliste")).toBeVisible();
    // Nichts davon steht im Brief.
    expect(aenderungen(vor, await stand(page))).toEqual([]);
  });

  test("Monarthritis: „Beweglichkeit nach Neutral-Null-Methode“ zeigt die ganze Tabelle nach Gelenk, Rotation der Hüfte je Ausgangsstellung", async ({ page }) => {
    await vorlage(page, "monarthritis", "Akute Monarthritis");
    await liste(page);
    await page.getByRole("button", { name: "Normalwerte zu Beweglichkeit nach Neutral-Null-Methode" }).hover();
    for (const gelenk of ["Schultergelenk", "Ellenbogengelenk", "Handgelenk", "Hüftgelenk", "Kniegelenk", "Oberes Sprunggelenk", "Halswirbelsäule"]) {
      await expect(box(page).locator(".nw-gelenk", { hasText: gelenk }).first()).toBeVisible();
    }
    await expect(box(page)).toContainText("Außenrotation/Innenrotation: in 90° Hüftbeugung 40–50/0/30–45°; in Streckung 30–40/0/30–40°");
    await expect(box(page)).toContainText("Extension/Flexion 35–60/0/50–60°");
    // Ohne jeden Beleg und deshalb nicht in der Tabelle: Rückneigen beim Kinn-Jugulum-Abstand, Drehung von BWS und LWS.
    await expect(box(page)).toContainText("Kinn-Jugulum-Abstand Vorneigen 0 cm (Kinn erreicht das Brustbein)");
    await expect(box(page)).not.toContainText("Rückneigen etwa");
    await expect(box(page)).not.toContainText("im Sitzen");
  });

  test("Fenster: Das „i“ steht neben dem Titel, die Box im Fluss darunter; Esc schließt erst die Box, dann das Fenster", async ({ page }) => {
    await vorlage(page, "drf", "Distale Radiusfraktur konservativ");
    await page.getByRole("button", { name: /Radial-\/Ulnarabduktion/ }).first().click();
    const fenster = feldfenster(page);
    await expect(fenster).toBeVisible();
    const i = fenster.getByRole("button", { name: /^Normalwerte zu / });
    await i.click();
    await expect(fenster.getByRole("tooltip")).toContainText("Radial-/Ulnarabduktion 25–30/0/30–40°");
    await page.mouse.move(0, 0);
    await page.keyboard.press("Escape");
    await expect(box(page)).toHaveCount(0);
    await expect(fenster).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(fenster).toHaveCount(0);
  });
});
