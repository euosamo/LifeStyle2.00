import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, reload, signOut, setPersistence, browserLocalPersistence, indexedDBLocalPersistence, deleteUser, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBsklHgKgsiwEmY_PhmLxhYTdiGlbXpCqc",
  authDomain: "lifestyle2-login.firebaseapp.com",
  projectId: "lifestyle2-login",
  storageBucket: "lifestyle2-login.firebasestorage.app",
  messagingSenderId: "436328668120",
  appId: "1:436328668120:web:1550db3d0c8579773d30ad"
};
const gate = document.getElementById("authGate");
const appRoot = document.getElementById("app");
const message = document.getElementById("authMessage");
let mode = "login", user = null, db = null, auth = null, cloudReady = false, timer = null;
let activeUid = null;
let cloudRevision = 0;
let pendingSaveKey = null;
window.lifestyleCloudReady = false;

function msg(text, error = false) {
  if (!message) return;
  message.textContent = text;
  message.className = error ? "auth-message error" : "auth-message";
}
function formMode() {
  const reg = mode === "register";
  document.getElementById("authTitle").textContent = reg ? "Konto erstellen" : "Willkommen zurück";
  document.getElementById("authSubtitle").textContent = reg ? "Erstelle dein persönliches Lifestyle-Konto." : "Melde dich an, um deine Finanzen zu öffnen.";
  document.getElementById("authSubmit").textContent = reg ? "Kostenlos registrieren" : "Anmelden";
  document.getElementById("authSwitch").textContent = reg ? "Ich habe bereits ein Konto" : "Neues Konto erstellen";
  document.getElementById("authForgot").hidden = reg;
  msg("");
}
function authError(e) {
  const errors = {
    "auth/invalid-email": "Bitte eine gültige E-Mail-Adresse eingeben.",
    "auth/weak-password": "Das Passwort muss mindestens 6 Zeichen haben.",
    "auth/email-already-in-use": "Diese E-Mail ist bereits registriert. Bitte anmelden.",
    "auth/invalid-credential": "E-Mail oder Passwort stimmt nicht.",
    "auth/user-not-found": "Für diese E-Mail gibt es noch kein Konto. Bitte registrieren.",
    "auth/wrong-password": "Das Passwort stimmt nicht.",
    "auth/network-request-failed": "Verbindung prüfen und erneut versuchen.",
    "auth/operation-not-allowed": "E-Mail/Passwort-Anmeldung ist in Firebase nicht aktiviert.",
    "auth/unauthorized-domain": "Diese Website ist in Firebase nicht als erlaubte Domain eingetragen.",
    "auth/configuration-not-found": "Die Firebase-Authentifizierung ist nicht vollständig eingerichtet.",
    "auth/too-many-requests": "Zu viele Versuche. Bitte später erneut probieren."
  };
  return errors[e.code] || `Anmeldung fehlgeschlagen (${e.code || e.message || "unbekannter Fehler"}).`;
}
function setupMissing() {
  if (gate) gate.hidden = false;
  if (appRoot) appRoot.hidden = true;
  msg("Firebase konnte nicht gestartet werden. Bitte Internetverbindung und Firebase-Konfiguration prüfen.", true);
}

document.getElementById("authSwitch").addEventListener("click", () => {
  mode = mode === "login" ? "register" : "login";
  formMode();
});
document.getElementById("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const btn = document.getElementById("authSubmit");
  btn.disabled = true;
  msg(mode === "register" ? "Konto wird erstellt …" : "Anmeldung läuft …");
  try {
    if (!auth) throw new Error("Firebase ist nicht gestartet.");
    if (mode === "register") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      try { localStorage.setItem("lifestyle-finanz-new-user-uid", credential.user.uid); } catch (_) {}
      await sendEmailVerification(credential.user);
      msg("Bestätigungs-E-Mail wurde angefordert. Bitte öffne dein E-Mail-Postfach und bestätige die Adresse, bevor du Lifestyle nutzt.");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (e) {
    msg(authError(e), true);
  } finally {
    btn.disabled = false;
  }
});
document.getElementById("authForgot").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) return msg("Bitte zuerst die E-Mail-Adresse eingeben.", true);
  try {
    if (!auth) throw new Error("Firebase ist nicht gestartet.");
    await sendPasswordResetEmail(auth, email);
    msg("Falls ein Konto besteht, wurde eine E-Mail zum Zurücksetzen versendet.");
  } catch (e) {
    msg(authError(e), true);
  }
});
document.getElementById("authLogout").addEventListener("click", async () => {
  if (auth) {
    const button = document.getElementById("authLogout");
    button.disabled = true;
    try {
      if (typeof window.lifestyleFlushCloudSave === "function") await window.lifestyleFlushCloudSave();
      await signOut(auth);
    } catch (e) {
      msg("Abmeldung abgebrochen, damit deine Daten nicht verloren gehen. Bitte Verbindung prüfen und erneut versuchen.", true);
    } finally {
      button.disabled = false;
    }
  }
});


