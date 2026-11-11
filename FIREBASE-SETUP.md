# Lifestyle Finanzen – Firebase und Veröffentlichung

> **Aktueller Rebuild-Stand (11.11.2026):** Dieser Entwicklungszweig basiert direkt auf dem unveränderten main (9149a2c6268503ef2791d7ea8c58d7fd7ce01c2d). Die originale index.html-Finanzoberfläche und Navigation bleiben erhalten; ergänzt wurden Auth/App Check, serverseitige Finanzdatenvalidierung, strenge Firestore-Regeln, isolierter Staging-Einstieg und Tests. main wurde nicht verändert und es wurde nichts live deployed. Vor Livebetrieb müssen Firebase-/Cloudflare-Console-Einstellungen, Site-Key-Token-Ausstellung und reale Geräte geprüft werden.


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
3. Der öffentliche Site-Key ist im Entwicklungszweig in `index.html` in `meta[name="firebase-app-check-site-key"]` eingetragen. Eine erfolgreiche Token-Ausstellung und Validierung auf der autorisierten Produktionsdomain ist noch nicht belegt.
4. Die App auf einer echten HTTPS-Domain aufrufen und zunächst **nicht erzwingen**. In App Check die Anfragemetriken für Cloud Firestore beobachten; Authentication nur dann, wenn Identity Platform und Auth App Check aktiviert sind. Login, Verifizierung, Passwort-Reset, Laden, Schreiben, Echtzeit-Sync und Push-Abonnement mit den unterstützten Browsern prüfen.
5. Erst wenn alle legitimen Clients gültige Tokens senden, in der Firebase Console Enforcement für **Cloud Firestore** aktivieren. **Authentication** nur aktivieren, wenn das Firebase-Projekt für Firebase Authentication mit Identity Platform eingerichtet ist. Firebase weist darauf hin, dass Enforcement unbestätigte Anfragen abweist und die Aktivierung bis zu 15 Minuten benötigen kann. Siehe [Firebase Auth FAQ](https://firebase.google.com/docs/auth/faq-and-troubleshooting#app-check) und [Enforcement-Anleitung](https://firebase.google.com/docs/app-check/enable-enforcement).

Ohne Site-Key meldet der Client `window.lifestyleAppCheckConfigured === false`; App Check ist dann aus. Firestore-Regeln und Authentifizierung bleiben die primären Zugriffskontrollen. Keine Debug-Tokens in Produktion hinterlegen. Firebase empfiehlt für neue Web-Integrationen reCAPTCHA Enterprise; Token-Erneuerung ist im Client aktiviert.

### Premium später ergänzen

Es ist kein Zahlungssystem aktiv. Free ist mit 0 € und Premium mit vorläufig 2,99 €/Monat dokumentiert; es gibt noch keine bezahlten oder serverseitig freigeschalteten Funktionen. Der Firestore-Pfad `users/{uid}/entitlements/plan` ist für spätere serverseitige Entitlements reserviert: verifizierte Nutzer können nur ihr eigenes Dokument lesen; Client-Schreibzugriffe sind gesperrt. Eine spätere vertrauenswürdige Backend-Funktion muss nach bestätigtem Zahlungsereignis den Plan setzen und widerrufen. Der Client darf weder Preis noch Abo-Status als Berechtigungsquelle verwenden. Vor Freigabe sind Free/Premium-Funktionen, Kündigung, Erstattungen und Wiederherstellung fachlich zu definieren. Der vorläufige Preis 2,99 €/Monat wird nicht abgerechnet.

## Cloudflare Pages und Push-Worker

- Firebase Functions liegen absichtlich in `firebase-functions/`, weil ein Repository-Root-Ordner `functions/` von Cloudflare Pages als Pages Functions interpretiert wird. Das Pages-Paket wird mit `node scripts/build-pages.mjs` über eine explizite Allowlist nach `dist/` gebaut. Dadurch werden ausschließlich Web-App-Dateien und `_headers` veröffentlicht; Firebase-Backendcode, Firestore-Regeln, Tests und interne Dokumentation bleiben außerhalb des öffentlichen Pakets.
- `_headers` wird durch das Build-Skript in `dist/` kopiert. Pages-Headerregeln gelten für statische Assetantworten; Antworten von Pages Functions brauchen eigene Headerregeln.
- Nach einem später ausdrücklich freigegebenen Preview-Deploy die tatsächlichen Antwortheader auf der Preview-Domain prüfen. CSP-Fehler kontrollieren, da Firebase Auth, Firestore und Functions erreichbar sein müssen.
- Worker-Secrets `FIREBASE_SERVICE_ACCOUNT_JSON` und `VAPID_PRIVATE_KEY` ausschließlich als Cloudflare Worker Secrets speichern. Niemals in GitHub, `wrangler.toml` oder Client-JavaScript eintragen.
- `VAPID_PUBLIC_KEY` darf öffentlich sein. `VAPID_SUBJECT` ist eine Kontaktangabe.
- Das Service Account des Push-Workers nur mit den minimal nötigen Firestore-Rechten ausstatten. Keine privaten Schlüssel im Browser verwenden.
- Der Push-Worker fragt App-Dokumente mit einem Feldfilter ab und ruft nur Erinnerungsbereiche (`reminders`, `notes`, `one`, `inst`) ab. Einmalige Ausgaben und Raten liegen derzeit als Arrays; Firestore kann deren Einzelelemente nicht per Projektion kürzen, weshalb darin noch Betragswerte an den Worker übertragen werden. Für stärkere Datenminimierung sollten Erinnerungsmetadaten später getrennt vom Finanzzustand gespeichert werden.
- Der Worker fragt derzeit per Collection-Group-Abfrage bis zu 1000 Dokumente pro Sammlung ab. Vor größerem Betrieb muss die Skalierungsgrenze geprüft werden.

### Cloudflare-Pages-Preview einrichten (noch nicht veröffentlicht)

1. Cloudflare Dashboard → **Workers & Pages** → das bestehende Pages-Projekt öffnen. Repository und Produktionsbranch kontrollieren; Produktionsbranch auf `main` belassen und nicht verändern.
2. **Settings → Builds & deployments → Build configuration**: Root directory auf Repository-Wurzel belassen, Build command auf `node scripts/build-pages.mjs` setzen und Build output directory auf `dist`. Build image / Environment variables: `NODE_VERSION=22` setzen, falls die Dashboard-Vorlage eine Runtime-Version verlangt.
3. Den Branch `main-based-security-rebuild-2026-11-10` ausschließlich als Preview behandeln. Den Produktionsbranch `main` nicht ändern und den Rebuild nicht als Production deployen, bevor die Freigabe ausdrücklich erteilt wurde.
4. Nach einem freigegebenen Preview-Build URL aufrufen und in DevTools → Network die Antwortheader prüfen. Die aktuelle erzwungene CSP erlaubt aus Kompatibilitätsgründen noch Inline-Skripte/-Styles; die strengere CSP ist Report-Only. Login, App Check, Firebase Calls und PWA-Install/Updates testen. `_headers` wird durch das Build in `dist/` kopiert.
5. Prüfen, dass die Preview keine Backenddateien ausliefert. Der Build-Test kontrolliert die Allowlist; URLs wie `/firebase-functions/index.js`, `/firestore.rules` und `/tests/` dürfen nicht zugänglich sein.

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

- Die ursprüngliche main-Oberfläche enthält Inline-Skripte, Inline-Styles und Inline-Eventhandler. Um die bestehende Oberfläche nicht zu beschädigen, erlaubt die aktuell erzwungene CSP deshalb vorübergehend 'unsafe-inline' für Skripte und Styles. Eine strengere CSP ohne diese Freigabe liegt nur als Content-Security-Policy-Report-Only vor. Vor Livebetrieb müssen die Inline-Anteile schrittweise entfernt und die CSP danach verschärft werden.
- Kontolöschung ist jetzt für einen späteren Backend-Deploy als Callable Function `deleteOwnAccount` unter `functions/` vorbereitet. Das Backend prüft Auth, verifizierte E-Mail und höchstens fünf Minuten alte Authentifizierung, löscht ausschließlich den UID-eigenen Firestore-Unterbaum und anschließend Auth. Die Funktion wird durch App Check geschützt, sobald sie außerhalb des Emulatorbetriebs ausgeführt wird. Browser-Push-Abmeldung ist zusätzlich best effort; gespeicherte Push-Abonnements im Firestore-User-Unterbaum werden rekursiv entfernt.
- Firestore `recursiveDelete` und Firebase Auth sind keine gemeinsame Transaktion. Der Ablauf kann bei Infrastrukturfehlern teilweise gelöscht werden; erneute Aufrufe schließen die Bereinigung ab. Die App muss bei einem Fehler die Wiederholung ermöglichen. Ein nachgewiesener Emulatorlauf ersetzt keine Fehler-/IAM-Tests im tatsächlichen Projekt.
- Lokal ist ein eigenes Firebase-Functions-Codeverzeichnis mit Node.js-22-Runtime angelegt. Firebase Functions 2nd gen setzt für den späteren Cloud-Einsatz Blaze/Abrechnung, korrekte Region und passende minimale IAM-Rechte für Firestore-Löschung und Firebase-Auth-Benutzerverwaltung voraus. Die Region `europe-west3` ist im Code festgelegt; vor der Einrichtung gegen den Firestore-Standort und die gewünschte Datenresidenz prüfen.
- Historischer Zwischenstand; maßgeblich sind die aktuelle Anleitung oben und `firebase-functions/package-lock.json` (`npm ci --prefix firebase-functions`). Die Function ist weiterhin nicht deployed.
- Vor Regelveröffentlichung die aktive Regelversion mit `firestore.rules` vergleichen. Die lokale `firebase.json` enthält nun zusätzlich Functions-Emulator und Function-Codequelle; dadurch wurde kein Cloud-Projekt ausgewählt oder geändert. Kein `.firebaserc` wurde angelegt.
- App Check: den Site-Key in `index.html` erst nach Einrichtung setzen. Da die Function Enforcement außerhalb des Emulators verlangt, kann Kontolöschung bis zum tatsächlichen App-Check-Setup/Token-Test fehlschlagen. Firestore/App-Check/Auth-Enforcement in der Console zunächst beobachten, dann einzeln nach erfolgreicher Prüfung erzwingen; Authentication-App-Check kann Identity Platform voraussetzen.
- Historischer Teststand vor der Node-22-Wiederholung: **31/31**. Der maßgebliche Node-22-Lauf mit **32/32** steht am Dokumentende.
- Weiterhin offen sind echter iPhone/Android-Test, Prüfung der Authorized Domains und aktiven Regeln/Headers in den jeweiligen Consolen, App-Check-Metriken/Enforcement, E-Mail-Versand, Laufzeit-IAM und ein Recovery-Test nach absichtlich fehlgeschlagener Function-/Firestore-Bereinigung.

Ausführbare lokale Folge aus dem Projektordner (JDK 21 und Node 22 installieren/auswählen):

```powershell
 npm ci --prefix firebase-functions
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60000'
npx firebase emulators:exec --only auth,firestore,functions --project demo-lifestyle-rules "node --test tests/*.test.mjs"
# Danach mit gesetzten LIFESTYLE_LOCAL_TLS_PFX und LIFESTYLE_CHROME_PATH:
npx firebase emulators:exec --only auth,firestore,functions --project demo-lifestyle-rules "node tests/local-https-smoke.mjs"
```

Die Demo-Projekt-ID verhindert produktive Firebase-Aufrufe der Emulator-Suite. Der Browser-Smoke-Test ersetzt Client-Konfiguration nur im lokalen HTTPS-Response.

### Tatsächlich reproduzierter Abschlusslauf unter Node 22 – 8. November 2026

- Node `v22.23.4`; Temurin Java `21.0.13`; Firebase CLI 15.35.0; Emulator-Projekt `demo-lifestyle-rules`.
- Emulator-Automatik: **32/32 bestanden**. Der Functions Emulator meldete ausdrücklich `Using node@22 from host`. `FUNCTIONS_DISCOVERY_TIMEOUT=60000` ist für den kalten Start erforderlich; mit dem Standard-Timeout lud die Function nicht schnell genug und der Kontolöschungstest schlug fehl. Mit erweitertem Timeout wurden alle Tests bestanden.
- Statische/Unit-Suite ohne Emulator: **23/23 bestanden**.
- HTTPS Chrome Smoke direkt gegen den gebauten `dist/`-Ordner mit allen drei Emulatoren: bestanden bei Desktop und Smartphone-Viewport, inklusive Finanzfunktionen, Auth, zwei Konten, XSS-Payloads, Export/Restore, Kontolöschung und CSP. JavaScript-Fehler sowie CSP-/Trusted-Types-Meldungen: keine.
- Kontolöschung unter synthetisch blockiertem lokalem Storage-Remove: sichtbarer Warnhinweis bei unvollständiger Cache-Löschung, Reset des In-Memory-Finanzzustands und erfolgreiche serverseitige Löschung im Emulator.
- Vollständiger Pages-Build unter Node 22 erstellte genau zwölf Dateien; jede wurde byteweise mit ihrem Quell-Asset verglichen. Sicherheitsmustersuche fand keine privaten Schlüssel, Service-Account-Credentials oder Worker-Secrets. Öffentliche Firebase-Web-API-Konfiguration und VAPID-Public-Key bleiben erwartungsgemäß Client-Konfiguration.
- Pages-Paketaufbau: explizite Whitelist nach `dist/`, `_headers` vorhanden, Backend/Rules/Tests nicht enthalten. HTTPS-Smoke-Test akzeptiert `LIFESTYLE_WEB_ROOT`, um genau dieses Paket zu servieren.
- `npm audit --prefix firebase-functions --omit=dev`: **0 bekannte Schwachstellen**; der erste DNS-Fehler wurde beim erneuten Versuch überwunden.
- Keine Live-Console oder echte Geräte geprüft; siehe manuelle Aufgaben und `TEST-CHECKLIST.md`.
- `firebase login:list --json` konnte wegen `EPERM` beim lokalen Firebase-CLI-Konfigurationsspeicher keine belastbare Konto-/Projektliste liefern. Cloudflare-Projekt-/Dashboardstatus war in dieser Arbeitsumgebung ebenfalls nicht lesbar.

## reCAPTCHA Enterprise App Check Nachprüfung – 8. November 2026

- `firebase-login.js` initialisiert `initializeAppCheck` direkt nach `initializeApp` und vor Auth, Firestore und Functions. Es verwendet `ReCaptchaEnterpriseProvider` mit dem öffentlichen Site-Key aus `meta[name="firebase-app-check-site-key"]` und `isTokenAutoRefreshEnabled: true`.
- Der Nutzer hat den öffentlichen Site-Key bereitgestellt und er ist jetzt in `index.html` gesetzt. Der Client kann damit den echten reCAPTCHA Enterprise Provider initialisieren. Erfolgreiche Token-Ausstellung und -Validierung gegen Firebase müssen auf einer autorisierten HTTPS-Domain separat nachgewiesen werden.
- Der lokale Emulator-UI-Smoke entfernt den Production-Site-Key ausschließlich aus der lokal ausgelieferten Testantwort, weil er die Firebase-Konfiguration auf ein Demo-Projekt und Auth/Firestore/Functions auf Emulatoren umbiegt. Das verhindert die Vermischung von Production App Check mit synthetischen Emulator-Credentials; der Build-Output selbst behält den Site-Key.
- Die erzwungene CSP und Report-Only-CSP erlauben nun zusätzlich `https://recaptcha.google.com/recaptcha/` für Frames. Weitere reCAPTCHA Enterprise Script-, Frame- und Connect-Hosts sind vorhanden. `unsafe-inline` bleibt vollständig entfernt.
- CSP-Änderung bestand statische Prüfung und lokalen HTTPS-Chrome-Smoke gegen Demo-Emulatoren ohne CSP-/Trusted-Types-Befund. Ein früher Versuch mit Site-Key im lokalen Demo-Emulator-Browser brach beim Registrierungsablauf ab; es wurde kein Token-Nachweis ausgegeben. Der erfolgreiche Emulator-Smoke leert den Key nur in der lokalen HTTP-Testantwort und prüft deshalb keine echte reCAPTCHA-Token-Ausstellung.
- App Check Enforcement wurde nicht aktiviert oder geändert. Auf einer freigegebenen autorisierten HTTPS-Preview-Domain App-Check-Metriken beobachten; Enforcement bleibt bis zu separater ausdrücklicher Freigabe ausgeschaltet.
- Nach Eintrag des Keys: statische/Unit-Tests **23/23 bestanden**, Auth/Firestore/Functions-Emulator-Tests **32/32 bestanden** (Node 22.23.4, Java 21.0.13). Lokaler HTTPS-Chrome-Smoke mit Demo-Emulatoren bestanden; der Test überschreibt den Meta-Key nur in seiner Testantwort und meldet keine CSP-/Trusted-Types- oder JavaScript-Fehler.
- Pages-Build erzeugte `dist/` mit 12 Dateien; der öffentliche Site-Key ist bytegenau im Meta-Tag von `dist/index.html` enthalten. `firebase-functions/` und `firestore.rules` sind nicht enthalten. Ein echter Token wurde nicht bestätigt: der Versuch mit Produktions-Key und localhost/Demo-Konfiguration brach im Auth-Registrierungsschritt ab, ohne Tokenbeleg. Für einen aussagekräftigen Token-Test ist die tatsächliche autorisierte HTTPS-Domain erforderlich.
