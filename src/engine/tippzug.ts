// Tipp-Zug (E-44): ob eine Taste an einem Halt des Durchlaufs wirken darf. Rein rechnerisch, ohne Browser. Zeiten sind
// Millisekunden auf derselben Uhr wie der Zeitstempel des Tastenereignisses (`performance.now()` im Browser).

/**
 * Schreckzeit: So lange nach dem Sichtbarwerden eines neuen Halts gilt eine Befehlstaste noch als Teil dessen, was der
 * Arzt vorher getippt hat. 300 ms liegen über der einfachen Reaktionszeit auf ein Bild (um 200 bis 250 ms) und über dem
 * Abstand zweier Tasten beim flüssigen Tippen (100 bis 200 ms): Eine Taste so kurz nach dem Erscheinen kann keine
 * Antwort auf den neuen Halt sein. Wer den Halt liest, braucht ohnehin länger. Vorschlag der Patientensicherheit
 * (Nachprüfung 08.11.2026); am Klinik-PC zu prüfen.
 */
export const SCHRECKZEIT_MS = 300;

/** So lange nach einem Befehl nennt ein Sperrhinweis ihn noch als „eben gesetzt“. */
export const EBEN_MS = 3000;

/**
 * Fenster eines Tipp-Zugs (E-45): Folgt auf einen Befehl binnen dieser Zeit eine verworfene Taste, war der Befehl blind
 * getippt. Eine Pause von mindestens dieser Länge zwischen zwei Tasten gilt als bewusst und beginnt einen neuen Zug.
 * 1,5 s decken langsames Tippen (um 400 ms je Taste, an Wortgrenzen länger) mit Abstand; Vorgabe des Leads, nicht
 * gemessen.
 */
export const KETTE_MS = 1500;

/**
 * Kommt nach einem Sprung kein Bild, obwohl die Seite sichtbar ist, gilt der Halt nach dieser Zeit als zu sehen
 * (CR-TS09). Ist die Seite verborgen, bleibt er „wartet“: Tasten gehen verloren statt zu wirken (R2-09).
 */
export const BILD_ERSATZ_MS = 1000;

/** Tasten, die eine Sperre lösen: Wer sie drückt, sieht sich um und tippt nicht mehr blind weiter. */
export const LOESENDE_TASTEN: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "F2"]);

export type TastenArt = "befehl" | "text" | "neutral";

export interface Zug {
  /** Seit wann der aktuelle Halt zu sehen ist; null, solange er noch nicht gezeichnet ist. */
  sichtbarAb: number | null;
  /** Nach verirrtem Text oder einer zu frühen Taste: Befehle wirken erst wieder nach Pfeiltaste, Tab, F2 oder Klick. */
  gesperrt: boolean;
}

export type Urteil = "wirkt" | "zu-frueh" | "gesperrt" | "sperrt" | "neutral";

/** Ohne Sprung und ohne Sperre: Was der Arzt drückt, gilt sofort. */
export const FREI: Zug = { sichtbarAb: Number.NEGATIVE_INFINITY, gesperrt: false };

/**
 * Art einer Taste an einem Halt. `befehle` sind die Zeichen, die dort etwas setzen (Ziffern, Ü, in der Befundliste U, A,
 * N). Leertaste, Tasten mit Strg, Alt, Befehlstaste und alle nicht druckbaren Tasten sind neutral: Sie setzen an einem
 * Halt nichts und sperren nichts.
 */
export function tastenArt(key: string, befehle: string, mitSondertaste = false): TastenArt {
  if (mitSondertaste || key.length !== 1 || key === " ") return "neutral";
  return befehle.includes(key.toLowerCase()) ? "befehl" : "text";
}

/**
 * Urteil über eine Taste. Ein Befehl wirkt nur, wenn nichts gesperrt ist und der Halt mindestens die Schreckzeit lang
 * zu sehen war, gemessen am Zeitstempel der Taste (wann sie gedrückt wurde, nicht wann der Rechner sie verarbeitet).
 * Text an einem Halt sperrt.
 */
