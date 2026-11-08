// Tastatur Runde 3 nach E-45 (Nachprüfungen Runde 2: Patientensicherheit PS-N05 bis PS-N09, Code-Review CR-TS07 bis
// CR-TS11, Browserprüfung QA-25 bis QA-30, R2-08). Szenarien je zweimal: „schnell“ mit 10 ms je Taste wie flüssiges
// Weiterschreiben, „langsam“ mit 400 ms je Taste wie jemand, der mit wenigen Fingern tippt. Jeder Test vergleicht den
// ganzen Brief vor und nach den Tasten. Wo ein Test wartet, bis der Halt bereit ist, prüft er den strengeren Weg: Der
// Befehl wirkt erst und muss dann zurückgenommen werden.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { abschnitt, aenderungen, bereit, feldfenster, meldung, nachDemNaechstenBild, oeffneApp, oeffneVorlage, stand, stelle, tippe, tippzug, warte } from "./hilfen.ts";
import { hauptweg, taste, vorlageMitKopf } from "./durchlauf.ts";

const TEMPO = { schnell: 10, langsam: 400 } as const;

async function vorlage(page: Page, suche: string, titel: string) {
  await oeffneApp(page);
  await vorlageMitKopf(page, suche, titel);
}

const osg = (page: Page) => vorlage(page, "osg", "OSG-Distorsion");

/** Pause des Arztes; danach, falls der Halt noch nicht bereit ist, bis er es ist (dann wirkt die erste Taste sicher). */
async function pause(page: Page, ms: number) {
  await warte(page, ms);
  if ((await tippzug(page)) === "wartet") await bereit(page);
}

const zeile = (page: Page, n: number) => page.locator(".befundliste [data-zeile]").nth(n);

/** Keine Meldung mit diesem Text: auch dann erfüllt, wenn gar keine Meldung steht. */
async function keineMeldung(page: Page, text: string) {
  await expect(meldung(page).filter({ hasText: text })).toHaveCount(0);
}

async function liste(page: Page) {
  await abschnitt(page, "befund").locator("[data-pruefen]").first().click();
  await expect(page.locator(".befundliste")).toBeVisible();
}

/** Gruppen im Fenster, die gerade Nummern zeigen. */
async function gruppenMitNummern(bereich: Locator): Promise<string[]> {
  return bereich.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>(".pillen, .ff-liste")]
      .filter((g) => [...g.querySelectorAll(".pille-ziffer, .ff-ziffer")].some((z) => getComputedStyle(z).visibility === "visible"))
      .map((g) => g.getAttribute("aria-label") ?? ""),
  );
}

test.describe("PS-N05 (Blocker): Text, Tab, Enter oder Leertaste ersetzt nie den eigenen Text", () => {
  const FELDER = [
    { stelle: /^Allergien: /, text: "Penicillin", erwartet: "Allergien: Penicillin" },
    { stelle: /^Unfallhergang: /, text: "Sturz vom Fahrrad", erwartet: "Unfallhergang: Sturz vom Fahrrad" },
    { stelle: /^Unfallzeitpunkt: /, text: "14 Uhr", erwartet: "Unfallzeitpunkt: 14 Uhr" },
  ];
  for (const f of FELDER) {
    for (const danach of ["⏎", " "] as const) {
      for (const [tempo, ms] of Object.entries(TEMPO)) {
        test(`${f.erwartet.split(":")[0]}: „${f.text}“, Tab, ${danach === "⏎" ? "Enter" : "Leertaste"} (${tempo})`, async ({ page }) => {
          await osg(page);
          await stelle(abschnitt(page, "anamnese"), f.stelle).first().click();
          await expect(feldfenster(page)).toBeVisible();
          const vor = await stand(page);
          await tippe(page, [...f.text, "Tab", danach], ms);
          await nachDemNaechstenBild(page);
          await nachDemNaechstenBild(page);
          // Tab ging weiter (E-45 Satz 5): Der Text steht im Satz, kein Schnellwert hat ihn ersetzt, und am nächsten Halt
          // hat weder Enter noch Leertaste etwas gesetzt.
          const geaendert = aenderungen(vor, await stand(page));
          expect(geaendert, geaendert.join("\n")).toHaveLength(1);
          expect(geaendert[0]).toContain(`→ z-gesetzt | ${f.erwartet}`);
          await keineMeldung(page, "Ersetzt");
        });
      }
    }
  }

  test("Schnellwert über getipptem Text: Meldung mit beiden Wortlauten und Rückgängig", async ({ page }) => {
    await osg(page);
    const an = abschnitt(page, "anamnese");
    await stelle(an, /^Allergien: /).first().click();
    await page.keyboard.type("Penicillin");
    await feldfenster(page).getByRole("button", { name: "keine bekannt" }).click();
    await expect(meldung(page)).toContainText("Ersetzt: Allergien „Penicillin“ → „keine bekannt“");
    await expect(stelle(an, /^Allergien: keine bekannt/)).toBeVisible();
    await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
    await expect(stelle(an, /^Allergien: Penicillin/)).toBeVisible();
  });

  test("Fußzeile nennt, was Enter am Element mit dem Fokus tut", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "anamnese"), /^Unfallzeitpunkt: /).first().click();
    const fuss = feldfenster(page).locator(".ff-tastenhinweis");
    await expect(fuss).toHaveText("Enter oder Tab: weiter · ↓ Schnellwerte · Esc schließt");
    await page.keyboard.press("ArrowDown");
    await expect(fuss).toHaveText("Enter setzt „heute“ ein · ↑ zurück ins Feld · Esc schließt");
    await page.keyboard.press("Escape");
    await stelle(abschnitt(page, "anamnese"), /^Allergien: /).first().click();
    await expect(fuss).toHaveText("Enter: neue Zeile · Strg+Enter oder Tab: weiter · ↓ Schnellwerte · Esc schließt");
  });
});

