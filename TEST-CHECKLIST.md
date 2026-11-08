# Lifestyle2 – kontrollierte Testcheckliste

Nur mit eigens angelegten Testkonten und synthetischen Finanzdaten arbeiten. Keine echten Finanzdaten importieren. Kontolöschung ist irreversibel; vor dem Test keine produktiven Konten verwenden.

## Vorbedingungen

- [ ] Nur Sicherheitsbranch verwenden; Branch-Name und Commit-Referenz notieren.
- [ ] Firebase-Projekt-ID ist `lifestyle2-login`; Testzugriffe erfolgen ausschließlich gegen Emulator oder ausdrücklich freigegebene Testumgebung.
- [ ] Für Emulatorläufe Java 21, Node.js 22 und Firebase CLI verfügbar; Emulator-Projekt-ID `demo-lifestyle-rules` verwenden. `FUNCTIONS_DISCOVERY_TIMEOUT=60000` setzen.
- [ ] Zwei getrennte Testkonten A und B mit verifizierten E-Mail-Adressen vorbereiten. Zugangsdaten nicht in Logs oder Screenshots aufnehmen.
- [ ] Synthetische, leicht erkennbare Datensätze anlegen (z. B. `TEST-A-...`, `TEST-B-...`).
- [ ] Konsolenausgabe und Browserkonsole ohne Passwörter, Tokens, E-Mail-Adressen oder Finanzwerte dokumentieren.

## Desktop – Chrome oder Edge

### Logo, Assets und CSP

- [ ] Login zeigt das unveränderte LS-Original auf schwarzem Hintergrund; Browser-Tab-Favicon zeigt dasselbe Motiv.
- [ ] PWA-Manifest lädt die 180-, 192- und 512-Pixel-Dateien aus demselben unveränderten LS-Original; installierte Desktop-PWA und Benachrichtigungen zeigen dasselbe Motiv und kein Ersatzsymbol.
- [ ] `app.js`, `sw-register.js` und `styles.css` laden ohne 404; Design, Navigation und Interaktionen entsprechen dem bisherigen Stand.
- [ ] CSP-Report-Only-Verstöße einschließlich Firebase-/reCAPTCHA-Verbindungen und Trusted Types protokollieren. Enforced CSP enthält kein `unsafe-inline` in irgendeiner Direktive; tatsächliche Pages-Response prüfen.

### Anmeldung und Sitzung

- [ ] Registrierung A mit gültiger E-Mail und mindestens 12 Zeichen Passwort.
- [ ] Vor E-Mail-Verifizierung bleibt Finanzansicht gesperrt; Verifizierungslink und „erneut prüfen“ testen.
- [ ] Mit korrekter Domain anmelden; falsches Passwort, ungültige E-Mail, Netzwerkfehler und nicht autorisierte Domain getrennt prüfen.
- [ ] Passwort-Reset anfordern und generische Antwort beobachten, unabhängig davon, ob das Konto existiert.
- [ ] Abmelden und Browser neu laden; private Inhalte sind nicht sichtbar.
- [ ] Nach erfolgreicher Authentifizierung bei absichtlich verweigertem Firestore-Zugriff erscheint die Datenlade-Diagnose mit erneutem Versuch/Abmelden, nicht das normale Loginformular.
- [ ] Browser schließen/neu öffnen und konfigurierte Sitzungspersistenz prüfen.

### Kontoisolation und Datenfunktionen

- [ ] A legt je einen Testeintrag für Einnahmen, Ausgaben, feste Ausgaben, einmalige Ausgabe, Rate, Sparziel, verbundenes Konto, Kategorie und Notiz an.
- [ ] Verbundene Konten: Name, Kontotyp und Kontostand anlegen und bearbeiten; Entfernen muss eine Bestätigung verlangen.
- [ ] A meldet sich ab; B meldet sich an. Keine A-Daten dürfen im UI, in Suchergebnissen, Statistiken, localStorage-Schlüsseln von B oder Firestore-Pfaden von B erscheinen.
- [ ] B kann A-Dokumente weder lesen, auflisten, erstellen, ändern noch löschen. B kann ausschließlich sein eigenes `users/B_UID/...` lesen und ändern.
- [ ] B erstellt eigene Daten; nach Wechsel zurück zu A bleiben beide Datensätze getrennt.
- [ ] Filter, Monatsübersicht, Suche, Bearbeiten/Löschen, Layoutreihenfolge und Währung mit synthetischen Werten testen.
- [ ] XSS-Testzeichenfolgen in Namen, Notizen, Kategorien, Konten und Importdateien bleiben Text; kein HTML, Eventhandler oder Skript wird ausgeführt.

