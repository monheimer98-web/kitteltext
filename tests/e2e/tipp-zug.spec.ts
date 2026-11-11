// Tastatursicherheit Runde 2 nach E-44 (Nachprüfungen vom 08.11.2026: Code-Review CR-TS01, Patientensicherheit PS-N01
// bis PS-N04, Browserprüfung QA-18 bis QA-24, Technik TS-01). Jeder Test vergleicht den ganzen Brief vor und nach den
// Tasten. „Ohne Pause“ heißt: echte Tastenereignisse direkt hintereinander (`tippe`), wie beim flüssigen Weiterschreiben;
// sonst wartet der Test, bis der Halt Befehle annimmt (`taste`, `bereit`), wie ein Arzt, der hinsieht.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  abschnitt,
  aenderungen,
  bereit,
  drueckeTasteRechtsNebenP,
  feldfenster,
  meldung,
  nachDemNaechstenBild,
  oeffneApp,
  oeffneVorlage,
  setzeZwischenablage,
  stand,
  stelle,
  tippe,
  tippzug,
  warte,
  zwischenablage,
} from "./hilfen.ts";
import { hauptweg, lage, taste, vorlageMitKopf } from "./durchlauf.ts";

/** Vorlage öffnen, Seite und Person mit der Maus, soweit die Vorlage sie fragt. */
async function vorlage(page: Page, suche: string, titel: string, station = false) {
  await oeffneApp(page);
  if (station) await page.getByRole("radio", { name: "Station" }).click();
  await vorlageMitKopf(page, suche, titel);
}

const osg = (page: Page) => vorlage(page, "osg", "OSG-Distorsion");

/** Befundliste des ersten Befundblocks öffnen. */
async function liste(page: Page) {
  await abschnitt(page, "befund").locator("[data-pruefen]").first().click();
  await expect(page.locator(".befundliste")).toBeVisible();
}

const zeile = (page: Page, n: number) => page.locator(".befundliste [data-zeile]").nth(n);

/** Klassen der Zeilen der Befundliste: Stand je Zeile (bz-ok, bz-offen, bz-vorschlag, bz-weg …). */
async function zeilenStand(page: Page): Promise<string[]> {
  return page.locator(".befundliste [data-zeile]").evaluateAll((z) => z.map((e) => e.className));
}

/** Gruppen im Fenster, die gerade Nummern zeigen (Tastenkappen sichtbar), mit ihrer Beschriftung. */
async function gruppenMitNummern(bereich: Locator): Promise<string[]> {
  return bereich.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>(".pillen, .ff-liste")]
      .filter((g) => [...g.querySelectorAll(".pille-ziffer, .ff-ziffer")].some((z) => getComputedStyle(z).visibility === "visible"))
      .map((g) => g.getAttribute("aria-label") ?? ""),
  );
}

/** Wartet nach dem Seitenuhr, bis die Schreckzeit sicher vorbei ist: Die Sperre soll auch danach noch gelten. */
async function schreckzeitVorbei(page: Page) {
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForFunction((t) => performance.now() > t + 2 * 300, t0);
}