test.describe("PS-N06: Nach dem Lösen setzt das nächste Enter oder die Leertaste nichts", () => {
  for (const [loesen, druck] of [
    ["ArrowDown", "⏎"],
    ["Tab", " "],
  ] as const) {
    test(`OSG „gestern“, Enter, sofort „1“ (gesperrt), ${loesen}, ${druck === "⏎" ? "Enter" : "Leertaste"}: Arbeitsunfall bleibt offen`, async ({ page }) => {
      await osg(page);
      await stelle(abschnitt(page, "anamnese"), /^Unfallzeitpunkt: /).first().click();
      const vor = await stand(page);
      await tippe(page, "gestern⏎1");
      await nachDemNaechstenBild(page);
      expect(await tippzug(page)).toBe("gesperrt");
      await tippe(page, [loesen]);
      await expect(meldung(page)).toContainText("Entsperrt: Tasten wirken wieder. Diese Taste hat nichts markiert.");
      await tippe(page, [druck]);
      await nachDemNaechstenBild(page);
      const geaendert = aenderungen(vor, await stand(page));
      expect(geaendert, geaendert.join("\n")).toHaveLength(1);
      expect(geaendert[0]).toContain("Unfallzeitpunkt: gestern");
      // Gegenprobe: Erst die zweite Pfeiltaste markiert, dann setzt Enter das Markierte.
      await taste(page, "ArrowDown");
      await taste(page, "Enter");
      expect(aenderungen(vor, await stand(page)).length).toBeGreaterThan(1);
    });
  }

  for (const loesen of ["Tab", "ArrowRight"] as const) {
    test(`Abszess „Unterarm“, Enter, sofort „u“ (gesperrt), ${loesen}, Enter: keine Zeile gesetzt`, async ({ page }) => {
      await vorlage(page, "abszess", "Weichteilinfekt, Abszess");
      await stelle(page, /^Region: /).first().click();
      const vor = await stand(page);
      await tippe(page, "Unterarm⏎u");
      await nachDemNaechstenBild(page);
      await expect(page.locator(".befundliste")).toBeVisible();
      expect(await tippzug(page)).toBe("gesperrt");
      await tippe(page, [loesen, "⏎"]);
      await nachDemNaechstenBild(page);
      const geaendert = aenderungen(vor, await stand(page));
      expect(geaendert, geaendert.join("\n")).toHaveLength(1);
      expect(geaendert[0]).toContain("Region: Unterarm");
    });
  }
});