### Export und Wiederherstellung

- [ ] Sicherung herunterladen und Datei lokal auf JSON-Format, Version, UTF-8-Inhalte und erwartete Testdatensätze prüfen.
- [ ] Datei an einem anderen Testprofil wiederherstellen; Warnung und Anzahl der importierten Einträge prüfen.
- [ ] Vorheriger Cloud-Stand wird vor Import synchronisiert und als lokale Recovery-Kopie bewahrt.
- [ ] Alle Bereiche, Notizen, Erinnerungen, Beträge und Statistiken nach Wiederherstellung vergleichen.
- [ ] Beschädigtes JSON, unbekannte Version/Felder, falsche Datentypen, ungültige Beträge, Prototype-Schlüssel und Datei über 8 MB müssen vor Änderung abgewiesen werden.
- [ ] Unterbrochene Netzwerkverbindung beim Speichern simulieren; Recovery-Kopie und ausstehender lokaler Zustand bleiben erhalten.
- [ ] Nach erfolgreichem Cloud-Flush sind konto-gebundene lokale Klartextdaten beim Abmelden entfernt; nach fehlgeschlagenem Speichern bleiben sie zur Wiederherstellung erhalten.
- [ ] Import mit Konto B bewusst testen; Bestätigung muss deutlich machen, dass nur Bs aktueller Datenstand ersetzt wird.

### Sicherheit und Desktop-Layout

- [ ] CSP-Report-Only-Verstöße in der Konsole sammeln; keine Sicherheitsrichtlinie als bestanden werten, solange tatsächliche Pages-Header nicht geprüft sind.
- [ ] App Check ohne Site-Key meldet „nicht konfiguriert“; mit Test-Site-Key gültige Tokens und Monitoring-Metriken prüfen.
- [ ] Vor Auth-App-Check-Enforcement verifizieren, dass Firebase Authentication mit Identity Platform im Projekt eingerichtet ist.
- [ ] Emulator-Regeltests durchführen: `npx firebase emulators:exec --only firestore,auth --project demo-lifestyle-rules "node --test tests/*.test.mjs"`.
- [ ] Breite 1280 px, 1024 px und 768 px prüfen: kein abgeschnittener Inhalt, keine überlagerten Schaltflächen, Navigation und Scrollen funktionieren.

## Smartphone – iPhone Safari/PWA und Android Chrome

- [ ] Login, Safari-Tab/Startbildschirm-Symbol und installierte PWA zeigen das unveränderte LS-Original auf schwarzem Hintergrund.
- [ ] PWA/Service Worker lädt `app.js`, `sw-register.js`, `styles.css` und `apple-touch-icon.png.png` aus dem Cache; Update auf den aktuellen Cache-Namen funktioniert.

- [ ] Anmeldung, Registrierung, Verifizierung, Reset, Abmeldung und Wiederanmeldung auf jedem Zielbrowser wiederholen.
- [ ] Tastatur, Passwortmanager, Autofill, Safe Areas, Hoch-/Querformat und Bildschirmtastatur testen.
- [ ] Startseite, Buchungen, Auswertung, feste/einmalige Ausgaben, Raten, Sparziele, Konten, Kategorien, Notizen und Datensicherung bedienen.
- [ ] Bei 320–430 px Viewportbreite: keine horizontale Überläufe, abgeschnittenen Beträge, unsichtbaren Schaltflächen oder überlagerten Dialoge.
- [ ] Exportdatei über den nativen Download-/Dateimanager wiederfinden und aus dem Dateimanager importieren.
- [ ] Während Wiederherstellung zwischen WLAN/Mobilfunk wechseln; Fehlerzustand und lokale Recovery-Kopie prüfen.
- [ ] Push-Berechtigung nur nach bewusstem Tippen testen; Widerruf und erneute Registrierung prüfen.
- [ ] PWA offline starten: ausschließlich statische App-Hülle; private Cloud-Daten ohne bestätigte Anmeldung dürfen nicht eingeblendet werden.
- [ ] XSS-Testzeichenfolgen in allen sichtbaren Feldern prüfen.

