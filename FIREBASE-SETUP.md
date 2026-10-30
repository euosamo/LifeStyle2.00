# Lifestyle2.0 – Login-Testzweig

Dieser Zweig ist ein **Entwurf**, nicht produktionsbereit. Die Live-App auf `main` wird nicht verändert.

## Was vorbereitet ist
- E-Mail-/Passwort-Registrierung und Anmeldung
- Passwort-Reset und Abmelden
- Login-Sperre vor dem Finanzbereich
- Datenablage pro Firebase-Nutzer unter `users/{uid}/appData/main`
- Firestore-Regeln, die jedem Nutzer ausschließlich den eigenen Datenpfad erlauben

## Vor dem Test zwingend erforderlich
1. In der [Firebase Console](https://console.firebase.google.com/) ein neues Projekt erstellen (Spark/Free zum Start).
2. **Authentication → Sign-in method** öffnen und **E-Mail/Passwort** aktivieren.
3. **Firestore Database** erstellen.
4. Unter **Project settings → Your apps** eine Web-App registrieren und deren Konfigurationswerte übernehmen.
5. In `firebase-login.js` die vier Platzhalter `FIREBASE_API_KEY_EINTRAGEN`, `FIREBASE_AUTH_DOMAIN_EINTRAGEN`, `FIREBASE_PROJECT_ID_EINTRAGEN`, `FIREBASE_APP_ID_EINTRAGEN` ersetzen.
6. Den Inhalt von `firestore.rules` im Firebase-Projekt veröffentlichen.
7. Die Testseite über HTTPS öffnen und mit zwei separaten Konten testen: Konto A speichert Testdaten; Konto B darf diese Daten nicht sehen.

## Wichtige Grenzen
- Solange die Firebase-Konfiguration nicht eingetragen und die Regeln nicht veröffentlicht sind, bleibt die Anmeldung absichtlich gesperrt.
- Der kostenlose Tarif hat Nutzungsgrenzen; er ist keine Garantie für dauerhaft kostenlose Nutzung bei beliebigem Umfang.
- Vor dem Live-Einsatz sind Tests für Konto-Wechsel, Offline-Verhalten, Synchronisierungskonflikte, Datenexport/-löschung und Mobilgeräte erforderlich.
- Dies ist noch keine Freigabe zur Veröffentlichung oder zum Zusammenführen in `main`.