test.describe("PS-N07, CR-TS07, PS-N08: Nach der Pause weitergetippt, der ganze Zug geht zurück", () => {
  for (const [tempo, ms] of Object.entries(TEMPO)) {
    test(`Schnittwunde „3 cm“, Enter, 0,5 s, „unauffällig“ (${tempo}): nur die Wundlänge bleibt`, async ({ page }) => {
      await vorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
      await liste(page);
      await page.locator(".befundliste [data-zeile]").filter({ hasText: "Wundlänge" }).locator("input").click();
      const vor = await stand(page);
      await tippe(page, "3 cm⏎", ms);
      await pause(page, 500);
      await tippe(page, "unauffällig", ms);
      await nachDemNaechstenBild(page);
      const geaendert = aenderungen(vor, await stand(page));
      expect(geaendert, geaendert.join("\n")).toHaveLength(1);
      expect(geaendert[0]).toContain("Wundlänge: 3 cm");
      await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt:");
      expect(await tippzug(page)).toBe("gesperrt");
    });

    test(`Abszess „Unterarm“, Enter, Pause, „und Hand“ (${tempo}): Befundliste unverändert`, async ({ page }) => {
      await vorlage(page, "abszess", "Weichteilinfekt, Abszess");
      await stelle(page, /^Region: /).first().click();
      const vor = await stand(page);
      await tippe(page, "Unterarm⏎", ms);
      await pause(page, 350);
      await tippe(page, "und Hand", ms);
      await nachDemNaechstenBild(page);
      const geaendert = aenderungen(vor, await stand(page));
      expect(geaendert, geaendert.join("\n")).toHaveLength(1);
      expect(geaendert[0]).toContain("Region: Unterarm");
      await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt:");
    });

    test(`OSG „gestern“, Enter, 0,35 s, „14 Uhr beim Fußball“ (${tempo}): Arbeitsunfall offen, Vorerkrankungen leer`, async ({ page }) => {
      await osg(page);
      await stelle(abschnitt(page, "anamnese"), /^Unfallzeitpunkt: /).first().click();
      const vor = await stand(page);
      await tippe(page, "gestern⏎", ms);
      await pause(page, 350);
      await tippe(page, "14 Uhr beim Fußball", ms);
      await nachDemNaechstenBild(page);
      const geaendert = aenderungen(vor, await stand(page));
      expect(geaendert, geaendert.join("\n")).toHaveLength(1);
      expect(geaendert[0]).toContain("Unfallzeitpunkt: gestern");
      // Die „1“ hat erst „Arbeitsunfall“ gesetzt; die „4“ im nächsten Feld verriet den blinden Zug (E-45 Satz 4).
      await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt: Arbeitsunfall");
      // Die verworfenen Zeichen so, wie sie getippt wurden, jede Leertaste einmal (im Browserdurchgang doppelt gesehen).
      // Ohne Vergleich über `toContainText`: Der fasst Leerraum zusammen.
      expect(await meldung(page).first().textContent()).toContain("Verworfen: „4 Uhr beim Fußball“");
      const offen = feldfenster(page).locator("textarea, input");
      if (await offen.count()) await expect(offen.first()).toHaveValue("");
    });
  }

  test("Gegenprobe ohne Fehlalarm: „gestern“, Enter, Blick, „1“, Blick, Text ins nächste Feld bleibt stehen", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "anamnese"), /^Unfallzeitpunkt: /).first().click();
    const vor = await stand(page);
    await tippe(page, "gestern⏎", TEMPO.langsam);
    await bereit(page);
    await tippe(page, "1");
    // Bewusst: nach dem Bild des Felds eine Pause über dem Takt des Texts davor (0,8 s), dann schreiben.
    await pause(page, 900);
    await tippe(page, "keine", TEMPO.langsam);
    await nachDemNaechstenBild(page);
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert.some((z) => z.includes("Arbeitsunfall"))).toBe(true);
    await keineMeldung(page, "Zurückgenommen");
    await expect(feldfenster(page).locator("textarea, input").first()).toHaveValue("keine");
  });

  test("Gegenprobe ohne Fehlalarm, zügig: „gestern“ mit 120 ms je Taste, Enter, Blick 0,2 s, „1“, Blick 0,2 s, „keine“", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "anamnese"), /^Unfallzeitpunkt: /).first().click();
    await tippe(page, "gestern⏎", 120);
    await bereit(page);
    await warte(page, 200);
    await tippe(page, "1");
    await bereit(page);
    await warte(page, 200);
    await tippe(page, "keine", 120);
    await nachDemNaechstenBild(page);
    // Mit festen 1,5 s statt des Takts wäre das ein Fehlalarm (E-45, Begründung).
    await keineMeldung(page, "Zurückgenommen");
    await expect(stelle(abschnitt(page, "anamnese"), /^Arbeitsunfall: /).first()).toHaveClass(/z-gesetzt/);
    await expect(feldfenster(page).locator("textarea, input").first()).toHaveValue("keine");
  });

  test("Rückgängig nimmt den ganzen Zug zurück: zwei U, Enter auf „Weiter“ zu früh, Rückgängig", async ({ page }) => {
    await osg(page);
    await liste(page);
    const n = await page.locator(".befundliste [data-zeile]").count();
    await zeile(page, n - 2).focus();
    const vor = await stand(page);
    await taste(page, "u");
    await taste(page, "u");
    await expect(page.locator(".bl-fuss button").first()).toBeFocused();
    await tippe(page, "⏎");
    await nachDemNaechstenBild(page);
    expect(aenderungen(vor, await stand(page))).toHaveLength(2);
    // MT-07: Die Meldung nennt die Wahl im Wortlaut der Zeile.
    await expect(meldung(page)).toContainText("Verworfen: Enter (zu früh nach dem Weiterspringen).");
    await expect(meldung(page)).toContainText("Eben gesetzt: Durchblutung/Motorik/Sensibilität „unauffällig“ und Kompartmentsyndrom „unauffällig“.");
    await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    await expect(meldung(page)).toContainText("Zurückgenommen: Durchblutung/Motorik/Sensibilität und Kompartmentsyndrom (jetzt: wieder Vorschlag)");
  });
});

