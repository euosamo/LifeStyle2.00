# Lifestyle Finanzen – Firebase und Veröffentlichung

## Bestehende Architektur

- Firebase-Projekt: `lifestyle2-login`
- Anmeldung: Firebase Authentication mit E-Mail und Passwort
- Datenbank: Cloud Firestore
- Finanzdaten je Konto: `users/{uid}/appData/main`
- Push-Abonnements: `users/{uid}/pushSubscriptions/{subscriptionId}`
- Push-Zustellmarker: `users/{uid}/pushDeliveries/{deliveryId}`
- Die Web-Konfiguration in `firebase-login.js` enthält eine öffentliche Firebase-Web-API-Konfiguration. Diese API-Key-Angabe ist kein Ersatz für Firestore-Sicherheitsregeln und kein privates Secret.

## Vor dem Release zwingend in Firebase Console einstellen

1. **Authentication → Sign-in method:** E-Mail/Passwort aktivieren.
2. **Authentication → Settings:** E-Mail Enumeration Protection aktivieren.
3. **Authentication → Settings → Password policy:** Mindestlänge 12 Zeichen festlegen und Richtlinie serverseitig erzwingen. Die Prüfung im Browser allein ist umgehbar.
4. **Authentication → Settings → Authorized domains:** `lifestyle2-00.pages.dev` und nur tatsächlich verwendete eigene Domains eintragen. Nicht benötigte Domains entfernen.
5. Prüfen, dass E-Mail-Verifizierung für neue Konten verlangt wird.
6. **Google Cloud → APIs & Dienste → Anmeldedaten:** Den Firebase-Web-API-Key auf HTTP-Referrer der tatsächlich verwendeten App-Domains begrenzen. API-Beschränkungen erst nach einem Test mit allen benötigten Firebase-APIs setzen, damit Auth und Firestore nicht versehentlich blockiert werden.
7. **App Check:** Für die Web-App reCAPTCHA Enterprise oder einen geeigneten Web-Provider einrichten und zunächst nur Metriken beobachten. App Check für Firebase Authentication setzt Firebase Authentication mit Identity Platform voraus; vor einer Auth-Enforcement-Aktivierung muss in der Firebase Console geprüft werden, ob dieses Projekt dafür eingerichtet ist. Firestore Enforcement erst nach erfolgreichen Tests erzwingen, damit bestehende Nutzer nicht ausgesperrt werden. Siehe [Firebase Auth FAQ zu App Check](https://firebase.google.com/docs/auth/faq-and-troubleshooting#app-check).
8. **Firestore Database:** Die Regeln aus `firestore.rules` veröffentlichen und danach die aktiven Regeln in der Firebase Console kontrollieren.

Regeln veröffentlichen (mit einem autorisierten Firebase-CLI-Konto):
```bash
firebase deploy --only firestore:rules --project lifestyle2-login
```

Die Regeln verlangen jetzt bei allen Nutzerzugriffen eine gültige Anmeldung, die passende UID und `email_verified == true`. Datenobjekte und Push-Abonnements werden auf erlaubte Felder und Datentypen begrenzt. Nicht explizit freigegebene Pfade bleiben gesperrt.

### App Check am Client aktivieren

Der Client unterstützt Firebase App Check mit reCAPTCHA Enterprise und automatischer Token-Erneuerung. Die Initialisierung erfolgt vor Auth und Firestore. Vor Aktivierung sind diese Schritte nötig:

1. In Google Cloud reCAPTCHA Enterprise einen Website-Score-Key für die Web-App `1:436328668120:web:1550db3d0c8579773d30ad` anlegen. Für die Produktions-Site nur `lifestyle2-00.pages.dev` und tatsächlich verwendete eigene Domains erlauben.
2. In Firebase Console → **Sicherheit → App Check** die Web-App registrieren und denselben reCAPTCHA-Enterprise-Site-Key verknüpfen. Der Site-Key ist öffentlich. Keine Service-Account-, OAuth- oder sonstigen privaten Zugangsdaten in Git oder Browser eintragen; Provider-/Projektzuordnung in der Console verwalten.
3. Den öffentlichen Site-Key in `index.html` in `meta[name="firebase-app-check-site-key"]` eintragen. Diese Änderung ist aktuell nur lokal vorbereitet.
4. Die App auf einer echten HTTPS-Domain aufrufen und zunächst **nicht erzwingen**. In App Check die Anfragemetriken für Cloud Firestore beobachten; Authentication nur dann, wenn Identity Platform und Auth App Check aktiviert sind. Login, Verifizierung, Passwort-Reset, Laden, Schreiben, Echtzeit-Sync und Push-Abonnement mit den unterstützten Browsern prüfen.
5. Erst wenn alle legitimen Clients gültige Tokens senden, in der Firebase Console Enforcement für **Cloud Firestore** aktivieren. **Authentication** nur aktivieren, wenn das Firebase-Projekt für Firebase Authentication mit Identity Platform eingerichtet ist. Firebase weist darauf hin, dass Enforcement unbestätigte Anfragen abweist und die Aktivierung bis zu 15 Minuten benötigen kann. Siehe [Firebase Auth FAQ](https://firebase.google.com/docs/auth/faq-and-troubleshooting#app-check) und [Enforcement-Anleitung](https://firebase.google.com/docs/app-check/enable-enforcement).

Ohne Site-Key meldet der Client `window.lifestyleAppCheckConfigured === false`; App Check ist dann aus. Firestore-Regeln und Authentifizierung bleiben die primären Zugriffskontrollen. Keine Debug-Tokens in Produktion hinterlegen. Firebase empfiehlt für neue Web-Integrationen reCAPTCHA Enterprise; Token-Erneuerung ist im Client aktiviert.

### Premium später ergänzen

Es ist kein Zahlungssystem aktiv. Free ist mit 0 € und Premium mit vorläufig 2,99 €/Monat dokumentiert; es gibt noch keine bezahlten oder serverseitig freigeschalteten Funktionen. Der Firestore-Pfad `users/{uid}/entitlements/plan` ist für spätere serverseitige Entitlements reserviert: verifizierte Nutzer können nur ihr eigenes Dokument lesen; Client-Schreibzugriffe sind gesperrt. Eine spätere vertrauenswürdige Backend-Funktion muss nach bestätigtem Zahlungsereignis den Plan setzen und widerrufen. Der Client darf weder Preis noch Abo-Status als Berechtigungsquelle verwenden. Vor Freigabe sind Free/Premium-Funktionen, Kündigung, Erstattungen und Wiederherstellung fachlich zu definieren. Der vorläufige Preis 2,99 €/Monat wird nicht abgerechnet.

## Cloudflare Pages und Push-Worker

- Firebase Functions liegen absichtlich in `firebase-functions/`, weil ein Repository-Root-Ordner `functions/` von Cloudflare Pages als Pages Functions interpretiert wird. Das statische Pages-Paket wird mit `node scripts/build-pages.mjs` explizit nach `dist/` erstellt. In Cloudflare Pages muss als Build command `node scripts/build-pages.mjs` und als Build output directory `dist` konfiguriert sein. Das Paket enthält nur die Web-App und `_headers`; Tests, Firestore Rules und Firebase-Backendcode bleiben ausgeschlossen. Die Pages-Einstellung ist im Dashboard noch manuell zu bestätigen.
- `_headers` setzt HTTP-Sicherheitsheader nur, wenn die Datei im konfigurierten Pages-Ausgabeverzeichnis liegt. Das Build-Skript legt sie dorthin. Pages-Headerregeln gelten für statische Assetantworten; Antworten von Pages Functions brauchen eigene Headerregeln.
- Nach dem Deploy die tatsächlichen Antwortheader auf `https://lifestyle2-00.pages.dev` prüfen. CSP-Fehler in der Browserkonsole kontrollieren, da Firebase Auth und Firestore weiterhin erreichbar sein müssen.
- Worker-Secrets `FIREBASE_SERVICE_ACCOUNT_JSON` und `VAPID_PRIVATE_KEY` ausschließlich als Cloudflare Worker Secrets speichern. Niemals in GitHub, `wrangler.toml` oder Client-JavaScript eintragen.
- `VAPID_PUBLIC_KEY` darf öffentlich sein. `VAPID_SUBJECT` ist eine Kontaktangabe.
- Das Service Account des Push-Workers nur mit den minimal nötigen Firestore-Rechten ausstatten. Keine privaten Schlüssel im Browser verwenden.
- Der Push-Worker fragt App-Dokumente mit einem Feldfilter ab und ruft nur Erinnerungsbereiche (`reminders`, `notes`, `one`, `inst`) ab. Einmalige Ausgaben und Raten liegen derzeit als Arrays; Firestore kann deren Einzelelemente nicht per Projektion kürzen, weshalb darin noch Betragswerte an den Worker übertragen werden. Für stärkere Datenminimierung sollten Erinnerungsmetadaten später getrennt vom Finanzzustand gespeichert werden.
- Der Worker fragt derzeit per Collection-Group-Abfrage bis zu 1000 Dokumente pro Sammlung ab. Vor größerem Betrieb muss die Skalierungsgrenze geprüft werden.

### Cloudflare-Pages-Preview einrichten (noch nicht veröffentlicht)

1. Cloudflare Dashboard → **Workers & Pages** → das bestehende Pages-Projekt öffnen. Repository und Produktionsbranch kontrollieren; Produktionsbranch auf `main` belassen und nicht verändern.
2. **Settings → Builds & deployments → Build configuration**: Root directory auf Repository-Wurzel belassen, Build command auf `node scripts/build-pages.mjs` setzen und Build output directory auf `dist`. Build image / Environment variables: `NODE_VERSION=22` setzen, falls die Dashboard-Vorlage eine Runtime-Version verlangt.
3. Im Abschnitt **Branch control / Branch deployments** sicherstellen, dass `security-hardening-2026-11-04` nur als Preview gebaut wird und nicht Production ersetzt. Git-Integration kann Preview bei einem Push auslösen; in dieser Sitzung gab es keinen Push und keine Veröffentlichung. Vor einem späteren Push erst ausdrücklich freigeben.
4. Nach einem freigegebenen Preview-Build URL aufrufen und in DevTools → Network bei HTML, JS, CSS, Manifest und Icons die Antwortheader prüfen. Erwartet: CSP ohne `unsafe-inline`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS, COOP/CORP. Fehlerfrei Login, App Check, Firebase Calls und PWA-Install/Updates testen. `_headers` wird durch den Build in `dist` kopiert. Cloudflare dokumentiert, dass `_headers` statische Antworten beeinflusst; Pages Function-Antworten brauchen separat gesetzte Header.
5. Prüfen, dass die Preview keine Backenddateien ausliefert. Das lokale Build enthält genau zwölf allowlist-Dateien; URLs wie `/firebase-functions/index.js`, `/firestore.rules` und `/tests/` dürfen nicht zugänglich sein.

### App-Check-Einrichtung Schritt für Schritt

1. In Google Cloud Projekt `lifestyle2-login` auswählen und **reCAPTCHA Enterprise** öffnen. Falls die API/Abrechnung nicht eingerichtet ist, zuerst Projektinhaber:in/Billing-Verantwortliche:n einbeziehen.
2. **Create key → Website**, Score-basierte Integration wählen und einen Site-Key für die Web-App `1:436328668120:web:1550db3d0c8579773d30ad` anlegen. Für Production ausschließlich `lifestyle2-00.pages.dev` und tatsächlich verwendete Custom-Domains freigeben. Für lokale Entwicklung getrennten Dev-Key/Debug Provider einsetzen; Production-Key nicht für `localhost` erweitern.
3. Firebase Console → **App Check → Apps → Web-App** → reCAPTCHA Enterprise Provider wählen und denselben Site-Key registrieren. Provider/Projekt auf Übereinstimmung prüfen.
4. Den Site-Key in der lokalen Branchversion in `index.html` in `<meta name="firebase-app-check-site-key" content="…">` eintragen. Der Site-Key darf öffentlich ausgeliefert werden. Keine Admin-, OAuth-, Service-Account- oder private VAPID-Zugangsdaten eintragen.
5. Eine Preview nur nach ausdrücklicher Veröffentlichungsfreigabe mit HTTPS öffnen. In App Check zunächst **Metriken beobachten**: erfolgreiche und nicht verifizierte Requests für Firestore und Functions; Registrierung, Login, Reset, Datenladen/-speichern und `deleteOwnAccount` testen. Debug-Tokens nur lokal und nur für die Emulator-/Entwicklungs-App.
6. Erst nachdem legitime Requests auf allen vorgesehenen Clients akzeptiert werden, Enforcement einzeln für Firestore und Functions einschalten und direkt erneut testen. Bei Functions muss die Runtime-Service-Identität `roles/firebaseappcheck.tokenVerifier` (nur Tokenprüfung) erhalten. Auth-App-Check nicht ohne bestätigte Identity-Platform-Voraussetzung und eigenen End-to-End-Test aktivieren.
7. Site-Key Änderung nicht isoliert deployen. App Check Enforcement ohne korrekten Client-Site-Key kann alle legitimen Web-Requests blockieren.

## Kontolöschung und Datenschutz

Die App verlangt vor der Callable `deleteOwnAccount` eine erneute Passwortbestätigung. Der Server verlangt Authentifizierung, verifizierte E-Mail und `auth_time` innerhalb von fünf Minuten, verwendet ausschließlich `request.auth.uid`, entfernt rekursiv dessen `users/{uid}`-Teilbaum (einschließlich Push-Abonnements/-Marker) und löscht danach das Auth-Konto. Wiederholung ist möglich, ein Rollback nicht: Firestore recursiveDelete und Auth sind keine gemeinsame Transaktion. Ein Emulator-Test deckt erfolgreiche Löschung, unberechtigte Aufrufe, fremde UID-Manipulation, Erhalt eines zweiten Kontos und Wiederholung ab. Fehler in Live-IAM, Netzwerkunterbrechungen und Push-Provider-Abmeldung bleiben vor Testbetrieb manuell zu verifizieren. Der Code liegt lokal unter `firebase-functions/`; er ist nicht deployed.

## Wiederherstellung und XSS / CSP

JSON-Sicherungen werden mit Formatversion exportiert; alte Roh-JSON-Sicherungen bleiben importierbar. Die Wiederherstellung weist beschädigte, unbekannte, übergroße und strukturell ungültige Daten vor dem Ersetzen zurück, begrenzt importierte Zustände auf 700 KiB (unterhalb des Firestore-Dokumentlimits), synchronisiert den alten Cloud-Stand zuerst und legt vor der Änderung eine gerätegebundene lokale Rückfallkopie an. Diese Kopie ist nicht Ende-zu-Ende verschlüsselt und wird bei Browser-/Geräteverlust nicht wiederherstellbar sein. Die JSON-Datei selbst enthält Finanzdaten und muss vertraulich aufbewahrt werden.

Die erzwungene CSP enthält kein `unsafe-inline`, auch nicht in `script-src-attr` und `style-src-attr`. Das wurde mit dem lokalen Chrome-Smoke-Test und Trusted Types geprüft. Dynamische Ansichten laufen über eine zentrale Trusted-Types-Template-Pipeline; gespeicherte Nutzwerte werden escaped bzw. validiert. Die CSP erlaubt notwendige Firebase- und reCAPTCHA-Hosts und muss nach Dashboard-Umstellung auf echter Pages-Antwort validiert werden. Trusted Types und ein einzelner zentraler HTML-Sink sind keine allgemeine Sanitizer-Garantie.

Das vorhandene LS-Original in `apple-touch-icon.png.png` (180×180) wird unverändert für Login, Favicon und iOS-Home-Bildschirm verwendet. Die 192×192- und 512×512-PNG-Dateien sind proportionale Größenexporte direkt aus diesem Original ohne Beschnitt oder Neugestaltung, damit Chromium die üblichen Manifest-Icongrößen erhält. Das SVG-Ersatzsymbol wird nicht referenziert. Der [PWA-Manifest-Leitfaden](https://web.dev/articles/add-manifest) nennt für Chromium mindestens 192×192 und 512×512.

Die Benutzerfinanzen werden während einer Sitzung zusätzlich in konto-gebundenen `localStorage`-Schlüsseln gehalten. Sie sind nicht Ende-zu-Ende verschlüsselt und bleiben für Browser-Erweiterungen, lokale Gerätekonten und XSS derselben Origin zugänglich. Nach bestätigtem Cloud-Speichern löscht die Abmeldung jetzt den konto-gebundenen Klartextcache; bei einem fehlgeschlagenen/offline Speichern bleibt er zur Wiederherstellung erhalten. Das reduziert die gespeicherte Zeit, ersetzt aber keine Geräteverschlüsselung und schützt nicht vor aktivem XSS. Vor öffentlichem Betrieb sind Logout-/Retention-Verhalten und Wiederherstellung auf Zielgeräten zu prüfen.

## Vollständige manuelle Firebase-Prüfliste vor Testbetrieb

Diese Liste beschreibt noch nicht vorgenommene Console-Einstellungen. Firebase-Projekt-ID im Client ist `lifestyle2-login`; die Firebase Web API-Konfiguration ist öffentlich und ersetzt keine Rules.

1. **Firebase Console → Project settings → Your apps:** prüfen, dass die verwendete Web-App `1:436328668120:web:1550db3d0c8579773d30ad` zum Projekt `lifestyle2-login` gehört. Firebase Console → Authentication → Settings → **Authorized domains**: `lifestyle2-00.pages.dev` und nur tatsächlich genutzte eigene Domains eintragen.
2. **Authentication → Sign-in method:** E-Mail/Passwort aktivieren. **Settings:** Email enumeration protection, Verifizierungs-E-Mails, Passwort-Reset-Aktions-URL und produktive Absender-/Template-Einstellungen prüfen. Password policy auf die gewünschte Mindestlänge (lokaler Registrierungsdialog verlangt 12 Zeichen; produktive Regel muss in der Console ebenfalls erzwungen werden) einstellen. Live-Login, echte Zustellung und Rate-Limits mit eigens freigegebenen Testkonten testen.
3. **Firestore:** Datenbankstandort und tatsächlich aktive Datenbank ermitteln; Live-Rules mit `firestore.rules` vergleichen. Vor Veröffentlichung verschärfte Rules zuerst in Emulator/Preview testen und erst nach ausdrücklicher Freigabe veröffentlichen.
4. **App Check:** Die detaillierte manuelle Abfolge steht in „App-Check-Einrichtung Schritt für Schritt“. Kurz: Website-Score-Site-Key für die echten Domains erstellen, Web-App in Firebase App Check damit registrieren, öffentlichen Site-Key ins lokale Meta-Tag eintragen, Preview-Metriken beobachten und Enforcement nach erfolgreichem Test stufenweise aktivieren.
5. **Functions:** Firebase Functions benötigen Blaze-Abrechnung. Billing-Konto, Budgets und Benachrichtigungen festlegen. Firestore-Standort gegen `europe-west3` in Client und `firebase-functions/index.js` prüfen; Callable-Client und Function-Region müssen übereinstimmen. Funktionaler Code ist in `firebase-functions/` vorbereitet; weder Bereitstellung noch Regionsabgleich sind live erfolgt.
6. **Function Runtime Service Account / IAM:** dedizierte Runtime-Identität konfigurieren. Für App Check `roles/firebaseappcheck.tokenVerifier` (enthält `firebaseappcheck.appCheckTokens.verify`). Für Auth-Löschung ist die Berechtigung `firebaseauth.users.delete` notwendig; `roles/firebaseauth.admin` enthält sie, ist aber breiter als eine kundenspezifische Rolle. Firestore-Rechte müssen `datastore.entities.get`, `datastore.entities.list` und `datastore.entities.delete` für die rekursive Löschung abdecken; Standardrolle `roles/datastore.user` gibt zusätzlich Erstellen/Ändern und ist daher für Löschung allein zu breit. Möglichst minimale Custom Roles verwenden und in einem isolierten Cloud-Projekt mit der realen Function-Version testen, bevor irgendein produktives Recht vergeben wird. Keine Owner-/Editor-Rolle. Danach Löschung, Teilausfall und Wiederholung mit zwei Testkonten testen.
7. **Backups:** Firestore-Backup/PITR-Verfügbarkeit und Aufbewahrungsfristen abhängig von Datenbankedition/Abrechnung bewusst konfigurieren; Restore-Prozess und Datenexportzugriff dokumentieren. Es gibt keine automatische serverseitige Backup-Einrichtung in diesem Repository.
8. **Google API key:** HTTP-Referrer auf die Produktivdomains begrenzen und notwendige APIs erst nach vollständigem Auth/Firestore/App-Check-Test einschränken. Keine Service-Account-Schlüssel im Client.

## Tests und verbleibende Prüfungen

- Die GitHub-Action `.github/workflows/security-rules.yml` richtet Node 22 und Temurin Java 21 ein und startet Auth-, Firestore- und Functions-Emulator. Lokal Java 21, Node.js 22 und Firebase CLI 15.35.0 verwenden. Wegen kalter Functions-Discovery `FUNCTIONS_DISCOVERY_TIMEOUT=60000` setzen; Beispiel: `$env:FUNCTIONS_DISCOVERY_TIMEOUT='60000'; npx firebase emulators:exec --only auth,firestore,functions --project demo-lifestyle-rules "node --test tests/*.test.mjs"`.
- Tests prüfen: Konto-Trennung, verifizierte E-Mail, unberechtigte Nutzer, Daten-Schema, Push-Abonnements, Zustellmarker und gesperrte Standardpfade.
- Der Auth-Emulator-Test nutzt ausschließlich `demo-lifestyle-rules`, erstellt zufällige lokale Konten und liest Verifizierungs-/Reset-Codes nur aus dem lokalen Emulator. Er prüft keinen echten E-Mail-Versand, keine produktiven Passwortregeln, keine produktive Rate-Limitierung und keine autorisierten Live-Domains.
- Vor Release zusätzlich mit zwei echten Testkonten auf iPhone und Desktop testen: Registrierung, Bestätigung, Login, Logout, Reset, Synchronisierung, parallele Änderungen, Push, Datenexport und Kontolöschung.
- Die konkrete Desktop-/Smartphone-Testfolge steht in `TEST-CHECKLIST.md`.
- Die aktive Firebase-Konfiguration, Cloudflare Worker Secrets, IAM-Rollen und Live-HTTP-Header können nicht allein durch GitHub-Änderungen verifiziert werden.

### Lokale Nachprüfung bis 7. November 2026

- Die bisherigen Inline-Skriptblöcke und der bestehende Style-Block wurden in gleich-originige Dateien ausgelagert. Die Inhalte wurden dabei nicht funktional umgeschrieben; lokale Syntax- und statische Tests wurden ausgeführt.
- Diese Ergebnisse wurden am 7. November 2026 erweitert: Java 21.0.13 ist vorhanden unter `C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot`; die globale `PATH`-Auswahl verweist weiterhin auf Java 8. Die erfolgreiche lokale Emulator-Ausführung und der Chrome-HTTPS-Smoke-Test sind in `TEST-CHECKLIST.md` protokolliert.
- Der Emulator-Browserlauf nutzt ausschließlich synthetische Konten und `demo-lifestyle-rules`. Er testet Registrierung, E-Mail-Verifizierung mit erneutem Prüfen, Datenladen, Passwort-Reset, erneute Anmeldung, Logout, Export, Wiederherstellung und Kontolöschung. Keine echten Zugangsdaten oder produktiven Daten wurden verwendet.
- Der frühere Hinweis zum blockierten Windows-Browserzugriff bezog sich auf das Öffnen der veröffentlichten Firefox-URL. Ein lokaler Chrome-Test gelang inzwischen, auch in einer 390×844 Smartphone-Viewport-Emulation. Das ist kein iPhone-Safari-/PWA-Gerätetest.
- Die lokale Anmeldung zielt auf `lifestyle2-login` und trennt Auth-Fehler von Firestore-Ladefehlern. Der live geladene Code zeigt nach erfolgreichem Auth bei Firestore-Ladefehlern weiterhin die Login-Ansicht mit separater Meldung. Die konkrete Ursache des betroffenen Kontos und ob `lifestyle2-00.pages.dev` in Firebase **Authorized domains** steht, bleiben ohne Firebase-Console-Zugriff und den Live-Fehlercode offen.

**Wichtig:** Ein GitHub-Commit veröffentlicht weder Firestore-Regeln noch Worker-Secrets. Diesen Branch nicht ungeprüft in `main` mergen oder veröffentlichen.

### Nachprüfung 8. November 2026: CSP, Functions und Veröffentlichungsvoraussetzungen

> Dieser Auditabschnitt ist der aktuelle Stand. Ältere Hinweise zu `functions/`, `unsafe-inline`, Node 24 und clientseitiger Kontolöschung in historischen Zwischenständen wurden durch die Nachprüfungen in diesem Dokument ersetzt.

- Der ältere Hinweis weiter oben, dass `unsafe-inline` in Attributdirektiven verbleibe, ist überholt. Die erzwungene CSP setzt jetzt `script-src-attr 'none'` und `style-src-attr 'none'`; `unsafe-inline` kommt in keiner CSP-Direktive vor. Der lokale Chrome-Lauf meldete unter erzwungener Policy und Trusted Types keine Verletzung. Vor Auslieferung müssen Cloudflare-Pages-Header dennoch separat kontrolliert werden.
- Kontolöschung ist jetzt für einen späteren Backend-Deploy als Callable Function `deleteOwnAccount` unter `functions/` vorbereitet. Das Backend prüft Auth, verifizierte E-Mail und höchstens fünf Minuten alte Authentifizierung, löscht ausschließlich den UID-eigenen Firestore-Unterbaum und anschließend Auth. Die Funktion wird durch App Check geschützt, sobald sie außerhalb des Emulatorbetriebs ausgeführt wird. Browser-Push-Abmeldung ist zusätzlich best effort; gespeicherte Push-Abonnements im Firestore-User-Unterbaum werden rekursiv entfernt.
- Firestore `recurs