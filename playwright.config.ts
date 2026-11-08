// Klicktests im echten Browser (E-41). Playwright ist nur Entwicklungswerkzeug und
// gelangt nicht in die ausgelieferte App. Zwei Läufe mit denselben Tests:
// - „entwicklung“: Vite-Entwicklungsserver, schnell beim Schreiben der Tests;
// - „einzeldatei“: die gebaute Datei dist-einzeldatei/kitteltext.html, per file://
//   geöffnet wie am Klinik-PC per Doppelklick. `npm run test:e2e` baut sie vorher neu.
import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Port je Arbeitskopie (CR-K04): aus ihrem Pfad abgeleitet, damit zwei Arbeitskopien nie denselben Server benutzen;
// mit KITTELTEXT_E2E_PORT frei wählbar. Ein vorhandener Server wird nicht mitbenutzt (`reuseExistingServer: false`):
// Ist der Port belegt, bricht Playwright mit einer Meldung ab, statt den Code einer anderen Arbeitskopie zu testen.
function portAusPfad(pfad: string): number {
  let h = 5381;
  for (const z of pfad) h = (h * 33 + z.charCodeAt(0)) >>> 0;
  return 5200 + (h % 700);
}
const PORT = Number(process.env.KITTELTEXT_E2E_PORT) || portAusPfad(fileURLToPath(new URL(".", import.meta.url)));
const EINZELDATEI = fileURLToPath(new URL("./dist-einzeldatei/kitteltext.html", import.meta.url));

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/e2e",
  fullyParallel: true,
  // Ein vergessenes test.only ließe den Lauf mit zwei Tests grün aussehen (CR-K09).
  forbidOnly: true,
  retries: 0,
  // Nur die Liste. HTML-Bericht und Spur (trace) halten die Eingaben jedes Schritts fest, auch den
  // Zugangscode; wer sie zur Fehlersuche braucht, schaltet sie im Aufruf zu (`--trace on`).
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    ...devices["Desktop Chrome"],
    // Kleinster Bildschirm aus dem Sichtprüfungsprotokoll.
    viewport: { width: 1366, height: 768 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    // Die App schreibt in die Zwischenablage; die Tests lesen sie zurück.
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "entwicklung",
      use: { baseURL: `http://localhost:${PORT}/` },
    },
    {
      // Prüft vor dem Lauf „einzeldatei“, dass die Datei da und jünger als der Quelltext ist (CR-K10).
      name: "bau",
      testMatch: /bau\.setup\.ts/,
    },
    {
      name: "einzeldatei",
      // baseURL ist die Datei selbst; die Tests rufen page.goto("") auf.
      use: { baseURL: pathToFileURL(EINZELDATEI).href },
      dependencies: ["bau"],
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
