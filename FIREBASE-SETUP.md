# Lifestyle Finanzen – Firebase und Veröffentlichung

Die Hauptversion auf `main` enthält jetzt die getestete Login- und Cloud-Speicher-Integration.

## Firebase-Konfiguration
- Firebase-Projekt: `lifestyle2-login`
- Anmeldung: E-Mail und Passwort
- Datenpfad pro Konto: `users/{uid}/appData/main`
- Die Web-Konfiguration ist bereits in `firebase-login.js` hinterlegt.

## Einmalig in der Firebase Console prüfen
1. Unter **Authentication → Sign-in method** muss E-Mail/Passwort aktiviert sein.
2. Unter **Authentication → Settings → Authorized domains** muss die Hauptdomain der App eingetragen sein.
3. Firestore Database muss erstellt sein.
4. Den Inhalt von `firestore.rules` veröffentlichen. Die Regeln erlauben jedem angemeldeten Nutzer nur Zugriff auf den eigenen Datenpfad.

## Datenübernahme
Beim ersten Login in einem Konto prüft die App, ob noch alte lokale Daten unter dem bisherigen Schlüssel `lifestyle-finanz-app-v3-empty` vorhanden sind. Nur wenn für das Firebase-Konto noch keine lokalen oder Cloud-Daten existieren, werden diese alten Daten einmalig in das neue Konto übernommen. Die alte lokale Kopie wird dabei nicht gelöscht.

## Vor dem produktiven Einsatz testen
- Anmeldung, Abmeldung und erneuter Login
- Speichern und Laden von Einnahmen, Ausgaben, festen Ausgaben, Verpflichtungen, Sparzielen und Notizen
- Konto A und Konto B dürfen niemals gegenseitig Daten sehen
- Datenexport und Kontolöschung
- Offline-Verhalten und Synchronisierung auf iPhone

**Wichtig:** Das Einchecken der Firestore-Regeln in GitHub veröffentlicht sie nicht automatisch in Firebase. Der Regelstand in der Firebase Console muss separat geprüft werden. Ebenso ist ein erfolgreicher GitHub-Commit noch kein Nachweis für eine erfolgreiche Cloudflare-Veröffentlichung.
