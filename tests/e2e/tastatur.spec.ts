// Tastatursicherheit nach Grundsatz E-43 (Prüfberichte vom 07.11.2026: Patientensicherheit PS-K01 bis PS-K08,
// Code-Review CR-K01 und CR-K02, Browserprüfung QA-01 bis QA-06). Jeder Test vergleicht den ganzen Brief vor und nach
// den Tasten, nicht nur die Zielstelle. Tests mit „langsamer Rechner“ drosseln die CPU und schicken die Tasten ohne Pause.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { abschnitt, aenderungen, bereit, feldfenster, meldung, nachDemNaechstenBild, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, stand, stelle, tastenSalve, tippe, warte } from "./hilfen.ts";
import { gewohnheitZifferEnter, hauptweg, lage, taste, vorlageMitKopf } from "./durchlauf.ts";

async function wunde(page: Page) {
  await oeffneApp(page);
  await oeffneVorlage(page, "schnittwunde", "Schnittwunde, Riss-Quetschwunde");
  await setzeSeiteUndPerson(page, "rechts", "Patient");
}

async function osg(page: Page, mitKopf = true) {
  await oeffneApp(page);
  await oeffneVorlage(page, "osg", "OSG-Distorsion");
  if (mitKopf) await setzeSeiteUndPerson(page, "rechts", "Patient");
}

/** Zustand des Befunds im Brief, der zu einer Zeile der Befundliste gehört. */
async function befundZustand(page: Page, zeile: number): Promise<string> {
  const k = await page.locator(".befundliste [data-zeile]").nth(zeile).getAttribute("data-zeile");
  return page.locator(`.tok[data-key="${k}"]`).first().evaluate((el) => [...el.classList].find((c) => c.startsWith("z-")) ?? "");
}

test.describe("PS-K01 und CR-K02: Enter setzt nie, was der Arzt nicht markiert hat", () => {
  test("Ziffer, Enter: das Enter ändert an der nächsten Stelle nichts (Schnittwunde, Tetanus)", async ({ page }) => {
    await wunde(page);
    const th = abschnitt(page, "therapie");
    await stelle(th, /^Tetanus: /).click();
    await taste(page, "2");
    const vor = await stand(page);
    await taste(page, "Enter");
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    await expect(stelle(th, "Tetanus: Tetanus-Auffrischimpfung nach Aufklärung verabreicht.")).toBeVisible();
  });

  // Je ein Halt jeder Art (CR-TS03): Enter bleibt dort stehen, deshalb genügen drei.
  test("nur Enter am Halt Seitenwahl: keine Stelle ändert sich, auch die Seite nicht (OSG ohne Seite)", async ({ page }) => {
    await osg(page, false);
    await taste(page, "F2");
    expect((await lage(page)).art).toBe("seite");
    const vor = await stand(page);
    for (let i = 0; i < 3; i++) await taste(page, "Enter");
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("OSG-Distorsion");
  });

  test("nur Enter am Halt Fenster: keine Angabe wird gesetzt (OSG, Art der Vorstellung)", async ({ page }) => {
    await osg(page);
    await taste(page, "F2");
    expect((await lage(page)).art).toBe("wahl");
    const vor = await stand(page);
    for (let i = 0; i < 3; i++) await taste(page, "Enter");
    expect(aenderungen(vor, await stand(page))).toEqual([]);
  });

  test("nur Enter am Halt Befundliste: kein Normalbefund wird gesetzt, der Zeiger geht zur nächsten offenen Zeile darunter", async ({ page }) => {
    await osg(page);
    await abschnitt(page, "befund").locator("[data-pruefen]").first().click();
    await expect(page.locator(".befundliste")).toBeVisible();
    const vor = await stand(page);
    for (let i = 0; i < 3; i++) await taste(page, "Enter");
    expect(aenderungen(vor, await stand(page))).toEqual([]);
    await expect(page.locator(".befundliste")).toBeVisible();
  });

  test("nur Enter am Halt Vorschlagsblock: nichts wird übernommen (OSG, Procedere)", async ({ page }) => {
    await osg(page);
    await stelle(abschnitt(page, "procedere"), /^Kontrolle: /).first().click();
    await taste(page, "1");
    await taste(page, "2");
    expect((await lage(page)).art).toBe("block");
    const vor = await stand(page);
    for (let i = 0; i < 3; i++) await taste(page, "Enter");
    expect(aenderungen(vor, await stand(page))).toEqual([]);
  });

  for (const [suche, titel] of [
    ["schnittwunde", "Schnittwunde, Riss-Quetschwunde"],
    ["osg", "OSG-Distorsion"],
    ["radiusfraktur konservativ", "Distale Radiusfraktur konservativ"],
    ["sht", "Schädel-Hirn-Trauma"],
    ["kopfplatzwunde", "Kopfplatzwunde"],
    ["fremdkörper", "Fremdkörper in den Weichteilen"],
    ["mhk", "MHK-Fraktur konservativ"],
    ["kniedistorsion", "Kniedistorsion"],
    ["bissverletzung", "Bissverletzung"],
    ["panaritium", "Panaritium"],
  ]) {
    test(`Gewohnheit „Ziffer, Enter“: kein Enter ändert den Brief (${titel})`, async ({ page }) => {
      await oeffneApp(page);
      await vorlageMitKopf(page, suche, titel);
      const { enter, ungewollt, rest } = await gewohnheitZifferEnter(page);
      test.info().annotations.push({ type: "Enter nach Ziffer", description: `${enter} Enter, ${ungewollt.length} mit Änderung` });
      expect(enter).toBeGreaterThan(0);
      expect(ungewollt).toEqual([]);
      // Der Lauf ist durch: Übrig sind nur Befundlisten, Vorschlagsblöcke und graue Sätze, die er absichtlich auslässt (CR-TS02).
      expect(rest).toEqual([]);
    });
  }
});

