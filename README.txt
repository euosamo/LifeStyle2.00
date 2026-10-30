LIFESTYLE FINANZEN – HAUPTVERSION

Enthalten:
- iPhone-optimiertes PWA-Layout mit unterer Navigation
- Finanzübersicht, Buchungen, Auswertungen und Kategorien
- Feste Ausgaben, einmalige Ausgaben, Raten & Verpflichtungen und Sparziele
- Notizen, Erinnerungen, Layout-Einstellungen und Datensicherung
- Firebase-Anmeldung und persönliche Cloud-Speicherung je Nutzer
- Lokale Zwischenspeicherung und Übernahme älterer lokaler Daten beim ersten Login

Veröffentlichung:
Die Hauptversion liegt im Branch `main`. Nach einem GitHub-Commit muss die Veröffentlichung durch Cloudflare Pages bzw. den konfigurierten Hosting-Dienst erfolgreich abgeschlossen sein. Auf dem iPhone die installierte Web-App vollständig schließen und neu öffnen oder Safari neu laden, damit der neue Service-Worker aktiv wird.

Wichtig:
- Die Firestore-Regeln aus `firestore.rules` müssen separat in der Firebase Console veröffentlicht sein.
- Vor produktiver Nutzung Anmeldung, Speichern, erneuten Login und getrennte Daten je Nutzer testen.
- Vor Updates empfiehlt sich zusätzlich ein Export über „Datensicherung herunterladen“.