const ref = uid => doc(db, "users", uid, "appData", "main");

// Öffentlicher VAPID-Schlüssel. Wird nach dem Eintragen des erzeugten Schlüssels ersetzt.
const LIFESTYLE_VAPID_PUBLIC_KEY = "BGkgIcW-ZisIhF1RcwBqdnmyOgtUcMYda9AhJyfO2J0-FKAsw04VMpO5TDjXRV-vRlu6gZWSE1Fp29WeIr-7PtE";
function decodeVapidKey(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
window.lifestyleSubscribeForPush = async function () {
  // Push registration needs the signed-in Firebase user and Firestore client,
  // but it must not wait for the separate financial-data download to finish.
  const readyUntil = Date.now() + 12000;
  while (Date.now() < readyUntil && !auth?.currentUser) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const currentUser = auth?.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    throw new Error("Deine Firebase-Anmeldung wurde auf diesem iPhone nicht wiederhergestellt. Bitte melde dich in Lifestyle einmal neu an.");
  }
  if (!db) {
    throw new Error("Die Firebase-Datenbank ist noch nicht bereit. Bitte öffne Lifestyle erneut und versuche es noch einmal.");
  }
  const pushUid = currentUser.uid;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Dieser Browser unterstützt keine Web-Push-Abonnements.");
  }
  if (LIFESTYLE_VAPID_PUBLIC_KEY.startsWith("REPLACE_")) {
    throw new Error("Der öffentliche VAPID-Schlüssel ist noch nicht in der App hinterlegt.");
  }
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(LIFESTYLE_VAPID_PUBLIC_KEY)
    });
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Der Browser hat kein vollständiges Push-Abonnement geliefert.");
  }
  const bytes = new TextEncoder().encode(json.endpoint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
  await setDoc(doc(db, "users", pushUid, "pushSubscriptions", id), {
    subscription: json,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
    userAgent: navigator.userAgent.slice(0, 180),
    updatedAt: serverTimestamp()
  });
  return true;
};


