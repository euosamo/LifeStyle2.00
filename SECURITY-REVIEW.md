# Lifestyle – Sicherheitsprüfung

## Sicherheitsverbesserung – 5. November 2026

### Vergleich mit der veröffentlichten Konfiguration

Die in der Firebase Console gelesenen Live-Regeln erlauben dem angemeldeten Kontoinhaber Lesen und Schreiben unter `users/{uid}/appData/main` und `pushSubscriptions`, prüfen aber keine E-Mail-Verifizierung und validieren weder Felder noch Datentypen oder Größen. Die Regeln im Branch hatten bereits eine UID- und E-Mail-Verifizierungsprüfung sowie erste Validierung. Sie ließen jedoch noch große bzw. nicht ausreichend begrenzte App-Zustände und Abonnementdaten zu.

### Umgesetzte Änderungen

- `appData/main`: ausschließlich verifizierte Eigentümer; festgelegte Felder und Typen, Wertebereiche, Enumerationen, begrenzte Listenlängen sowie verschachtelte Prüfungen für Layout- und Erinnerungseinstellungen. Erstellen und Aktualisieren verlangen Zeitstempel der Serveranfrage und revisionsgenaue Erhöhung.
- `pushSubscriptions`: Eigentümerprüfung, festes Schema, begrenzte Zeichenketten, Formatprüfung für Dokument-ID und Schlüssel, Zeitstempelprüfung sowie HTTPS-Endpunkte nur von unterstützten Push-Anbietern.
- `pushDeliveries`: verifizierte Eigentümer dürfen eigene Marker lesen und löschen; Erstellen und Aktualisieren bleiben gesperrt. Nicht abgedeckte Pfade bleiben standardmäßig gesperrt.
- Emulator-Tests decken Eigentümertrennung, fehlende E-Mail-Verifizierung, ungültige Felder/Typen/Werte/Größen, Revisionsregeln, Push-Endpunkte, Markerberechtigungen und unbekannte Pfade ab. Der statische Regressionstest wurde an die strengere Revisionsprüfung angepasst.

### Testergebnisse

Am 5. November 2026 erfolgreich mit Firebase CLI 15.35.0 und Firestore Emulator ausgeführt: `node --test tests/*.test.mjs` innerhalb von `firebase emulators:exec --only firestore --project demo-lifestyle-rules`. Ergebnis: 14 Tests bestanden, 0 fehlgeschlagen. Der Emulator verwendete ein Demo-Projekt; es wurden keine produktiven Daten gelesen oder verändert.

### Auswirkungen und offene Risiken

- Der aktuelle Client schreibt die für `appData` erlaubten Felder, inkrementiert `revision` um genau eins und speichert Push-Abonnements im geprüften Format. Damit ist für die aktuelle App keine direkte Inkompatibilität erkennbar.
- Alte gespeicherte Zustände mit zusätzlichen Feldern oder nicht passenden Werten können beim nächsten Schreiben abgewiesen werden. Produktivdaten wurden nicht inspiziert; vor einer späteren Freigabe muss die Migration/Kompatibilität mit repräsentativen Konten geprüft werden.
- Regeln können Einträge innerhalb beliebiger Listen nicht rekursiv validieren. Listenlängen und wesentliche Einstellungsfelder sind begrenzt; die maximale Firestore-Dokumentgröße bleibt zusätzlich relevant.
- Der Grenzwert für Listen kann bei sehr großen Konten das Speichern verhindern. App-seitige Normalisierung, Migration und Tests auf iPhone/Desktop mit zwei Konten stehen noch aus.
- Die in Firebase Console gelesenen veröffentlichten Regeln bleiben unverändert. Diese Änderungen wurden nicht veröffentlicht und betreffen nicht die Live-App.

## Änderungen in diesem Branch

