import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Replace these values with the Web App config from Firebase Console.
const firebaseConfig = {
  apiKey: "FIREBASE_API_KEY_EINTRAGEN",
  authDomain: "FIREBASE_AUTH_DOMAIN_EINTRAGEN",
  projectId: "FIREBASE_PROJECT_ID_EINTRAGEN",
  appId: "FIREBASE_APP_ID_EINTRAGEN"
};
const KEY = "lifestyle-finanz-app-v3-empty";
const gate = document.getElementById("authGate");
const appRoot = document.getElementById("app");
const message = document.getElementById("authMessage");
let mode = "login", user = null, db = null, auth = null, cloudReady = false, timer = null;
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
function setupMissing() { msg("Firebase ist noch nicht eingerichtet. Die Finanzdaten bleiben bis dahin gesperrt.", true); }
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
    const errors = {"setup":"Firebase ist noch nicht eingerichtet.","auth/invalid-email":"Bitte eine gültige E-Mail-Adresse eingeben.","auth/weak-password":"Das Passwort muss mindestens 6 Zeichen haben.","auth/email-already-in-use":"Diese E-Mail ist bereits registriert. Bitte anmelden.","auth/invalid-credential":"E-Mail oder Passwort stimmt nicht.","auth/network-request-failed":"Verbindung prüfen und erneut versuchen."};
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
  if (!user || !db || !cloudReady) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try { await setDoc(ref(user.uid), { state, updatedAt: serverTimestamp() }); msg("Änderungen synchronisiert."); }
    catch { msg("Synchronisierung fehlgeschlagen. Verbindung und Firestore-Regeln prüfen.", true); }
  }, 700);
};
function showApp() { gate.hidden = true; appRoot.hidden = false; document.body.classList.add("authenticated"); cloudReady = true; }
formMode();
if (Object.values(firebaseConfig).some(v => v.includes("_EINTRAGEN"))) setupMissing();
else {
  try {
    const app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app);
    onAuthStateChanged(auth, async nextUser => {
      user = nextUser; cloudReady = false;
      if (!user) {
        localStorage.removeItem(KEY); gate.hidden = false; appRoot.hidden = true;
        document.body.classList.remove("authenticated"); document.getElementById("authLogout").hidden = true; return;
      }
      document.getElementById("authLogout").hidden = false;
      try {
        const snap = await getDoc(ref(user.uid));
        const cloudState = snap.exists() ? snap.data().state : null;
        const local = localStorage.getItem(KEY);
        const marker = "lifestyle-user-initialized:" + user.uid;
        if (cloudState) {
          if (JSON.stringify(JSON.parse(local || "null")) !== JSON.stringify(cloudState)) {
            localStorage.setItem(KEY, JSON.stringify(cloudState)); location.reload(); return;
          }
        } else if (!sessionStorage.getItem(marker)) {
          localStorage.removeItem(KEY); sessionStorage.setItem(marker, "yes"); location.reload(); return;
        }
        showApp();
      } catch { msg("Daten konnten nicht geladen werden. Firestore-Regeln und Verbindung prüfen.", true); }
    });
  } catch { setupMissing(); }
}