test.describe("CR-TS01: Weitergetipptes nach Enter setzt an keinem Halt etwas", () => {
  test("Befundliste, Schnittwunde: Wundlänge „3 cm“, Enter, „unauffällig“ ohne Pause", async ({ page }) => {
    await vorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
    await liste(page);
    await page.locator(".befundliste [data-zeile]").filter({ hasText: "Wundlänge" }).locator("input").click();
    const vor = await stand(page);
    await tippe(page, "3 cm⏎unauffällig");
    await nachDemNaechstenBild(page);
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert).toHaveLength(1);
    expect(geaendert[0]).toContain("Wundlänge: 3");
    await expect(meldung(page)).toContainText("Verworfen: „unauffällig“");
    expect(await tippzug(page)).toBe("gesperrt");
  });

  test("Befundliste, SHT: Glasgow Coma Scale „15“, Enter, „unauffällig“ ohne Pause", async ({ page }) => {
    await vorlage(page, "sht", "Schädel-Hirn-Trauma");
    await liste(page);
    await page.locator(".befundliste [data-zeile]").filter({ hasText: "Glasgow" }).locator("input").click();
    const vor = await stand(page);
    await tippe(page, "15⏎unauffällig");
    await nachDemNaechstenBild(page);
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert).toHaveLength(1);
    expect(geaendert[0]).toContain("Glasgow Coma Scale: 15");
    await expect(meldung(page)).toContainText("Verworfen: „unauffällig“");
  });

  test("Fenster, Monarthritis: Kreatinin „0,9 mg/dl“, Enter, „12 Uhr“ ohne Pause; die Sperre gilt auch nach der Schreckzeit", async ({ page }) => {
    await vorlage(page, "monarthritis", "Akute Monarthritis");
    await stelle(abschnitt(page, "diagnostik"), /^Kreatinin: /).first().click();
    const vor = await stand(page);
    await tippe(page, "0,9 mg/dl⏎12 Uhr");
    await nachDemNaechstenBild(page);
    let geaendert = aenderungen(vor, await stand(page));
    expect(geaendert).toHaveLength(1);
    expect(geaendert[0]).toContain("Kreatinin 0,9 mg/dl.");
    await expect(feldfenster(page)).toHaveAttribute("aria-label", /^Punktion/);
    await expect(meldung(page)).toContainText("Verworfen: „12 Uhr“");
    // Die Sperre gilt für den ganzen Tipp-Zug, nicht nur für die Schreckzeit (E-44 Satz 1).
    await schreckzeitVorbei(page);
    await page.keyboard.press("1");
    await nachDemNaechstenBild(page);
    expect(aenderungen(vor, await stand(page))).toEqual(geaendert);
    // Erst nach einer Pfeiltaste wählt die Ziffer wieder.
    await taste(page, "ArrowDown");
    await taste(page, "1");
    geaendert = aenderungen(vor, await stand(page));
    expect(geaendert.length).toBeGreaterThan(1);
  });

  test("Schreckzeit: ein „u“ ein Bild nach dem Sprung wirkt nicht, auch ohne Text davor (Schnittwunde, Wundlänge)", async ({ page }) => {
    await vorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
    await liste(page);
    await page.locator(".befundliste [data-zeile]").filter({ hasText: "Wundlänge" }).locator("input").click();
    const vor = await stand(page);
    await tippe(page, "3 cm⏎");
    // Die nächste Zeile ist gezeichnet, aber noch keine 0,3 Sekunden zu sehen.
    await nachDemNaechstenBild(page);
    expect(await tippzug(page)).toBe("wartet");
    await tippe(page, "u");
    await nachDemNaechstenBild(page);
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert).toHaveLength(1);
    expect(geaendert[0]).toContain("Wundlänge: 3");
    await expect(meldung(page)).toContainText("Verworfen: „u“ (zu früh nach dem Weiterspringen)");
  });

  test("Die Sperre gilt auch für Enter auf „Weiter“: „x“ auf der letzten Zeile der Befundliste, Enter, Enter; die Liste bleibt, die Ziffer wirkt auch nach der Schreckzeit nicht", async ({ page }) => {
    await osg(page);
    await liste(page);
    const n = await page.locator(".befundliste [data-zeile]").count();
    for (let i = 0; i < n; i++) await page.keyboard.press("ArrowDown");
    await expect(zeile(page, n - 1)).toBeFocused();
    const vor = await stand(page);
    // „x“ sperrt; Enter auf der Zeile führt zu „Weiter“; Enter dort ist ein Knopfdruck und bei Sperre verworfen (PS-N06).
    await tippe(page, ["x", "⏎", "⏎"]);
    await nachDemNaechstenBild(page);
    await expect(page.locator(".befundliste")).toBeVisible();
    await expect(feldfenster(page)).toHaveCount(0);
    await expect(meldung(page)).toContainText("Verworfen: „x↵“");
    await schreckzeitVorbei(page);
    expect(await tippzug(page)).toBe("gesperrt");
    await tippe(page, "1");
    await nachDemNaechstenBild(page);
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    // Auf „Weiter“ sagt eine Ziffer, wo der Zeiger steht (PS-N03); die Sperre bleibt.
    await expect(meldung(page)).toContainText("Ende der Liste: Enter auf „Weiter“");
    expect(await tippzug(page)).toBe("gesperrt");
    await taste(page, "ArrowDown");
    expect(await tippzug(page)).not.toBe("gesperrt");
  });

  test("Fallkopf: Enter auf „Nächste Stelle“ und „1“ ohne Pause setzen keine Seite; F2 und „1“ ohne Pause keine Person", async ({ page }) => {
    await oeffneApp(page);
    await oeffneVorlage(page, "osg", "OSG-Distorsion");
    await expect(page.getByRole("button", { name: /^Nächste Stelle/ })).toBeFocused();
    const vor = await stand(page);
    await tippe(page, ["⏎", "1"]);
    await nachDemNaechstenBild(page);
    expect((await lage(page)).art).toBe("seite");
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("OSG-Distorsion");
    await expect(meldung(page)).toContainText("Verworfen: „1“ (zu früh nach dem Weiterspringen)");
    // Seite mit der Maus (löst die Sperre); dann F2 auf den Halt Person und „1“ im selben Zug.
    await page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: "rechts", exact: true }).click();
    const person = page.getByRole("radiogroup", { name: "Patient oder Patientin" });
    await tippe(page, ["F2", "1"]);
    await nachDemNaechstenBild(page);
    await expect(person).toBeFocused();
    await expect(person.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(meldung(page)).toContainText("Verworfen: „1“ (zu früh nach dem Weiterspringen)");
  });

  test("Block, OSG: „1“, „2“ in „Kontrolle“, dann ohne Pause „für zu Hause“: Der Block übernimmt nichts, und die Kontrolle geht zurück", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
    const vor = await stand(page);
    await taste(page, "1");
    await bereit(page);
    await tippe(page, "2für zu Hause");
    await nachDemNaechstenBild(page);
    // Die „2“ wirkt (nach der Schreckzeit) und schließt das Fenster; das „f“ am Block verrät, dass ohne Blick
    // weitergetippt wurde: „1“ und „2“ gehen zusammen zurück (E-45 Satz 2), das „ü“ in „für“ übernimmt nichts.
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    // Beide Angaben heißen „Kontrolle“: einmal genannt (QA-31).
    await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt: „Kontrolle“ (jetzt: wieder offen). Verworfen: „für zu Hause“");
  });

  test("Ende: Leertaste direkt nach dem Sprung auf „… kopieren“ kopiert nicht; nach der Schreckzeit kopiert Enter", async ({ page }) => {
    await oeffneApp(page);
    await vorlageMitKopf(page, "osg", "OSG-Distorsion");
    await taste(page, "F2");
    expect((await hauptweg(page)).ende).toBe(true);
    await setzeZwischenablage(page, "LEER");
    // F2 springt noch einmal auf „… kopieren“; die Leertasten kommen im selben Zug ohne Pause.
    await tippe(page, ["F2", " ", " "]);
    await nachDemNaechstenBild(page);
    expect(await zwischenablage(page)).toBe("LEER");
    await expect(meldung(page)).toContainText("Leertaste verworfen, nichts kopiert.");
    // Mit einem Blick und nach dem Lösen kopiert Enter wie gewohnt. Das erste Tab nach einer Sperre löst nur und lässt
    // den Fokus auf dem Knopf (PS-N06).
    await page.keyboard.press("Tab");
    await expect(page.locator("[data-naechste-kopie]")).toBeFocused();
    await bereit(page);
    await page.keyboard.press("Enter");
    await expect(meldung(page)).toContainText("kopiert");
    expect(await zwischenablage(page)).not.toBe("LEER");
  });

  test("Ende: Wird der Knopf zu „Fall schließen“, schließt ein Enter direkt danach den Fall nicht; mit einem Blick schon, mit Rückgängig (R2-05)", async ({ page }) => {
    await oeffneApp(page);
    await vorlageMitKopf(page, "osg", "OSG-Distorsion");
    await taste(page, "F2");
    expect((await hauptweg(page)).ende).toBe(true);
    await bereit(page);
    await page.keyboard.press("Control+Shift+Enter");
    // Derselbe Knopf behält den Fokus und heißt jetzt „Alles kopiert · Fall schließen“.
    await page.waitForFunction(() => /Alles kopiert/.test(document.activeElement?.textContent ?? ""));
    expect(await tippzug(page)).toBe("wartet");
    await tippe(page, "⏎");
    await nachDemNaechstenBild(page);
    const schliessen = page.getByRole("button", { name: "Alles kopiert · Fall schließen" });
    await expect(schliessen).toBeFocused();
    await expect(meldung(page)).toContainText("Ganzer Brief kopiert");
    await expect(meldung(page)).toContainText("Enter verworfen, Fall bleibt offen.");
    // Das Kopieren beendet den Zug: Die Meldung bietet nichts zum Zurücknehmen an, was schon im KIS stehen kann.
    await expect(meldung(page)).not.toContainText("Eben gesetzt");
    await page.keyboard.press("Tab");
    await expect(schliessen).toBeFocused();
    await bereit(page);
    await page.keyboard.press("Enter");
    await expect(meldung(page)).toContainText("Fall 1 geschlossen");
    await expect(schliessen).toHaveCount(0);
    // Rückgängig in der Meldung stellt den Fall wieder her (CR-TS11).
    await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("OSG-Distorsion");
    await expect(schliessen).toBeVisible();
  });
});

