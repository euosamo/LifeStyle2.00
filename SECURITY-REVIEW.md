# Lifestyle – Sicherheitsprüfung

## Änderungen in diesem Branch

- Firestore-Datenzugriffe verlangen eine angemeldete, E-Mail-verifizierte UID und beschränken jeden Nutzer auf den eigenen Datenpfad.
- Firestore-Schreibvorgänge für Finanzdaten und Push-Abonnements werden auf erlaubte Felder und Datentypen geprüft; Push-Endpunkte sind auf bekannte Browser-Push-Anbieter begrenzt, um beliebige ausgehende Anfragen des Workers (SSRF) zu verhindern.
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
