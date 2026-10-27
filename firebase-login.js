import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, reload, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
    try { await signOut(auth); }
    catch (e) { msg(authError(e), true); }
  }
});

const ref = uid => doc(db, "users", uid, "appData", "main");
window.lifestyleCloudSave = state => {
  if (!user || !db || !cloudReady || user.uid !== activeUid) return;
  const saveUser = user;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      if (!cloudReady || !user || user.uid !== saveUser.uid) return;
      await setDoc(ref(saveUser.uid), { state, updatedAt: serverTimestamp() });
      if (user && user.uid === saveUser.uid) msg("Änderungen synchronisiert.");
    } catch (e) {
      msg(`Synchronisierung fehlgeschlagen (${e.code || "Fehler"}). Firestore-Regeln und Verbindung prüfen.`, true);
    }
  }, 700);
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
    verify.innerHTML = '<button id="resendVerification" class="secondary" type="button">Bestätigungs-E-Mail erneut senden</button><button id="checkVerification" class="secondary" type="button">Ich habe bestätigt – erneut prüfen</button>';
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
  await setPersistence(auth, browserLocalPersistence);
  onAuthStateChanged(auth, async nextUser => {
    clearTimeout(timer);
    cloudReady = false;
    user = nextUser;
    if (!user) {
      const verify = document.getElementById("verifyEmailActions");
      if (verify) verify.hidden = true;
      document.getElementById("authForm").hidden = false;
      document.getElementById("authForgot").hidden = false;
      document.getElementById("authSwitch").hidden = false;
      activeUid = null;
      window.lifestyleUserStorageKey = null;
      gate.hidden = false;
      appRoot.hidden = true;
      document.body.classList.remove("authenticated");
      document.getElementById("authLogout").hidden = true;
      return;
    }

    if (!user.emailVerified) {
      activeUid = null;
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
    gate.hidden = false;
    appRoot.hidden = true;
    document.getElementById("authLogout").hidden = false;
    msg("Deine Finanzdaten werden geladen …");
    try {
      const snap = await getDoc(ref(uid));
      if (!user || user.uid !== uid) return;
      const localRaw = localStorage.getItem(window.lifestyleUserStorageKey);
      const localState = localRaw ? JSON.parse(localRaw) : null;
      const cloudState = snap.exists() ? snap.data().state : null;
      const chosenState = cloudState || localState || null;
      if (typeof window.lifestyleApplyState !== "function" || typeof window.render !== "function") {
        throw new Error("App-Funktionen wurden nicht geladen.");
      }
      window.lifestyleApplyState(chosenState);
      if (!snap.exists() && chosenState) {
        await setDoc(ref(uid), { state: chosenState, updatedAt: serverTimestamp() });
      }
      if (!user || user.uid !== uid) return;
      cloudReady = true;
      showApp();
      window.render();
      if (!localStorage.getItem("lifestyle-finanz-guide-seen") || !localStorage.getItem("lifestyle-finanz-onboarding-done")) {
        if (typeof window.showFirstStart === "function") window.showFirstStart();
      }
      if (typeof window.checkReminders === "function") {
        window.checkReminders();
        if (!window.lifestyleReminderTimer) window.lifestyleReminderTimer = setInterval(window.checkReminders, 15000);
      }
      msg("");
    } catch (e) {
      cloudReady = false;
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