test("PS-K02 mehrzeiliges Feld: Enter macht eine neue Zeile, der weitere Text bleibt im Feld", async ({ page }) => {
  await wunde(page);
  const an = abschnitt(page, "anamnese");
  await stelle(an, /^Unfallhergang: /).click();
  const vor = await stand(page);
  await page.keyboard.type("Beim Gemüseschneiden mit dem Küchenmesser geschnitten.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Seit 2 Stunden blutend, keine weiteren Verletzungen.");
  await nachDemNaechstenBild(page);
  const geaendert = aenderungen(vor, await stand(page));
  expect(geaendert).toHaveLength(1);
  expect(geaendert[0]).toContain("Beim Gemüseschneiden mit dem Küchenmesser geschnitten.");
  expect(geaendert[0]).toContain("Seit 2 Stunden blutend, keine weiteren Verletzungen.");
});

test("PS-K02 einzeiliges Feld: Enter geht weiter; vertippter Text im nächsten Fenster setzt nichts, auch nicht seine Ziffer", async ({ page }) => {
  await wunde(page);
  const an = abschnitt(page, "anamnese");
  await stelle(an, /^Unfallzeitpunkt: /).click();
  const vor = await stand(page);
  await page.keyboard.type("heute gegen 14 Uhr");
  await page.keyboard.press("Enter");
  await page.keyboard.type("zu Hause beim Kochen, 1 Schnitt");
  await nachDemNaechstenBild(page);
  const geaendert = aenderungen(vor, await stand(page));
  expect(geaendert).toHaveLength(1);
  expect(geaendert[0]).toMatch(/Unfallzeitpunkt: .*heute gegen 14 Uhr/);
});

