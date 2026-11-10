// Texte der Anleitung in der Seitenleiste (D-05). Die Tastenliste kommt aus `tastatur.ts`, damit Einstellungen,
// Seitenleiste und ANLEITUNG.md dieselben Worte haben. Wortwahl nach dem Prüfbericht marke-text-tastatur-2026-11-08:
// nur Begriffe der Oberfläche, Tasten im Fließtext ausgeschrieben, keine Ausrufezeichen. Ein Test prüft das.
// Später steht hier auch die Verknüpfung mit dem Handy (K-16).

export interface Hilfeschritt {
  was: string;
  wie: string;
}

export const ANLEITUNG_TITEL = "Anleitung";

export const GRUNDREGEL = {
  titel: "Grau und Schwarz",
  saetze: [
    "Grau ist ein Vorschlag der Vorlage, schwarz ist deine Aussage.",
    "Kopiert wird nur, was du übernommen, gewählt oder geschrieben hast. Grau wird nicht kopiert.",
  ],
} as const;

export const VIER_SCHRITTE: { titel: string; schritte: readonly Hilfeschritt[] } = {
  titel: "Ein Brief in vier Schritten",
  schritte: [
    { was: "Vorlage suchen.", wie: "Tippen, was der Patient hat („osg re“, „Platzwunde“), dann Enter. Nächster Patient: Strg+K." },
    { was: "Seite und Person wählen.", wie: "Im Fallkopf über dem Brief. Eine schon gewählte Seite ändert sich erst mit dem zweiten Klick; die Meldung nennt alte und neue Seite." },
    {
      was: "Lücken füllen oder übernehmen.",
      wie: "F2 führt von Stelle zu Stelle. Gelb fehlt noch: tippen oder mit der Ziffer am Knopf wählen. Grau lesen, dann mit Ü übernehmen oder anklicken und ändern. In der Befundliste je Zeile U unauffällig, A auffällig, N nicht untersucht.",
    },
    { was: "Kopieren.", wie: "Ist ein Abschnitt fertig, kopiert ihn Strg+Enter, den ganzen Brief Strg+Umschalt+Enter. Im KIS mit Strg+V einfügen." },
  ],
};

export const NICHTS_VERGESSEN = {
  titel: "Damit nichts fehlt",
  saetze: [
    "Gelb mit ● fehlt noch. Solange ein Abschnitt Gelbes oder Graues enthält, kopiert er nicht: Sein Knopf zeigt dann etwa „● 2 offen · ○ 1 Vorschlag · klären“ und führt zur ersten Stelle.",
    "„Bitte abgleichen“ heißt: Zwei Abschnitte passen nicht zusammen, etwa bei der Belastung. Der Hinweis steht am Abschnitt und bei den Kopierknöpfen; beide Stellen prüfen.",
    "Was du erst im KIS weißt, setzt du auf „erst im KIS ausfüllen“. Im Text steht dann etwa [OP-DATUM], die Liste „Im KIS zu ergänzen“ zählt mit.",
    "F2 springt zur nächsten Stelle, die zu klären ist, Umschalt+F2 zur vorigen. Bleibt nichts, meldet die App „Nichts mehr zu klären.“",
    "Im Procedere vieler Stationsvorlagen steht oben der Kasten „Standardprotokoll“: „Vorschau“ zeigt die Zeilen grau, „Übernehmen“ setzt sie schwarz in den Brief, die Sätze der Vorlage, die sie ersetzen, treten zurück, und die Meldung nennt sie.",
    "„Entfernen“ bringt diese Sätze so zurück, wie sie waren; was danach noch gelb ist, etwa die Gehhilfe, wählst du selbst.",
    "Auf Station stehen unter dem Fallkopf Aufnahme, OP und Entlassung: „12.11.“, „heute“ oder „gestern“ genügt. Das Datum steht dann überall, wo der Brief es braucht; fehlt es, steht dort [OP-DATUM] fürs KIS. Hinter Fristen steht das errechnete Datum grau in Klammern, bis du es mit Ü übernimmst.",
    "Gehhilfe, Allergien und Klammern beantwortest du einmal: An den anderen Stellen steht deine Antwort grau, mit Ü übernehmen oder dort anders wählen.",
  ],
} as const;

export const TASTATUR_TITEL = "Tastatur";

/** Die Stunden kommen aus dem Speichermodul, damit der Text nicht von der Regel abweicht. */
export function datenschutz(stunden: { zna: number; station: number }) {
  return {
    titel: "Datenschutz",
    saetze: [
      "Keine Namen, keine Geburtsdaten, keine Fallnummern eintragen, auch nicht in freien Text. Der Merker ist für „Kabine 3“, nicht für Namen.",
      "Nichts verlässt diesen PC: Die App sendet nichts, alles bleibt in diesem Browser.",
      `Fälle verschwinden, wenn du das Browserfenster schließt, sonst nach ${stunden.zna} Stunden ohne Änderung in der Notaufnahme, nach ${stunden.station} Stunden auf Station. Am Ende des Dienstes: „Arbeitsplatz räumen“.`,
    ],
  };
}

export const ZEHN_MINUTEN = {
  titel: "Vor dem ersten Dienst",
  saetze: [
    "Einmal am eigenen Arbeitsplatz der Zehn-Minuten-Test: Unter Einstellungen den Arbeitsplatz-Check öffnen, die drei Probetexte nacheinander in ein Freitextfeld des KIS einfügen und Zeile für Zeile vergleichen. Nur an einem Testpatienten oder in einem leeren Feld, ohne zu speichern.",
    "Was dabei zu notieren ist, steht im Abschnitt „Zehn-Minuten-Test“ der ausführlichen Anleitung (ANLEITUNG.md).",
  ],
} as const;

export const SCHLUSSSATZ = "Kitteltext trifft keine medizinische Entscheidung. Der Text ist deine ärztliche Aussage und vor der Übernahme zu prüfen.";