test.describe("PS-N01: Die Ziffernreihe folgt der Lesereihenfolge", () => {
  for (const [suche, titel, vorbelegt] of [
    ["sht", "Schädel-Hirn-Trauma", true],
    ["osg", "OSG-Distorsion", false],
  ] as const) {
    test(`„Kontrolle“ (${titel}, „wo“ ${vorbelegt ? "vorbelegt" : "offen"}): „1“, „2“ setzt wann und wo`, async ({ page }) => {
      await vorlage(page, suche, titel);
      await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
      const fenster = feldfenster(page);
      const wann = await fenster.getByRole("radiogroup", { name: "wann" }).getByRole("radio").nth(0).textContent();
      const wo = await fenster.getByRole("radiogroup", { name: "wo" }).getByRole("radio").nth(1).textContent();
      const vor = await stand(page);
      await taste(page, "1");
      // Nach der ersten Ziffer trägt nur „wo“ Nummern, auch wenn „wo“ vorbelegt ist.
      expect(await gruppenMitNummern(fenster)).toEqual(["wo"]);
      await taste(page, "2");
      const geaendert = aenderungen(vor, await stand(page));
      expect(geaendert).toHaveLength(1);
      expect(geaendert[0]).toContain(`z-gesetzt | Kontrolle:`);
      expect(geaendert[0]).toContain(wann!.replace(/^\d/, "").trim());
      expect(geaendert[0]).toContain(wo!.replace(/^\d/, "").trim());
    });
  }

  test("Kopfplatzwunde „Entfernung des Nahtmaterials“: „1“, „1“, „2“ geht Reihe für Reihe", async ({ page }) => {
    await vorlage(page, "kopfplatzwunde", "Kopfplatzwunde");
    await stelle(abschnitt(page, "procedere"), /^Entfernung des Nahtmaterials: /).first().click();
    const fenster = feldfenster(page);
    const reihen = fenster.getByRole("radiogroup");
    const n = await reihen.count();
    expect(n).toBeGreaterThanOrEqual(2);
    const erwartet: string[] = [];
    const folge = n >= 3 ? ["1", "1", "2"] : ["1", "2"];
    for (let i = 0; i < folge.length; i++) erwartet.push((await reihen.nth(i).getByRole("radio").nth(Number(folge[i]) - 1).textContent())!.replace(/^\d/, "").trim());
    const vor = await stand(page);
    for (const z of folge) await taste(page, z);
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert).toHaveLength(1);
    for (const e of erwartet) if (e !== "ohne Angabe") expect(geaendert[0]).toContain(e);
  });
});