### iPhone Safari / Home-Bildschirm-Web-App (echtes Gerät erforderlich)

- [ ] iOS-Version und Safari-Version dokumentieren; Website direkt in Safari öffnen, Login/Registrierung/Reset sowie Querformat, Safe Areas und Bildschirmtastatur prüfen.
- [ ] Über Teilen → „Zum Home-Bildschirm“ installieren; Startbildschirm-Symbol, Startbildschirm, App-Titel, Vollbilddarstellung und Update nach Cachewechsel prüfen.
- [ ] Push ist auf iOS nur für Web-Apps vom Home-Bildschirm verfügbar (iOS/iPadOS 16.4+); Safari-Webseiten allein genügen nicht. In der installierten Web-App Push nur nach bewusstem Tap aktivieren, Ablehnen/Widerruf prüfen und danach erneut aktivieren.
- [ ] Mit einem eigens freigegebenen Testkonto echte Test-Push zustellen; bei gesperrtem Bildschirm und geöffneter App prüfen, Inhalt auf sensible Finanzdetails kontrollieren, Antippen öffnet nur dieselbe Origin und richtigen App-Abschnitt.
- [ ] iOS Mitteilungseinstellungen, Fokusmodus, Benachrichtigungsdarstellung und Neustart prüfen. Apple verlangt, dass Push-Nachrichten unmittelbar als sichtbare Notification angezeigt werden; keine stillen Pushes einplanen.
- [ ] Offline starten, Navigation durch gecachte App-Hülle prüfen; private Daten erst nach Auth und verfügbarer Synchronisierung. Offline-Buchung, Wiederverbindung und Konflikt-/Recovery-Verhalten prüfen; Service Worker darf keine veralteten Kontoansichten zeigen.
- [ ] iOS Downloads: Export über Teilen/Dateien speichern, wieder importieren, Dateigröße und Datenintegrität vergleichen; App löschen/neu installieren nur mit Testdaten und vorher verifiziertem Export.

### Android Chrome / installierte PWA (echtes Gerät erforderlich)

- [ ] Android- und Chrome-Version notieren; Website laden, installieren, App-Icon und Vollbild starten, Browser-Tab und installierte App getrennt testen.
- [ ] Anmeldung/Registrierung/Reset/Logout, Passwortmanager, Autofill, Zurücknavigation, Rotation, Tastatur und Safe-Area/Viewport auf echtem Telefon testen.
- [ ] Push nach bewusster Nutzeraktion erlauben, verweigern, Systemeinstellungen widerrufen und erneut abonnieren; Testzustellung mit gesperrtem Bildschirm, App geschlossen und geöffnet.
- [ ] Benachrichtigungsinhalt auf vertrauliche Werte prüfen; Benachrichtigungstap, Duplikate, Aktualisierung und Abmeldung vom Push testen.
- [ ] Offline/Flugmodus: installierte App-Hülle starten, Requests/Fehlerzustand prüfen, Eingabe bei Sync-Ausfall erhalten, WLAN/Mobilfunk wieder aktivieren und Konfliktbehandlung verifizieren.
- [ ] Export/Import über Downloads und Dateiauswahl testen; ungültige/zu große Dateien dürfen Daten nicht ersetzen.
- [ ] Viewport 320–430 px, Hoch-/Querformat, große Schrift/Display-Skalierung, Systemnavigation und Browser-/PWA-Update kontrollieren.

Alle Push-Prüfungen sind mit synthetischen Erinnerungen und Testkonten durchzuführen. Der lokale Emulator kann FCM-Auth/Firestore testen, aber keine echte Apple-/Google-Push-Zustellung oder Geräteberechtigungen ersetzen.

## Kontolöschung (nur Testkonten)