test.describe("Ende der Befundliste: Ein Zeichen auf „Weiter“ gleich nach einer Wahl verrät den blinden Zug", () => {
  // Auf „Weiter“ bedeutet kein Buchstabe und keine Ziffer etwas. Kommt eines binnen 1,5 s nach einem Befehl, gilt E-45
  // Satz 2 wie an jedem Halt; sonst sagt der Hinweis nur, wo der Zeiger steht.
  for (const [tempo, ms] of Object.entries(TEMPO)) {
    test(`OSG, vorletzte Zeile, „und“ (${tempo}): beide Zeilen zurück, das „d“ auf „Weiter“ setzt nichts`, async ({ page }) => {
      await osg(page);
      await liste(page);
      const n = await page.locator(".befundliste [data-zeile]").count();
      await zeile(page, n - 2).focus();
      const vor = await stand(page);
      await tippe(page, "und", ms);
      await nachDemNaechstenBild(page);
      const geaendert = aenderungen(vor, await stand(page));
      expect(geaendert, geaendert.join("\n")).toEqual([]);
      await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt:");
      expect(await tippzug(page)).toBe("gesperrt");
    });
  }

  test("eine Taste zu viel gleich nach der letzten Zeile: auch die letzte Wahl geht zurück", async ({ page }) => {
    await osg(page);
    await liste(page);
    const n = await page.locator(".befundliste [data-zeile]").count();
    await zeile(page, n - 1).focus();
    const vor = await stand(page);
    await taste(page, "u");
    await expect(page.locator(".befundliste .bl-fuss .knopf")).toBeFocused();
    await taste(page, "u");
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt: Kompartmentsyndrom");
  });
});

test.describe("QA-25: Die Seitenwahl verschiebt den Fallkopf nicht", () => {
  // OSG wie in der Browserprüfung: Ohne Seite passt die Kopfzeile, mit „RECHTS“ brach sie früher um. Monarthritis mit
  // langem Titel dazu: Der Titel kürzt, statt umzubrechen.
  for (const [suche, titel, breite] of [
    ["osg", "OSG-Distorsion", 900],
    ["osg", "OSG-Distorsion", 1024],
    ["osg", "OSG-Distorsion", 1366],
    ["monarthritis", "Akute Monarthritis", 900],
  ] as const) {
    test(`${titel}, ${breite} px: Seite wählen, dann Klick an die alte Stelle von „Patientin“ setzt die Person`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 800 });
      await oeffneApp(page);
      await oeffneVorlage(page, suche, titel);
      const seite = page.getByRole("radiogroup", { name: "Seite", exact: true });
      const patientin = page.getByRole("radiogroup", { name: "Patient oder Patientin" }).getByRole("radio", { name: "Patientin", exact: true });
      const kopfVor = await page.locator(".fallkopf").boundingBox();
      const vor = await patientin.boundingBox();
      await seite.getByRole("radio", { name: "rechts", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("RECHTS");
      expect(await patientin.boundingBox()).toEqual(vor);
      expect((await page.locator(".fallkopf").boundingBox())?.height).toBe(kopfVor?.height);
      // Klick auf den linken Rand des Knopfs, wo er vor der Seitenwahl stand.
      await page.mouse.click(vor!.x + 3, vor!.y + vor!.height / 2);
      await expect(patientin).toBeChecked();
      await expect(seite.getByRole("radio", { name: "rechts", exact: true })).toBeChecked();
      await expect(page.getByRole("heading", { level: 1 })).not.toContainText("BEIDSEITS");
    });
  }
});