test.describe("PS-N02: Ü an Block und Befundgruppe mit Meldung; zu frühes Ü wirkt nicht", () => {
  test("OSG „Kontrolle“ „1“, dann „2“ und Ü ohne Pause: Das Ü übernimmt den Block nicht; die Kontrolle geht von selbst zurück", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
    const vor = await stand(page);
    await taste(page, "1");
    await tippe(page, "2ü");
    await nachDemNaechstenBild(page);
    // Die „2“ kam vor dem Bild der nächsten Reihe (E-45 Satz 1) und verrät den blinden Zug: auch die „1“ zurück, ohne
    // dass der Arzt „Rückgängig“ suchen muss (früher R2-03: Hinweis mit Rückgängig).
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt: „Kontrolle“ (jetzt: wieder offen). Verworfen: „2ü“");
    await expect(meldung(page).getByRole("button", { name: "Rückgängig" })).toHaveCount(0);
  });

  test("Ü am Block im Menschentempo: Meldung nennt die Sätze, Rückgängig nimmt genau sie zurück", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
    await taste(page, "1");
    await taste(page, "2");
    expect((await lage(page)).art).toBe("block");
    const vor = await stand(page);
    await taste(page, "ü");
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert.length).toBeGreaterThan(1);
    await expect(meldung(page)).toContainText(`Übernommen: ${geaendert.length} Sätze in „`);
    await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
    await nachDemNaechstenBild(page);
    expect(aenderungen(vor, await stand(page))).toEqual([]);
  });

  test("Ü an einer Befundgruppe: Meldung nennt die Normalbefunde, Rückgängig nimmt genau sie zurück", async ({ page }) => {
    await osg(page);
    await liste(page);
    // Der Zeiger steht auf der ersten offenen Zeile „Wunde/Haut“ (grau, Gruppe Inspektion).
    const vor = await stand(page);
    await taste(page, "ü");
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert.length).toBeGreaterThan(0);
    await expect(meldung(page)).toContainText("Übernommen:");
    await expect(meldung(page)).toContainText("„Inspektion“");
    await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
    await nachDemNaechstenBild(page);
    expect(aenderungen(vor, await stand(page))).toEqual([]);
  });
});

