# Kitteltext

Deterministischer Textbaustein-Zusammensetzer für die O&U-/ZNA-Dokumentation.
Aus vorgegebenen Standardtexten wird in wenigen Taps am iPhone ein fertiger,
**anonymer** Untersuchungs- und Procedere-Text – und über einen PC-Zwilling oder
E-Mail auf den Klinik-PC gebracht.

> **Keine Patientendaten.** Kein Feld für Name, Geburtsdatum, Fallnummer – technisch
> nicht vorhanden. Freitext ist auf Zeichenklassen begrenzt. Der Personenbezug entsteht
> erst im KIS. Das ist die Architektur-Entscheidung, die die App strukturell aus
> DSGVO Art. 9, § 203 StGB und dem Medizinprodukterecht heraushält.

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver: http://localhost:5173  (App)
                   #                     http://localhost:5173/pc.html  (PC-Zwilling)
npm run validate   # Katalog-Struktur prüfen
npm run build      # Typecheck + App-Build (dist/) + Single-File-Zwilling (dist-pc/pc.html)
npm run preview    # gebaute App lokal servieren
```

## Was drin ist

**Kompletter Katalog** aus dem Standardtexte-ZNA-Dokument (20 Seiten), von einem
Modellierungs-Team überführt und bereinigt: **19 Regionen, 68 Bausteine, 33 Stapel**
– von Allgemeinbefund/Body-Check über die gesamte obere und untere Extremität bis
Wirbelsäule, Thorax und SHT. Tippfehler, Klinik-Interna, Personennamen und veraltete
Daten entfernt.

**App (PWA, iPhone-first)**
- Home mit Ein-Tap-Stapeln, „Zuletzt", Volltextsuche über alle Bausteine, anatomischem
  Regionen-Raster.
- Vollbild-**Seiten-Gate** (rechts/links/beidseits, kein Default, erzwungen,
  exportsperrend) – die einzige sicherheitskritische Entscheidung.
- **Composer** mit Negativ-Default: Normalbefund ist vorgewählt, nur Abweichungen
  antippen (gruppierte Chips), plus Zahl-/ROM-/Zeitraum-Felder und Slash-Auswahlen.
  Persistente Live-Vorschau. Auto-Persistenz nach jeder Änderung.
  - **Bausteine frei kombinieren:** Fall-Leiste mit „+ Baustein"-Picker (Suche,
    „✓ im Fall") und Entfernen – Untersuchung + Procedere + Allgemeinbefund beliebig
    in einem Fall, ohne Neuanfang.
  - Abweichungs-Zähler im Header, inline „auszufüllen"-Markierung offener Pflichtfelder,
    einmaliger Erklär-Tipp, dezentes haptisches Feedback.
- **Review** mit rot markierten offenen Pflichtangaben und **harter Export-Sperre**.
- **Übergabe** an den PC: Zustandscode, E-Mail-Fallback, Volltext-Kopie.
- **Fall als Stapel speichern**: eine ad-hoc gebaute Baustein-Kombination als eigene
  Ein-Tap-Kombination sichern – erscheint danach oben auf der Startseite.
- **Editor**: Stapel anlegen/ändern, Bausteine & Segmente bearbeiten, Katalog
  exportieren/importieren, auf Standard zurücksetzen.
- **Einstellungen**: Theme (System/Hell/Dunkel), Klinik-Postfach, In-App-PC-Empfang,
  Katalog-Info.
- **Theme**: folgt per Default dem Gerät (dunkel im Nachtdienst, hell am Tag),
  manuell überschreibbar.
- **PC-Empfang in der App**: derselbe Decode-Weg wie der Zwilling, aber innerhalb der
  App (für Klinik-PCs, die die App-Adresse im Browser öffnen können).
- Erststart-Zweckbestimmung, 56–64 px Trefferflächen, dezentes haptisches Feedback.
- Installierbar (Manifest), offline-fähig (Service Worker, nur im Produktions-Build).

**PC-Zwilling** (`dist-pc/pc.html`) – eine **einzige, eigenständige HTML-Datei**
(alles inline, kein Server, kein CDN). Nimmt den Zustandscode entgegen und rendert mit
derselben Engine denselben Text, mit großem „Alles kopieren"-Knopf.

## Sicherheit des Zustandscodes

Der Code enthält Version **und** einen strukturellen Katalog-Fingerprint sowie eine
Prüfziffer. Passt etwas nicht (falsche Version, bearbeiteter Katalog, Tippfehler),
zeigt der Zwilling einen **Fehler statt stillem Falschtext** – der gefährlichste Fall
(z. B. rechts statt links) ist damit ausgeschlossen. End-to-end verifiziert:
identischer Text auf iPhone und PC; verfälschte/ungültige Codes werden abgewiesen.

## Architektur

```
src/
  model/types.ts          Datenmodell (Region, Baustein, Segment, Platzhalter, Fall)
  data/
    katalog.ts            4 handgepflegte Kern-Regionen + Merge des Korpus
    corpus/*.json         15 vom Team modellierte Regionen (content-as-data)
    katalogStore.ts       effektiver Katalog (Standard oder eigener), reaktiv
  engine/
    render.ts             deterministisch: Fall -> Text, Export-Validierung
    statecode.ts          Zustandscode encode/decode + Fingerprint + Prüfziffer
  ui/                     App, Home, SeitenGate, Composer, Review, Uebergabe,
                          Settings, Editor, clipboard
  pc/                     PC-Zwilling (eigener Single-File-Build)
  store.ts, settings.ts, recent.ts
scripts/validate-corpus.mjs   Struktur-Validator für den Korpus
```

Kernprinzipien: Negativ-Default · Seite als Forcing Function · kein Personenbezug ·
rein deterministisch (kein Ableiten → kein Medizinprodukt) · genau ein erzwungener
Review · content-as-data · Wording-Disziplin (nie „empfohlen/Leitlinie/Assistent/KI").

## Noch offen – der eine echte Risikopunkt (macht der Arzt am Haus)

Erfassung und Übergabe-Wege sind fertig. Ob der beste Weg auf den Klinik-PC trägt,
entscheidet sich nur am konkreten Krankenhaus. Drei Tests, je ~10 Min:

1. **Clipboard-Test:** Am KIS-Arbeitsplatz etwas kopieren und in ein Freitextfeld
   einfügen – erlaubt oder von Citrix/Richtlinie gesperrt?
2. **Browser-Test:** Öffnet der Klinik-Browser eine lokale HTML-Datei / ein Lesezeichen
   (für den PC-Zwilling)? Ist das eigene Postfach am selben Rechner erreichbar?
3. **Epias/Dragon-Check:** Gibt es am Haus schon gute Textbausteine/Autotexte?

Fällt der Clipboard-Test, bleibt der E-Mail-Fallback. Fällt der Browser-Test, ist der
Zwilling nicht nutzbar, aber Code-Kopie/E-Mail funktionieren weiter.

## Mögliche nächste Ausbaustufen

- Optionaler Online-Pairing-Code (6-stellig) über einen Mini-Relay statt Abtippen.
- QR-Anzeige des Zustandscodes.
- Volleditor für Auswahl-Optionen und Platzhalter-Definitionen.
- Optionale Platzhalter, deren umgebendes Label bei leerem Wert verschwindet.
- PNG-App-Icons (aktuell SVG) für schöneres iOS-Home-Icon.
