# Kitteltext

Formulierungshilfe für Arztbriefe in Orthopädie und Unfallchirurgie. Der Arzt tippt am Klinik-PC, was der Patient hat, sieht den ganzen Brief, füllt die Lücken, übernimmt oder ändert, was die Vorlage vorschlägt, und kopiert ihn Abschnitt für Abschnitt ins KIS. Zwei Einsatzorte: Notaufnahme (Ambulanzbrief) und Station (Entlassbrief).

Grundregel: Was die Vorlage über den Patienten aussagt, steht grau im Brief und wird erst kopiert, wenn der Arzt es übernommen, gewählt oder getippt hat.

Keine Felder für Name, Geburtsdatum oder Fallnummer. Kein Server. Die Seite sendet nichts.

Stand und offene Punkte: `docs/02-produkt/02-roadmap.md`. Einstieg für alle, die am Projekt arbeiten: `CLAUDE.md`.

## Starten

```bash
npm install
npm run build      # prüft Typen, baut dist/ und dist-einzeldatei/kitteltext.html
npm run preview    # gebauten Stand unter http://localhost:4173 ausliefern
npm test           # Engine-, Ablauf- und Katalogtests
npm run test:e2e   # baut, dann Klicktests im Browser (Playwright, vor jedem Build für den Partner)
npm run dev        # Entwicklungsserver
npm run status     # docs/03-inhalt/02-vorlagenstatus.md neu erzeugen
node tools/vorlage-zeigen.mjs zna-osg-distorsion   # eine Vorlage als Text ausgeben
```

## Für den Arzt

Die Bedienung steht in `ANLEITUNG.md`, dazu der Zehn-Minuten-Test, mit dem sich klären lässt, ob Kopieren und Einfügen am eigenen Klinik-PC funktioniert.

## Aufbau

Inhalte sind Daten (`src/data`), die Text-Engine (`src/engine`) kennt keine Diagnosen, die Oberfläche (`src/ui`) rechnet nichts Fachliches. Näheres in `docs/04-technik/01-architektur.md`; das Format der Vorlagen in `docs/04-technik/02-vorlagenformat.md`; die Sprachregeln in `docs/03-inhalt/01-stilrichtlinie.md`.

## Wichtig

Jede Vorlage zeigt ihren Prüfstand. „Standardtext" ist Wortlaut aus den eigenen Standardtexten des Nutzers. „Entwurf, ungeprüft" hat kein Arzt freigegeben. Der erzeugte Text ist in jedem Fall ärztlich zu prüfen, bevor er übernommen wird.

Die erste Fassung (Handy-App mit Übertragung per Code) liegt im Git-Tag `v1-stand-2026-07-22`.