test("PS-K03 auffälliger Befund kippt nicht per U auf den Normalsatz", async ({ page }) => {
  await osg(page);
  await abschnitt(page, "befund").locator("[data-pruefen]").first().click();
  await expect(page.locator(".befundliste")).toBeVisible();
  for (const k of ["u", "a", "1"]) await taste(page, k);
  // Erst nach dem Ende des Zugs: Gleich danach wäre das U eine Taste ohne Bedeutung und nähme den Zug zurück (CR-TS15).
  await warte(page, 1600);
  await taste(page, "u");
  expect(await befundZustand(page, 0)).toBe("z-ok");
  // Zeile 2 bleibt auffällig (dem Satz fehlt noch der Ort, deshalb ist die Stelle offen, nicht unauffällig).
  const zeile2 = page.locator(".befundliste [data-zeile]").nth(1);
  await expect(zeile2.getByRole("radio", { name: "auffällig", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(await befundZustand(page, 1)).not.toBe("z-ok");
  // Der Hinweis steht in der Meldungszeile, nicht unten in der Liste außer Sicht (QA-21).
  await expect(meldung(page)).toContainText("auffällig erfasst");
  // Per Klick geht es, mit Meldung und Rückgängig.
  await zeile2.getByRole("radio", { name: "unauffällig", exact: true }).click();
  await expect(meldung(page)).toContainText("jetzt unauffällig (vorher auffällig)");
  await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
  await expect(zeile2.getByRole("radio", { name: "auffällig", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("PS-K04, E-44 und E-45 langsamer Rechner: die zweite vorausgetippte Ziffer wählt nirgends, und die erste geht mit ihr zurück", async ({ page }) => {
  await wunde(page);
  const th = abschnitt(page, "therapie");
  await stelle(th, /^Lokalanästhesie: /).click();
  const vor = await stand(page);
  await tastenSalve(page, ["1", "2"]);
  // Die „2“ kam, bevor der nächste Halt (Wundverschluss) zu sehen war: verworfen. Sie verrät, dass auch die „1“ blind
  // getippt war; beide zusammen zurück, in einer Meldung (E-45 Satz 2). Lokalanästhesie ist wieder offen.
  expect(aenderungen(vor, await stand(page))).toEqual([]);
  await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt: „Lokalanästhesie“ (jetzt: wieder offen). Verworfen: „2“ (zu früh nach dem Weiterspringen).");
  await expect(stelle(th, /^Lokalanästhesie: .*fehlt noch$/)).toBeFocused();
});

test("PS-K05 langsamer Rechner: Escape direkt nach dem Öffnen schließt; Enter oder Ziffer danach setzen nichts", async ({ page }) => {
  await wunde(page);
  const tetanus = stelle(abschnitt(page, "therapie"), /^Tetanus: /);
  await tetanus.focus();
  // Der Arzt sieht die Stelle an, bevor er tippt; vorausgetippt ist erst, was danach kommt.
  await bereit(page);
  const vor = await stand(page);
  await tastenSalve(page, ["Enter", "Escape", "Enter"]);
  expect(aenderungen(vor, await stand(page))).toEqual([]);
  // Das Öffnen ist ein Sprung (E-45 Satz 1): Das zweite Enter kam vor dem neuen Bild und öffnet nicht noch einmal.
  await expect(feldfenster(page)).toHaveCount(0);
  await expect(meldung(page)).toContainText("Verworfen: Enter (zu früh nach dem Weiterspringen).");
  // Mit einer Ziffer statt Enter: Das Fenster ist zu, die Ziffer trifft die Stelle im Brief und setzt dort nichts.
  await page.keyboard.press("ArrowDown");
  await tetanus.focus();
  await bereit(page);
  await tastenSalve(page, ["Enter", "Escape", "1"]);
  await expect(feldfenster(page)).toHaveCount(0);
  expect(aenderungen(vor, await stand(page))).toEqual([]);
});

test("PS-K06, E-45 und E-48 langsamer Rechner: „+ …“ öffnet im selben Ereignis; die vorausgetippte Ziffer kam vor dem Bild, der Zusatz bleibt und wird genannt", async ({ page }) => {
  await osg(page);
  const plus = page.getByRole("button", { name: "+ Tetanusschutz" });
  await plus.focus();
  await bereit(page);
  const vor = await stand(page);
  await tastenSalve(page, ["Enter", "2"]);
  // Früher wählte die „2“ im neuen Fenster. Seit E-45 beginnt mit dem Öffnen die Schreckzeit: Die „2“ ist verworfen und
  // verrät den blinden Zug. Den angefügten Zusatz nimmt die App seit E-48 nicht still weg (PS-N13): Er bleibt, seine
  // Angabe ist offen und hält das Kopieren auf, die Meldung nennt ihn.
  const neu = aenderungen(vor, await stand(page));
  expect(neu).toHaveLength(1);
  expect(neu[0]).toContain("Tetanus");
  expect(neu[0]).toContain("z-offen");
  await expect(meldung(page)).toContainText("Im Brief geblieben: „Tetanusschutz“ (angefügt, bitte prüfen).");
  await expect(meldung(page)).not.toContainText("Zurückgenommen");
  await expect(meldung(page)).toContainText("Verworfen: „2“ (zu früh nach dem Weiterspringen).");
  // Gegenprobe: Das Fenster des Zusatzes steht offen; nach dem Lösen mit einer Pfeiltaste wählt die Ziffer wie bisher.
  await expect(feldfenster(page)).toHaveAttribute("aria-label", /^Tetanusschutz/);
  await taste(page, "ArrowDown");
  await taste(page, "2");
  await expect(stelle(page, /^Tetanusschutz: .*nach Angabe aktuell/)).toBeVisible();
});

test("PS-K07 und E-45 langsamer Rechner: schnell getippte Befundentscheidungen setzen keine Zeile, die der Arzt nicht gesehen hat", async ({ page }) => {
  await osg(page);
  await abschnitt(page, "befund").locator("[data-pruefen]").first().click();
  await expect(page.locator(".befundliste")).toBeVisible();
  const vor = await stand(page);
  const zeilenVor = [await befundZustand(page, 0), await befundZustand(page, 1), await befundZustand(page, 2)];
  await tastenSalve(page, ["u", "u", "u"]);
  // Der Zeiger rückt nach jedem Befehl, das ist ein Sprung (E-45 Satz 1): Das zweite U kam vor dem Bild der nächsten
  // Zeile. Es verrät den blinden Zug; das erste U geht mit zurück.
  expect([await befundZustand(page, 0), await befundZustand(page, 1), await befundZustand(page, 2)]).toEqual(zeilenVor);
  expect(aenderungen(vor, await stand(page))).toEqual([]);
  await expect(meldung(page)).toContainText("Zurückgenommen, weil gleich weitergetippt:");
  await expect(meldung(page)).toContainText("Verworfen: „uu“ (zu früh nach dem Weiterspringen).");
  // Der Fokus steht wieder auf der ersten Zeile.
  await expect(page.locator(".befundliste [data-zeile]").first()).toBeFocused();
});

test("PS-K07 Gegenprobe: dieselben drei U im Abstand von 400 ms setzen je ihre Zeile", async ({ page }) => {
  await osg(page);
  await abschnitt(page, "befund").locator("[data-pruefen]").first().click();
  await expect(page.locator(".befundliste")).toBeVisible();
  await tippe(page, "uuu", 400);
  await nachDemNaechstenBild(page);
  expect([await befundZustand(page, 0), await befundZustand(page, 1), await befundZustand(page, 2)]).toEqual(["z-ok", "z-ok", "z-ok"]);
});

test("CR-K13 gehaltene Ziffer wählt einmal, nicht noch einmal im nächsten Fenster", async ({ page }) => {
  await wunde(page);
  const th = abschnitt(page, "therapie");
  await stelle(th, /^Lokalanästhesie: /).click();
  // Wie eine Taste, die länger als die Wiederholverzögerung gedrückt bleibt: ein Druck, dann Wiederholungen.
  const cdp = await page.context().newCDPSession(page);
  const d = { key: "1", code: "Digit1", windowsVirtualKeyCode: 49 };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...d, text: "1" });
  await nachDemNaechstenBild(page);
  await expect(feldfenster(page)).toBeVisible();
  const vor = await stand(page);
  for (let i = 0; i < 4; i++) {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...d, text: "1", autoRepeat: true });
    await nachDemNaechstenBild(page);
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...d });
  await cdp.detach();
  expect(aenderungen(vor, await stand(page))).toEqual([]);
});

test("PS-K08 Seitenfenster: eine Ziffer ändert nur den Baustein, nie den ganzen Brief", async ({ page }) => {
  await wunde(page);
  await stelle(abschnitt(page, "befund"), /^Seite: rechts/).first().click();
  await taste(page, "2");
  // Nur der Baustein ist links; der Brief bleibt rechts (der Kopf nennt die abweichende Seite dazu).
  await expect(page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: "rechts", exact: true })).toBeChecked();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Schnittwunde, Riss-Quetschwunde RECHTS + LINKS");
  // Den ganzen Brief ändern: zweimal dieselbe Wahl, dann nennt die Meldung alte und neue Seite.
  await stelle(abschnitt(page, "diagnose"), /^Seite: rechts/).first().click();
  const ganz = feldfenster(page).getByRole("radiogroup", { name: "Seite des ganzen Briefs" });
  await ganz.getByRole("radio", { name: "links", exact: true }).click();
  await expect(page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: "rechts", exact: true })).toBeChecked();
  await ganz.getByRole("radio", { name: "links", exact: true }).click();
  await expect(meldung(page)).toContainText("Seite des ganzen Briefs: links (vorher rechts)");
  await expect(page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: "links", exact: true })).toBeChecked();
});