test.describe("R2-08: Meldungen verdecken weder Zeiger noch Zeilen noch Knöpfe", () => {
  for (const [breite, hoehe] of [
    [1024, 768],
    [900, 800],
  ]) {
    test(`${breite} × ${hoehe}: Meldung nach Ü in der Befundliste steht unter dem Brief`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: hoehe });
      await osg(page);
      await liste(page);
      // Zeiger auf eine Zeile weit unten, damit sie am unteren Rand steht, wo früher die Meldung lag.
      const n = await page.locator(".befundliste [data-zeile]").count();
      await zeile(page, n - 1).focus();
      await taste(page, "ü");
      await expect(meldung(page)).toContainText("Übernommen");
      const lage = await page.evaluate(() => {
        const r = (s: string) => document.querySelector(s)?.getBoundingClientRect() ?? null;
        const m = r(".meldung")!;
        const a = document.activeElement!.getBoundingClientRect();
        const rahmen = r(".papier-rahmen")!;
        const leiste = r(".pruefleiste");
        return { m: { top: m.top, bottom: m.bottom, left: m.left, right: m.right }, fokusUnten: a.bottom, rahmenUnten: rahmen.bottom, leiste: leiste && { top: leiste.top, left: leiste.left, bottom: leiste.bottom } };
      });
      // Alles, was im Brief zu sehen ist, endet über der Meldung; der Fokus ist zu sehen.
      expect(lage.rahmenUnten).toBeLessThanOrEqual(lage.m.top + 0.5);
      expect(lage.fokusUnten).toBeLessThanOrEqual(lage.m.top + 0.5);
      // Die Prüfleiste liegt daneben (breit) oder darunter (schmal), nie unter der Meldung.
      if (lage.leiste) expect(lage.leiste.left >= lage.m.right - 0.5 || lage.leiste.top >= lage.m.bottom - 0.5).toBe(true);
    });
  }

  test("1024 × 768: Fenster über der Meldungszeile nicht verdeckt", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await osg(page);
    await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
    await expect(meldung(page)).toHaveCount(0);
    // Eine Meldung erscheint, während das Fenster offen ist: ein Buchstabe, wo gewählt wird, sperrt und meldet.
    await taste(page, "x");
    await expect(feldfenster(page)).toBeVisible();
    await expect(meldung(page)).toBeVisible();
    const lage = await page.evaluate(() => ({ fenster: document.querySelector(".feldfenster")!.getBoundingClientRect().bottom, meldung: document.querySelector(".meldung")!.getBoundingClientRect().top }));
    expect(lage.fenster).toBeLessThanOrEqual(lage.meldung + 0.5);
  });
});