window.lifestyleDeleteAccount = async function () {
  if (!auth || !db || !auth.currentUser) {
    msg("Bitte melde dich zuerst an.", true);
    return;
  }
  const current = auth.currentUser;
  const confirmed = await window.appConfirm("Möchtest du dein Lifestyle-Konto wirklich dauerhaft löschen? Deine gespeicherten Finanzdaten und dein Login werden entfernt. Diese Aktion kann nicht rückgängig gemacht werden.");
  if (!confirmed) return;
  const password = await window.appPrompt("Bitte gib zur Sicherheitsprüfung dein Passwort ein:");
  if (password === null || !password) {
    msg("Kontolöschung abgebrochen. Zur Löschung ist eine erneute Sicherheitsprüfung nötig.");
    return;
  }
  try {
    msg("Konto wird sicherheitshalber geprüft …");
    await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password));
    clearTimeout(timer);
    cloudReady = false;
    activeUid = null;
    cloudRevision = 0;
    msg("Gespeicherte Finanzdaten werden gelöscht …");
    await deleteDoc(ref(current.uid));
    try { localStorage.removeItem("lifestyle-finanz-app-user-" + current.uid); } catch (_) {}
    await deleteUser(current);
    try { localStorage.removeItem("lifestyle-finanz-guide-seen"); localStorage.removeItem("lifestyle-finanz-onboarding-done"); } catch (_) {}
    msg("Dein Konto wurde gelöscht.");
  } catch (e) {
    if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
      msg("Das Passwort stimmt nicht. Dein Konto wurde nicht gelöscht.", true);
    } else if (e.code === "auth/requires-recent-login") {
      msg("Die Sicherheitsprüfung ist abgelaufen. Bitte melde dich ab und wieder an und versuche es erneut.", true);
    } else {
      msg("Kontolöschung fehlgeschlagen (" + (e.code || e.message || "unbekannter Fehler") + "). Bitte erneut versuchen.", true);
    }
  }
};
let cloudSaveQueue = Promise.resolve();
async function writeCloudSnapshot(saveUser, snapshot) {
  if (!cloudReady || !user || user.uid !== saveUser.uid || activeUid !== saveUser.uid) throw new Error("Anmeldung nicht mehr aktiv.");
  const expectedRevision = cloudRevision;
  await runTransaction(db, async transaction => {
    const current = await transaction.get(ref(saveUser.uid));
    const actualRevision = current.exists() ? Number(current.data().revision || 0) : 0;
    if (actualRevision !== expectedRevision) {
      const conflict = new Error("Die Daten wurden auf einem anderen Gerät geändert. Zum Schutz vor Überschreiben wurde nicht synchronisiert. Bitte neu laden und Änderungen vergleichen.");
      conflict.code = "lifestyle/sync-conflict";
      throw conflict;
    }
    transaction.set(ref(saveUser.uid), {
      state: snapshot,
      revision: expectedRevision + 1,
      updatedAt: serverTimestamp()
    });
  });
  cloudRevision = expectedRevision + 1;
  try {
    localStorage.removeItem(pendingSaveKey);
    localStorage.setItem(window.lifestyleUserStorageKey + "-cloud-saved-at", String(Date.now()));
  } catch (_) {}
}
window.lifestyleCloudSave = state => {
  let snapshot;
  try { snapshot = JSON.parse(JSON.stringify(state)); } catch (_) { return; }
  const savedAt = Date.now();
  // Keep both the latest local snapshot and an explicit retry copy before network work.
  try {
    if (window.lifestyleUserStorageKey) {
      localStorage.setItem(window.lifestyleUserStorageKey, JSON.stringify(snapshot));
      localStorage.setItem(window.lifestyleUserStorageKey + "-saved-at", String(savedAt));
      if (pendingSaveKey) localStorage.setItem(pendingSaveKey, JSON.stringify({ state: snapshot, savedAt, baseRevision: cloudRevision }));
    }
  } catch (e) {
    msg("Lokales Speichern ist fehlgeschlagen. Bitte nicht schließen und Speicherplatz prüfen.", true);
    return;
  }
  if (!user || !db || !cloudReady || user.uid !== activeUid) return;
  const saveUser = user;
  cloudSaveQueue = cloudSaveQueue.catch(() => {}).then(async () => {
    if (!cloudReady || !user || user.uid !== saveUser.uid || activeUid !== saveUser.uid) return;
    try {
      await writeCloudSnapshot(saveUser, snapshot);
      msg("Änderungen synchronisiert.");
    } catch (e) {
      msg(e.code === "lifestyle/sync-conflict"
        ? e.message
        : `Synchronisierung fehlgeschlagen (${e.code || "Fehler"}). Deine Änderung bleibt als ausstehender lokaler Speicherstand erhalten. Bitte Verbindung prüfen und erneut versuchen.`, true);
    }
  });
};
window.lifestyleFlushCloudSave = async () => {
  clearTimeout(timer);
  if (!user || !db || !cloudReady || user.uid !== activeUid) throw new Error("Cloud-Daten sind nicht bereit.");
  const saveUser = user;
  const currentState = typeof window.lifestyleGetState === "function" ? window.lifestyleGetState() : null;
  if (!currentState) throw new Error("Aktueller Datenstand konnte nicht gelesen werden.");
  const snapshot = JSON.parse(JSON.stringify(currentState));
  try {
    await cloudSaveQueue;
    await writeCloudSnapshot(saveUser, snapshot);
    msg("Daten vor der Abmeldung gespeichert.");
  } catch (e) {
    msg(e.code === "lifestyle/sync-conflict" ? e.message : `Speichern vor Abmeldung fehlgeschlagen (${e.code || "Fehler"}). Bitte Verbindung prüfen und erneut versuchen.`, true);
    throw e;
  }
};

