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
7. **App Check:** Für die Web-App reCAPTCHA Enterprise oder einen geeigneten Web-Provider einrichten, den App-Check-Client aktivieren und danach Firestore Enforcement einschalten. Erst nach erfolgreichem Test erzwingen, damit bestehende Nutzer nicht ausgesperrt werden.
8. **Firestore Database:** Die Regeln aus `firestore.rules` veröffentlichen und danach die aktiven Regeln in der Firebase Console kontrollieren.

Regeln veröffentlichen (mit einem autorisierten Firebase-CLI-Konto):
```bash
firebase deploy --only firestore:rules --project lifestyle2-login
```

Die Regeln verlangen jetzt bei allen Nutzerzugriffen eine gültige Anmeldung, die passende UID und `email_verified == true`. Datenobjekte und Push-Abonnements werden auf erlaubte Felder und Datentypen begrenzt. Nicht explizit freigegebene Pfade bleiben gesperrt.

## Cloudflare Pages und Push-Worker

- Die Datei `_headers` setzt HTTP-Sicherheitsheader, wenn sie am veröffentlichten Pages-Projektstamm liegt.
- Nach dem Deploy die tatsächlichen Antwortheader auf `https://lifestyle2-00.pages.dev` prüfen. CSP-Fehler in der Browserkonsole kontrollieren, da Firebase Auth und Firestore weiterhin erreichbar sein müssen.
- Worker-Secrets `FIREBASE_SERVICE_ACCOUNT_JSON` und `VAPID_PRIVATE_KEY` ausschließlich als Cloudflare Worker Secrets speichern. Niemals in GitHub, `wrangler.toml` oder Client-JavaScript eintragen.
- `VAPID_PUBLIC_KEY` darf öffentlich sein. `VAPID_SUBJECT` ist eine Kontaktangabe.
- Das Service Account des Push-Workers nur mit den minimal nötigen Firestore-Rechten ausstatten. Keine privaten Schlüssel im Browser verwenden.
- Der Worker fragt derzeit per Collection-Group-Abfrage bis zu 1000 Dokumente pro Sammlung ab. Vor größerem Betrieb muss die Skalierungsgrenze geprüft werden.

## Kontolöschung und Datenschutz

Die Kontolöschung entfernt jetzt die eigenen Push-Abonnements, Zustellmarker, Finanzdaten und lokalen Kontospeicher. Die Regeln erlauben dem bestätigten Kontoinhaber nur das Lesen und Löschen der eigenen Zustellmarker; Erstellen und Ändern bleibt dem Worker vorbehalten.

## Tests und verbleibende Prüfungen

- Die GitHub-Action `.github/workflows/security-rules.yml` startet den Firestore Emulator und führt Regeltests aus.
- Tests prüfen: Konto-Trennung, verifizierte E-Mail, unberechtigte Nutzer, Daten-Schema, Push-Abonnements, Zustellmarker und gesperrte Standardpfade.
- Vor Release zusätzlich mit zwei echten Testkonten auf iPhone und Desktop testen: Registrierung, Bestätigung, Login, Logout, Reset, Synchronisierung, parallele Änderungen, Push, Datenexport und Kontolöschung.
- Die aktive Firebase-Konfiguration, Cloudflare Worker Secrets, IAM-Rollen und Live-HTTP-Header können nicht allein durch GitHub-Änderungen verifiziert werden.

**Wichtig:** Ein GitHub-Commit veröffentlicht weder Firestore-Regeln noch Worker-Secrets. Diesen Branch nicht ungeprüft in `main` mergen oder veröffentlichen.