- [ ] Vor Löschung Testdaten exportieren und Datei prüfen.
- [ ] Falsches Reauth-Passwort eingeben: kein Firestore-Dokument wird gelöscht.
- [ ] Mit korrektem Passwort löschen: Push-Abonnements, Zustellmarker, Finanzdokument und konto-gebundene lokale Schlüssel werden entfernt.
- [ ] Fehler/Netzwerkausfall an jedem Löschschritt simulieren und feststellen, ob Konto oder Unterkollektionen teilweise verbleiben.
- [ ] Nach Abschluss Login mit A testen; Auth muss abgelehnt werden und A-Daten dürfen nicht mehr lesbar sein.
- [ ] Restdaten im Emulator/Admin-Kontext prüfen; Kontolöschung ist aktuell clientseitig nicht atomar. Für Livebetrieb Backend-Löschprozess mit Retry und Status verwenden.

## Premium-Vorbereitung

- [ ] Free wird mit 0 € angezeigt/dokumentiert; Premium wird nur als geplanter Preis von 2,99 €/Monat dokumentiert.
- [ ] Keine Checkout-Schaltfläche, Zahlungsdaten, Abonnementerstellung oder tatsächliche Premium-Freischaltung vorhanden.
- [ ] Emulator bestätigt: Nutzer A kann nur A-Planstatus lesen; B kann A nicht lesen; kein Client kann Planstatus erstellen, ändern, auflisten oder löschen.
- [ ] Vor späterer Zahlung: Backend-Webhooks, Idempotenz, Kündigung, Erstattung, Wiederherstellung, Ablauf und Berechtigungswiderruf separat entwerfen und testen.

## Testergebnisprotokoll

| Lauf | Gerät/Browser | Branch/Commit | Konten | Ergebnis | Fehler/Notizen |
|---|---|---|---|---|---|
|  |  |  |  | offen |  |

## Lokale Prüfergebnisse – 7. November 2026

- Repository: `euosamo/LifeStyle2.00`; Branch `security-hardening-2026-11-04`; HEAD `9c7ecd777970acada346c69326b44c481da9885e`. Live- und Firebase-Einstellungen wurden nicht verändert.
- Java 21.0.13 ist lokal vorhanden unter `C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot`. Die globale `PATH`-Auswahl zeigt weiterhin auf Java 8; für Emulatorläufe `JAVA_HOME` auf den JDK-21-Pfad setzen und dessen `bin` voranstellen.
- Emulator-Suite: **28 bestanden, 0 fehlgeschlagen**. Auth-Emulator prüft zwei getrennte synthetische Konten, Verifizierung, Passwort-Reset, falsches Passwort und Abmeldung. Firestore-Regeln prüfen Benutzertrennung, Verifizierung, Schemas, Größenlimits, unzulässige Pfade und Plan-Entitlements. Erwartete `PERMISSION_DENIED`-Meldungen gehören zu verweigerten Negativtests.
- HTTPS-Browser-Smoke mit erzwungener aktueller CSP: bestanden in Chrome auf 1440×900 und 390×844. Lokales kurzlebiges selbstsigniertes Zertifikat, keine Vertrauensspeicheränderung. Login-/Original-Logo-Ansicht lädt, ohne horizontalen Überlauf. Im Desktop-Browser erfolgreich: Emulator-Registrierung, E-Mail-Verifizierung und erneute Prüfung, Laden der Cloud-Daten, tatsächlicher JSON-Download, Wiederherstellung, Zurückweisung eines manipulierten Imports, Passwort-Reset, erneute Anmeldung, Abmeldung und Kontolöschung. Zwei Browserkonten wurden getrennt geprüft: B sah As synthetische Buchung nicht; nach Löschung von A konnte A sich nicht mehr anmelden, während B weiter anmelden konnte.
- UI-Aktionen Erstellen, Bearbeiten und Löschen bestanden für Einnahmen, Ausgaben, Fixkosten, Einmalausgaben, Raten, Sparziele und Kategorien. Filter für Einnahmen/Ausgaben und aktuellen/vorherigen Monat, Statistiken nach Kategorien, persönliche Angaben und Währung wurden geprüft. Die Ansichten Startseite, Buchungen, Auswertung, Fixkosten, Einmalausgaben, Raten, Sparziele, Konten, Notizen, Einstellungen, persönliche Angaben, Erinnerungen und Sicherung renderten ohne Browser-JavaScriptfehler oder horizontalen Überlauf.
- Die CSP-Report-Only-Prüfung erfasste Inline-Eventhandler, Inline-/dynamische-Stile und Trusted-Types-Verstöße. Die aktuellen Benutzeraktionen funktionierten gleichzeitig mit der erzwungenen CSP und deren zusätzlichen `script-src-elem`-/`style-src-elem`-Beschränkungen in Chrome.
- Der Monatswähler auf der Startseite beschränkt den Offset auf Vormonat, aktuellen Monat und Folgemonat. Der HTTPS-UI-Test klickt zurück/vor und bestätigt mit synthetischen Buchungen, dass Einnahmen, Ausgaben und Einmalausgaben nur für den gewählten Monat in die Monatsübersicht einfließen. Fixkosten und monatliches Gehalt bleiben monatlich angesetzt.
- Der mobile Browserlauf ist eine Chrome-Viewport-Emulation, kein iPhone-Safari- oder iOS-PWA-Test. Eine echte Geräteprüfung bleibt offen.
- Die vollständige Browserfolge lässt sich mit `node tests/local-https-smoke.mjs` wiederholen, während Auth- und Firestore-Emulatoren laufen. Dafür müssen `LIFESTYLE_LOCAL_TLS_PFX` und `LIFESTYLE_CHROME_PATH` gesetzt sein. Das Testskript ersetzt Firebase-Konfiguration nur während der lokalen HTTP-Antwort und routet ausdrücklich zu `demo-lifestyle-rules` auf lokalen Emulatorports.
- Die erfolgreiche Authentifizierung und das Laden der Finanzdaten wurden im Emulator getrennt beobachtet. Die tatsächliche Cloudflare-Domainfreigabe und der Live-Firestore-Fehlercode des betroffenen Kontos sind ohne Zugriff auf Firebase Console und Browserkonsole nicht feststellbar.