test("CR-K01 Entweder-oder-Fenster: Ziffern in einem anderen Eingabefeld wählen keinen Baustein", async ({ page }) => {
  await wunde(page);
  const an = abschnitt(page, "anamnese");
  await an.getByRole("button", { name: "Weitere Aktionen für Anamnese" }).click();
  await page.getByRole("menu").getByRole("button", { name: "Als eigenen Baustein speichern …" }).click();
  const name = page.locator(".bausteinwahl input[type=text]");
  await name.fill("Wunde Standard");
  const pr = abschnitt(page, "procedere");
  await stelle(pr, /^Ambulante Versorgung, Operation oder Verlegung\?: /).click();
  await expect(feldfenster(page)).toBeVisible();
  const vor = await stand(page);
  await name.click();
  await page.keyboard.type(" 2 Tage");
  await expect(name).toHaveValue("Wunde Standard 2 Tage");
  expect(aenderungen(vor, await stand(page))).toEqual([]);
});

test("QA-01 Strg+Enter auf einer Lücke kopiert nur und öffnet kein Fenster", async ({ page }) => {
  await wunde(page);
  await stelle(abschnitt(page, "therapie"), /^Tetanus: /).focus();
  const vor = await stand(page);
  await taste(page, "Control+Enter");
  await expect(meldung(page)).toContainText("Nicht kopiert");
  await expect(feldfenster(page)).toHaveCount(0);
  await taste(page, "1");
  expect(aenderungen(vor, await stand(page))).toEqual([]);
});

