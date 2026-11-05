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

## Was diese Änderungen nicht automatisch erledigen

1. Die Firestore-Regeln in diesem Repository werden nicht automatisch in Firebase veröffentlicht. Sie müssen separat in Firebase deployed und anschließend in der Firebase Console geprüft werden.
2. Der Code kann die Firebase-Console-Einstellungen nicht ändern. In Authentication sind E-Mail Enumeration Protection, erlaubte Domains, E-Mail/Passwort-Anmeldung und die aktuelle Passwort Policy zu kontrollieren.
3. Cloudflare Worker Secrets und Berechtigungen müssen in Cloudflare geprüft werden. Der Service Account sollte nur die nötigen Firestore-Rechte haben; private Schlüssel gehören ausschließlich in Worker Secrets.
4. Die CSP muss auf der tatsächlichen Cloudflare-Pages-Domain im Browser geprüft werden. Das bestehende UI verwendet Inline-Skripte und Inline-Eventhandler; deshalb muss `unsafe-inline` vorerst erlaubt bleiben und ist kein vollständiger XSS-Schutz.
5. Finanzdaten im Browser-Cache/localStorage sind nicht Ende-zu-Ende verschlüsselt. Cloud-Speicherung über Firestore und HTTPS ist keine Ende-zu-Ende-Verschlüsselung.
6. Ein vollständiger Browser-/iPhone-Test, ein Test mit zwei getrennten Konten und ein unabhängiger Penetrationstest sind weiterhin erforderlich.
7. Der GitHub-Branch `main` ist derzeit nicht geschützt (`protected: false`). Vor einem Merge sollte Branch Protection mit Pull-Request-Pflicht, erforderlichen Security-Checks und gesperrtem Force-Push eingerichtet werden. Diese Repository-Einstellung wurde nicht durch den Code-Branch geändert.

## Release-Regel

Diese Änderungen bleiben in einem separaten Branch. Nicht in `main` mergen und nicht veröffentlichen, bevor Emulator-Tests erfolgreich sind, die Firestore-Regeln live bereitgestellt wurden und die bestehende Anmeldung, Synchronisierung, Push-Funktionen und Datenübernahme auf iPhone und Desktop regressionsfrei getestet wurden.

