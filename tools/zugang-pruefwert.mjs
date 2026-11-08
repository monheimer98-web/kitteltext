// Gibt den Prüfwert für einen neuen Zugangscode aus (E-51). Der Code kommt aus
// der Umgebungsvariablen ZUGANG_CODE, damit er in keiner Datei und keinem
// Aufrufprotokoll eines Skripts steht. Ausgabe: nur der Prüfwert.
import { zugangsPruefwert } from "../src/access.ts";

const code = process.env.ZUGANG_CODE;
if (!code || code.trim().length < 8) {
  console.error("ZUGANG_CODE fehlt oder ist kürzer als 8 Zeichen.");
  process.exit(1);
}
console.log(zugangsPruefwert(code));
