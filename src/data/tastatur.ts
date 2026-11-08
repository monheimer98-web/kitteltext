// Tastenbelegung, wie sie die Einstellungen zeigen. Dieselbe Tabelle steht in `ANLEITUNG.md` unter „Tastatur“; ein Test
// vergleicht beide Wort für Wort (QA-18). Wer eine Taste ändert, ändert beide und E-43/E-44 im Entscheidungslog.

export interface Tastenregel {
  taste: string;
  wirkt: string;
}

export const TASTATUR: readonly Tastenregel[] = [
  { taste: "Strg+K", wirkt: "neuer Fall, Vorlage suchen" },
  { taste: "F2, Umschalt+F2", wirkt: "nächste, vorige Stelle, die zu klären ist" },
  {
    taste: "Ziffer 1–9",
    wirkt: "wählt die Möglichkeit mit dieser Nummer: im Fenster, in der Seitenwahl im Fallkopf, in der Zeile der Befundliste. Nummern stehen nur an der Reihe, in der die Ziffer gerade wählt",
  },
  { taste: "Ü", wirkt: "übernimmt den grauen Vorschlag: Satz, Block, Gruppe in der Befundliste; die Meldung nennt, was übernommen wurde, mit Rückgängig. Braucht die deutsche Tastaturbelegung; sonst Klick auf den Knopf mit „Ü“" },
  { taste: "U, A, N", wirkt: "Befundliste: unauffällig, auffällig, nicht untersucht; danach eine Zeile tiefer, sobald die Zeile fertig ist" },
  { taste: "Pfeiltasten", wirkt: "markieren; Enter oder Leertaste löst das Markierte aus. Nach einer Sperre markiert der erste Druck nichts" },
  { taste: "↓ im Eingabefeld", wirkt: "zu den Schnellwerten" },
  {
    taste: "Enter",
    wirkt: "im einzeiligen Feld: weiter. Auf einem markierten Knopf: auslösen. In der Befundliste: zur nächsten offenen Zeile darunter. Sonst setzt Enter nichts, ein Hinweis sagt, was geht",
  },
  { taste: "Strg+Enter", wirkt: "im Eingabefeld: weiter. Sonst: nächsten fertigen Abschnitt kopieren, auch wenn eine Lücke den Fokus hat" },
  { taste: "Strg+Umschalt+Enter", wirkt: "ganzen Brief kopieren" },
  { taste: "Tab", wirkt: "im Eingabefeld: weiter wie Strg+Enter. Sonst nächstes Bedienelement; nach einer Sperre markiert der erste Druck nichts" },
  { taste: "Alt+1 … Alt+9", wirkt: "Fall wechseln" },
  { taste: "Strg+Z, Strg+Y", wirkt: "rückgängig, wiederholen" },
  { taste: "Esc", wirkt: "Fenster oder Liste schließen" },
];

/** Der Satz zur Sperre, gleich in Fensterfuß, Meldung und Absatz der Anleitung (MT-01, R2-06). */
export const SPERRE = "Tasten gesperrt bis Pfeiltaste, Tab, F2 oder Klick.";

/** Was nach einem Sprung und nach verirrtem Text gilt (E-44); steht unter der Tabelle in Einstellungen und Anleitung. */
export const TASTENSPERRE =
  "Damit weitergetippter Text an der nächsten Stelle nichts auswählt, wirken dort Ziffer, U, A, N und Ü erst, wenn die Stelle 0,3 Sekunden zu sehen war; ebenso Enter und Leertaste auf einem Knopf. Das gilt nach jedem Weiterspringen, auch eine Zeile tiefer in der Befundliste. Zu frühe Tasten setzen nichts, ebenso Text dort, wo gewählt wird. Die Meldung zeigt sie; danach sind diese Tasten gesperrt bis Pfeiltaste, Tab, F2 oder Klick. Die erste Pfeiltaste oder Tab danach löst nur und markiert nichts. Kam die Taste gleich nach einer Wahl, oder landet Text gleich im Feld danach, nimmt die App alle Wahlen dieses Tippens zurück und nennt sie; das gilt auch für eine Ziffer oder einen Buchstaben, der an der Stelle nichts bewirkt (etwa eine 4, wo es nur 1 und 2 gibt). Zurück heißt immer offen oder grau: Stand an einer Stelle vorher schon eine eigene Aussage, kommt sie nicht wieder, die Stelle wird offen und hält das Kopieren auf. Einen eben angefügten Satz („+ …“) lässt die App stehen und nennt ihn („Im Brief geblieben“). Hat eine Taste kurz davor etwas gesetzt, nennt die Meldung das, mit Rückgängig; auch dieses Rückgängig macht die Stelle offen, statt eine alte Aussage herzustellen.";