test.describe("PS-N03: Der Zeiger der Befundliste rückt in sichtbarer Folge, nie nach oben", () => {
  test("OSG: sechsmal U setzt genau die ersten sechs Zeilen, auch „nicht erhoben“; ohne Normalbefund bleibt der Zeiger stehen", async ({ page }) => {
    await osg(page);
    await liste(page);
    const vorher = await zeilenStand(page);
    for (let i = 0; i < 6; i++) await taste(page, "u");
    const nach6 = await zeilenStand(page);
    for (let i = 0; i < 6; i++) expect(nach6[i], `Zeile ${i + 1}`).toContain("bz-ok");
    expect(nach6.slice(6)).toEqual(vorher.slice(6));
    // Zeile 7 (Syndesmose) hat keinen Normalbefund: U setzt nichts, der Zeiger bleibt, die Zeilen darunter bleiben.
    // Nach einer Pause; gleich nach dem sechsten U verriete die Taste ohne Bedeutung den Zug (CR-TS15, `runde4.spec.ts`).
    await warte(page, 1600);
    await taste(page, "u");
    expect((await zeilenStand(page)).slice(6)).toEqual(vorher.slice(6));
    await expect(zeile(page, 6)).toBeFocused();
    await expect(meldung(page)).toContainText("ohne Normalbefund");
  });

  test("eine Taste zu viel nach der letzten Zeile und einer Pause: Zeiger auf „Weiter“ in Sicht, keine Zeile ändert sich (900 × 800)", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await osg(page);
    await liste(page);
    const n = await page.locator(".befundliste [data-zeile]").count();
    for (let i = 0; i < n; i++) await page.keyboard.press("ArrowDown");
    await expect(zeile(page, n - 1)).toBeFocused();
    const vor = await stand(page);
    await taste(page, "u");
    // Bewusst nach einer Pause über 1,5 s; gleich danach nähme die Taste den Zug zurück (E-45, `tipp-kette.spec.ts`).
    await warte(page, 1600);
    await taste(page, "u");
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert).toHaveLength(1);
    const weiter = page.locator(".befundliste .bl-fuss .knopf");
    await expect(weiter).toBeFocused();
    await expect(weiter).toBeInViewport();
    await expect(meldung(page)).toContainText("Ende der Liste");
  });

  test("Ü an einer Gruppe: Zeiger auf die nächste offene Zeile darunter, auch in derselben Gruppe; keine offene Zeile übersprungen", async ({ page }) => {
    await osg(page);
    await liste(page);
    const vorher = await zeilenStand(page);
    // OSG: Zeile 1 „Wunde/Haut“ grau, Zeile 2 „Schwellung/Hämatom lateral“ offen, beide Gruppe Inspektion.
    expect(vorher[0]).toContain("bz-vorschlag");
    expect(vorher[1]).toContain("bz-offen");
    await taste(page, "ü");
    await expect(zeile(page, 1)).toBeFocused();
    // Weiter mit U je Zeile bis zur nächsten grauen in der Gruppe Palpation, dort Ü: Zeiger auf „DS Außenband“ darunter.
    await taste(page, "u");
    await taste(page, "u");
    await expect(zeile(page, 3)).toBeFocused();
    await taste(page, "ü");
    await expect(zeile(page, 4)).toBeFocused();
    const nachher = await zeilenStand(page);
    for (const i of [0, 1, 2, 3]) expect(nachher[i], `Zeile ${i + 1}`).toContain("bz-ok");
    expect(nachher[4], "Zeile 5").toContain("bz-offen");
  });

  test("Ü auf einer offenen Zeile: der Zeiger bleibt dort, das nächste U trifft sie und nicht die Zeile darunter (R2-02)", async ({ page }) => {
    await osg(page);
    await liste(page);
    // OSG: Zeile 3 „DS Außenknöchel“ offen (entscheiden), Zeile 4 „DS Innenknöchel“ grau, Zeile 5 „DS Außenband“ offen.
    await taste(page, "ü");
    await taste(page, "u");
    await expect(zeile(page, 2)).toBeFocused();
    const vorher = await zeilenStand(page);
    expect(vorher[2]).toContain("bz-offen");
    expect(vorher[3]).toContain("bz-vorschlag");
    expect(vorher[4]).toContain("bz-offen");
    await taste(page, "ü");
    await expect(meldung(page)).toContainText("DS Innenknöchel");
    await expect(zeile(page, 2)).toBeFocused();
    await taste(page, "u");
    const nachher = await zeilenStand(page);
    expect(nachher[2], "Zeile 3, auf der Ü und U kamen").toContain("bz-ok");
    expect(nachher[3], "Zeile 4, per Ü übernommen").toContain("bz-ok");
    expect(nachher[4], "Zeile 5 darunter").toEqual(vorher[4]);
  });
});