- Firestore-Datenzugriffe verlangen eine angemeldete, E-Mail-verifizierte UID und beschränken jeden Nutzer auf den eigenen Datenpfad.
- Firestore-Schreibvorgänge für Finanzdaten und Push-Abonnements werden auf erlaubte Felder und Datentypen geprüft; Revisionsnummern müssen monoton um genau eins steigen. Push-Endpunkte sind auf bekannte Browser-Push-Anbieter begrenzt, um beliebige ausgehende Anfragen des Workers (SSRF) zu verhindern.
- Neue Konten benötigen mindestens 12 Zeichen beim Passwort; bestehende Konten können sich weiterhin mit ihrem bisherigen Passwort anmelden.
- HTTP-Sicherheitsheader werden über Cloudflare-Pages-`_headers` gesetzt.
- Push-Benachrichtigungen dürfen nur noch zur eigenen App-Origin navigieren; der Push-Worker sendet nur an freigegebene FCM-, Mozilla-, Apple- und Windows-Push-Hosts.
- Emulator-Tests prüfen Nutzertrennung, E-Mail-Verifizierung, erlaubte Datenformen und standardmäßige Sperren.
- App Check ist clientseitig für reCAPTCHA Enterprise vorbereitet. Ohne Site-Key bleibt es absichtlich inaktiv; Einrichtung und Monitoring/Enforcement in Firebase sind manuelle Release-Schritte.
- `users/{uid}/entitlements/plan` ist als künftiger serververwalteter Planstatus reserviert: Eigentümer dürfen nur ihr eigenes Dokument lesen, Client-Schreibzugriffe sind gesperrt. Es gibt keine Zahlungsintegration und keine aktive Premium-Freischaltung.
- Export/Wiederherstellung nutzt versioniertes JSON, Größen- und Strukturprüfung, Rückfallkopie und Cloud-Flush vor und nach Wiederherstellung. Diese Abläufe wurden im lokalen HTTPS-Browserlauf mit synthetischen Emulator-Konten geprüft; reale produktive Konten wurden nicht verwendet.
- Historischer Zwischenstand; ersetzt durch den Abschlussnachweis unten: die erzwungene CSP enthält in keiner Direktive `unsafe-inline`.
- Firebase-Login und Datenladefehler sind im UI getrennt. Ein erfolgreicher Firebase-Login bei verweigertem Firestore-Zugriff zeigt nun einen eigenen Diagnose-/Retry-/Abmeldezustand, statt weiter das Loginformular darzustellen.
- Der Push-Worker liest nur noch die für Erinnerungen benötigten Firestore-Felder und kodiert Reminder-Marker als UTF-8-sicheres Base64URL; zuvor konnten bestimmte Unicode-Zeichen die Push-Verarbeitung abbrechen.
- Das vorhandene LS-Original `apple-touch-icon.png.png` (180×180) wird unverändert an Login, Favicon und iOS-Startbildschirm referenziert. Die Manifest-/Push-Dateien mit 192×192 und 512×512 sind proportionale Größenexporte direkt aus dem Original ohne Zuschnitt oder Redesign; das SVG-Ersatzsymbol wird nicht als App-Icon verwendet.
- Der bisherige App- und Service-Worker-Registrierungscode wurde ohne funktionale Umschreibung in `app.js` und `sw-register.js` ausgelagert; die vorhandene CSS-Regeldatei wurde unverändert nach `styles.css` ausgelagert. Der Service-Worker-Cache wurde dafür aktualisiert. Inline-Handler und dynamische `style`-Attribute bleiben noch vorhanden.
- Die Report-Only-CSP prüft jetzt zusätzlich Trusted Types. Firebase Auth App Check ist nur mit Firebase Authentication und Identity Platform möglich; der notwendige Console-Status ist lokal nicht einsehbar.

## Was diese Änderungen nicht automatisch erledigen

### Read-only Live-Beobachtung am 6. November 2026

Die Pages-Adresse `https://lifestyle2-00.pages.dev/` antwortete mit HTTP 200. Die ausgelieferte `firebase-login.js` zeigte `projectId` und `authDomain` des erwarteten Firebase-Projekts `lifestyle2-login`; die autorisierten Domains in der Firebase Console konnten nicht eingesehen werden. Die ausgelieferte Version enthielt die lokalen Login-Diagnoseänderungen und App-Check-Vorbereitung dieses Branches noch nicht. In den abgerufenen Antwortheadern waren `X-Content-Type-Options` und `Referrer-Policy` vorhanden; eine Content-Security-Policy, `X-Frame-Options` und HSTS wurden nicht beobachtet. Das ist eine Prüfung des HTTP-Abrufs, kein Browserkonsolen- oder echter Anmeldetest.