test("QA-02 nach einer Angabe am Anfang eines Befundblocks kommt die Befundliste desselben Blocks", async ({ page }) => {
  await oeffneApp(page);
  await vorlageMitKopf(page, "luxationsfraktur mittelgelenk", "Luxationsfraktur des Mittelgelenks");
  await stelle(abschnitt(page, "befund"), /^betroffener Finger: /).first().click();
  await taste(page, "3");
  await expect(page.locator(".befundliste")).toBeVisible();
  await expect(feldfenster(page)).toHaveCount(0);
});

test("QA-02 nach einer Entweder-oder-Wahl kommt die erste Lücke des gewählten Bausteins", async ({ page }) => {
  await oeffneApp(page);
  await vorlageMitKopf(page, "luxationsfraktur mittelgelenk", "Luxationsfraktur des Mittelgelenks");
  const pr = abschnitt(page, "procedere");
  await stelle(pr, /oder .*\?: .*fehlt noch$/).first().click();
  const vor = await stand(page);
  await feldfenster(page).getByRole("option", { name: /Handsprechstunde zur Operation/ }).click();
  await nachDemNaechstenBild(page);
  const nachher = await stand(page);
  const neuOffen = Object.keys(nachher).filter((k) => !(k in vor) && nachher[k].startsWith("z-offen"));
  expect(neuOffen.length).toBeGreaterThan(0);
  const erste = await page.locator(`[data-key="${neuOffen[0]}"]`).first().getAttribute("aria-label");
  await expect(feldfenster(page)).toHaveAttribute("aria-label", erste!.split(": ")[0]);
});

test("QA-02 Fall 6: nach der Wahl eines Bausteins, der nur aus einem Vorschlag besteht, hat dieser Block den Fokus", async ({ page }) => {
  await oeffneApp(page);
  await vorlageMitKopf(page, "luxationsfraktur mittelgelenk", "Luxationsfraktur des Mittelgelenks");
  const pr = abschnitt(page, "procedere");
  const offen = stelle(pr, /Wunde.*\?: .*fehlt noch$/).first();
  await offen.click();
  await feldfenster(page).getByRole("option", { name: /Keine Wunde im Bereich der Fraktur/ }).click();
  await nachDemNaechstenBild(page);
  const l = await lage(page);
  expect(l.art).toBe("block");
});