test.describe("Leichte Befunde der Runde 2", () => {
  test("QA-26: Nach einem Klick auf „auffällig“ trägt die erste offene Angabe die Nummern; „2“ wählt dort", async ({ page }) => {
    await osg(page);
    await liste(page);
    const z = page.locator(".befundliste [data-zeile]").filter({ hasText: "DS Außenknöchel" });
    await z.getByRole("radio", { name: "auffällig", exact: true }).click();
    await expect(z.locator(".pille-ziffer").first()).toBeVisible();
    const vor = await stand(page);
    await taste(page, "2");
    const geaendert = aenderungen(vor, await stand(page));
    expect(geaendert.length).toBe(1);
    await keineMeldung(page, "Verworfen");
  });

  test("QA-27: Zweites Strg+Umschalt+Enter mit sofortigem Enter schließt den Fall nicht", async ({ page }) => {
    await osg(page);
    await taste(page, "F2");
    expect((await hauptweg(page)).ende).toBe(true);
    await bereit(page);
    await page.keyboard.press("Control+Shift+Enter");
    await page.waitForFunction(() => /Alles kopiert/.test(document.activeElement?.textContent ?? ""));
    await bereit(page);
    // Der Fokus liegt schon auf dem Knopf; das zweite Kopieren ist trotzdem ein Sprung.
    await page.keyboard.press("Control+Shift+Enter");
    await tippe(page, "⏎");
    await nachDemNaechstenBild(page);
    await expect(page.getByRole("button", { name: "Alles kopiert · Fall schließen" })).toBeVisible();
    await expect(meldung(page)).toContainText("Enter verworfen, Fall bleibt offen.");
  });

  test("QA-28: „Ziffer, Enter“ vor einem mehrzeiligen Feld schreibt keinen Zeilenumbruch", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "anamnese"), /^Arbeitsunfall: /).first().click();
    await bereit(page);
    await tippe(page, "1⏎");
    await nachDemNaechstenBild(page);
    const feld = feldfenster(page).locator("textarea");
    await expect(feld).toBeFocused();
    await expect(feld).toHaveValue("");
    // Der schnelle Weg zu den Schnellwerten geht weiter.
    await bereit(page);
    await page.keyboard.press("ArrowDown");
    await expect(feldfenster(page).locator(".ff-vorschlaege button").first()).toBeFocused();
  });

  test("PS-N09: Eine Meldung mit Rückgängig verschwindet, sobald ihr Fall nicht mehr zu sehen ist", async ({ page }) => {
    await osg(page);
    await liste(page);
    await zeile(page, 0).focus();
    await taste(page, "ü");
    await expect(meldung(page).getByRole("button", { name: "Rückgängig" })).toBeVisible();
    // Neuer Fall mit derselben Vorlage (P32): Die Meldung gälte sonst dem falschen Brief.
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await expect(meldung(page)).toHaveCount(0);
    await oeffneVorlage(page, "osg", "OSG-Distorsion");
    await expect(meldung(page)).toHaveCount(0);
    await page.locator(".reiter-knopf").first().click();
    await expect(page.locator(".reiter-knopf").first()).toHaveAttribute("aria-current", "true");
    await expect(meldung(page)).toHaveCount(0);
  });

  test("CR-TS08: Ein Lösen vor dem ersten Bild gilt; das späte Bild beginnt die Schreckzeit nicht neu", async ({ page }) => {
    // Langsamer Rechner: Jedes Bild kommt 400 ms später.
    await page.addInitScript(() => {
      const echt = window.requestAnimationFrame.bind(window);
      const offen = new Map<number, number>();
      let nr = 0;
      window.requestAnimationFrame = (f) => {
        const id = ++nr;
        offen.set(id, window.setTimeout(() => (offen.delete(id), echt(f)), 400));
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        window.clearTimeout(offen.get(id));
        offen.delete(id);
      };
    });
    await osg(page);
    await page.keyboard.press("F2");
    await warte(page, 100);
    await page.keyboard.press("ArrowDown");
    expect(await tippzug(page)).toBe("bereit");
    // Das Bild wäre jetzt gekommen; danach wirkt eine Ziffer trotzdem.
    await warte(page, 450);
    const vor = await stand(page);
    await page.keyboard.press("1");
    await nachDemNaechstenBild(page);
    expect(aenderungen(vor, await stand(page)).length).toBeGreaterThan(0);
    await keineMeldung(page, "Verworfen");
  });

  for (const sichtbar of [true, false]) {
    test(`CR-TS09: Ohne Bild gilt der Halt nach 1 s als zu sehen, ${sichtbar ? "wenn die Seite sichtbar ist" : "nicht bei verborgener Seite"}`, async ({ page }) => {
      await page.addInitScript((s) => {
        window.requestAnimationFrame = () => 0;
        if (!s) Object.defineProperty(document, "visibilityState", { get: () => "hidden" });
      }, sichtbar);
      await osg(page);
      await page.keyboard.press("F2");
      expect(await tippzug(page)).toBe("wartet");
      // Ersatz nach 1 s, danach die Schreckzeit (0,3 s) wie nach einem Bild.
      await warte(page, 1400);
      expect(await tippzug(page)).toBe(sichtbar ? "bereit" : "wartet");
      const vor = await stand(page);
      await page.keyboard.press("1");
      await warte(page, 50);
      if (sichtbar) expect(aenderungen(vor, await stand(page)).length).toBeGreaterThan(0);
      else {
        expect(aenderungen(vor, await stand(page))).toEqual([]);
        await expect(meldung(page)).toContainText("Verworfen: „1“");
      }
    });
  }

  test("CR-TS10: Rückgängig der Übernahme lässt eine spätere eigene Wahl im selben Satz stehen", async ({ page }) => {
    await osg(page);
    const pr = abschnitt(page, "procedere");
    await pr.locator("[data-uebernehmen]").first().click();
    await expect(meldung(page)).toContainText("Übernommen");
    const rueck = meldung(page).getByRole("button", { name: "Rückgängig" });
    await stelle(pr, /^Sportpause: /).first().click();
    const wahl = feldfenster(page).getByRole("radio").filter({ hasText: "2 Wochen" }).first();
    const text = (await wahl.textContent())!.replace(/^\d/, "").trim();
    await wahl.click();
    await page.keyboard.press("Escape");
    await expect(stelle(pr, new RegExp(`^Sportpause: .*${text}`))).toBeVisible();
    await rueck.click();
    // Die eigene Wahl bleibt schwarz, nicht „Vorschlag der Vorlage“.
    const sport = stelle(pr, new RegExp(`^Sportpause: .*${text}`)).first();
    await expect(sport).toBeVisible();
    await expect(sport).not.toHaveAccessibleName(/Vorschlag der Vorlage/);
    await expect(sport).toHaveClass(/z-gesetzt/);
  });

  test("CR-TS11: Kopfplatzwunde „Wunde“: Nach „1“ trägt die vorbelegte Seite die Nummern, nicht die nächste offene Angabe", async ({ page }) => {
    await vorlage(page, "kopfplatzwunde", "Kopfplatzwunde");
    await stelle(abschnitt(page, "befund"), /^Wunde: /).first().click();
    const fenster = feldfenster(page);
    await taste(page, "1");
    expect(await gruppenMitNummern(fenster)).toEqual(["Seite (entfällt in der Mittellinie)"]);
  });
});