export function urteil(zug: Zug, art: TastenArt, zeit: number): Urteil {
  if (art === "neutral") return "neutral";
  if (art === "text") return "sperrt";
  if (zug.gesperrt) return "gesperrt";
  if (zug.sichtbarAb === null || zeit < zug.sichtbarAb + SCHRECKZEIT_MS) return "zu-frueh";
  return "wirkt";
}

/** Zustand nach dem Urteil: Text und zu frühe Befehle sperren den ganzen Tipp-Zug, über den nächsten Sprung hinaus. */
export function nachUrteil(zug: Zug, u: Urteil): Zug {
  return u === "zu-frueh" || u === "sperrt" ? { ...zug, gesperrt: true } : zug;
}

/** Ein Sprung zu einem neuen Halt: Die Sperre bleibt, die Schreckzeit beginnt, sobald der Halt gezeichnet ist. */
export function nachSprung(zug: Zug): Zug {
  return { ...zug, sichtbarAb: null };
}

/** Pfeiltaste, Tab, F2 oder Klick: Die Sperre fällt, und der Arzt hat hingesehen. */
export function geloest(): Zug {
  return FREI;
}

/** Ob eine Taste zum Zeitpunkt `zeit` noch in die Schreckzeit nach dem letzten Sprung fällt. */
export function inSchreckzeit(zug: Zug, zeit: number): boolean {
  return zug.sichtbarAb === null || zeit < zug.sichtbarAb + SCHRECKZEIT_MS;
}

/** Ob der Halt zum Zeitpunkt `jetzt` Befehle annimmt (Anzeige; maßgeblich ist `urteil`). */
export function bereit(zug: Zug, jetzt: number): boolean {
  return !zug.gesperrt && zug.sichtbarAb !== null && jetzt >= zug.sichtbarAb + SCHRECKZEIT_MS;
}

// --- Kette (E-45) --------------------------------------------------------------------------------------------------
//
// Ein Tipp-Zug kann mehrere Befehle enthalten: Der Zeiger der Befundliste und die Nummernreihe rücken nach jedem Befehl,
// und wer langsamer als die Schreckzeit tippt, trifft mit jeder Taste einen neuen Halt. Die Kette hält fest, welche
// Befehle seit der letzten bewussten Pause, Navigation oder Texteingabe gewirkt haben. Verrät eine spätere Taste, dass
// der Zug blind war, gehen alle zusammen zurück. Enter und Leertaste verraten nichts: „Ziffer, Enter“ ist eine
// Gewohnheit, kein blindes Weitertippen; sie werden an einem Halt verworfen, nehmen aber nichts zurück.

export interface Kette<B> {
  /** Wirksame Befehle seit Beginn des Zugs, in Reihenfolge. */
  befehle: readonly B[];
  /** Zeitstempel der letzten Taste. */
  letzteTaste: number;
  /** Zeitstempel des letzten Befehls, der wirken durfte, auch wenn er nichts geändert hat. */
  letzterBefehl: number;
  /** Zeitstempel des letzten Zeichens, das ein Textfeld angenommen hat, solange seither kein Befehl kam; sonst null. */
  textZeit: number | null;
  /** Abstände der letzten Zeichen dieses Texts (höchstens drei): der Takt, in dem der Arzt gerade schreibt. */
  luecken: readonly number[];
}

/**
 * Wie weit der Takt des eben geschriebenen Texts reicht: Kommt nach einem Befehl Text in einem Feld binnen des
 * Doppelten des längsten der letzten Abstände, gehört er noch zum selben Schreiben. Mindestens die Schreckzeit,
 * höchstens `KETTE_MS`. Begründung in E-45: Ein fester Wert von 1,5 s nähme auch bewusst gewählte Werte zurück, wenn der
 * Arzt danach zügig ins nächste Feld schreibt; der Takt unterscheidet beides, solange blind getippt im Takt geschieht.
 */
export const TAKT_FAKTOR = 2;

