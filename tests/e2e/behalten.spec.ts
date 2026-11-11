// K-06, behaltene Stationsfälle (E-50, E-67): Einschalten mit Erklärung, Kurzbezeichnung beim Anlegen, Neuladen, zweites
// Fenster, Ablauf nach drei Tagen mit Uhr-Attrappe, Räumen, Ausschalten, gesperrter Speicher, Tastatur.
// Gegenproben im Prüfbericht r6-k06-2026-11-10.md (Frist, Hörer für das andere Fenster, Sperre, Räumen, Neuladen), je rot.
import { expect, test } from "@playwright/test";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import { ZUGANG_SCHLUESSEL } from "../../src/access.ts";
import { abschnitt, meldung, oeffneApp, oeffneVorlage, setzeSeiteUndPerson, setzeZwischenablage, zwischenablage } from "./hilfen.ts";

// Montag, 09.11.2026, 14:10 in Berlin (Zeitzone der Klicktests).
const MONTAG = new Date("2026-11-09T14:10:00+01:00");
const KOXARTHROSE = "Koxarthrose, Hüft-Totalendoprothese";

const kopf = (page: Page) => page.locator(".fallkopf");
const liste = (page: Page) => page.getByRole("region", { name: "Behaltene Fälle" });
const zeile = (page: Page, kurz: string) => liste(page).locator(`[data-behalten-zeile="${kurz}"]`);
const reiter = (page: Page) => page.getByRole("navigation", { name: "Offene Fälle" });
const gespeichert = (page: Page) => page.evaluate(() => window.localStorage.getItem("kitteltext3.behalten"));

/** Ob alle Teile eines Elements auf einer Zeile stehen (gleiche Oberkante des ersten und letzten Kinds). */
async function einzeilig(page: Page, selektor: string): Promise<boolean> {
  return page.locator(selektor).evaluate((el) => {
    const kinder = [...el.children] as HTMLElement[];
    const a = kinder[0].getBoundingClientRect();
    const b = kinder[kinder.length - 1].getBoundingClientRect();
    return Math.abs(a.top - b.top) < 2;
  });
}

/**
 * Reiterleiste (QA-44): Ist der offene Reiter mit seinem × ganz zu sehen und nicht von „+ Neuer Fall“ verdeckt, und ist
 * „+ Neuer Fall“ selbst zu sehen? Geprüft wird auch, was an der Stelle wirklich oben liegt.
 */
async function reiterImBlick(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector("nav.reiter")!.getBoundingClientRect();
    const eintrag = document.querySelector("[data-reiter-offen]");
    const neuEl = document.querySelector(".reiter-neu");
    if (!eintrag || !neuEl) return { reiter: false, zu: false, neu: false };
    const neu = neuEl.getBoundingClientRect();
    const zuEl = eintrag.querySelector(".reiter-zu")!;
    const r = eintrag.getBoundingClientRect();
    const zu = zuEl.getBoundingClientRect();
    const drin = (x: DOMRect) => x.left >= nav.left - 0.5 && x.right <= nav.right + 0.5;
    const oben = (x: DOMRect, el: Element) => el.contains(document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2));
    return {
      reiter: drin(r) && r.right <= neu.left + 0.5,
      zu: drin(zu) && oben(zu, zuEl),
      neu: drin(neu) && oben(neu, neuEl),
    };
  });
}

/** Wie der Browser ein Farbtoken auflöst („rgb(…)“), zum Vergleich mit berechneten Stilen. */
async function tokenFarbe(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const farbe = getComputedStyle(probe).color;
    probe.remove();
    return farbe;
  }, token);
}

async function einstellungen(page: Page) {
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  return page.getByRole("dialog", { name: "Einstellungen" });
}

async function einschalten(page: Page) {
  const dialog = await einstellungen(page);
  await dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" }).getByRole("radio", { name: "an" }).click();
  const frage = dialog.getByRole("group", { name: "Stationsfälle behalten einschalten?" });
  await expect(frage.getByRole("button", { name: "Einschalten" })).toBeFocused();
  await frage.getByRole("button", { name: "Einschalten" }).click();
  await expect(dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" }).getByRole("radio", { name: "an" })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Schließen" }).click();
}

/** Stationsfall anlegen und unter `kurz` behalten (über die Frage beim Anlegen). */
async function behalteneHuefte(page: Page, kurz = "Zi 12 Fenster") {
  await oeffneVorlage(page, "Koxarthrose", KOXARTHROSE);
  const frage = page.getByRole("dialog", { name: "Fall behalten?" });
  await expect(frage).toBeVisible();
  const feld = frage.getByRole("textbox", { name: "Kurzbezeichnung" });
  await expect(feld).toBeFocused();
  await feld.fill(kurz);
  await frage.getByRole("button", { name: "Behalten" }).click();
  await expect(frage).toHaveCount(0);
  await expect(kopf(page).locator("[data-behalten]")).toContainText(`Behalten · „${kurz}“`);
}