### Reproduzierbarer lokaler HTTPS-Lauf (PowerShell)

Mit installiertem JDK 21 und Chrome:

```powershell
$jdk = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot'
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"
$env:LIFESTYLE_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:LIFESTYLE_LOCAL_TLS_PFX = Join-Path $env:TEMP ("lifestyle-local-test-" + [guid]::NewGuid().ToString('N') + '.p12')
& "$jdk\bin\keytool.exe" -genkeypair -alias localhost -keyalg RSA -keysize 2048 -validity 3 -storetype PKCS12 -keystore $env:LIFESTYLE_LOCAL_TLS_PFX -storepass lifestyle-local-test -dname 'CN=localhost' -ext 'SAN=dns:localhost,ip:127.0.0.1'
npx firebase emulators:exec --only firestore,auth --project demo-lifestyle-rules "node tests/local-https-smoke.mjs"
```

The temporary certificate expires after three days and is only used by the test browser with certificate warnings ignored. It must never be used for production or installed in a system trust store. Install the test dependencies together when needed: `npm install --no-save --no-package-lock firebase@10.12.2 @firebase/rules-unit-testing@3.0.4 firebase-tools@15.35.0 playwright-core`.

## Lokale Ergebnisse vom 7. November 2026

- JavaScript-Syntax sowie Backup-, statische Sicherheits- und Push-Tests: bestanden; 22/22 Tests.
- Auth-/Firestore-Emulator- und Sicherheits-Tests mit Java 21, ausschließlich Demo-Projekt: 30/30 Tests bestanden. Erwartete `PERMISSION_DENIED`-Meldungen stammen aus negativen Regeltests.
- HTTPS-Smoke in Chrome mit Auth-/Firestore-Emulatoren: Desktop 1440×900 und Smartphone-Viewport 390×844 bestanden. Geprüft wurden Auth, getrennte Konten, synthetischer Export/Import, Kontolöschung, alle Finanzansichten, Monats-/Filter-/Statistikfunktionen, Einstellungen, CSP und das originale LS-Bild auf der Loginansicht.
- Browser-CRUD: Einnahmen, Ausgaben, Fixkosten, Einmalausgaben, Raten, Sparziele, Kategorien, Notizen sowie Konten erstellen/bearbeiten/löschen bestanden. Ein gespeicherter XSS-Teststring blieb Text und führte keinen Handler aus.
- Diese Prüfungen sind lokale Emulator- und Chrome-Viewport-Tests. Sie bestätigen keine Firebase-Console-/Cloudflare-Liveeinstellung und ersetzen keinen iPhone-Safari-/Android-PWA-Test auf Geräten.