/** Ein neuer Zug: nach einer Navigation (Pfeiltaste, Tab, F2, Klick) oder einer Pause. */
export function neueKette<B>(zeit: number): Kette<B> {
  return { befehle: [], letzteTaste: zeit, letzterBefehl: Number.NEGATIVE_INFINITY, textZeit: null, luecken: [] };
}

/**
 * Jede Taste, bevor sie ausgewertet wird. Eine Pause von mindestens `KETTE_MS` seit der letzten Taste beendet den Zug:
 * `beendet` sind dann seine Befehle (für den Hinweis „eben gesetzt“), und ein neuer Zug beginnt.
 */
export function nachTaste<B>(k: Kette<B>, zeit: number): { kette: Kette<B>; beendet: readonly B[] } {
  if (zeit - k.letzteTaste >= KETTE_MS) return { kette: neueKette<B>(zeit), beendet: k.befehle };
  return { kette: { ...k, letzteTaste: zeit }, beendet: [] };
}

/**
 * Ein Textfeld hat ein Zeichen angenommen: Der Arzt schreibt, ein neuer Zug beginnt. Folgt das Zeichen ohne Befehl
 * dazwischen auf ein voriges, zählt der Abstand zum Takt.
 */
export function nachText<B>(k: Kette<B>, zeit: number): Kette<B> {
  const fortgesetzt = k.befehle.length === 0 && k.textZeit !== null && zeit - k.textZeit < KETTE_MS;
  const luecken = fortgesetzt ? [...k.luecken, zeit - (k.textZeit as number)].slice(-3) : [];
  return { ...neueKette<B>(zeit), textZeit: zeit, luecken };
}

/** Ein Befehl durfte wirken; `befehl`, sobald feststeht, dass er etwas geändert hat (sonst nur der Zeitpunkt). */
export function mitBefehl<B>(k: Kette<B>, befehl: B | null, zeit: number): Kette<B> {
  return { ...k, befehle: befehl === null ? k.befehle : [...k.befehle, befehl], letzterBefehl: zeit };
}

/** Was ein Befehl geändert hat, steht fest (nach dem Zeichnen): Er gehört zum Zug. */
export function mitWirkung<B>(k: Kette<B>, befehl: B): Kette<B> {
  return { ...k, befehle: [...k.befehle, befehl] };
}

/** Fenster für Text nach einem Befehl: der Takt des Texts, mit dem der Zug begann (`TAKT_FAKTOR`); ohne Takt die Schreckzeit. */
export function textFenster<B>(k: Kette<B>): number {
  if (k.luecken.length === 0) return SCHRECKZEIT_MS;
  return Math.min(KETTE_MS, Math.max(SCHRECKZEIT_MS, TAKT_FAKTOR * Math.max(...k.luecken)));
}

/**
 * Ob der Zug blind war (E-45). Anlass „verworfen“: Ein Befehl kam zu früh, oder ein Zeichen ohne Bedeutung kam an einem
 * Halt an. Anlass „text“: Text kam in einem Textfeld an. Blind ist der Zug, wenn er wirksame Befehle hat und der letzte
 * Befehl weniger als `KETTE_MS` zurückliegt; bei Text zusätzlich nur, wenn er noch in der Schreckzeit nach dem Sprung
 * ankam (`schreckzeit`) oder im Takt des Texts, mit dem der Zug begann (`textFenster`). Wer nach einer Navigation oder
 * Pause wählt und dann ins neue Feld schreibt, hat hingesehen.
 */
export function blind<B>(k: Kette<B>, anlass: "verworfen" | "text", zeit: number, schreckzeit: boolean): boolean {
  if (k.befehle.length === 0 || zeit - k.letzterBefehl >= KETTE_MS) return false;
  return anlass === "verworfen" || schreckzeit || zeit - k.letzterBefehl < textFenster(k);
}

/** Verworfene Zeichen für die Meldung: Enter und Leertaste ausgeschrieben, wenn sie allein stehen (MT-08). */
export function verworfenWort(zeichen: string): string {
  if (zeichen === "↵") return "Enter";
  if (zeichen.trim() === "") return "Leertaste";
  return `„${zeichen}“`;
}