test("QA-03 Seitenwahl im Fallkopf: Pfeil markiert, Enter setzt das Markierte; Ziffern wählen", async ({ page }) => {
  await osg(page, false);
  const seite = page.getByRole("radiogroup", { name: "Seite", exact: true });
  await taste(page, "F2");
  // Halt: Die Gruppe hat den Fokus, nichts ist markiert; Enter wählt nichts.
  await expect(seite).toBeFocused();
  await taste(page, "Enter");
  await expect(seite.getByRole("radio", { checked: true })).toHaveCount(0);
  // Pfeil markiert den ersten, der zweite Pfeil den nächsten; Enter wählt den markierten.
  await taste(page, "ArrowRight");
  await expect(seite.getByRole("radio", { name: "rechts", exact: true })).toBeFocused();
  await taste(page, "ArrowRight");
  await expect(seite.getByRole("radio", { name: "links", exact: true })).toBeFocused();
  await taste(page, "Enter");
  await expect(seite.getByRole("radio", { name: "links", exact: true })).toBeChecked();
});

test("QA-03 Seitenwahl im Fallkopf: die Ziffer am Halt wählt die Seite und geht weiter; eine gesetzte Seite ändert dieselbe Ziffer zweimal", async ({ page }) => {
  await osg(page, false);
  const seite = page.getByRole("radiogroup", { name: "Seite", exact: true });
  await taste(page, "F2");
  await taste(page, "2");
  await expect(seite.getByRole("radio", { name: "links", exact: true })).toBeChecked();
  await expect(page.getByRole("radiogroup", { name: "Patient oder Patientin" })).toBeFocused();
  await seite.getByRole("radio", { name: "links", exact: true }).focus();
  await taste(page, "1");
  await expect(seite.getByRole("radio", { name: "links", exact: true })).toBeChecked();
  await taste(page, "1");
  await expect(seite.getByRole("radio", { name: "rechts", exact: true })).toBeChecked();
  await expect(meldung(page)).toContainText("Seite des ganzen Briefs: rechts (vorher links)");
});

test("QA-04 nach der Befundliste steht die nächste Stelle sichtbar und nicht unter dem Fallkopf", async ({ page }) => {
  await oeffneApp(page);
  await vorlageMitKopf(page, "monarthritis", "Akute Monarthritis");
  await abschnitt(page, "befund").locator("[data-pruefen]").first().click();
  await expect(page.locator(".befundliste")).toBeVisible();
  for (let i = 0; i < 40 && (await page.locator(".befundliste").count()); i++) {
    const l = await lage(page);
    if (l.art !== "liste") break;
    // Steht der Fokus im Messwert einer Zeile, wird ein Wert eingetragen, nicht U oder N getippt (CR-TS04).
    if (l.imFeld) {
      await bereit(page);
      await page.keyboard.type("37,2");
      await taste(page, "Enter");
    } else if (l.zeile === null || l.offen === 0) await taste(page, "Enter");
    else if (l.zeile.includes("bz-offen")) await taste(page, l.normal ? "u" : "n");
    else if (l.zeile.includes("bz-vorschlag")) await taste(page, "ü");
    else if (l.zeile.includes("bz-luecke") || l.zeile.includes("bz-einstufig")) await taste(page, "1");
    else await taste(page, "Enter");
  }
  await expect(feldfenster(page)).toBeVisible();
  const lagen = await page.evaluate(() => {
    const kopf = document.querySelector(".fallkopf")?.getBoundingClientRect().bottom ?? 0;
    const f = document.querySelector(".feldfenster")!.getBoundingClientRect();
    const a = document.activeElement!.getBoundingClientRect();
    return { kopf, fensterOben: f.top, fensterUnten: f.bottom, fokusOben: a.top, fokusUnten: a.bottom, hoehe: innerHeight };
  });
  expect(lagen.fensterOben).toBeGreaterThanOrEqual(lagen.kopf - 1);
  expect(lagen.fokusOben).toBeGreaterThanOrEqual(lagen.kopf - 1);
  expect(lagen.fokusUnten).toBeLessThanOrEqual(lagen.hoehe + 1);
});

