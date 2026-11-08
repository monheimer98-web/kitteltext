import { render } from "preact";
import { App } from "./ui/App.tsx";
import "./ui/styles.css";

const wurzel = document.getElementById("app")!;
// Der Hinweis für veraltete Browser steht fest in der Seite und weicht der App.
wurzel.textContent = "";
render(<App />, wurzel);

// Die erste Fassung hat einen Dienstarbeiter mit Zwischenspeicher eingerichtet.
// Diese Fassung braucht keinen; der alte würde veraltete Dateien ausliefern.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((liste) => liste.forEach((r) => r.unregister()))
    .catch(() => {});
}
if ("caches" in window) {
  caches
    .keys()
    .then((namen) => namen.filter((n) => n.startsWith("kitteltext")).forEach((n) => caches.delete(n)))
    .catch(() => {});
}