/** Zweites Fenster im selben Browser: gleicher dauerhafter Speicher, eigener Sitzungsspeicher. */
async function zweitesFenster(context: BrowserContext): Promise<Page> {
  const p = await context.newPage();
  await p.goto("");
  await expect(p.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
  return p;
}

test.describe("Behaltene Stationsfälle (K-06)", () => {
  test("Ab Werk aus; Einschalten erklärt, was wie lange wo liegt, und fragt nach Bestätigung", async ({ page }) => {
    await oeffneApp(page);
    await expect(liste(page)).toHaveCount(0);
    const dialog = await einstellungen(page);
    const gruppe = dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" });
    await expect(gruppe.getByRole("radio", { name: "aus" })).toHaveAttribute("aria-checked", "true");
    await gruppe.getByRole("radio", { name: "an" }).click();
    const frage = dialog.getByRole("group", { name: "Stationsfälle behalten einschalten?" });
    for (const teil of [/ganze Arbeitsstand/, /Höchstens 3 Tage ab Beginn/, /beim Start und jede Minute/, /unter demselben Windows-Konto/, /keine Namen und keine Geburtsdaten/, /Arbeitsplatz räumen/, /Notaufnahmefälle bleiben/]) {
      await expect(frage).toContainText(teil);
    }
    // Wortlaut nach MT-R6-10: Daten des Aufenthalts genannt, Bezugspunkt der Frist, dieser Browser, alle Wege zum Löschen.
    for (const teil of [
      "Bausteine, Befunde, Werte, Daten des Aufenthalts und freier Text.",
      "ab Beginn des Falls, nicht ab der letzten Änderung.",
      "an diesem PC diesen Browser unter demselben Windows-Konto",
      "Löschen: einzeln unter „Behaltene Fälle“, nach „Alles kopiert · Fall löschen“, alle mit „Arbeitsplatz räumen“ oder beim Ausschalten, wenn du es wählst.",
    ]) {
      await expect(frage).toContainText(teil);
    }
    // Abbrechen lässt es aus; Esc ebenso, ohne den Dialog zu schließen.
    await frage.getByRole("button", { name: "Abbrechen" }).click();
    await expect(gruppe.getByRole("radio", { name: "aus" })).toHaveAttribute("aria-checked", "true");
    await gruppe.getByRole("radio", { name: "an" }).click();
    await page.keyboard.press("Escape");
    await expect(frage).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(gruppe.getByRole("radio", { name: "aus" })).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("button", { name: "Schließen" }).click();
    // Aus: Ein Stationsfall fragt nicht.
    await oeffneVorlage(page, "Koxarthrose", KOXARTHROSE);
    await expect(page.getByRole("dialog", { name: "Fall behalten?" })).toHaveCount(0);
    await expect(kopf(page).locator("[data-behalten]")).toHaveCount(0);
    expect(await gespeichert(page)).toBeNull();
    // Einschalten: Meldung und Hilfe nennen, wer fragt und ab wann die Frist läuft; bei null „keine“ (MT-R6-09, MT-R6-14, DS-R6-10).
    const wieder = await einstellungen(page);
    await wieder.getByRole("radiogroup", { name: "Stationsfälle behalten" }).getByRole("radio", { name: "an" }).click();
    await wieder.getByRole("group", { name: "Stationsfälle behalten einschalten?" }).getByRole("button", { name: "Einschalten" }).click();
    await expect(meldung(page)).toHaveText("Eingeschaltet. Bei jedem neuen Stationsfall fragt die App jetzt nach einer Kurzbezeichnung.");
    await expect(wieder.locator("#behalten-es-hilfe")).toHaveText("An: Stationsfälle bleiben unter einer Kurzbezeichnung höchstens 3 Tage ab Beginn auf diesem PC. Zurzeit keine behaltenen Fälle.");
  });

  test("Anlegen mit Kurzbezeichnung, Hinweis gegen Geburtsdatum, Neuladen behält Fall und Eingaben", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await oeffneVorlage(page, "Koxarthrose", KOXARTHROSE);
    const frage = page.getByRole("dialog", { name: "Fall behalten?" });
    await expect(frage).toContainText(/wird am Do \d\d\.11\. um \d\d:\d\d gelöscht|wird am .* gelöscht/);
    // Die Frage ist offen; der Text sagt, was Behalten hieße, nicht was schon gilt (MT-R6-21).
    await expect(frage.locator("#kurz-text")).toContainText("Behalten heißt: Der Fall bleibt auf diesem PC, auch wenn du das Fenster schließt");
    const feld = frage.getByRole("textbox", { name: "Kurzbezeichnung" });
    await expect(feld).toBeFocused();
    // Leer geht nicht, ein Datum wird angemerkt, aber nicht verboten.
    await frage.getByRole("button", { name: "Behalten" }).click();
    await expect(frage.getByRole("alert")).toHaveText("Bitte eine Kurzbezeichnung eingeben.");
    await feld.fill("12.03.1950");
    await expect(frage.locator("#kurz-hinweise")).toContainText("Enthält ein Datum. Kein Geburtsdatum eintragen.");
    // In der Form der Hinweise am Abschnitt: Strich links, neutrale Fläche, Text schwarz; nicht gelb gefüllt (DS-R6-5).
    const hinweis = await frage.locator(".kurz-hinweis").first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { flaeche: s.backgroundColor, strich: s.borderLeftWidth, text: s.color };
    });
    expect(hinweis).toEqual({ flaeche: await tokenFarbe(page, "--flaeche"), strich: "3px", text: await tokenFarbe(page, "--text") });
    await feld.fill("Zi 12 Fenster");
    await expect(frage.locator("#kurz-hinweise")).toHaveText("");
    // Ohne Hinweis ein Abstand zwischen Hilfe und Knöpfen, nicht zwei (DS-R6-7); die Live-Region bleibt im Baum.
    const abstand = await frage.evaluate((el) => Math.round(el.querySelector(".kurz-knoepfe")!.getBoundingClientRect().top - el.querySelector("#kurz-hilfe")!.getBoundingClientRect().bottom));
    expect(abstand).toBe(12);
    await expect(frage.locator("#kurz-hinweise")).toHaveAttribute("aria-live", "polite");
    await page.keyboard.press("Enter");
    await expect(frage).toHaveCount(0);
    await expect(meldung(page)).toContainText("Fall behalten als „Zi 12 Fenster“");
    await expect(reiter(page)).toContainText("Zi 12 Fenster");
    await expect(kopf(page).locator("[data-behalten]")).toContainText("begonnen heute");
    await expect(page.locator("#fk-etikett")).toHaveCount(0);
    await setzeSeiteUndPerson(page, "rechts", "Patientin");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RE");

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(KOXARTHROSE);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RE");
    await expect(kopf(page).locator("[data-behalten]")).toContainText("„Zi 12 Fenster“");
    await expect(page.getByRole("radiogroup", { name: "Patient oder Patientin" }).getByRole("radio", { name: "Patientin", exact: true })).toHaveAttribute("aria-checked", "true");
    // Der Inhalt liegt einmal auf dem PC, nicht zusätzlich im Sitzungsspeicher des Fensters.
    const sitzung = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem("kitteltext3.sitzung") ?? "{}"));
    expect(sitzung.faelle).toEqual([]);
    expect(sitzung.behalten).toHaveLength(1);
  });

  test("Blind weitergetippt: „1“ und Enter direkt nach der Frage behalten nichts", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    const suche = page.getByRole("combobox", { name: "Diagnose oder Kürzel" });
    await suche.fill("Koxarthrose");
    await expect(page.getByRole("option").first()).toContainText(KOXARTHROSE);
    await suche.press("Enter");
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");
    const frage = page.getByRole("dialog", { name: "Fall behalten?" });
    await expect(frage).toBeVisible();
    await expect(frage.getByRole("textbox", { name: "Kurzbezeichnung" })).toHaveValue("");
    expect(await gespeichert(page)).toBeNull();
    // Esc heißt: nur in diesem Fenster.
    await page.keyboard.press("Escape");
    await expect(frage).toHaveCount(0);
    // Keine eigene Zeile, der Weg zum Behalten steht als Link in der Metazeile (DS-R6-2).
    await expect(kopf(page).locator("[data-behalten]")).toHaveCount(0);
    await expect(kopf(page).locator(".fk-neben").getByRole("button", { name: "Fall behalten …" })).toBeVisible();
    expect(await gespeichert(page)).toBeNull();
  });

  test("Zweites Fenster sieht nur den behaltenen Fall, holt ihn mit Rückfrage; das erste schließt ihn", async ({ page, context }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 12 Fenster");
    // Ein Notaufnahmefall bleibt in diesem Fenster.
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await page.getByRole("radiogroup", { name: "Einsatzort" }).getByRole("radio", { name: "Notaufnahme" }).click();
    await oeffneVorlage(page, "osg", "OSG");

    const zweites = await zweitesFenster(context);
    await expect(zweites.getByRole("navigation", { name: "Offene Fälle" }).getByRole("button", { name: /Fall/ })).toHaveCount(0);
    await expect(zeile(zweites, "Zi 12 Fenster")).toContainText(KOXARTHROSE);
    await expect(zeile(zweites, "Zi 12 Fenster")).toContainText("in einem anderen Fenster oder Tab geöffnet");
    // Ein Zustand, keine Lücke: schwarz und kräftig, nicht gelb (DS-R6-5).
    const ort = await zeile(zweites, "Zi 12 Fenster").locator(".behalten-ort.anderswo").evaluate((el) => ({ farbe: getComputedStyle(el).color, gewicht: getComputedStyle(el).fontWeight }));
    expect(ort).toEqual({ farbe: await tokenFarbe(zweites, "--text"), gewicht: "600" });
    const holen = zeile(zweites, "Zi 12 Fenster").getByRole("button", { name: "„Zi 12 Fenster“ hierher holen" });
    await holen.click();
    // Sichtbare Beschriftung steht wörtlich im zugänglichen Namen (CR-R6-24, WCAG 2.5.3).
    const rueckfrage = zeile(zweites, "Zi 12 Fenster").getByRole("button", { name: "„Zi 12 Fenster“ dort schließen und hier öffnen?" });
    expect((await rueckfrage.getAttribute("aria-label"))!.toLowerCase()).toContain((await rueckfrage.innerText()).trim().toLowerCase());
    await rueckfrage.click();
    await expect(zweites.getByRole("heading", { level: 1 })).toContainText(KOXARTHROSE);
    await expect(zweites.locator(".fallkopf [data-behalten]")).toContainText("„Zi 12 Fenster“");

    await expect(meldung(page)).toContainText("„Zi 12 Fenster“ ist jetzt in einem anderen Fenster geöffnet und hier geschlossen.");
    await expect(reiter(page)).not.toContainText("Zi 12 Fenster");
    await expect(reiter(page)).toContainText("OSG");
    // Was das zweite Fenster einträgt, kommt im ersten in der Liste an, nicht als offener Fall.
    await zweites.getByRole("button", { name: "Kurzbezeichnung ändern" }).click();
    await zweites.getByRole("textbox", { name: "Kurzbezeichnung" }).fill("Zi 12 Tür");
    await zweites.getByRole("dialog", { name: "Kurzbezeichnung ändern" }).getByRole("button", { name: "Ändern" }).click();
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await expect(zeile(page, "Zi 12 Tür")).toContainText("in einem anderen Fenster oder Tab geöffnet");
  });

  test("Schließen und „Rückgängig“ melden, was geschah: Hat ein anderes Fenster den Fall, sagt die Meldung es und bietet kein „Rückgängig“, das nichts täte oder ihn wegholte (CR-R6-14, CR-R6-18)", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 12");
    // Ein anderes Fenster holt den Fall, ohne dass das Ereignis hier ankommt (Schreiben im selben Fenster löst keines aus).
    const anderswoGeholt = () =>
      page.evaluate(() => {
        const roh = JSON.parse(window.localStorage.getItem("kitteltext3.behalten")!) as { faelle: { stand: number; fenster: string | null }[] };
        roh.faelle[0] = { ...roh.faelle[0], stand: roh.faelle[0].stand + 1, fenster: "anderes-fenster" };
        window.localStorage.setItem("kitteltext3.behalten", JSON.stringify(roh));
      });
    await anderswoGeholt();
    await page.getByRole("button", { name: "Fall 1 schließen, bleibt behalten" }).click();
    await expect(meldung(page)).toContainText("Fall 1 hier geschlossen. „Zi 12“ ist inzwischen in einem anderen Fenster geöffnet oder geändert.");
    await expect(meldung(page)).not.toContainText("bleibt behalten");
    await expect(meldung(page).getByRole("button", { name: "Rückgängig" })).toHaveCount(0);

    // Über die Liste zurückgeholt (mit Rückfrage), mit dem Reiter geschlossen; dann holt ihn das andere Fenster wieder.
    await zeile(page, "Zi 12").getByRole("button", { name: "„Zi 12“ hierher holen" }).click();
    await zeile(page, "Zi 12").getByRole("button", { name: "„Zi 12“ dort schließen und hier öffnen?" }).click();
    await expect(kopf(page).locator("[data-behalten]")).toContainText("„Zi 12“");
    await page.getByRole("button", { name: /Fall \d+ schließen, bleibt behalten/ }).click();
    await expect(meldung(page)).toContainText("„Zi 12“ bleibt behalten");
    await anderswoGeholt();
    const vorher = await gespeichert(page);
    await meldung(page).getByRole("button", { name: "Rückgängig" }).click();
    await expect(meldung(page)).toContainText("„Zi 12“ ist inzwischen in einem anderen Fenster geöffnet. Hierher holen unter „Behaltene Fälle“ (Strg+K).");
    await expect(kopf(page)).toHaveCount(0);
    expect(await gespeichert(page)).toBe(vorher);
    await expect(zeile(page, "Zi 12")).toContainText("in einem anderen Fenster oder Tab geöffnet");
  });

  test("Ablauf mit Uhr-Attrappe: am zweiten Tag hervorgehoben, nach genau 3 Tagen gelöscht, offen und in der Liste", async ({ page }) => {
    await page.clock.install({ time: MONTAG });
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 12 Fenster");
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await behalteneHuefte(page, "Bett 3");
    await expect(page.getByRole("button", { name: "Fall 1 schließen, bleibt behalten" })).toHaveAttribute("title", "Fall in diesem Fenster schließen; er bleibt unter „Behaltene Fälle“ (Strg+K)");
    await page.getByRole("button", { name: "Fall 1 schließen, bleibt behalten" }).click();
    await expect(meldung(page)).toContainText("„Zi 12 Fenster“ bleibt behalten und wird am Do 12.11. um 14:10 gelöscht; wieder öffnen unter „Behaltene Fälle“ (Strg+K).");

    await page.clock.fastForward("24:00:00");
    const zeileKopf = kopf(page).locator("[data-behalten]");
    await expect(zeileKopf).toHaveClass(/alt/);
    await expect(zeileKopf).not.toHaveClass(/bald/);
    await expect(zeileKopf).toContainText("begonnen gestern 14:10");
    await expect(zeileKopf).toContainText("wird am Do 12.11. um 14:10 gelöscht");

    await page.clock.fastForward("47:58:00");
    await expect(zeileKopf).toContainText("wird heute um 14:10 gelöscht");
    await expect(zeileKopf).toHaveClass(/bald/);
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await expect(zeile(page, "Zi 12 Fenster")).toContainText("begonnen Mo 09.11. 14:10 · wird heute um 14:10 gelöscht");

    // Die regelmäßige Prüfung (jede Minute) löscht nach Ablauf, auch den Fall, der in keinem Fenster offen ist. „Bett 3“ war
    // der offene Fall: Die Meldung bleibt stehen (PS-R6-1).
    await page.clock.fastForward("00:03:00");
    await expect(page.locator("[data-stehend]")).toContainText("2 behaltene Fälle nach 3 Tagen gelöscht");
    await expect(liste(page)).toContainText("Noch kein Fall behalten. Bei jedem neuen Stationsfall fragt die App nach einer Kurzbezeichnung.");
    await expect(reiter(page)).not.toContainText("Bett 3");
    expect(await gespeichert(page)).toBeNull();
  });

  test("„Zuletzt kopiert“ geht mit dem behaltenen Fall, der abläuft; nach dem Reiter-× bleibt es (CR-R6-09)", async ({ page }) => {
    await page.clock.install({ time: MONTAG });
    await oeffneApp(page);
    await einschalten(page);
    // Commotio-Überwachung: Die Diagnose ist ohne Klären kopierbar.
    await oeffneVorlage(page, "Commotio cerebri Überwachung", "Commotio cerebri Überwachung");
    const frage = page.getByRole("dialog", { name: "Fall behalten?" });
    await frage.getByRole("textbox", { name: "Kurzbezeichnung" }).fill("Zi 9");
    await frage.getByRole("button", { name: "Behalten" }).click();
    await abschnitt(page, "diagnose").getByRole("button", { name: "Kopieren", exact: true }).click();
    await expect(meldung(page)).toContainText("kopiert");
    const leiste = page.getByRole("complementary", { name: "Prüfen und kopieren" });
    // Eine Stunde später ein zweiter behaltener Fall; er läuft eine Stunde nach dem ersten ab.
    await page.clock.fastForward(3600_000);
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await behalteneHuefte(page, "Bett 3");
    await expect(leiste).toContainText("Zuletzt kopiert");
    await expect(leiste).toContainText("Zi 9");
    // Mit dem Reiter geschlossen: Der Hinweis, was in der Zwischenablage liegt, bleibt.
    await page.getByRole("button", { name: "Fall 1 schließen, bleibt behalten" }).click();
    await expect(leiste).toContainText("Zuletzt kopiert");
    await page.clock.fastForward(71 * 3600_000 + 60_000);
    await expect(meldung(page)).toContainText("„Zi 9“ nach 3 Tagen gelöscht");
    await expect(kopf(page)).toContainText("Bett 3");
    await expect(leiste).not.toContainText("Zuletzt kopiert");
  });

  test("PS-R6-1: Läuft der offene Fall ab, wird kein anderer aktiv; Startseite mit stehender Meldung, Strg+Enter kopiert nichts", async ({ page }) => {
    await page.clock.install({ time: MONTAG });
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 12");
    await page.clock.fastForward("01:50:00");
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await behalteneHuefte(page, "Zi 14");
    // Gleiche Vorlage, später begonnen: Der Nachbar sähe genauso aus.
    await reiter(page).getByRole("button", { name: /Zi 12/ }).first().click();
    await expect(kopf(page).locator("[data-behalten]")).toContainText("„Zi 12“");
    await setzeZwischenablage(page, "vorher");

    await page.clock.fastForward((70 * 60 + 12) * 60_000);
    const stehend = page.locator("[data-stehend]");
    await expect(stehend).toHaveText(/Behaltener Fall „Zi 12“ nach 3 Tagen gelöscht\./);
    await expect(stehend).toHaveAttribute("role", "alert");
    await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
    await expect(page.locator(".fallkopf")).toHaveCount(0);
    await expect(reiter(page)).toContainText("Zi 14");
    await expect(reiter(page).locator(".reiter-eintrag.aktiv")).toHaveCount(0);
    // Strg+Enter wirkt auf keinen Brief (mit dem Nachbarn aktiv ginge sein Abschnitt in die Zwischenablage oder sie würde entwertet).
    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(300);
    expect(await zwischenablage(page)).toBe("vorher");
    // Die Meldung bleibt, bis jemand sie gelesen hat, auch über die Dauer einer gewöhnlichen Meldung hinaus.
    await page.clock.fastForward("00:00:30");
    await expect(stehend).toBeVisible();
    await stehend.getByRole("button", { name: "Verstanden" }).click();
    await expect(stehend).toHaveCount(0);
  });

  test("Fallkopf eines behaltenen Falls: eine Zeile, früherer Tag ohne Gelb, Vorwarnung, im kompakten Fallkopf stehend (PS-R6-2, E-82)", async ({ page }) => {
    await page.clock.install({ time: MONTAG });
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 12 Fenster");
    await setzeSeiteUndPerson(page, "rechts", "Patientin");
    await page.locator("#fk-alter").fill("78");
    const zeileKopf = kopf(page).locator("[data-behalten]");
    await expect(zeileKopf).toHaveText(/^Behalten · „Zi 12 Fenster“ ändern · begonnen heute 14:10 · zuletzt geändert heute 14:10 · wird am Do 12\.11\. um 14:10 gelöscht$/);
    await expect(zeileKopf.getByRole("button", { name: "Kurzbezeichnung ändern" })).toHaveText("ändern");
    // Der Beginn steht nicht zweimal (MT-R6-08).
    await expect(kopf(page).locator(".fk-typ").first()).toHaveText("Entlassbrief");
    for (const breite of [1366, 1024]) {
      await page.setViewportSize({ width: breite, height: 768 });
      expect(await einzeilig(page, ".fallkopf [data-behalten]"), `einzeilig bei ${breite} px`).toBe(true);
    }

    await page.clock.fastForward("26:00:00");
    await expect(zeileKopf).toHaveClass(/alt/);
    await expect(zeileKopf).toHaveAttribute("title", "Begonnen an einem früheren Tag: Was im Brief steht, kann von gestern sein.");
    await expect(zeileKopf.locator(".fk-behalten-alter")).toHaveCSS("font-weight", "600");
    // Gelb heißt „fehlt noch“: keine gelbe Fläche, sondern der Randstrich des Hinweises am Abschnitt (E-69, E-82).
    const farben = await zeileKopf.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.background = "var(--offen-flaeche)";
      document.body.append(probe);
      const gelb = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { flaeche: getComputedStyle(el).backgroundColor, gelb, strich: getComputedStyle(el).borderLeftWidth };
    });
    expect(farben.flaeche).not.toBe(farben.gelb);
    expect(farben.strich).toBe("3px");
    for (const breite of [1366, 1024]) {
      await page.setViewportSize({ width: breite, height: 768 });
      expect(await einzeilig(page, ".fallkopf [data-behalten]"), `einzeilig am zweiten Tag bei ${breite} px`).toBe(true);
    }
    // Reiter: Kurzbezeichnung in voller Schrift, das Alter nur als Tag, fett und nicht gelb.
    await expect(reiter(page).locator(".reiter-kurz")).toHaveText("Zi 12 Fenster");
    await expect(reiter(page).locator(".reiter-kurz")).toHaveCSS("font-weight", "600");
    await expect(reiter(page).locator(".reiter-zeit")).toHaveText("gestern");
    await expect(reiter(page).locator(".reiter-zeit")).toHaveClass(/alt/);

    // Am Klinik-PC (etwa 630 px hoch) scrollt die Zeile mit dem Brief weg; die Titelzeile trägt Kurzbezeichnung und Tag.
    await page.setViewportSize({ width: 1366, height: 633 });
    await page.locator(".papier-rahmen").evaluate((el) => el.scrollBy(0, 900));
    await expect(zeileKopf).not.toBeInViewport();
    const titel = page.locator(".fk-titel");
    await expect(titel.locator('.fk-person-teil.kurz[data-text="„Zi 12 Fenster“"]')).toBeInViewport();
    await expect(titel.locator('.fk-person-teil[data-text="Patientin, 78 J."]')).toBeInViewport();
    await expect(titel.locator('.fk-person-teil.warnung[data-text="begonnen gestern"]')).toBeInViewport();
    // Neben dem KIS (unter 1080 px) bleibt das Alter im Reiter stehen.
    await page.setViewportSize({ width: 960, height: 633 });
    await expect(reiter(page).locator(".reiter-zeit")).toBeVisible();

    // Zwei Stunden vor dem Löschen: Löschzeit fett und in der Titelzeile (Vorwarnung, Entscheidung zu PS-R6-1).
    await page.setViewportSize({ width: 1366, height: 633 });
    await page.clock.fastForward((43 * 60 + 59) * 60_000);
    await expect(zeileKopf).not.toHaveClass(/bald/);
    await expect(titel.locator(".fk-person-teil.warnung")).toHaveCount(1);
    await page.clock.fastForward("00:02:00");
    await expect(zeileKopf).toHaveClass(/bald/);
    await expect(zeileKopf.locator(".fk-behalten-loeschen")).toHaveText("wird heute um 14:10 gelöscht");
    await expect(zeileKopf.locator(".fk-behalten-loeschen")).toHaveCSS("font-weight", "600");
    await expect(titel.locator('.fk-person-teil.warnung[data-text="wird heute um 14:10 gelöscht"]')).toBeInViewport();
  });

  test("Metazeile und Reiter nennen über Mitternacht den Tag, ohne dass jemand etwas ändert (PS-R6-2)", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-11-09T23:00:00+01:00") });
    await oeffneApp(page);
    await page.getByRole("radiogroup", { name: "Einsatzort" }).getByRole("radio", { name: "Notaufnahme" }).click();
    await oeffneVorlage(page, "osg", "OSG");
    await expect(kopf(page).locator(".fk-typ").first()).toHaveText("Ambulanzbrief · begonnen 23:00");
    await expect(reiter(page).locator(".reiter-zeit")).toHaveText("23:00");
    await page.clock.fastForward("01:30:00");
    await expect(kopf(page).locator(".fk-typ").first()).toHaveText("Ambulanzbrief · begonnen gestern 23:00");
    await expect(reiter(page).locator(".reiter-zeit")).toHaveText("gestern");
    // Nicht behalten: kein Stand je Abschnitt, auch nicht über Mitternacht (E-86).
    await expect(page.locator("[data-abschnitt]").first()).toBeVisible();
    await expect(page.locator("[data-stand]")).toHaveCount(0);
  });

  test("Stand je Abschnitt: am nächsten Tag leise „Stand gestern“, nach einer Änderung dort nicht mehr, auch nach dem Neuladen (PS-R6-3, E-86)", async ({ page }) => {
    await page.clock.install({ time: MONTAG });
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 12");
    const verlauf = page.locator('[data-abschnitt="verlauf"]');
    const anamnese = page.locator('[data-abschnitt="anamnese"]');
    await expect(page.locator("[data-stand]")).toHaveCount(0);

    // Dienstag 10:10: Die Minutenprüfung zeichnet neu, ohne dass jemand etwas tut.
    await page.clock.fastForward("20:00:00");
    await expect(anamnese.locator("[data-stand]")).toHaveText("Stand gestern");
    await expect(verlauf.locator("[data-stand]")).toHaveText("Stand gestern");
    // Leise: Farbe wie die übrigen Hinweise am Abschnitt, keine Fläche, nicht fett; kein Gelb (Entscheidung 12).
    const stil = await anamnese.locator("[data-stand]").evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--text-leise)";
      document.body.append(probe);
      const leise = getComputedStyle(probe).color;
      probe.remove();
      const s = getComputedStyle(el);
      return { flaeche: s.backgroundColor, gewicht: s.fontWeight, leise: s.color === leise };
    });
    expect(stil).toEqual({ flaeche: "rgba(0, 0, 0, 0)", gewicht: "400", leise: true });

    await verlauf.getByRole("button", { name: "+ frei ergänzen" }).click();
    await verlauf.getByRole("textbox", { name: "Freie Ergänzung zu Verlauf" }).fill("Tag 2: mobil am Rollator.");
    await expect(verlauf.locator("[data-stand]")).toHaveCount(0);
    await expect(anamnese.locator("[data-stand]")).toHaveText("Stand gestern");

    await page.reload();
    await expect(kopf(page).locator("[data-behalten]")).toContainText("„Zi 12“");
    await expect(anamnese.locator("[data-stand]")).toHaveText("Stand gestern");
    await expect(verlauf.locator("[data-stand]")).toHaveCount(0);

    // Donnerstag: Der Tag steht da, nicht „gestern“.
    await page.clock.fastForward("48:00:00");
    await expect(anamnese.locator("[data-stand]")).toHaveText("Stand Mo 09.11.");
    await expect(verlauf.locator("[data-stand]")).toHaveText("Stand vorgestern");
  });

  for (const breite of [1366, 1024]) {
    test(`Reiterleiste bei ${breite} px: offener Reiter, sein × und „+ Neuer Fall“ immer zu sehen, auch während „Arbeitsplatz räumen“ (QA-44)`, async ({ page }) => {
      await page.clock.install({ time: MONTAG });
      await page.setViewportSize({ width: breite, height: 768 });
      await oeffneApp(page);
      await einschalten(page);
      await behalteneHuefte(page, "Zi 12 Fenster");
      await page.getByRole("button", { name: /Neuer Fall/ }).click();
      await behalteneHuefte(page, "Bett 5");
      // Am zweiten Tag tragen die Reiter ihr Alter; dazu ein Notaufnahmefall.
      await page.clock.fastForward("26:00:00");
      await page.getByRole("button", { name: /Neuer Fall/ }).click();
      await page.getByRole("radiogroup", { name: "Einsatzort" }).getByRole("radio", { name: "Notaufnahme" }).click();
      await oeffneVorlage(page, "osg", "OSG");
      const breiter = await reiter(page).evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(await reiterImBlick(page), "dritter Fall offen").toEqual({ reiter: true, zu: true, neu: true });
      // Zum ersten Fall, der links hinausgeschoben sein kann.
      await page.keyboard.press("Alt+1");
      await expect(kopf(page).locator("[data-behalten]")).toContainText("„Zi 12 Fenster“");
      expect(await reiterImBlick(page), "erster Fall offen").toEqual({ reiter: true, zu: true, neu: true });
      await page.getByRole("button", { name: "Arbeitsplatz räumen" }).click();
      await expect(page.locator("[data-raeumen-frage]")).toBeVisible();
      expect(await reiterImBlick(page), "während der Frage").toEqual({ reiter: true, zu: true, neu: true });
      await page.getByRole("button", { name: "Abbrechen" }).click();
      // Beide Knöpfe nehmen den Klick an (nichts liegt darüber).
      await page.getByRole("button", { name: /Neuer Fall/ }).click();
      await expect(page.getByRole("combobox", { name: "Diagnose oder Kürzel" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Fall 1 schließen, bleibt behalten" }).click();
      await expect(reiter(page)).not.toContainText("Zi 12 Fenster");
      if (breite === 1024) expect(breiter, "bei 1024 px läuft die Leiste über").toBe(true);
    });
  }

  test("Behaltener Fall wird Notaufnahmefall: nicht mehr behalten, Kurzbezeichnung bleibt als Merker im Reiter (PS-R6-7, H-R6-5)", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Bett 11");
    await kopf(page).getByRole("button", { name: "Vorlage wechseln" }).click();
    await page.getByRole("radiogroup", { name: "Einsatzort" }).getByRole("radio", { name: "Notaufnahme" }).click();
    await oeffneVorlage(page, "osg", "OSG");
    await expect(meldung(page)).toContainText("„Bett 11“ ist jetzt ein Notaufnahmefall und wird nicht mehr behalten, nur noch in diesem Fenster. Die Kurzbezeichnung bleibt als Merker.");
    await expect(page.locator("#fk-etikett")).toHaveValue("Bett 11");
    await expect(reiter(page).locator(".reiter-name")).toContainText("Bett 11");
    expect(await gespeichert(page)).toBeNull();
  });

  test("Kommt das Ereignis aus dem anderen Fenster nicht an, schließt die Rückkehr ins Fenster den geholten Fall (PS-R6-5, CR-R6-11)", async ({ page, context }) => {
    // Das erste Fenster erhält keine Ereignisse `storage`, wie nach „Zurück“ aus dem Seitenspeicher oder dem Ruhezustand.
    await page.addInitScript(() => {
      const echt = window.addEventListener.bind(window) as (art: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => void;
      (window as unknown as { addEventListener: typeof echt }).addEventListener = (art, fn, o) => {
        if (art !== "storage") echt(art, fn, o);
      };
    });
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 12");
    const b = await zweitesFenster(context);
    await zeile(b, "Zi 12").getByRole("button", { name: "„Zi 12“ hierher holen" }).click();
    await zeile(b, "Zi 12").getByRole("button", { name: "„Zi 12“ dort schließen und hier öffnen?" }).click();
    await expect(kopf(b).locator("[data-behalten]")).toContainText("„Zi 12“");
    // Ohne Ereignis zeigt das erste Fenster den Fall weiter …
    await page.waitForTimeout(300);
    await expect(kopf(page).locator("[data-behalten]")).toContainText("„Zi 12“");
    // … bis es den Fokus zurückbekommt (zurück aus dem KIS).
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator("[data-stehend]")).toContainText("„Zi 12“ ist jetzt in einem anderen Fenster geöffnet und hier geschlossen.");
    await expect(page.locator(".fallkopf")).toHaveCount(0);
  });

  test("Zurück aus dem Seitenspeicher: Das Fenster nimmt seinen beim Verlassen freigegebenen Fall wieder (CR-R6-11)", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 12");
    const fenster = () => page.evaluate(() => JSON.parse(window.localStorage.getItem("kitteltext3.behalten")!).faelle[0].fenster as string | null);
    const eigenes = await fenster();
    expect(eigenes).not.toBeNull();
    // Was der Browser beim Wegnavigieren und bei „Zurück“ ohne Neuladen auslöst (Playwright schaltet den Seitenspeicher ab).
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    expect(await fenster()).toBeNull();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    expect(await fenster()).toBe(eigenes);
    await expect(kopf(page).locator("[data-behalten]")).toContainText("„Zi 12“");
  });

  test("Ablauf beim Start: nach 3 Tagen ohne offenes Fenster ist der Fall beim Öffnen gelöscht", async ({ page }) => {
    await page.clock.install({ time: MONTAG });
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 4");
    await page.goto("about:blank");
    await page.clock.setSystemTime(new Date(MONTAG.getTime() + 72 * 3600_000 + 60_000));
    await page.goto("");
    await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
    await expect(meldung(page)).toHaveText("Behaltener Fall „Zi 4“ nach 3 Tagen gelöscht.");
    expect(await gespeichert(page)).toBeNull();
  });

  test("Fall mit höherem Fallformat aus einer neueren Fassung: Zeile sagt es, Öffnen gesperrt, Löschen geht (CR-R6-03)", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 8");
    await page.evaluate(() => {
      const b = JSON.parse(window.localStorage.getItem("kitteltext3.behalten")!);
      b.faelle[0] = { ...b.faelle[0], fenster: null, fallFormat: 99 };
      window.localStorage.setItem("kitteltext3.behalten", JSON.stringify(b));
      window.sessionStorage.clear();
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
    await expect(zeile(page, "Zi 8")).toContainText("aus einer neueren Fassung");
    await expect(zeile(page, "Zi 8").getByRole("button", { name: "„Zi 8“ öffnen" })).toBeDisabled();
    await zeile(page, "Zi 8").getByRole("button", { name: "„Zi 8“ löschen" }).click();
    await zeile(page, "Zi 8").getByRole("button", { name: "„Zi 8“ wirklich löschen?" }).click();
    await expect(meldung(page)).toContainText("Behaltener Fall „Zi 8“ gelöscht.");
    expect(await gespeichert(page)).toBeNull();
  });

  test("Arbeitsplatz räumen mit behaltenen Fällen: drei Knöpfe, Fokus auf Abbrechen, alles löschen zählt richtig (E-81)", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 1");
    await page.getByRole("button", { name: "Fall 1 schließen, bleibt behalten" }).click();
    await expect(zeile(page, "Zi 1")).toBeVisible();
    await behalteneHuefte(page, "Zi 2");
    await page.getByRole("button", { name: "Arbeitsplatz räumen" }).click();
    const frage = page.getByRole("group", { name: "Auf diesem PC liegen 2 behaltene Fälle. Was soll gelöscht werden?" });
    await expect(frage.getByRole("button", { name: "Abbrechen" })).toBeFocused();
    await expect(frage.getByRole("button", { name: "Räumen, behaltene Fälle bleiben" })).toBeVisible();
    // Esc und Enter auf dem Fokus löschen nichts; der Fokus geht zurück an „Arbeitsplatz räumen“.
    await page.keyboard.press("Escape");
    await expect(frage).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Arbeitsplatz räumen" })).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(frage).toHaveCount(0);
    expect(JSON.parse((await gespeichert(page))!).faelle).toHaveLength(2);
    // Der aktive Reiter bleibt sichtbar, solange die Frage steht (QA-44).
    await page.getByRole("button", { name: "Arbeitsplatz räumen" }).click();
    await expect(reiter(page).locator(".reiter-eintrag.aktiv")).toBeInViewport();
    await frage.getByRole("button", { name: "Alles löschen, auch die 2 behaltenen" }).click();
    await expect(meldung(page)).toHaveText(/Arbeitsplatz geräumt: 2 behaltene Fälle gelöscht, Zwischenablage überschrieben\. Eigene Bausteine und Vorlagen bleiben\./);
    await expect(liste(page)).toContainText("Noch kein Fall behalten. Bei jedem neuen Stationsfall fragt die App nach einer Kurzbezeichnung.");
    expect(await gespeichert(page)).toBeNull();
  });

  test("Arbeitsplatz räumen, behaltene Fälle bleiben: Fenster leer, Zwischenablage überschrieben, Fall frei für ein anderes Fenster (E-81)", async ({ page, context }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 7");
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await oeffneVorlage(page, "Koxarthrose", KOXARTHROSE);
    await page.getByRole("dialog", { name: "Fall behalten?" }).getByRole("button", { name: "Nur in diesem Fenster" }).click();
    await setzeZwischenablage(page, "Brief von vorhin");
    await page.getByRole("button", { name: "Arbeitsplatz räumen" }).click();
    const frage = page.getByRole("group", { name: "Auf diesem PC liegt 1 behaltener Fall („Zi 7“), in diesem Fenster 1 weiterer Fall. Was soll gelöscht werden?" });
    await frage.getByRole("button", { name: "Räumen, behaltener Fall bleibt" }).click();
    await expect(meldung(page)).toHaveText(
      /Arbeitsplatz geräumt: 1 Fall dieses Fensters gelöscht, Zwischenablage überschrieben\. 1 behaltener Fall bleibt unter „Behaltene Fälle“ bis zu seinem Ablauf\./,
    );
    await expect(reiter(page).locator(".reiter-eintrag")).toHaveCount(0);
    expect((await zwischenablage(page)).trim()).toBe("");
    expect(JSON.parse((await gespeichert(page))!).faelle[0].fenster).toBeNull();
    await expect(zeile(page, "Zi 7")).toContainText("Öffnen");
    // Ein anderes Fenster öffnet ihn ohne Rückfrage.
    const b = await zweitesFenster(context);
    await zeile(b, "Zi 7").getByRole("button", { name: "„Zi 7“ öffnen" }).click();
    await expect(kopf(b).locator("[data-behalten]")).toContainText("„Zi 7“");
  });

  test("Ausschalten fragt: nur ausschalten oder sofort löschen; Enter löscht nichts (QA-46)", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 5");
    let dialog = await einstellungen(page);
    await dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" }).getByRole("radio", { name: "aus" }).click();
    const name = "„Stationsfälle behalten“ ausschalten? 1 behaltener Fall liegt auf diesem PC.";
    let frage = dialog.getByRole("group", { name });
    // Kein Knopf, der löscht, liegt vorab auf Enter.
    await expect(frage.getByRole("button", { name: "Abbrechen" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(frage).toHaveCount(0);
    expect(await gespeichert(page)).not.toBeNull();
    await expect(dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" }).getByRole("radio", { name: "an" })).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" }).getByRole("radio", { name: "aus" }).click();
    await expect(frage).toContainText("„Nur ausschalten“ lässt ihn unter „Behaltene Fälle“");
    await frage.getByRole("button", { name: "Nur ausschalten" }).click();
    await expect(meldung(page)).toContainText("Ausgeschaltet. 1 behaltener Fall bleibt bis zu seinem Ablauf.");
    await dialog.getByRole("button", { name: "Schließen" }).click();
    await expect(kopf(page).locator("[data-behalten]")).toContainText("„Zi 5“");
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await expect(liste(page)).toContainText("„Stationsfälle behalten“ ist aus: Neue Fälle kommen nicht hinzu.");
    await page.keyboard.press("Escape");

    dialog = await einstellungen(page);
    await dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" }).getByRole("radio", { name: "an" }).click();
    await dialog.getByRole("button", { name: "Einschalten" }).click();
    await dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" }).getByRole("radio", { name: "aus" }).click();
    frage = dialog.getByRole("group", { name });
    await frage.getByRole("button", { name: "Löschen und ausschalten" }).click();
    await expect(meldung(page)).toContainText("1 behaltener Fall gelöscht");
    await dialog.getByRole("button", { name: "Schließen" }).click();
    await expect(liste(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
    expect(await gespeichert(page)).toBeNull();
  });

  test("Ausschalten in einem Fenster gilt im anderen: dort keine Frage beim Anlegen, ein Wechsel der Darstellung schaltet nicht wieder ein (CR-R6-02)", async ({ page, context }) => {
    await oeffneApp(page);
    await einschalten(page);
    const b = await zweitesFenster(context);
    const behaltenWahl = (d: Locator) => d.getByRole("radiogroup", { name: "Stationsfälle behalten" });
    let dialog = await einstellungen(b);
    await expect(behaltenWahl(dialog).getByRole("radio", { name: "an" })).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("button", { name: "Schließen" }).click();

    dialog = await einstellungen(page);
    await behaltenWahl(dialog).getByRole("radio", { name: "aus" }).click();
    await expect(behaltenWahl(dialog).getByRole("radio", { name: "aus" })).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("button", { name: "Schließen" }).click();

    await b.bringToFront();
    await oeffneVorlage(b, "Koxarthrose", KOXARTHROSE);
    await expect(kopf(b)).toBeVisible();
    await expect(b.getByRole("dialog", { name: "Fall behalten?" })).toHaveCount(0);
    await expect(b.locator("[data-fall-behalten]")).toHaveCount(0);
    dialog = await einstellungen(b);
    await expect(behaltenWahl(dialog).getByRole("radio", { name: "aus" })).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("radiogroup", { name: "Darstellung" }).getByRole("radio", { name: "dunkel" }).click();
    await dialog.getByRole("button", { name: "Schließen" }).click();
    const gespeicherteEinstellungen = await b.evaluate(() => JSON.parse(window.localStorage.getItem("kitteltext3.einstellungen") ?? "{}"));
    expect([gespeicherteEinstellungen.stationBehalten, gespeicherteEinstellungen.farbmodus]).toEqual([false, "dunkel"]);
    expect(await gespeichert(b)).toBeNull();
    // Und umgekehrt: Die Darstellung aus B gilt in A.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("Dieselbe Kurzbezeichnung zweimal: abgewiesen mit Hinweis auf den anderen Fall", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 12 Fenster");
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await oeffneVorlage(page, "Koxarthrose", KOXARTHROSE);
    const frage = page.getByRole("dialog", { name: "Fall behalten?" });
    const feld = frage.getByRole("textbox", { name: "Kurzbezeichnung" });
    await feld.fill("zi 12 fenster");
    await frage.getByRole("button", { name: "Behalten" }).click();
    await expect(frage.getByRole("alert")).toContainText(`„Zi 12 Fenster“ trägt schon ein anderer behaltener Fall (${KOXARTHROSE}, begonnen heute`);
    await expect(frage.getByRole("alert")).toContainText("). Andere Kurzbezeichnung wählen oder den alten Fall unter „Behaltene Fälle“ (Strg+K) löschen.");
    await expect(feld).toBeFocused();
    await expect(feld).toHaveAttribute("aria-invalid", "true");
    await feld.fill("Zi 12 Tür");
    await expect(frage.getByRole("alert")).toHaveCount(0);
    await frage.getByRole("button", { name: "Behalten" }).click();
    await expect(frage).toHaveCount(0);
    // Im Reiter steht die Kurzbezeichnung vorn; gleiche Vorlagen ließen sich sonst nach dem Kürzen nicht unterscheiden.
    await expect(reiter(page).locator(".reiter-name")).toHaveText([/^Zi 12 Fenster · Koxarthrose/, /^Zi 12 Tür · Koxarthrose/]);
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await expect(liste(page).locator("[data-behalten-zeile]")).toHaveCount(2);
  });

  test("Tastatur: Liste mit Tab und Enter, Löschen in zwei Schritten, Fokus bleibt in der Liste", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 6");
    await page.getByRole("button", { name: "Fall 1 schließen, bleibt behalten" }).click();
    const oeffnen = zeile(page, "Zi 6").getByRole("button", { name: "„Zi 6“ öffnen" });
    await oeffnen.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(KOXARTHROSE);
    await expect(meldung(page)).toContainText("„Zi 6“ geöffnet: begonnen heute");
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    const loeschen = zeile(page, "Zi 6").getByRole("button", { name: "„Zi 6“ löschen" });
    await loeschen.focus();
    await page.keyboard.press("Enter");
    await expect(zeile(page, "Zi 6").getByRole("button", { name: "„Zi 6“ wirklich löschen?" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(zeile(page, "Zi 6")).toHaveCount(0);
    await expect(liste(page).getByRole("heading", { name: "Behaltene Fälle" })).toBeFocused();
    await expect(reiter(page)).not.toContainText("Zi 6");
    expect(await gespeichert(page)).toBeNull();
  });

  test("Fokus: Esc in der Frage nach der Kurzbezeichnung gibt ihn dem Auslöser zurück; nach dem letzten Löschen bei ausgeschalteter Einstellung ins Suchfeld (CR-R6-12)", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 7");
    // Erst wenn die Frage beim Anlegen ihren Fokus abgegeben hat (an „Nächste Stelle“), sonst überholt der Test sie.
    const f2 = page.locator(".f2");
    await expect(f2).toBeFocused();
    const aendern = kopf(page).getByRole("button", { name: "Kurzbezeichnung ändern" });
    await aendern.focus();
    await page.keyboard.press("Enter");
    const frage = page.getByRole("dialog", { name: "Kurzbezeichnung ändern" });
    await expect(frage.getByRole("textbox", { name: "Kurzbezeichnung" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(frage).toHaveCount(0);
    await expect(aendern).toBeFocused();

    // Nicht behaltener Stationsfall: „Fall behalten …“ in der Metazeile.
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await oeffneVorlage(page, "Koxarthrose", KOXARTHROSE);
    await page.getByRole("dialog", { name: "Fall behalten?" }).getByRole("button", { name: "Nur in diesem Fenster" }).click();
    await expect(f2).toBeFocused();
    const behalten = page.locator("[data-fall-behalten]");
    await behalten.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Fall behalten?" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(behalten).toBeFocused();

    // Einstellung aus, „Zi 7“ bleibt bis zum Ablauf; der letzte Eintrag wird per Tastatur gelöscht.
    const dialog = await einstellungen(page);
    await dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" }).getByRole("radio", { name: "aus" }).click();
    await dialog.getByRole("button", { name: "Nur ausschalten" }).click();
    await dialog.getByRole("button", { name: "Schließen" }).click();
    await page.getByRole("button", { name: "Fall 1 schließen, bleibt behalten" }).click();
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    const loeschen = zeile(page, "Zi 7").getByRole("button", { name: "„Zi 7“ löschen" });
    await loeschen.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(liste(page)).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Diagnose oder Kürzel" })).toBeFocused();
  });

  test("Löschen, das der Browser verweigert: Meldung nennt die Folge und den Ausweg, die Zeile bleibt (MT-R6-12)", async ({ page }) => {
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 6");
    await page.getByRole("button", { name: "Fall 1 schließen, bleibt behalten" }).click();
    // Ab jetzt verweigert der Browser jedes Schreiben und Entfernen des Bestands.
    await page.evaluate(() => {
      const setItem = Storage.prototype.setItem;
      const removeItem = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === "kitteltext3.behalten") throw new DOMException("voll", "QuotaExceededError");
        return setItem.call(this, k, v);
      };
      Storage.prototype.removeItem = function (k: string) {
        if (k === "kitteltext3.behalten") throw new DOMException("gesperrt", "SecurityError");
        return removeItem.call(this, k);
      };
    });
    await zeile(page, "Zi 6").getByRole("button", { name: "„Zi 6“ löschen" }).click();
    await zeile(page, "Zi 6").getByRole("button", { name: "„Zi 6“ wirklich löschen?" }).click();
    await expect(meldung(page)).toContainText("Nicht gelöscht: Der Browser hat das Löschen verweigert, der Fall liegt weiter auf diesem PC. Bitte melden.");
    await expect(zeile(page, "Zi 6")).toHaveCount(1);
    expect(await gespeichert(page)).toContain("Zi 6");
  });

  test("Schreiben scheitert: stehendes Banner mit dem Stand auf dem PC, weg beim nächsten gelungenen Schreiben; Neuladen behält die Eingabe (CR-R6-01, H-R6-4)", async ({ page }) => {
    await page.clock.install({ time: MONTAG });
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Bett 11");
    const sperre = (an: boolean) =>
      page.evaluate((an) => {
        const w = window as unknown as { echtesSetItem?: Storage["setItem"] };
        w.echtesSetItem ??= Storage.prototype.setItem;
        const echt = w.echtesSetItem;
        Storage.prototype.setItem = an
          ? function (this: Storage, k: string, v: string) {
              if (k === "kitteltext3.behalten") throw new DOMException("voll", "QuotaExceededError");
              return echt.call(this, k, v);
            }
          : echt;
      }, an);
    const banner = page.locator("[data-speicherfehler]");
    await page.clock.fastForward("00:05:00");
    await sperre(true);
    await page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: "rechts", exact: true }).click();
    await expect(banner).toHaveText("Der Browser hat das Speichern von „Bett 11“ verweigert (Speicher voll oder gesperrt). Behalten bleibt der Stand von 14:10; was du seitdem einträgst, geht mit dem Schließen dieses Fensters verloren.");
    await expect(banner).toHaveAttribute("role", "alert");
    // Kein Knopf, keine zweite Meldung in der Meldungszeile; ein Dialog liegt darüber, nicht darunter.
    await expect(banner.getByRole("button")).toHaveCount(0);
    await expect(page.locator(".meldung", { hasText: "verweigert" })).toHaveCount(0);
    // Geht das Schreiben wieder, verschwindet das Banner mit der nächsten Eingabe.
    await sperre(false);
    await page.getByRole("radiogroup", { name: "Patient oder Patientin" }).getByRole("radio", { name: "Patientin", exact: true }).click();
    await expect(banner).toHaveCount(0);
    expect(await gespeichert(page)).toContain("\"seite\":\"rechts\"");
    // Und noch einmal gesperrt: Neuladen verliert die Eingabe nicht (Kopie im Sitzungsspeicher), danach ist alles gespeichert.
    await sperre(true);
    await page.getByRole("textbox", { name: "Alter" }).fill("78");
    await expect(banner).toBeVisible();
    expect(await gespeichert(page)).not.toContain("\"alter\":\"78\"");
    await page.reload();
    await expect(kopf(page).locator("[data-behalten]")).toContainText("„Bett 11“");
    await expect(page.getByRole("textbox", { name: "Alter" })).toHaveValue("78");
    await expect(banner).toHaveCount(0);
    expect(await gespeichert(page)).toContain("\"alter\":\"78\"");
  });

  test("Speicher wird unlesbar: offener Fall bleibt offen, die Liste sagt „nicht lesbar“ statt „keiner“ (CR-R6-06)", async ({ page }) => {
    await page.clock.install({ time: MONTAG });
    await oeffneApp(page);
    await einschalten(page);
    await behalteneHuefte(page, "Zi 32");
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await behalteneHuefte(page, "Zi 33");
    await page.evaluate(() => {
      const getItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (this: Storage, k: string) {
        if (k === "kitteltext3.behalten") throw new DOMException("gesperrt", "SecurityError");
        return getItem.call(this, k);
      };
    });
    await page.clock.fastForward("00:01:30");
    await expect(kopf(page).locator("[data-behalten]")).toContainText("„Zi 33“");
    await expect(page.locator("[data-stehend]")).toHaveCount(0);
    await page.getByRole("button", { name: /Neuer Fall/ }).click();
    await expect(liste(page).locator("[data-unlesbar]")).toHaveText("Gerade nicht lesbar: Der Browser verweigert den Zugriff auf die behaltenen Fälle. Sie bleiben auf diesem PC.");
    await expect(liste(page)).not.toContainText("Noch kein Fall behalten");
  });

  test("Gesperrter Speicher: Einstellung nicht wählbar, mit Erklärung", async ({ page }) => {
    await page.addInitScript((zugang) => {
      try {
        window.localStorage.setItem(zugang.schluessel, zugang.wert);
      } catch {
        /* nichts */
      }
      const setze = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (this === window.localStorage && k !== zugang.schluessel) throw new DOMException("Speicher gesperrt", "SecurityError");
        return setze.call(this, k, v);
      };
    }, { schluessel: ZUGANG_SCHLUESSEL, wert: await import("../../src/access.ts").then((m) => m.ZUGANG_PRUEFWERT) });
    await page.goto("");
    await page.getByRole("button", { name: "Verstanden" }).click();
    await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
    const dialog = await einstellungen(page);
    const gruppe = dialog.getByRole("radiogroup", { name: "Stationsfälle behalten" });
    await expect(gruppe.getByRole("radio", { name: "an" })).toBeDisabled();
    await expect(gruppe).toHaveAccessibleDescription(/Nicht wählbar: Dieser Browser speichert nichts dauerhaft/);
  });
});
