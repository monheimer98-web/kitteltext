// Gemeinsame Schritte der Klicktests. Gesucht wird über Rollen, Beschriftungen und
// die data-Attribute der App, nicht über CSS-Klassen.
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
// Im Repository steht nur der Prüfwert des Zugangscodes (E-51). Den Code selbst bekommt nur der
// Zugangstest, und nur über die Umgebungsvariable KITTELTEXT_ZUGANG; ohne sie prüft er nur die Abweisung.
import { ZUGANG_PRUEFWERT, ZUGANG_SCHLUESSEL } from "../../src/access.ts";

export const zugangscode = process.env.KITTELTEXT_ZUGANG ?? "";

/**
 * Öffnet die App in einem frischen Browserkontext: freigeschaltet, Hinweis bestätigt, Startseite.
 * Die Freischaltung liegt vor dem Laden im Speicher, statt dass der Code getippt wird: So steht er bei einem
 * Fehlschlag weder im Aufrufprotokoll noch in der Momentaufnahme der Seite (CR-K08). Nur der Zugangstest tippt ihn.
 */
export async function oeffneApp(page: Page) {
  await page.addInitScript(
    ([schluessel, code]) => {
      try {
        window.localStorage.setItem(schluessel, code);
      } catch {
        /* gesperrter Speicher: dann zeigt die App das Schloss, und der Test scheitert sichtbar */
      }
    },
    [ZUGANG_SCHLUESSEL, ZUGANG_PRUEFWERT],
  );
  await page.goto("");
  await page.getByRole("button", { name: "Verstanden" }).click();
  await expect(page.getByRole("heading", { name: "Was hat der Patient?" })).toBeVisible();
  // Beim allerersten Start geht die Anleitung einmal von selbst auf (D-05); die Klicktests arbeiten ohne sie.
  await expect(page.getByRole("complementary", { name: "Anleitung" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Anleitung" })).toHaveCount(0);
}

/** Sucht eine Vorlage im Suchfeld der Startseite und öffnet den ersten Treffer mit Enter. */
export async function oeffneVorlage(page: Page, eingabe: string, titel: string) {
  const suche = page.getByRole("combobox", { name: "Diagnose oder Kürzel" });
  await suche.fill(eingabe);
  await expect(page.getByRole("option").first()).toContainText(titel);
  await suche.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(titel);
}

/** Seite und Person im Fallkopf; die erste Wahl ist je ein Klick. */
export async function setzeSeiteUndPerson(page: Page, seite: "rechts" | "links" | "beidseits" | "ohne Seite", person: "Patient" | "Patientin" | "Kind" | "neutral") {
  await page.getByRole("radiogroup", { name: "Seite", exact: true }).getByRole("radio", { name: seite, exact: true }).click();
  await page.getByRole("radiogroup", { name: "Patient oder Patientin" }).getByRole("radio", { name: person, exact: true }).click();
}

/** Abschnitt des Briefs. Die Abschnitte haben keine zugängliche Beschriftung, nur eine Überschrift; daher das data-Attribut. */
export function abschnitt(page: Page, id: string): Locator {
  return page.locator(`section[data-abschnitt="${id}"]`);
}

/**
 * Klickbare Textstelle im Brief nach ihrer Beschriftung („Vorerkrankungen: …, fehlt noch“). Text gilt genau (CR-K03):
 * Eine graue Stelle heißt „<Text>, Vorschlag der Vorlage, noch nicht übernommen“ und enthielte die schwarze Beschriftung
 * sonst als Teilstring. Reguläre Ausdrücke sind am Ende zu verankern, wenn sie Schwarz von Grau unterscheiden sollen.
 */
export function stelle(bereich: Page | Locator, beschriftung: string | RegExp): Locator {
  return typeof beschriftung === "string" ? bereich.getByRole("button", { name: beschriftung, exact: true }) : bereich.getByRole("button", { name: beschriftung });
}

/** Das Fenster an einer geöffneten Textstelle. */
export function feldfenster(page: Page): Locator {
  return page.getByRole("dialog").filter({ hasNot: page.getByRole("heading", { name: "Einstellungen" }) });
}

/** Die Meldungszeile unten (role=status). */
export function meldung(page: Page): Locator {
  return page.locator(".meldung");
}

export async function zwischenablage(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

export async function setzeZwischenablage(page: Page, text: string) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
}

/**
 * Wartet, bis der Browser ein Bild gezeichnet hat und die Zeitgeber danach gelaufen sind. Danach ist jeder Weitersprung
 * fertig; wer prüfen will, dass eine Taste nichts geändert hat, wartet so lange, bevor er den Stand vergleicht.
 */
export async function nachDemNaechstenBild(page: Page) {
  await page.evaluate(() => new Promise<void>((fertig) => requestAnimationFrame(() => setTimeout(() => setTimeout(fertig, 0), 0))));
}

/**
 * Taste Ü wie auf der deutschen Tastatur (Taste rechts neben P): Playwright kennt sie nicht als Taste und schickte nur
 * Text ohne Tastenereignis. Deshalb über die DevTools-Schnittstelle, mit `key` „ü“ wie im Browser am Klinik-PC.
 */
export async function drueckeUe(page: Page) {
  await drueckeTasteRechtsNebenP(page, "ü");
}

/** Dieselbe Taste ohne deutsche Belegung: Auf US-Belegung liefert sie „[“ (PS-N04). */
export async function drueckeTasteRechtsNebenP(page: Page, zeichen: "ü" | "[") {
  const cdp = await page.context().newCDPSession(page);
  const d = { key: zeichen, code: "BracketLeft", windowsVirtualKeyCode: zeichen === "ü" ? 186 : 219 };
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...d, text: zeichen });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...d });
  await cdp.detach();
}