test("PS-N04 ohne deutsche Belegung: „[“ statt Ü setzt nichts, sperrt nichts und nennt den Grund", async ({ page }) => {
  await osg(page);
  await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
  await taste(page, "1");
  await taste(page, "2");
  expect((await lage(page)).art).toBe("block");
  await bereit(page);
  const vor = await stand(page);
  await drueckeTasteRechtsNebenP(page, "[");
  await nachDemNaechstenBild(page);
  expect(aenderungen(vor, await stand(page))).toEqual([]);
  await expect(meldung(page)).toContainText("Ü nicht erkannt");
  expect(await tippzug(page)).toBe("bereit");
  await taste(page, "ü");
  await expect(meldung(page)).toContainText("Übernommen:");
});

test("QA-18 Einstellungen: Tastaturtabelle wie die Anleitung, mit Ü und ohne das alte Enter", async ({ page }) => {
  await oeffneApp(page);
  await page.getByRole("button", { name: /Einstellungen/ }).click();
  const tabelle = page.getByRole("dialog", { name: "Einstellungen" }).locator(".es-kuerzel");
  await expect(tabelle).toContainText("übernimmt den grauen Vorschlag");
  await expect(tabelle).toContainText("Sonst setzt Enter nichts");
  await expect(tabelle).not.toContainText("Bestätigen und weiter");
  await expect(tabelle).not.toContainText("Enter in der Befundliste");
  await expect(page.getByRole("dialog", { name: "Einstellungen" })).toContainText("0,3 Sekunden");
});

// Echter Mausklick: Drücken und Loslassen an derselben Stelle, wie die Hand; der Fokus wechselt beim Drücken, und mit
// ihm wandern die Nummern in eine andere Gruppe. Geklickt wird am linken Rand eines Knopfs, der nicht der erste seiner
// Gruppe ist: Erschienen die Nummern erst beim Drücken, rückte der Knopf unter dem Zeiger weg (QA-19).
test.describe("QA-19: Ein Klick direkt nach einem Fokuswechsel trifft", () => {
  test("Fallkopf bei 900 px: „rechts“, dann linker Rand von „Patientin“", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await oeffneApp(page);
    await oeffneVorlage(page, "osg", "OSG-Distorsion");
    await page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: "rechts", exact: true }).click();
    const patientin = page.getByRole("radiogroup", { name: "Patient oder Patientin" }).getByRole("radio", { name: "Patientin", exact: true });
    const kasten = (await patientin.boundingBox())!;
    await page.mouse.click(kasten.x + 3, kasten.y + kasten.height / 2);
    await expect(patientin).toBeChecked();
  });

  test("Fenster: Nummern an „wann“, Klick auf den linken Rand der dritten Möglichkeit in „wo“", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
    const fenster = feldfenster(page);
    expect(await gruppenMitNummern(fenster)).toEqual(["wann"]);
    const ziel = fenster.getByRole("radiogroup", { name: "wo" }).getByRole("radio").nth(2);
    const kasten = (await ziel.boundingBox())!;
    await page.mouse.click(kasten.x + 3, kasten.y + kasten.height / 2);
    await expect(ziel).toBeChecked();
  });
});