Bei der neuen lokalen Browserprüfung blockierte die Browserautomation bereits den Firefox-Zugriff mit „URL policy enforcement is not yet supported“. Daher konnte die Browserkonsole nicht gelesen, kein Live-Login getestet und kein PC-/Smartphone-Rendering bestätigt werden. Es wurden keine Zugangsdaten eingegeben. Die zuvor abgerufene Live-Konfiguration wies zwar auf das richtige Firebase-Projekt, belegt aber nicht, dass die Pages-Domain in Firebase Authorized Domains freigegeben ist.

Der Auth-Emulator-Test ist angelegt, ließ sich lokal aber nicht starten: Firebase CLI wartete auf den Emulator-Hub-Port 4400, der innerhalb des Timeouts nicht aktiv wurde. Der kombinierte Firestore/Auth-Lauf ist zusätzlich durch die vorhandene Java 8-Laufzeit blockiert; Firebase CLI 15.35.0 verlangt Java 21+. Zwei Installationsversuche für Temurin 21 starteten den Installer, ließen aber keinen Installerprozess und keinen installierten JDK-21-Pfad zurück. Daher sind Auth-, Zwei-Konten-, Rules- und Wiederherstellungsabläufe mit Firebase-Emulatoren noch nicht als bestanden zu werten.

Die lokalen Unit-/statischen Tests liefen mit 20/20 bestanden; JavaScript-Syntaxchecks der App-, Login-, Service-Worker- und Testdateien liefen ohne Fehler. Firestore-/Auth-Emulator-, echte Konto-, Kontolöschungs-, Wiederherstellungs- und Geräte-Tests liefen nicht und gelten ausdrücklich nicht als bestanden.

### Aktualisierung 7. November 2026

Die obigen 6.-November-Angaben sind ein damaliger Zwischenstand und werden durch die folgenden lokalen Prüfergebnisse aktualisiert:

- Java 21.0.13 steht unter `C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot` bereit. Mit Java 21 bestanden **28 von 28** Auth-, Firestore-Regel- und Sicherheitsprüfungen.
- Ein lokaler HTTPS-Chrome-Lauf mit synthetischen Emulator-Konten bestand bei 1440×900 und 390×844. Er prüfte Auth, Verifizierung, Passwort-Reset, Export/Import, Kontolöschung, Benutzertrennung und alle Finanzbereich-Ansichten. Erstell-, Bearbeit- und Löschaktionen für alle sechs Finanzdatentypen und Kategorien bestanden; Filter, Monatsperioden, Kategorienstatistik und Einstellungen wurden ebenfalls geprüft.
- Historischer Zwischenstand; nachfolgend dokumentiert ist der vollständige CSP-Entzug und der Browser-Smoke ohne CSP-/Trusted-Types-Meldungen.
- Ein reproduzierbarer Monatsfehler wurde lokal behoben: Die Startseite bietet jetzt einen Monatswähler (Vormonat, aktueller Monat, Folgemonat) und beschränkt Buchungen/Einmalausgaben der Monatsübersicht auf den ausgewählten Monat. Der HTTPS-Test klickt den Monatswechsel und prüft synthetische Summen; Fixkosten und Gehalt bleiben als monatliche Werte berücksichtigt.
- Die lokale Simulation belegt keine Live-Domainfreigabe, keine aktiven Cloud-Regeln/-Header, keinen App-Check-Enforcement-Status und keinen erfolgreichen iPhone-Safari-/PWA-Lauf. Es wurden keine Produktivkonten oder Live-Einstellungen angefasst.

### Nachprüfung 7. November 2026 – verbundene Konten und lokale Sicherheit