function showApp() {
  gate.hidden = true;
  appRoot.hidden = false;
  document.body.classList.add("authenticated");
}
function showVerificationGate(currentUser) {
  gate.hidden = false;
  appRoot.hidden = true;
  document.body.classList.remove("authenticated");
  document.getElementById("authLogout").hidden = true;
  let verify = document.getElementById("verifyEmailActions");
  if (!verify) {
    verify = document.createElement("div");
    verify.id = "verifyEmailActions";
    verify.innerHTML = '<button id="resendVerification" class="secondary" type="button">Bestätigungs-E-Mail erneut senden</button><button id="checkVerification" class="secondary" type="button">Ich habe bestätigt – erneut prüfen</button><button id="changeVerificationEmail" class="secondary" type="button">Zurück – E-Mail-Adresse ändern</button>';
    message.insertAdjacentElement("afterend", verify);
    document.getElementById("resendVerification").addEventListener("click", async () => {
      try {
        if (!auth.currentUser) throw new Error("Bitte melde dich erneut an.");
        await sendEmailVerification(auth.currentUser);
        msg("Eine neue Bestätigungs-E-Mail wurde angefordert. Bitte prüfe auch den Spam-Ordner.");
      } catch (e) { msg(authError(e), true); }
    });
    document.getElementById("checkVerification").addEventListener("click", async () => {
      try {
        if (!auth.currentUser) throw new Error("Bitte melde dich erneut an.");
        await reload(auth.currentUser);
        if (auth.currentUser.emailVerified) window.location.reload();
        else msg("Die E-Mail ist noch nicht bestätigt. Bitte öffne den Link in der E-Mail und versuche es erneut.");
      } catch (e) { msg(authError(e), true); }
    });
    document.getElementById("changeVerificationEmail").addEventListener("click", async () => {
      const previousEmail = auth.currentUser?.email || document.getElementById("authEmail").value;
      try {
        await signOut(auth);
        document.getElementById("authEmail").value = previousEmail;
        mode = "register";
        formMode();
        document.getElementById("authForm").hidden = false;
        document.getElementById("authForgot").hidden = true;
        document.getElementById("authSwitch").hidden = false;
        document.getElementById("authSwitch").textContent = "Ich habe bereits ein Konto";
        msg("Prüfe oder ändere die E-Mail-Adresse und registriere dich erneut. Eine falsch geschriebene Adresse kann nicht nachträglich geändert werden.");
        document.getElementById("authEmail").focus();
      } catch (e) { msg(authError(e), true); }
    });
  }
  verify.hidden = false;
  document.getElementById("authForm").hidden = true;
  document.getElementById("authForgot").hidden = true;
  document.getElementById("authSwitch").hidden = true;
  msg("Bitte bestätige zuerst deine E-Mail-Adresse (" + (currentUser.email || "") + "). Erst danach kannst du deine Finanzübersicht öffnen.");
}
formMode();