test("QA-20 Wahlziffer auf dem gewählten Knopf in dessen Schriftfarbe; Angaben der Befundzeile zeigen ihre Nummern", async ({ page }) => {
  await osg(page);
  const seite = page.getByRole("radiogroup", { name: "Seite", exact: true });
  await seite.getByRole("radio", { name: "rechts", exact: true }).focus();
  const farben = await seite.locator(".pille.aktiv").evaluate((k) => {
    const z = k.querySelector(".pille-ziffer")!;
    return { knopf: getComputedStyle(k).color, ziffer: getComputedStyle(z).color, sichtbar: getComputedStyle(z).visibility };
  });
  expect(farben.sichtbar).toBe("visible");
  expect(farben.ziffer).toBe(farben.knopf);
  // Befundliste: „Schwellung“ auffällig; die Zeile bleibt der Zeiger, ihre Angabe zeigt die Nummern, mit denen gewählt wird.
  await liste(page);
  await page.keyboard.press("ArrowDown");
  await taste(page, "a");
  await expect(zeile(page, 1)).toBeFocused();
  expect((await gruppenMitNummern(zeile(page, 1))).length).toBe(1);
  expect(await gruppenMitNummern(page.locator(".befundliste"))).toHaveLength(1);
});

test("QA-23 Wahlziffer als Tastenkappe, klar getrennt von der Zahl im Knopftext (Tibiakopf, Röntgenkontrolle)", async ({ page }) => {
  await vorlage(page, "tibiakopf", "Tibiakopffraktur, Osteosynthese", true);
  await stelle(abschnitt(page, "procedere"), /^Röntgenkontrolle: /).first().click();
  const kappe = feldfenster(page).getByRole("radiogroup", { name: "Wann" }).locator(".pille-ziffer").nth(1);
  // Die Kappe sitzt seit dem Design-Feinschliff (10.11.2026, Nr. 16) auf dem Rand des Knopfs, nicht mehr in seiner Zeile:
  // getrennt heißt jetzt, sie endet mindestens 4 px vor dem Knopftext.
  const stil = await kappe.evaluate((z) => {
    const s = getComputedStyle(z);
    const text = z.parentElement!.querySelector(".pille-text")!.getBoundingClientRect();
    return { rand: s.borderTopStyle, breite: parseFloat(s.borderTopWidth), abstand: text.left - z.getBoundingClientRect().right, sichtbar: s.visibility };
  });
  expect(stil).toMatchObject({ rand: "solid", sichtbar: "visible" });
  expect(stil.breite).toBeGreaterThanOrEqual(1);
  expect(stil.abstand).toBeGreaterThanOrEqual(4);
});