- Die Kontenübersicht unterstützt nun Erstellen, Bearbeiten von Name/Typ/Kontostand und bestätigtes Entfernen. Das sind lokal gespeicherte Übersichtseinträge; es wird keine Bankverbindung hergestellt oder auf Konten zugegriffen. Bearbeiten/Löschen verwenden Eventdelegation; Nutzerdaten werden beim Rendern escaped.
- Historischer CSP-Zwischenstand, durch den nachfolgenden Abschlusslauf ersetzt.
- Nach erfolgreichem Cloud-Flush löscht Abmelden die konto-gebundenen lokalen Klartextdaten. Bei fehlgeschlagenem/offline Flush bleibt die Wiederherstellungskopie erhalten. Bei Kontolöschung wird der lokale Cache erst nach erfolgreicher Firebase-Auth-Löschung entfernt. Firestore und Auth bleiben zwei getrennte, nicht atomare Vorgänge; ein serverseitiger Löschprozess wäre robuster.
- Die lokale Speicherverschlüsselung wurde nicht eingeführt: ein Schlüssel im selben Browser-Origin böte bei XSS keinen wirksamen Schutz und ein zusätzliches Passwort/Recovery-Verfahren wäre eine relevante Produktänderung. Der aktive Sitzungscache bleibt unverschlüsselt.
- Ein getesteter XSS-String in Finanzdaten blieb im HTTPS-Chrome-Lauf Text und löste kein Ereignis aus; das ist kein allgemeiner Nachweis von XSS-Freiheit.
- Die abschließende Java-21-Emulator-Suite bestand 30/30 Auth-, Firestore-Regel- und statische Tests. Der abschließende lokale HTTPS-Chrome-Lauf bestand mit Konten-CRUD und XSS-Test bei Desktop- und Smartphone-Viewport. Ergebnisse stehen im aktualisierten Testprotokoll.

1. Die Firestore-Regeln in diesem Repository werden nicht automatisch in Firebase veröffentlicht. Sie müssen separat in Firebase deployed und anschließend in der Firebase Console geprüft werden.
2. Der Code kann die Firebase-Console-Einstellungen nicht ändern. In Authentication sind E-Mail Enumeration Protection, erlaubte Domains, E-Mail/Passwort-Anmeldung und die aktuelle Passwort Policy zu kontrollieren.
3. Cloudflare Worker Secrets und Berechtigungen müssen in Cloudflare geprüft werden. Der Service Account sollte nur die nötigen Firestore-Rechte haben; private Schlüssel gehören ausschließlich in Worker Secrets.
4. Die CSP muss nach Eintragung des Pages-Build-Ausgabepfads auf der tatsächlichen Cloudflare-Pages-Domain im Browser und in den Response-Headern geprüft werden. Lokaler HTTPS-Chrome-Test hat die erzwungene Richtlinie und Trusted Types geprüft; das ist kein Nachweis der Live-Pages-Konfiguration.
5. Finanzdaten im Browser-Cache/localStorage sind nicht Ende-zu-Ende verschlüsselt. Cloud-Speicherung über Firestore und HTTPS ist keine Ende-zu-Ende-Verschlüsselung.
6. Echte freigegebene Testkonten, iPhone-Safari-/PWA-Geräte, produktive Domain-/Header-Konfiguration, Push und ein unabhängiger Penetrationstest sind weiterhin erforderlich. Zwei-Konten-, Export/Wiederherstellungs- und Kontolöschungsabläufe bestanden lokal ausschließlich mit Emulator-Konten und synthetischen Daten.
7. Der GitHub-Branch `main` ist derzeit nicht geschützt (`protected: false`). Vor einem Merge sollte Branch Protection mit Pull-Request-Pflicht, erforderlichen Security-Checks und gesperrtem Force-Push eingerichtet werden. Diese Repository-Einstellung wurde nicht durch den Code-Branch geändert.

## Release-Regel

Diese Änderungen bleiben in einem separaten Branch. Die lokalen Emulator- und Chrome-Tests sind bestanden; das genügt nicht für einen kontrollierten Livebetrieb. Vorher müssen Firebase-Domain und aktive Regeln in der Console geprüft werden, die Sicherheitsheader auf Pages bestätigt werden sowie reale iPhone-/Desktop- und Push-Tests mit freigegebenen Testkonten erfolgen. Nicht in `main` mergen und nicht veröffentlichen, bevor diese Punkte abgeschlossen und ausdrücklich freigegeben wurden.


### Abschluss-Nachprüfung – 8. November 2026

