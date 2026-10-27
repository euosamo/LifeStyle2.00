import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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
function msg(text, error = false) { message.textContent = text; message.className = error ? "auth-message error" : "auth-message"; }
function formMode() {
  const reg = mode === "register";
  document.getElementById("authTitle").textContent = reg ? "Konto erstellen" : "Willkommen zurück";
  document.getElementById("authSubtitle").textContent = reg ? "Erstelle dein persönliches Lifestyle-Konto." : "Melde dich an, um deine Finanzen zu öffnen.";
  document.getElementById("authSubmit").textContent = reg ? "Kostenlos registrieren" : "Anmelden";
  document.getElementById("authSwitch").textContent = reg ? "Ich habe bereits ein Konto" : "Neues Konto erstellen";
  document.getElementById("authForgot").hidden = reg;
  msg("");
}
function setupMissing() { msg("Firebase ist noch nicht vollständig eingerichtet. Bitte prüfe die Konfiguration.", true); }
document.getElementById("authSwitch").addEventListener("click", () => { mode = mode === "login" ? "register" : "login"; formMode(); });
document.getElementById("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const btn = document.getElementById("authSubmit"); btn.disabled = true;
  msg(mode === "register" ? "Konto wird erstellt …" : "Anmeldung läuft …");
  try {
    if (!auth) throw new Error("setup");
    if (mode === "register") await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    const errors = {"setup":"Firebase ist noch nicht eingerichtet.","auth/invalid-email":"Bitte eine gültige E-Mail-Adresse eingeben.","auth/weak-password":"Das Passwort muss mindestens 6 Zeichen haben.","auth/email-already-in-use":"Diese E-Mail ist bereits registriert. Bitte anmelden.","auth/invalid-credential":"E-Mail oder Passwort stimmt nicht.","auth/network-request-failed":"Verbindung prüfen und erneut versuchen.","auth/operation-not-allowed":"Bitte aktiviere E-Mail/Passwort in Firebase Authentication."};
    msg(errors[e.code || e.message] || "Anmeldung fehlgeschlagen. Prüfe die Firebase-Einrichtung.", true);
  } finally { btn.disabled = false; }
});
document.getElementById("authForgot").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) return msg("Bitte zuerst die E-Mail-Adresse eingeben.", true);
  try { if (!auth) throw new Error("setup"); await sendPasswordResetEmail(auth, email); msg("Falls ein Konto besteht, wurde eine E-Mail zum Zurücksetzen versendet."); }
  catch (e) { msg(e.message === "setup" ? "Firebase ist noch nicht eingerichtet." : "E-Mail konnte nicht versendet werden.", true); }
});
document.getElementById("authLogout").addEventListener("click", async () => { if (auth) await signOut(auth); });
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
    } catch (e) { msg("Synchronisierung fehlgeschlagen. Bitte Verbindung und Firestore-Regeln prüfen.", true); }
  }, 700);
};
function showApp() { gate.hidden = true; appRoot.hidden = false; document.body.classList.add("authenticated"); }
formMode();
try {
  const app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app);
  onAuthStateChanged(auth, async nextUser => {
    clearTimeout(timer);
    cloudReady = false;
    user = nextUser;
    if (!user) {
      activeUid = null;
      window.lifestyleUserStorageKey = null;
      gate.hidden = false; appRoot.hidden = true;
      document.body.classList.remove("authenticated");
      document.getElementById("authLogout").hidden = true;
      return;
    }
    const uid = user.uid;
    activeUid = uid;
    window.lifestyleUserStorageKey = "lifestyle-finanz-app-user-" + uid;
    gate.hidden = false; appRoot.hidden = true;
    document.getElementById("authLogout").hidden = false;
    msg("Deine Finanzdaten werden geladen …");
    try {
      const snap = await getDoc(ref(uid));
      if (!user || user.uid !== uid) return;
      const localRaw = localStorage.getItem(window.lifestyleUserStorageKey);
      const localState = localRaw ? JSON.parse(localRaw) : null;
      const cloudState = snap.exists() ? snap.data().state : null;
      const chosenState = cloudState || localState || null;
      window.lifestyleApplyState(chosenState);
      if (!snap.exists() && chosenState) {
        await setDoc(ref(uid), { state: chosenState, updatedAt: serverTimestamp() });
      }
      if (!user || user.uid !== uid) return;
      cloudReady = true;
      showApp();
      msg("");
    } catch (e) {
      cloudReady = false;
      msg("Daten konnten nicht geladen werden. Bitte Firestore-Regeln, Verbindung und Datenbank prüfen.", true);
    }
  });
} catch (e) { setupMissing(); }