test.describe("Runde 3b: Wechsel von Seite oder Person beendet den Zug (PS-N11); Rückgängig nach „Ersetzt“ (PS-N10)", () => {
  const kopf = (page: Page, name: string) => page.getByRole("radiogroup", { name, exact: true });

  for (const [tempo, ms] of Object.entries(TEMPO)) {
    test(`PS-N11: Seite rechts → links bestätigt („2“, „2“), gleich danach „x“ (${tempo}): bleibt links, nichts zurückgenommen`, async ({ page }) => {
      await osg(page);
      const seite = kopf(page, "Seite");
      await seite.getByRole("radio", { name: "rechts", exact: true }).focus();
      await taste(page, "2");
      await expect(seite.getByRole("radio", { name: "auf „links“ ändern?" })).toBeVisible();
      await bereit(page);
      // Zweite „2“ bestätigt; das „x“ danach (Fehlgriff oder Weitertippen) nahm bisher die Bestätigung zurück und stellte
      // die eben verworfene Seite „rechts“ schwarz wieder her (Prüfskript P41).
      await tippe(page, ["2", "x"], ms);
      await nachDemNaechstenBild(page);
      await expect(seite.getByRole("radio", { name: "links", exact: true })).toBeChecked();
      const brieftext = (await page.locator("[data-abschnitt]").allTextContents()).join("\n");
      expect(brieftext).toContain("links");
      expect(brieftext).not.toContain("rechts");
      const text = (await meldung(page).textContent()) ?? "";
      expect(text).toContain("Verworfen: „x“");
      expect(text).toContain("Eben gesetzt: Seite „links“");
      expect(text).not.toContain("Zurückgenommen");
      expect(await tippzug(page)).toBe("gesperrt");
      // Zurück nur, wenn der Arzt es will: „Rückgängig“ in der Meldung.
      await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
      await expect(seite.getByRole("radio", { name: "rechts", exact: true })).toBeChecked();
      await expect(meldung(page)).toContainText("Zurückgenommen: Seite (jetzt: rechts)");
    });

    test(`PS-N11: Person Patient → Patientin („2“), gleich danach „x“ (${tempo}): bleibt Patientin`, async ({ page }) => {
      await osg(page);
      const person = kopf(page, "Patient oder Patientin");
      await person.getByRole("radio", { name: "Patient", exact: true }).focus();
      await bereit(page);
      await tippe(page, ["2", "x"], ms);
      await nachDemNaechstenBild(page);
      await expect(person.getByRole("radio", { name: "Patientin", exact: true })).toBeChecked();
      await keineMeldung(page, "Zurückgenommen");
    });

    test(`PS-N11, Gegenstück: die erste Seite am Halt („2“), gleich danach „x“ (${tempo}): zurück auf offen`, async ({ page }) => {
      await oeffneApp(page);
      await oeffneVorlage(page, "osg", "OSG-Distorsion");
      const seite = kopf(page, "Seite");
      await taste(page, "F2");
      await expect(seite).toBeFocused();
      await bereit(page);
      await tippe(page, ["2", "x"], ms);
      await nachDemNaechstenBild(page);
      await expect(seite.getByRole("radio", { checked: true })).toHaveCount(0);
      await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt: Seite (jetzt: nicht gewählt)");
    });
  }

  for (const f of [
    { abschnitt: "anamnese", stelle: "Allergien", tippt: "Penicillin", schnellwert: "keine bekannt", neu: "Penicillin, Latex" },
    { abschnitt: "procedere", stelle: "Schmerzmittel", tippt: "Ibu", schnellwert: "Kein Schmerzmittel nötig", neu: "Ibuprofen 400 mg bei Bedarf" },
  ] as const) {
    test(`PS-N10: ${f.stelle}: Rückgängig nach „Ersetzt“ tut nichts, wenn die Stelle seither neu geschrieben ist`, async ({ page }) => {
      await osg(page);
      const ab = abschnitt(page, f.abschnitt);
      await stelle(ab, new RegExp(`^${f.stelle}: `)).first().click();
      await page.keyboard.type(f.tippt);
      await feldfenster(page).getByRole("button", { name: f.schnellwert }).click();
      await expect(meldung(page)).toContainText(`Ersetzt: ${f.stelle} „${f.tippt}“ → „${f.schnellwert}“`);
      const rueck = meldung(page).getByRole("button", { name: "Rückgängig" });
      // Der Arzt schreibt die Stelle neu, während die Meldung noch steht (Prüfskript P40). Der Schnellwert ging weiter;
      // das nächste Fenster schließt Esc.
      if (await feldfenster(page).isVisible()) await page.keyboard.press("Escape");
      await stelle(ab, new RegExp(`^${f.stelle}: `)).first().click();
      await feldfenster(page).locator("input, textarea").first().click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type(f.neu);
      await page.keyboard.press("Tab");
      await expect(stelle(ab, new RegExp(`^${f.stelle}: ${f.neu}`)).first()).toBeVisible();
      await expect(meldung(page)).toContainText(`Ersetzt: ${f.stelle}`);
      const vor = await stand(page);
      await rueck.click();
      await expect(meldung(page)).toContainText("Nichts zurückzunehmen: Die Stelle ist inzwischen geändert.");
      expect(aenderungen(vor, await stand(page))).toEqual([]);
      await expect(stelle(ab, new RegExp(`^${f.stelle}: ${f.neu}`)).first()).toBeVisible();
    });
  }
});