> Korrektur des früheren Emulator-Zwischenstands: Der nachfolgende Node-22-Wiederholungslauf ist maßgeblich. `firebase-functions/` ist der Firebase-Backendpfad; Cloudflare Pages muss das über `scripts/build-pages.mjs` erzeugte `dist/` veröffentlichen, damit `functions/` nicht als Pages-Functions-Route interpretiert wird.

Dieser Abschnitt ersetzt ältere Zwischenstände in diesem Dokument, soweit sie bei CSP, Kontolöschung und Testzahlen abweichen.

- CSP: `unsafe-inline` ist aus `script-src`, `style-src`, `script-src-attr` und `style-src-attr` entfernt. Inline-Eventattribute und Styleattribute in den App-Templates werden vor dem Einfügen in erlaubte Eventdelegation bzw. statische CSS-Klassen übersetzt. Es gibt im ausgelieferten DOM keine solchen Attribute. Der einzige `innerHTML`-Sink liegt im zentralen Trusted-Types-Template-Wrapper (`setAppMarkup`); Auth-Fehleransichten verwenden DOM-Erzeugung und `textContent`. Ein Browserlauf mit erzwungener CSP und Trusted Types meldete keine CSP-/Trusted-Types-Verstöße. Die Trusted-Types-Policy selbst ist kein allgemeiner Sanitizer: Sicherheit hängt weiterhin an der internen Template-Pipeline, dem kontextgerechten Escaping und der Freigabeliste der UI-Aktionen.
- XSS: synthetische HTML-/Eventhandler-Payloads in Buchungen, Kategorien, Fixkosten, Einmalausgaben, Raten, Sparzielen, Konten und Notizen wurden gespeichert und über Browseransichten geprüft. Sie blieben Text bzw. erzeugten kein HTML-Element; kein Payload wurde ausgeführt. Das ist eine konkrete Regressionprüfung, kein mathematischer Beweis allgemeiner XSS-Freiheit.
- Kontolöschung: `deleteOwnAccount` (Quelle `firebase-functions/index.js`) verlangt angemeldete, bestätigte E-Mail und Authentifizierung innerhalb der letzten fünf Minuten. Sie ignoriert übermittelte UIDs, löscht rekursiv ausschließlich `users/{request.auth.uid}`, danach das Auth-Konto und akzeptiert eine Wiederholung, wenn das Auth-Konto bereits fehlt. Der Aufruf ist mit Functions-, Auth- und Firestore-Emulator getestet; ein zweites Konto und dessen Daten blieben erhalten. Firestore-Löschung ist produktbedingt nicht atomar: bei einem Fehler kann ein Teilbaum schon entfernt sein. Der Endpunkt ist wiederholbar, aber kein transaktionaler Rollback. Die lokale Browser-Push-Abmeldung ist Best Effort; die serverseitigen Push-Dokumente werden mit dem Nutzerdatenbaum entfernt.
- Emulator-/Automatiktests: **31/31 bestanden** mit Java 21.0.13 in Demo-Emulatoren; Auth (zwei Konten), Firestore-Regeln, Schema-/Größenvalidierung, Entitlements, XSS-Helfer, Backup/Restore, Push-ID und serverseitige Löschung wurden abgedeckt. Erwartete `PERMISSION_DENIED`-Logs gehören zu negativen Regeln.
- HTTPS-Chrome-Smoke mit allen drei Emulatoren: bestanden bei 1440×900 Desktop und 390×844 Smartphone-Viewport. Enthalten waren Auth, Verifizierung, Reset, Logout, synthetische Finanzfunktionen, Konten-CRUD und Negativsaldo `-1.500,75 €`, Monatswechsel, Filter, Kategorienstatistik, Einstellungen, Export/Import/Manipulationsabwehr, zwei Konten, Kontolöschung und Wiederanmeldung. Alle geprüften App-Ansichten passten ohne horizontalen Überlauf. Browser-JavaScriptfehler: keine; CSP/Trusted Types: keine Meldungen.
- Historischer Zwischenstand: damaliger Emulatorlauf nutzte Node 24. In der Nachprüfung vom 8. November wurden Emulator und Testprozesse explizit mit Node 22 wiederho