try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  // Keep the signed-in session across normal page reloads, including iOS Safari/PWA.
  try { await setPersistence(auth, indexedDBLocalPersistence); }
  catch (_) { await setPersistence(auth, browserLocalPersistence); }
  onAuthStateChanged(auth, async nextUser => {
    clearTimeout(timer);
    cloudReady = false;
    window.lifestyleCloudReady = false;
    user = nextUser;
    if (!user) {
      const verify = document.getElementById("verifyEmailActions");
      if (verify) verify.hidden = true;
      document.getElementById("authForm").hidden = false;
      document.getElementById("authForgot").hidden = false;
      document.getElementById("authSwitch").hidden = false;
      activeUid = null;
      cloudRevision = 0;
      pendingSaveKey = null;
      window.lifestyleUserStorageKey = null;
      gate.hidden = false;
      appRoot.hidden = true;
      document.body.classList.remove("authenticated");
      document.getElementById("authLogout").hidden = true;
      return;
    }

    if (!user.emailVerified) {
      activeUid = null;
      cloudRevision = 0;
      pendingSaveKey = null;
      window.lifestyleUserStorageKey = null;
      showVerificationGate(user);
      return;
    }
    const verify = document.getElementById("verifyEmailActions");
    if (verify) verify.hidden = true;
    document.getElementById("authForm").hidden = false;
    document.getElementById("authForgot").hidden = false;
    document.getElementById("authSwitch").hidden = false;
    const uid = user.uid;
    activeUid = uid;
    window.lifestyleUserStorageKey = "lifestyle-finanz-app-user-" + uid;
    pendingSaveKey = window.lifestyleUserStorageKey + "-pending-cloud-save";
    gate.hidden = false;
    appRoot.hidden = true;
    document.getElementById("authLogout").hidden = false;
    msg("Deine Finanzdaten werden geladen …");
    try {
      // Cloud is authoritative. Never continue with defaults or local data merely
      // because a device/network is slow: wait for Firestore or fail closed.
      const snap = await getDoc(ref(uid));
      if (!user || user.uid !== uid) return;
      const localRaw = localStorage.getItem(window.lifestyleUserStorageKey);
      const localState = localRaw ? JSON.parse(localRaw) : null;
      cloudRevision = snap.exists() ? Number(snap.data().revision || 0) : 0;
      const pendingRaw = localStorage.getItem(pendingSaveKey);
      const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
      if (pending && (!pending.state || typeof pending.state !== "object" || Array.isArray(pending.state))) throw new Error("Ausstehender lokaler Speicherstand ist ungültig. Er wurde nicht überschrieben.");
      if (pending && Number(pending.baseRevision) !== cloudRevision) throw new Error("Auf diesem Gerät liegen noch nicht synchronisierte Änderungen vor, während die Cloud auf einem anderen Stand ist. Zum Schutz vor Datenverlust wurde die App gesperrt. Bitte Änderungen erst abgleichen.");
      const cloudState = snap.exists() ? snap.data().state : null;
      if (snap.exists() && (!cloudState || typeof cloudState !== "object" || Array.isArray(cloudState))) {
        throw new Error("Der gespeicherte Cloud-Datenstand ist ungültig. Zum Schutz deiner Daten wurde das Laden gestoppt.");
      }
      // Import legacy data from the previous main version once, only when this account has no saved data.
      let legacyState = null;
      let legacyImport = false;
      try {
        const alreadyImported = localStorage.getItem("lifestyle-finanz-legacy-imported");
        if (!alreadyImported && !localState && !cloudState) {
          const legacyRaw = localStorage.getItem("lifestyle-finanz-app-v3-empty");
          if (legacyRaw) { legacyState = JSON.parse(legacyRaw); legacyImport = !!legacyState && typeof legacyState === "object"; }
        }
      } catch (_) {}
      // An existing Firestore document always wins. Local data is only used to
      // initialize a genuinely missing cloud document (or one-time legacy import).
      const chosenState = (pending && pending.state) || cloudState || localState || legacyState || null;
      if (legacyImport && chosenState === legacyState) {
        try {
          localStorage.setItem(window.lifestyleUserStorageKey, JSON.stringify(legacyState));
          localStorage.setItem(window.lifestyleUserStorageKey + "-saved-at", String(Date.now()));
        } catch (_) {}
      }
      if (typeof window.lifestyleApplyState !== "function" || typeof window.render !== "function") {
        throw new Error("App-Funktionen wurden nicht geladen.");
      }
      window.lifestyleApplyState(chosenState);
      if (!user || user.uid !== uid) return;
      // Reveal the app only after the verified cloud/local initialization is complete.
      cloudReady = true;
      window.lifestyleCloudReady = true;
      showApp();
      window.render();
      // Create a cloud record only if Firestore confirmed that no record existed.
      if (chosenState && (!snap.exists() || pending)) {
        writeCloudSnapshot(user, JSON.parse(JSON.stringify(chosenState)))
          .then(() => {
            try {
              localStorage.setItem(window.lifestyleUserStorageKey + "-cloud-saved-at", String(Date.now()));
              if (legacyImport && chosenState === legacyState) localStorage.setItem("lifestyle-finanz-legacy-imported", uid);
            } catch (_) {}
          })
          .catch(e => { cloudReady = false; window.lifestyleCloudReady = false; appRoot.hidden = true; gate.hidden = false; msg(e.message || "Cloud-Synchronisierung fehlgeschlagen. Daten wurden nicht überschrieben.", true); });
      }
      let newlyRegistered = false;
      try { newlyRegistered = localStorage.getItem("lifestyle-finanz-new-user-uid") === uid; } catch (_) {}
      if (newlyRegistered && !chosenState?.onboardingComplete && typeof window.showFirstStart === "function") {
        window.showFirstStart();
      }
      if (typeof window.checkReminders === "function") {
        window.checkReminders();
        if (!window.lifestyleReminderTimer) window.lifestyleReminderTimer = setInterval(window.checkReminders, 15000);
      }
      msg("");
    } catch (e) {
      cloudReady = false;
      window.lifestyleCloudReady = false;
      msg(`Anmeldung war erfolgreich, aber Finanzdaten konnten nicht geladen werden (${e.code || e.message || "Fehler"}). Firestore-Regeln und Datenbank prüfen.`, true);
    }
  }, e => {
    setupMissing();
    msg(authError(e), true);
  });
} catch (e) {
  setupMissing();
  msg(authError(e), true);
}