test("QA-05 Enter im Textfeld einer Satzlücke geht weiter", async ({ page }) => {
  await osg(page);
  await page.getByRole("button", { name: "+ Schmerzmittel gegeben" }).click();
  const titel = await feldfenster(page).getAttribute("aria-label");
  expect((await lage(page)).art).toBe("eingabe");
  await page.keyboard.type("Ibuprofen 600 mg");
  await taste(page, "Enter");
  await expect(stelle(page, /Ibuprofen 600 mg verabreicht/).first()).toBeVisible();
  // Weiter heißt: Das Fenster dieser Stelle ist zu, der Durchlauf steht an einer anderen.
  await expect(page.locator(`[role=dialog][aria-label="${titel}"]`)).toHaveCount(0);
});

test("QA-06 Hauptweg per Tastatur: OSG-Distorsion bis zum Kopieren; am Ende liegt der Fokus auf „… kopieren“", async ({ page }) => {
  await oeffneApp(page);
  const suche = page.getByRole("combobox", { name: "Diagnose oder Kürzel" });
  await suche.pressSequentially("osg re");
  await expect(page.getByRole("option").first()).toContainText("OSG-Distorsion");
  await taste(page, "Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("OSG-Distorsion RECHTS");
  await taste(page, "Enter");
  const weg = await hauptweg(page);
  let tasten = 2 + weg.tasten;
  const ende = weg.ende;
  expect(ende).toBe(true);
  await taste(page, "Control+Shift+Enter");
  tasten++;
  test.info().annotations.push({ type: "Tastendrücke", description: `${tasten} Tastendrücke bis zum kopierten Brief, dazu 6 getippte Zeichen („osg re“)` });
  console.log(`Hauptweg OSG: ${tasten} Tastendrücke + 6 getippte Zeichen`);
  await expect(meldung(page)).toContainText("Ganzer Brief kopiert");
});

// Prüfliste PS-T1 Punkte 10 und 13: In Becken, Hüfte und Knie ist die Entweder-oder-Stelle die erste Stelle der
// Anamnese; nach der Wahl per Ziffer öffnet sich die erste Lücke des gewählten Bausteins, auf beiden Wegen.
for (const [suche, titel] of [
  ["beckenring", "Beckenringfraktur konservativ"],
  ["periprothetische femurfraktur", "Periprothetische Femurfraktur bei Hüftprothese"],
  ["knieprothese", "Periprothetische Femur- oder Tibiafraktur bei Knieprothese"],
]) {
  for (const [ziffer, weg] of [["1", "Unfall"], ["2", "ohne Unfall"]]) {
    test(`T1 per Tastatur (${titel}, ${weg}): Entweder-oder-Stelle zuerst in der Anamnese, danach die erste Lücke des gewählten Bausteins`, async ({ page }) => {
      await oeffneApp(page);
      await page.getByRole("radio", { name: "Station" }).click();
      await vorlageMitKopf(page, suche, titel);
      const erster = abschnitt(page, "anamnese").locator("[data-key].tok").first();
      await expect(erster).toHaveAttribute("aria-label", /^Unfall oder Beschwerden ohne Unfall\?: .*fehlt noch$/);
      await erster.click();
      expect((await lage(page)).art).toBe("wahl");
      const vor = await stand(page);
      await taste(page, ziffer);
      const nachher = await stand(page);
      const neuOffen = Object.keys(nachher).filter((k) => !(k in vor) && nachher[k].startsWith("z-offen"));
      expect(neuOffen.length).toBeGreaterThan(0);
      expect(neuOffen[0]).toMatch(ziffer === "1" ? /^ana-st-unfall\// : /^ana-st-beschwerden\//);
      const erste = await page.locator(`[data-key="${neuOffen[0]}"]`).first().getAttribute("aria-label");
      await expect(feldfenster(page)).toHaveAttribute("aria-label", erste!.split(": ")[0]);
    });
  }
}