Ein kontrollierter Testbetrieb gilt erst dann als vorbereitet, wenn Emulator-, Zwei-Konten-, Export/Wiederherstellungs-, Auth- und Geräteprüfungen nachvollziehbar bestanden wurden. Diese Liste selbst ist kein Testergebnis.

## Historischer Abschlusslauf 8. November 2026 (vor Node-22-Wiederholung)

**Ergebnis:** alle 31 automatisierten Tests bestanden; lokaler HTTPS-Browserlauf bestanden. Java 21.0.13 wurde vom Firebase CLI erkannt und genutzt. Functions Emulator lief mit Host Node 24, weil in dieser Umgebung Node 22 nicht installiert war; die Cloud-Funktion deklariert Node 22 und muss lokal vor Freigabe mit dieser Version reproduziert werden.

`npm audit --prefix functions --omit=dev` meldete nach dem Abhängigkeits-Patch 0 bekannte Schwachstellen.

### Verifizierte Tests

- Auth Emulator: zwei getrennte synthetische Benutzer, Registrierung, E-Mail-Verifizierung, Anmeldung, falsches Passwort, Passwortzurücksetzung und Abmeldung.
- Firestore Rules Emulator: eigener Datenbaum, fremde UID, nicht verifizierter Benutzer, Schema-/Pflichtfeld-/Typ-/Größenvalidierung, Push-Subscriptions und Zustellmarker, nicht freigegebene Pfade sowie nur-lesbare Plan-Entitlements.
- Functions Emulator: fehlendes Auth wird abgewiesen; verifizierter Besitzer kann löschen; übermittelte fremde UID wird ignoriert; fremde Daten bleiben bestehen; rekursive Finanz-/Push-Unterdaten werden gelöscht; erneuter Löschaufruf ist idempotent.
- Backup/XSS/Worker: JSON-Roundtrip, Legacyformat, beschädigte/zu große/unerlaubte Backups, gefährliche Prototypfelder, Escaping und Push-ID-Encoding.
- HTTPS Chrome: Desktop 1440×900 plus 390×844 Smartphone-Viewport. Login-Gate/Logo, Login/Registrierung/Verifizierung/Reset/Logout, Einnahmen/Ausgaben/Fixkosten/Einmalausgaben/Raten/Sparziele/Kategorien/Notizen/Konten jeweils CRUD, verbundene Konten editieren/löschen, Negativsaldo `-1.500,75 €`, Monatswechsel, Filter/Sortierung, Statistiken, Einstellungen, Export/Wiederherstellung/Manipulationsabwehr, zwei Konten und Kontolöschung. App-Ansichten ohne horizontalen Überlauf; XSS-Teststrings erzeugten keine HTML-Elemente und führten nicht aus. JavaScript-Fehler: keine. CSP-/Trusted-Types-Befunde: keine.
- Erzwungene CSP enthält kein `unsafe-inline`. Die im Browser geprüften DOM-Ansichten enthalten keine Inline-Event- oder Styleattribute.
- Logo-Prüfung: Login und Verknüpfungen zu Favicon/iOS-Icon verweisen auf `apple-touch-icon.png.png`; Desktop/Viewport-Browser konnte das 180×180-Bild laden. Kein echter iPhone-Home-Bildschirmtest.

### Nicht ausgeführt / nicht beweisbar

- Kein echtes iPhone/Android, iOS-Safari, installierte PWA oder physischer Home-Bildschirm.
- Keine produktive Firebase Console/Cloudflare Pages geprüft oder geändert; E-Mail-Versand, Authorized Domains, aktive Regeln und tatsächlich ausgelieferte Header bleiben offen.
- Kein Test mit produktiven Nutzerkonten, echten Finanzdaten, echtem Push oder öffentlichem Abuse-Verhalten.
- Keine simulierte Firestore-Teillöschung/Permission-Unterbrechung und kein Live-IAM-Test. Firestore `recursiveDelete` ist nicht atomar, obwohl Wiederholung unterstützt wird.
- No independent security assessment; static and browser checks do not certify general absence of XSS.

### Lokale A