test.describe("QA-31, QA-32: Die Rücknahmemeldung nennt jede Stelle einmal, mit dem Stand danach, und alle", () => {
  /** Wortlaut der Meldung, ohne dass Playwright Leerraum zusammenfasst. */
  const text = async (page: Page) => (await meldung(page).first().textContent()) ?? "";

  test("QA-31: OSG, vorletzte Zeile angeklickt, „u“, 0,4 s, „n“, 0,4 s, „d“", async ({ page }) => {
    await osg(page);
    await liste(page);
    const n = await page.locator(".befundliste [data-zeile]").count();
    const vor = await stand(page);
    await zeile(page, n - 2).click({ position: { x: 12, y: 8 } });
    await tippe(page, "und", 400);
    await nachDemNaechstenBild(page);
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    const t = await text(page);
    // Bisher: „Durchblutung/Motorik/Sensibilität (jetzt: wieder Vorschlag) und Durchblutung/Motorik/Sensibilität (jetzt:
    // unauffällig) und 1 weitere“: der Zwischenstand nach der ersten Taste als „jetzt“, Kompartmentsyndrom ungenannt.
    expect(t).toContain("Zurückgenommen, weil gleich weitergetippt: Durchblutung/Motorik/Sensibilität und Kompartmentsyndrom (jetzt: wieder Vorschlag). Verworfen: „d“");
    expect(t.match(/Durchblutung\/Motorik\/Sensibilität/g)).toHaveLength(1);
    expect(t).not.toContain("weitere");
  });

  test("CR-TS14: Rückgängig nach eigener Änderung dazwischen nennt nur, was zurückging, mit dem Stand danach", async ({ page }) => {
    await osg(page);
    await liste(page);
    const n = await page.locator(".befundliste [data-zeile]").count();
    await zeile(page, n - 2).focus();
    await taste(page, "u");
    await taste(page, "u");
    await tippe(page, "⏎");
    await nachDemNaechstenBild(page);
    const rueck = meldung(page).getByRole("button", { name: "Rückgängig" });
    await expect(rueck).toBeVisible();
    // Die Ärztin ändert die erste Zeile selbst auf „auffällig“; Rückgängig lässt sie so und nimmt nur die zweite zurück.
    await zeile(page, n - 2).getByRole("radio", { name: "auffällig", exact: true }).click();
    await rueck.click();
    await expect(meldung(page)).toContainText("Zurückgenommen: ");
    const t = await text(page);
    expect(t).toContain("Zurückgenommen: Kompartmentsyndrom (jetzt: wieder Vorschlag)");
    expect(t).not.toContain("Durchblutung");
  });

  test("QA-32: Abszess „Unterarm“, Enter, Pause, „und Hand“ langsam", async ({ page }) => {
    await vorlage(page, "abszess", "Weichteilinfekt, Abszess");
    await stelle(page, /^Region: /).first().click();
    await tippe(page, "Unterarm⏎", TEMPO.langsam);
    await pause(page, 350);
    await tippe(page, "und Hand", TEMPO.langsam);
    await nachDemNaechstenBild(page);
    const t = await text(page);
    expect(t).toContain("Zurückgenommen, weil gleich weitergetippt: Rötung und Schwellung (jetzt: wieder offen). Verworfen:");
    expect(t).not.toContain("weitere");
  });

  test("QA-32: Schnittwunde „3 cm“, Enter, 0,5 s, „unauffällig“ langsam", async ({ page }) => {
    await vorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
    await liste(page);
    await page.locator(".befundliste [data-zeile]").filter({ hasText: "Wundlänge" }).locator("input").click();
    await tippe(page, "3 cm⏎", TEMPO.langsam);
    await pause(page, 500);
    await tippe(page, "unauffällig", TEMPO.langsam);
    await nachDemNaechstenBild(page);
    const t = await text(page);
    expect(t).toContain("Zurückgenommen, weil gleich weitergetippt: 4 Stellen: Wundränder, Verschmutzung und Wundgrund, Fremdkörper (jetzt: wieder offen); Blutung (jetzt: wieder Vorschlag). Verworfen:");
    expect(t).not.toContain("weitere");
  });
});
