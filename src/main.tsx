import { render } from "preact";
import { App } from "./ui/App.tsx";
import "./theme.ts"; // initialisiert das Theme (System/Hell/Dunkel) beim Start
import "./ui/styles.css";

render(<App />, document.getElementById("app")!);

// Service Worker registrieren – nur im Produktions-Build (nicht im Dev-Modus,
// wo er Vites HMR stören würde) und nicht über file://.
if (
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  location.protocol.startsWith("http")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        /* SW optional – App läuft auch ohne */
      });
  });
}