/**
 * Wartet, bis der Halt Befehle annimmt (E-44): nach einem Sprung erst, wenn er die Schreckzeit lang zu sehen war, und
 * nie, solange die Tasten gesperrt sind (dann scheitert der Test sichtbar an der Zeitgrenze). So tippt ein Arzt, der
 * hinsieht. Tests, die vorausgetippte Tasten prüfen, rufen das nicht auf.
 */
export async function bereit(page: Page) {
  await page.waitForFunction(() => (document.documentElement.getAttribute("data-tippzug") ?? "bereit") === "bereit");
}

/** Wartet `ms` auf der Uhr der Seite: Teil des Szenarios (Pause des Arztes, ausbleibendes Bild), nie zum Grünmachen. */
export async function warte(page: Page, ms: number) {
  const t0 = await page.evaluate(() => performance.now());
  // Mit Zeitgeber statt Bild abfragen: Einige Tests unterdrücken die Bilder (CR-TS09).
  await page.waitForFunction((t) => performance.now() >= t, t0 + ms, { polling: 20 });
}

/** Stand des Tipp-Zugs: „bereit“, „wartet“ (Schreckzeit) oder „gesperrt“. */
export async function tippzug(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.getAttribute("data-tippzug") ?? "bereit");
}

/** Ziffer im geöffneten Fenster, wenn der Halt sie annimmt. Seit K-01 hören die Fenster ab dem Einhängen. */
export async function waehleZiffer(page: Page, ziffer: string) {
  await bereit(page);
  await page.keyboard.press(ziffer);
}

/**
 * Stand aller Textstellen des Briefs und der Wahl im Fallkopf: je Stelle Zustand und Beschriftung. Wer eine Taste
 * prüft, vergleicht den ganzen Stand davor und danach, nicht nur die Zielstelle (T-1).
 */
export async function stand(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const aus: Record<string, string> = {};
    for (const el of document.querySelectorAll<HTMLElement>("[data-key].tok")) {
      const zustand = [...el.classList].find((c) => c.startsWith("z-")) ?? "";
      aus[el.dataset.key!] = `${zustand} | ${el.getAttribute("aria-label")}`;
    }
    for (const gruppe of document.querySelectorAll<HTMLElement>(".fallkopf [role=radiogroup]")) {
      aus[`kopf:${gruppe.getAttribute("aria-label")}`] = [...gruppe.querySelectorAll('[aria-checked="true"]')].map((b) => b.textContent).join(",");
    }
    return aus;
  });
}

/** Was sich zwischen zwei Ständen geändert hat, als lesbare Zeilen „Schlüssel: vorher → nachher“. */
export function aenderungen(vorher: Record<string, string>, nachher: Record<string, string>): string[] {
  const keys = [...new Set([...Object.keys(vorher), ...Object.keys(nachher)])];
  return keys.filter((k) => vorher[k] !== nachher[k]).map((k) => `${k}: ${vorher[k] ?? "–"} → ${nachher[k] ?? "–"}`);
}

/** Aussagen, die neu schwarz (gesetzt, unauffällig, auffällig) im Brief stehen oder deren Wortlaut sich geändert hat. */
export function neueAussagen(vorher: Record<string, string>, nachher: Record<string, string>): string[] {
  return aenderungen(vorher, nachher).filter((z) => / → z-(gesetzt|ok|abw) /.test(z) || / → [^z]/.test(z) || z.startsWith("kopf:"));
}

/**
 * Drückt eine Ziffer in dem Augenblick, in dem das Fenster an einer Textstelle im Dokument erscheint,
 * vor dem nächsten Bild: so wie eine vorausgetippte Taste am langsamen Rechner oder beim schnellen
 * Tippen ankommt. Das Ereignis geht an das Element mit dem Fokus, wie eine echte Taste.
 * Gibt die Beschriftung des Fensters und den Text des Elements mit Fokus zurück.
 */