test.describe("QA-24: Genau eine Nummernreihe im Fenster, auch nach einem Klick in eine andere Gruppe", () => {
  test("OSG „Kontrolle“: Klick in „wann“, dann „3“: wählt in „wo“, „wann“ bleibt", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
    const fenster = feldfenster(page);
    expect(await gruppenMitNummern(fenster)).toEqual(["wann"]);
    await fenster.getByRole("radiogroup", { name: "wann" }).getByRole("radio", { name: /nach 1 Woche/ }).click();
    expect(await gruppenMitNummern(fenster)).toEqual(["wo"]);
    await taste(page, "3");
    await expect(stelle(page, /^Kontrolle: .*nach 1 Woche beim Durchgangsarzt/)).toBeVisible();
  });

  test("OSG „Orthese“: Nach „2“ fehlt dem Satz nichts mehr, es geht weiter; die freiwillige Angabe „danach“ bleibt leer (R2-03)", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "procedere"), /^Orthese: /).first().click();
    const fenster = feldfenster(page);
    expect(await gruppenMitNummern(fenster)).toEqual(["Tag und Nacht"]);
    const vor = await stand(page);
    await taste(page, "2");
    await expect(fenster.getByRole("radiogroup", { name: "Tag und Nacht" })).toHaveCount(0);
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert).toHaveLength(1);
    expect(geaendert[0]).toContain("für 2 Wochen Tag und Nacht tragen.");
  });

  test("Tibiakopf „Physiotherapie“: Klick in „Inhalt“, dann „3“: Dem Satz fehlt nichts mehr, es geht zur Verordnung (eigener Satz, E-71), „3“ wählt dort", async ({ page }) => {
    await vorlage(page, "tibiakopf", "Tibiakopffraktur, Osteosynthese", true);
    const pro = abschnitt(page, "procedere");
    await stelle(pro, /^Physiotherapie: /).first().click();
    const fenster = feldfenster(page);
    expect(await fenster.getByRole("radiogroup").evaluateAll((g) => g.map((x) => x.getAttribute("aria-label") ?? ""))).toEqual(["Inhalt", "Häufigkeit"]);
    expect(await gruppenMitNummern(fenster)).toEqual(["Inhalt"]);
    await fenster.getByRole("radiogroup", { name: "Inhalt" }).getByRole("radio", { name: /mit Gangschule/ }).first().click();
    // Die Häufigkeit ist freiwillig und bleibt leer; die Pflichtfrage nach der Verordnung ist der nächste Halt.
    await expect(fenster).toHaveAccessibleName("Verordnung der Physiotherapie");
    expect(await gruppenMitNummern(fenster)).toEqual(["Verordnung der Physiotherapie"]);
    const dritte = (await fenster.getByRole("radiogroup", { name: "Verordnung der Physiotherapie" }).getByRole("radio").nth(2).textContent())!.replace(/^\d/, "").trim();
    await taste(page, "3");
    await expect(stelle(pro, new RegExp(`^Verordnung der Physiotherapie: .*${dritte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))).toBeVisible();
    await expect(stelle(pro, /^Physiotherapie: Physiotherapie mit Gangschule\./)).toBeVisible();
  });
});

test("QA-22 Enter auf der Personengruppe wählt nichts und sagt, was geht", async ({ page }) => {
  await oeffneApp(page);
  await oeffneVorlage(page, "osg", "OSG-Distorsion");
  await page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: "rechts", exact: true }).click();
  await taste(page, "F2");
  const person = page.getByRole("radiogroup", { name: "Patient oder Patientin" });
  await expect(person).toBeFocused();
  const vor = await stand(page);
  await taste(page, "Enter");
  expect(aenderungen(vor, await stand(page))).toEqual([]);
  await expect(meldung(page)).toContainText("Enter wählt nur, was markiert ist: Ziffer 1 bis 4, oder mit Pfeiltaste markieren und dann Enter.");
});

test("R2-04 und E-45 Fallkopf: „1“ setzt die Person, ein „x“ gleich danach nimmt sie zurück und nennt sie", async ({ page }) => {
  await oeffneApp(page);
  await oeffneVorlage(page, "osg", "OSG-Distorsion");
  await page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: "rechts", exact: true }).click();
  await taste(page, "F2");
  const person = page.getByRole("radiogroup", { name: "Patient oder Patientin" });
  await expect(person).toBeFocused();
  await taste(page, "1");
  await tippe(page, "x");
  await nachDemNaechstenBild(page);
  await expect(person.getByRole("radio", { name: "Patient", exact: true })).toHaveAttribute("aria-checked", "false");
  await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt: Person (jetzt: nicht gewählt). Verworfen: „x“");
  // Der Fokus steht wieder auf der Personengruppe. Die erste Pfeiltaste löst nur (PS-N06), danach wählt die Ziffer.
  await expect(person).toBeFocused();
  await taste(page, "ArrowRight");
  await expect(meldung(page)).toContainText("Entsperrt: Tasten wirken wieder. Diese Taste hat nichts markiert.");
  await expect(person.getByRole("radio", { checked: true })).toHaveCount(0);
  await taste(page, "1");
  await expect(person.getByRole("radio", { name: "Patient", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("TS-01 Fenster mit Textfeld-Angabe: Der Tastenhinweis nennt Enter, nicht die Ziffer", async ({ page }) => {
  await osg(page);
  await page.getByRole("button", { name: "+ Schmerzmittel gegeben" }).click();
  expect((await lage(page)).art).toBe("eingabe");
  await expect(feldfenster(page).locator(".ff-tastenhinweis")).toHaveText("Enter oder Tab: weiter · ↓ Schnellwerte · Esc schließt");
});
