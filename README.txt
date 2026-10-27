LIFESTYLE FINANZEN – PWA-PAKET

Enthalten:
- index.html: deine App, basierend auf der bereitgestellten ZIP
- manifest.webmanifest: Installationsdaten für iPhone/Android
- sw.js: Offline-Cache und Aktualisierung beim erneuten Öffnen
- icon-192.png / icon-512.png: App-Symbole

WICHTIG:
1. Die Dateien müssen gemeinsam unter derselben HTTPS-Adresse gehostet werden (z. B. GitHub Pages).
2. Auf dem iPhone die HTTPS-Adresse in Safari öffnen -> Teilen -> „Zum Home-Bildschirm“.
3. Änderungen an der gehosteten App werden beim nächsten Öffnen abgerufen. Nach einer Aktualisierung die App ggf. einmal schließen und erneut öffnen.
4. Die App speichert ihre Daten aktuell im lokalen Speicher des Browsers (localStorage). Solange dieselbe Adresse/Origin und derselbe Speicher verwendet werden, bleiben die Daten bei normalen App-Updates erhalten.
5. Lokale Speicherung ist keine geräteübergreifende Cloud-Sicherung. Browserdaten löschen, die App/Website-Daten entfernen oder das Gerät wechseln kann die Daten löschen bzw. nicht übertragen. Regelmäßig die vorhandene Funktion „Datensicherung herunterladen“ nutzen.
6. Dieses Paket richtet eine installierbare PWA ein; es veröffentlicht die App nicht automatisch und richtet keine Cloud-Synchronisierung ein.