export function zifferSobaldFensterErscheint(page: Page, ziffer: string): Promise<{ fenster: string; fokus: string }> {
  return page.evaluate(
    (z) =>
      new Promise<{ fenster: string; fokus: string }>((fertig) => {
        const beobachter = new MutationObserver(() => {
          const fenster = document.querySelector('[role="dialog"]');
          if (!fenster) return;
          beobachter.disconnect();
          const ziel = document.activeElement ?? document.body;
          ziel.dispatchEvent(new KeyboardEvent("keydown", { key: z, code: `Digit${z}`, bubbles: true, cancelable: true }));
          fertig({ fenster: fenster.getAttribute("aria-label") ?? "", fokus: ziel === fenster ? "Fenster" : (ziel.textContent ?? "") });
        });
        beobachter.observe(document.body, { childList: true, subtree: true });
      }),
    ziffer,
  );
}

/** Tastencodes der deutschen Tastatur für Zeichen, die Playwright nicht als Taste kennt. */
const CODE_DE: Record<string, string> = { ä: "Quote", ö: "Semicolon", ü: "BracketLeft", ß: "Minus", " ": "Space", ",": "Comma", ".": "Period", "-": "Slash", "/": "Digit7" };

/**
 * Tippt wie ein Arzt, der flüssig weiterschreibt: je Zeichen ein echtes Tastenereignis ohne Pause, auch für Umlaute;
 * „⏎“ ist Enter. Playwrights `keyboard.type` schickte Umlaute als eingefügten Text ohne Tastenereignis; Chrome setzt
 * solchen Text an die letzte Schreibmarke, auch in ein Feld, das den Fokus schon abgegeben hat. Am Klinik-PC kommt jedes
 * Zeichen als Taste an. Als Liste: Einträge mit mehr als einem Zeichen sind benannte Tasten („F2“, „Enter“).
 */
export async function tippe(page: Page, text: string | string[], abstandMs = 0) {
  const cdp = await page.context().newCDPSession(page);
  try {
    let erste = true;
    for (const z of typeof text === "string" ? [...text] : text) {
      // Getaktet (E-45-Szenarien): je Taste ein fester Abstand, gemessen vom Test, nicht vom Rechner.
      if (abstandMs > 0 && !erste) await new Promise((w) => setTimeout(w, abstandMs));
      erste = false;
      const d =
        z === "⏎"
          ? TASTEN.Enter
          : z.length > 1
            ? TASTEN[z]
            : {
              key: z,
              code: CODE_DE[z] ?? (/[a-z]/i.test(z) ? `Key${z.toUpperCase()}` : /[0-9]/.test(z) ? `Digit${z}` : ""),
              text: z,
              windowsVirtualKeyCode: /[a-z0-9]/i.test(z) ? z.toUpperCase().charCodeAt(0) : 0,
              modifiers: z !== z.toLowerCase() ? 8 : 0,
            };
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...d });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...d, text: undefined });
    }
  } finally {
    await cdp.detach();
  }
}

const TASTEN: Record<string, { key: string; code: string; text?: string; windowsVirtualKeyCode: number; modifiers?: number }> = {
  Enter: { key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13 },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  F2: { key: "F2", code: "F2", windowsVirtualKeyCode: 113 },
  " ": { key: " ", code: "Space", text: " ", windowsVirtualKeyCode: 32 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  "Shift+Tab": { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 },
};
for (let i = 0; i <= 9; i++) TASTEN[String(i)] = { key: String(i), code: `Digit${i}`, text: String(i), windowsVirtualKeyCode: 48 + i };
for (const b of "abcdefghijklmnopqrstuvwxyz") TASTEN[b] = { key: b, code: `Key${b.toUpperCase()}`, text: b, windowsVirtualKeyCode: b.toUpperCase().charCodeAt(0) };
TASTEN["ü"] = { key: "ü", code: "BracketLeft", text: "ü", windowsVirtualKeyCode: 186 };

/**
 * Langsamer Rechner (Prüfskript P4 der Patientensicherheit): CPU per DevTools gedrosselt, alle Tasten ohne Pause in die
 * Eingabewarteschlange des Browsers. Ob Neuzeichnen und Zeitgeber zwischen zwei Tasten laufen, entscheidet der Browser.
 */
export async function tastenSalve(page: Page, tasten: string[], drossel = 20) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: drossel });
  try {
    const auftraege: Promise<unknown>[] = [];
    for (const t of tasten) {
      const d = TASTEN[t];
      if (!d) throw new Error(`Taste ${t} fehlt in der Tabelle`);
      auftraege.push(cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...d }));
      auftraege.push(cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...d, text: undefined }));
    }
    // Jeder Auftrag kehrt erst zurück, wenn der Renderer die Taste verarbeitet hat; danach noch ein Bild für das, was
    // eine Taste nach dem Zeichnen anstößt. Keine feste Wartezeit (CR-TS05); die Drosselung bleibt dabei an.
    await Promise.all(auftraege);
    await nachDemNaechstenBild(page);
    await nachDemNaechstenBild(page);
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
  }
}
