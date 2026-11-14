import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { initializeAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, reload, signOut, browserLocalPersistence, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, doc, getDoc, setDoc, serverTimestamp, runTransaction, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { resolveFirebaseEnvironment } from "./firebase-environment.js";

const productionFirebaseConfig = {
  apiKey: "AIzaSyBsklHgKgsiwEmY_PhmLxhYTdiGlbXpCqc",
  authDomain: "lifestyle2-login.firebaseapp.com",
  projectId: "lifestyle2-login",
  storageBucket: "lifestyle2-login.firebasestorage.app",
  messagingSenderId: "436328668120",
  appId: "1:436328668120:web:1550db3d0c8579773d30ad"
};
const firebaseEnvironment = resolveFirebaseEnvironment(
  name => document.querySelector(`meta[name="${name}"]`)?.content || "",
  productionFirebaseConfig
);
const firebaseConfig = firebaseEnvironment.firebaseConfig;
const gate = document.getElementById("authGate");
const appRoot = document.getElementById("app");
const message = document.getElementById("authMessage");
let mode = "login", user = null, db = null, auth = null, cloudReady = false, timer = null;
let activeUid = null;
let appCheck = null;
let functions = null;
let cloudRevision = 0;
let cloudUnsubscribe = null;
let lastCloudState = null;
let pendingSaveKey = null;
window.lifestyleCloudReady = false;

function msg(text, error = false) {
  if (message) {
    message.textContent = text;
    message.className = error ? "auth-message error" : "auth-message";
  }
  // The login gate is hidden after sign-in, so cloud errors must also be visible in the app.
  if (error) {
    console.error("[Lifestyle]", text);
    if (appRoot && !appRoot.hidden && typeof window.showToast === "function") {
      window.showToast(text);
    }
  }
}
function createButton(parent, id, label, className = "secondary") {
  const button = document.createElement("button");
  button.id = id;
  button.type = "button";
  button.className = className;
  button.textContent = label;
  parent.appendChild(button);
  return button;
}
function formMode() {
  const reg = mode === "register";
  document.getElementById("authTitle").textContent = reg ? "Konto erstellen" : "Willkommen zurück";
  document.getElementById("authSubtitle").textContent = reg ? "Erstelle dein persönliches Lifestyle-Konto." : "Melde dich an, um deine Finanzen zu öffnen.";
  document.getElementById("authSubmit").textContent = reg ? "Kostenlos registrieren" : "Anmelden";
  document.getElementById("authSwitch").textContent = reg ? "Ich habe bereits ein Konto" : "Neues Konto erstellen";
  document.getElementById("authForgot").hidden = reg;
  const passwordInput = document.getElementById("authPassword");
  passwordInput.minLength = reg ? 12 : 6;
  passwordInput.autocomplete = reg ? "new-password" : "current-password";
  passwordInput.setAttribute("aria-describedby", "authPasswordHint");
  const hint = document.getElementById("authPasswordHint");
  if (hint) hint.textContent = reg ? "Mindestens 12 Zeichen verwenden." : "";
  msg("");
}
function authError(e) {
  const errors = {
    "auth/invalid-email": "Bitte eine gültige E-Mail-Adresse eingeben.",
    "auth/weak-password": "Bitte verwende ein stärkeres Passwort mit mindestens 12 Zeichen.",
    "lifestyle/weak-password": "Bitte verwende ein Passwort mit mindestens 12 Zeichen.",
    "auth/email-already-in-use": "Diese E-Mail ist bereits registriert. Bitte anmelden.",
    "auth/invalid-credential": "E-Mail oder Passwort stimmt nicht.",
    "auth/user-not-found": "Für diese E-Mail gibt es noch kein Konto. Bitte registrieren.",
    "auth/wrong-password": "Das Passwort stimmt nicht.",
    "auth/operation-not-allowed": "E-Mail/Passwort-Anmeldung ist in Firebase nicht aktiviert.",
    "auth/unauthorized-domain": "Diese Website ist in Firebase nicht als erlaubte Domain eingetragen.",
    "auth/configuration-not-found": "Die Firebase-Authentifizierung ist nicht vollständig eingerichtet.",
    "auth/invalid-api-key": "Der Firebase-Web-API-Schlüssel ist ungültig oder gehört nicht zu diesem Projekt.",
    "auth/app-not-authorized": "Diese App ist für das Firebase-Projekt nicht autorisiert.",
    "auth/network-request-failed": "Firebase ist nicht erreichbar. Prüfe Netzwerk, Browserblocker und Content-Security-Policy.",
    "auth/too-many-requests": "Zu viele Versuche. Bitte später erneut probieren."
  };
  return errors[e.code] || `Anmeldung fehlgeschlagen (${e.code || e.message || "unbekannter Fehler"}).`;
}
function setupMissing(error) {
  if (gate) gate.hidden = false;
  if (appRoot) appRoot.hidden = true;
  if (error) console.error("[Lifestyle] Firebase initialization failed:", error);
  msg("Firebase konnte nicht gestartet werden. Bitte Internetverbindung und Firebase-Konfiguration prüfen.", true);
}

function showCloudLoadFailure(error) {
  const form = document.getElementById("authForm");
  const forgot = document.getElementById("authForgot");
  const switchMode = document.getElementById("authSwitch");
  if (form) form.hidden = true;
  if (forgot) forgot.hidden = true;
  if (switchMode) switchMode.hidden = true;
  if (gate) gate.hidden = false;
  if (appRoot) appRoot.hidden = true;
  document.body.classList.remove("authenticated");
  let actions = document.getElementById("authRecoveryActions");
  if (!actions) {
    actions = document.createElement("div");
    actions.id = "authRecoveryActions";
    createButton(actions, "authRetryData", "Erneut versuchen");
    createButton(actions, "authSignOutAfterLoadError", "Abmelden");
    message?.insertAdjacentElement("afterend", actions);
    document.getElementById("authRetryData").addEventListener("click", () => window.location.reload());
    document.getElementById("authSignOutAfterLoadError").addEventListener("click", async () => {
      try { await signOut(auth); } catch (signOutError) { console.error("[Lifestyle] Sign-out after data-load failure failed:", signOutError); }
    });
  }
  actions.hidden = false;
  const explanation = error?.code === "permission-denied"
    ? "Prüfe aktive Firestore-Regeln, den Verifizierungsstatus und eine eventuell erzwungene App-Check-Konfiguration."
    : error?.code === "unavailable" || error?.code === "deadline-exceeded"
      ? "Prüfe die Internetverbindung und ob Firestore erreichbar ist."
      : "Prüfe Firebase-Projekt, Browserkonsole und Firestore-Konfiguration.";
  console.error("[Lifestyle] Firebase sign-in succeeded, but private data could not be loaded:", error);
  msg(`Anmeldung erfolgreich, aber deine privaten Finanzdaten konnten nicht geladen werden (${error?.code || "Fehler"}). ${explanation}`, true);
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
      if (password.length < 12) throw Object.assign(new Error("Bitte verwende ein Passwort mit mindestens 12 Zeichen."), { code: "lifestyle/weak-password" });
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
  if (!auth) return;
  const button = document.getElementById("authLogout");
  const signedOutUid = auth.currentUser?.uid;
  let cloudSaveConfirmed = false;
  button.disabled = true;
  try {
    try {
      if (typeof window.lifestyleFlushCloudSave !== "function") throw new Error("Cloud-Speicherung nicht verfügbar.");
      await window.lifestyleFlushCloudSave();
      cloudSaveConfirmed = true;
    } catch (saveError) {
      // The pending snapshot is retained locally; a sync conflict must never trap the user in the session.
      msg("Abmeldung erfolgt. Eine Änderung konnte noch nicht synchronisiert werden und bleibt auf diesem Gerät zur Wiederherstellung gespeichert.", true);
    }
    await signOut(auth);
    // Remove the per-user plaintext cache only after a confirmed cloud flush. If the
    // device was offline or the write failed, keep it so the user can recover it.
    if (cloudSaveConfirmed && signedOutUid) clearUserLocalData(signedOutUid);
  } catch (e) {
    msg("Abmeldung fehlgeschlagen (" + (e.code || e.message || "Fehler") + "). Bitte erneut versuchen.", true);
  } finally {
    button.disabled = false;
  }
});


const ref = uid => doc(db, "users", uid, "appData", "main");

function clearUserLocalData(uid, includeLegacy = false) {
  try {
    const prefix = "lifestyle-finanz-app-user-" + uid;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) localStorage.removeItem(key);
    }
    if (localStorage.getItem("lifestyle-finanz-new-user-uid") === uid) {
      localStorage.removeItem("lifestyle-finanz-new-user-uid");
    }
    if (includeLegacy) {
      localStorage.removeItem("lifestyle-finanz-app-v3-empty");
      localStorage.removeItem("lifestyle-finanz-app-v2");
      localStorage.removeItem("lifestyle-finanz-legacy-imported");
      localStorage.removeItem("lifestyle-finanz-guide-seen");
      localStorage.removeItem("lifestyle-finanz-onboarding-done");
    }
    return true;
  } catch (storageError) {
    console.warn("[Lifestyle] Local user data cleanup was incomplete:", storageError);
    return false;
  }
}

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
  const password = await window.appPrompt("Bitte gib zur Sicherheitsprüfung dein Passwort ein:", "", "password");
  if (password === null || !password) {
    msg("Kontolöschung abgebrochen. Zur Löschung ist eine erneute Sicherheitsprüfung nötig.");
    return;
  }
  try {
    msg("Konto wird sicherheitshalber geprüft …");
    await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password));
    clearTimeout(timer);
    if (cloudUnsubscribe) { cloudUnsubscribe(); cloudUnsubscribe = null; }
    cloudReady = false;
    activeUid = null;
    lastCloudState = null;
    cloudRevision = 0;
    msg("Gespeicherte Finanzdaten und Geräteverknüpfungen werden gelöscht …");
    // Remove every user-owned subcollection in bounded batches before deleting the account.
    // Firestore rules permit this only for the currently verified owner.
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) await subscription.unsubscribe();
    } catch (pushCleanupError) {
      console.warn("[Lifestyle] Browser push subscription cleanup skipped:", pushCleanupError);
    }
    if (!functions) throw new Error("Kontolöschung ist nicht verfügbar: Backend-Funktion nicht initialisiert.");
    await httpsCallable(functions, "deleteOwnAccount")({});
    const localCleanupComplete = clearUserLocalData(current.uid, true);
    if (typeof window.lifestyleApplyState === "function") window.lifestyleApplyState({}, { render: false });
    // Admin SDK deletion does not automatically clear this browser's Firebase Auth session.
    await signOut(auth);
    msg(localCleanupComplete
      ? "Dein Konto wurde gelöscht."
      : "Dein Konto wurde gelöscht, aber lokale Gerätedaten konnten nicht vollständig entfernt werden. Bitte lösche die Website-Daten für Lifestyle in deinem Browser.", !localCleanupComplete);
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
async function writeCloudSnapshot(saveUser, snapshot, baseSnapshot) {
  if (!cloudReady || !user || user.uid !== saveUser.uid || activeUid !== saveUser.uid) {
    throw new Error("Anmeldung nicht mehr aktiv.");
  }
  if (!functions) throw new Error("Sicherer Speicherdienst ist nicht verfügbar.");
  const saveSnapshot = httpsCallable(functions, "saveOwnAppData");
  const result = await saveSnapshot({
    state: snapshot,
    baseState: baseSnapshot && typeof baseSnapshot === "object" ? baseSnapshot : {}
  });
  const committedState = result.data?.state;
  const committedRevision = Number(result.data?.revision);
  if (!committedState || !Number.isSafeInteger(committedRevision) || committedRevision < 1) {
    throw new Error("Der Speicherdienst hat keine gültige Bestätigung zurückgegeben.");
  }
  cloudRevision = Math.max(cloudRevision, committedRevision);
  lastCloudState = cloneState(committedState);
  try {
    localStorage.removeItem(pendingSaveKey);
    localStorage.setItem(window.lifestyleUserStorageKey + "-cloud-saved-at", String(Date.now()));
  } catch (_) {}
}
window.lifestyleCloudSave = state => {
  let snapshot;
  try { snapshot = JSON.parse(JSON.stringify(state)); } catch (_) { return; }
  const savedAt = Date.now();
  // Capture the cloud base at the exact moment this local edit is made.
  // Never read lastCloudState later inside the async queue: by then a newer
  // remote snapshot may have arrived, making an old device snapshot look like
  // a fresh edit and resurrecting deleted items (for example, savings goals).
  const baseSnapshot = cloneState(lastCloudState || {});
  // Keep both the latest local snapshot and an explicit retry copy before network work.
  try {
    if (window.lifestyleUserStorageKey) {
      localStorage.setItem(window.lifestyleUserStorageKey, JSON.stringify(snapshot));
      localStorage.setItem(window.lifestyleUserStorageKey + "-saved-at", String(savedAt));
      if (pendingSaveKey) localStorage.setItem(pendingSaveKey, JSON.stringify({ state: snapshot, savedAt, baseRevision: cloudRevision }));
    }
  } catch (e) {
    // Remove only obsolete conflict backup copies created by earlier sync
    // versions, then retry the normal local snapshot writes. Never remove
    // the main user data or pending-save record.
    console.warn("[Lifestyle] Local browser cache write failed; pruning obsolete conflict backups:", e);
    try {
      const prefix = (window.lifestyleUserStorageKey || "") + "-sync-conflict-";
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix) && !key.endsWith("latest")) localStorage.removeItem(key);
      }
      if (window.lifestyleUserStorageKey) {
        localStorage.setItem(window.lifestyleUserStorageKey, JSON.stringify(snapshot));
        localStorage.setItem(window.lifestyleUserStorageKey + "-saved-at", String(savedAt));
      }
      if (pendingSaveKey) localStorage.setItem(pendingSaveKey, JSON.stringify({ state: snapshot, savedAt, baseRevision: cloudRevision }));
    } catch (retryError) {
      console.warn("[Lifestyle] Local cache still unavailable; cloud save will continue:", retryError);
    }
  }
  if (!user || !db || !cloudReady || user.uid !== activeUid) return;
  const saveUser = user;
  cloudSaveQueue = cloudSaveQueue.catch(() => {}).then(async () => {
    if (!cloudReady || !user || user.uid !== saveUser.uid || activeUid !== saveUser.uid) return;
    try {
      await writeCloudSnapshot(saveUser, snapshot, baseSnapshot);
      msg("Änderungen synchronisiert.");
    } catch (e) {
      console.error("[Lifestyle] Firestore write failed:", e);
      const detail = e.message || e.code || "Unbekannter Fehler";
      if (e.code === "lifestyle/sync-conflict" || e.code === "functions/aborted") {
        // A simultaneous transaction retry/conflict is expected with two active devices.
        // Keep the local pending snapshot, but do not repeatedly interrupt the user.
        console.warn("[Lifestyle] Simultaneous cloud write detected; local snapshot retained for the next save.");
      } else {
        msg(`Synchronisierung fehlgeschlagen (${e.code || "Fehler"}): ${detail}. Deine Änderung bleibt lokal gesichert.`, true);
      }
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
    await writeCloudSnapshot(saveUser, snapshot, lastCloudState || {});
    msg("Daten vor der Abmeldung gespeichert.");
  } catch (e) {
    msg(e.code === "lifestyle/sync-conflict" ? e.message : `Speichern vor Abmeldung fehlgeschlagen (${e.code || "Fehler"}). Bitte Verbindung prüfen und erneut versuchen.`, true);
    throw e;
  }
};

// Firestore forbids arrays directly inside arrays. The app uses row arrays
// (for example fixed expenses), so wrap only nested array elements in a tagged map.
const FIRESTORE_ARRAY_TAG = "lifestyleFirestoreNestedArrayV1";
const FIRESTORE_ESCAPED_FIELD_PREFIX = "lifestyleFirestoreEscapedField_";
function encodeFirestoreFieldKey(key) {
  return /^__.*__$/.test(key) || key === FIRESTORE_ARRAY_TAG || key.startsWith(FIRESTORE_ESCAPED_FIELD_PREFIX) ? FIRESTORE_ESCAPED_FIELD_PREFIX + encodeURIComponent(key) : key;
}
function decodeFirestoreFieldKey(key) {
  if (!key.startsWith(FIRESTORE_ESCAPED_FIELD_PREFIX)) return key;
  try {
    const original = decodeURIComponent(key.slice(FIRESTORE_ESCAPED_FIELD_PREFIX.length));
    return /^__.*__$/.test(original) || original === FIRESTORE_ARRAY_TAG || original.startsWith(FIRESTORE_ESCAPED_FIELD_PREFIX) ? original : key;
  } catch (_) { return key; }
}
function encodeFirestoreValue(value, arrayElement = false) {
  if (Array.isArray(value)) {
    const items = value.map(item => encodeFirestoreValue(item, true));
    return arrayElement ? { [FIRESTORE_ARRAY_TAG]: true, items } : items;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[encodeFirestoreFieldKey(key)] = encodeFirestoreValue(item, false);
    return out;
  }
  return value;
}
function decodeFirestoreValue(value) {
  if (Array.isArray(value)) return value.map(decodeFirestoreValue);
  if (value && typeof value === "object") {
    if (value[FIRESTORE_ARRAY_TAG] === true && Array.isArray(value.items)) {
      return value.items.map(decodeFirestoreValue);
    }
    const out = {};
    for (const [key, item] of Object.entries(value)) out[decodeFirestoreFieldKey(key)] = decodeFirestoreValue(item);
    return out;
  }
  return value;
}
function cloneState(value) { return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : {}; }
function mergeDeviceAndCloud(base, local, remote) {
  const merged = {}, conflicts = [];
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})]);
  for (const key of keys) {
    const b = JSON.stringify((base || {})[key]);
    const l = JSON.stringify((local || {})[key]);
    const r = JSON.stringify((remote || {})[key]);
    const localChanged = l !== b, remoteChanged = r !== b;
    if (localChanged && remoteChanged && l !== r) { conflicts.push(key); merged[key] = (remote || {})[key]; }
    else if (localChanged) merged[key] = (local || {})[key];
    else merged[key] = (remote || {})[key];
  }
  return { state: merged, conflicts };
}
let deferredPersonalSettingsSnapshot = null;
window.lifestyleMergeDeferredCloudState = personalValues => {
  if (!deferredPersonalSettingsSnapshot) return false;
  const { revision, remote } = deferredPersonalSettingsSnapshot;
  const local = typeof window.lifestyleGetState === "function" ? cloneState(window.lifestyleGetState()) : {};
  const merged = mergeDeviceAndCloud(lastCloudState || {}, local, remote);
  Object.assign(merged.state, personalValues || {});
  cloudRevision = revision;
  lastCloudState = cloneState(remote);
  deferredPersonalSettingsSnapshot = null;
  if (merged.conflicts.length) {
    try { localStorage.setItem(window.lifestyleUserStorageKey + "-sync-conflict-latest", JSON.stringify({ local, remote, fields: merged.conflicts, savedAt: Date.now() })); } catch (_) {}
  }
  if (typeof window.lifestyleApplyState === "function") window.lifestyleApplyState(merged.state, { render: false });
  if (merged.conflicts.length) {
    console.warn("[Lifestyle] Personal settings merge kept the entered values; backup saved for:", merged.conflicts.join(", "));
  }
  return true;
};
function startCloudRealtimeSync(uid) {
  if (cloudUnsubscribe) cloudUnsubscribe();
  deferredPersonalSettingsSnapshot = null;
  cloudUnsubscribe = onSnapshot(ref(uid), snap => {
    if (!cloudReady || activeUid !== uid || !user || user.uid !== uid || !snap.exists()) return;
    const data = snap.data(), revision = Number(data.revision || 0), remote = decodeFirestoreValue(data.state);
    if (!remote || typeof remote !== "object" || Array.isArray(remote) || revision <= cloudRevision) return;
    if (window.lifestylePersonalSettingsEditing === true) {
      if (!deferredPersonalSettingsSnapshot || revision > deferredPersonalSettingsSnapshot.revision) {
        deferredPersonalSettingsSnapshot = { revision, remote: cloneState(remote) };
      }
      return;
    }
    const local = typeof window.lifestyleGetState === "function" ? cloneState(window.lifestyleGetState()) : {};
    const merged = mergeDeviceAndCloud(lastCloudState || {}, local, remote);
    cloudRevision = revision;
    lastCloudState = cloneState(remote);
    if (merged.conflicts.length) {
      try { localStorage.setItem(window.lifestyleUserStorageKey + "-sync-conflict-latest", JSON.stringify({ local, remote, fields: merged.conflicts, savedAt: Date.now() })); } catch (_) {}
    }
    const mergedDiffersFromRemote = JSON.stringify(merged.state) !== JSON.stringify(remote);
    if (typeof window.lifestyleApplyState === "function") {
      window.lifestyleSkipNextRenderPersist = true;
      window.lifestyleApplyState(merged.state);
    }
    // Only upload genuine local-only edits. A remote snapshot must not cause
    // an automatic echo write, especially when both devices have different
    // local UI preferences such as layout visibility or reminders.
    if (mergedDiffersFromRemote && typeof window.lifestyleCloudSave === "function") {
      window.lifestyleCloudSave(merged.state);
    }
    if (merged.conflicts.length) {
      console.warn("[Lifestyle] Simultaneous changes merged; remote values kept for:", merged.conflicts.join(", "));
    }
  }, error => {
    msg("Live-Synchronisierung unterbrochen (" + (error.code || "Verbindungsfehler") + "). Deine lokalen Änderungen bleiben erhalten.", true);
  });
}
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
    createButton(verify, "resendVerification", "Bestätigungs-E-Mail erneut senden");
    createButton(verify, "checkVerification", "Ich habe bestätigt – erneut prüfen");
    createButton(verify, "changeVerificationEmail", "Zurück – E-Mail-Adresse ändern");
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
        if (auth.currentUser.emailVerified) {
          await auth.currentUser.getIdToken(true);
          window.location.reload();
        } else {
          msg("Die E-Mail ist noch nicht bestätigt. Bitte öffne den Link in der E-Mail und versuche es erneut.");
        }
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
  // The public Enterprise site key is supplied through the page metadata after
  // Firebase Console setup. Never ship a secret key in the client.
  const appCheckSiteKey = firebaseEnvironment.appCheckSiteKey.trim();
  if (appCheckSiteKey) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
    window.lifestyleAppCheckConfigured = true;
    window.lifestyleFirebaseEnvironment = firebaseEnvironment.environment;
  } else {
    window.lifestyleAppCheckConfigured = false;
    window.lifestyleFirebaseEnvironment = firebaseEnvironment.environment;
    console.warn("[Lifestyle] Firebase App Check ist noch nicht konfiguriert.");
  }
  // Initialize auth directly with browser storage. Avoid awaiting IndexedDB persistence,
  // which can stall Firebase startup on some iOS PWA installations.
  auth = initializeAuth(app, { persistence: browserLocalPersistence });
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  functions = getFunctions(app, "europe-west3");
  onAuthStateChanged(auth, async nextUser => {
    clearTimeout(timer);
    if (cloudUnsubscribe) { cloudUnsubscribe(); cloudUnsubscribe = null; }
    cloudReady = false;
    window.lifestyleCloudReady = false;
    lastCloudState = null;
    user = nextUser;
    if (!user) {
      const verify = document.getElementById("verifyEmailActions");
      if (verify) verify.hidden = true;
      const recovery = document.getElementById("authRecoveryActions");
      if (recovery) recovery.hidden = true;
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
    const recovery = document.getElementById("authRecoveryActions");
    if (recovery) recovery.hidden = true;
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
    document.getElementById("authForm").hidden = true;
    document.getElementById("authForgot").hidden = true;
    document.getElementById("authSwitch").hidden = true;
    msg("Anmeldung erfolgreich. Deine privaten Finanzdaten werden geladen …");
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
      const cloudState = snap.exists() ? decodeFirestoreValue(snap.data().state) : null;
      // A revision mismatch must not lock the user out. Preserve the pending
      // snapshot under a separate recovery key, then use the cloud as authority
      // when it exists. If no cloud document exists, retain the pending snapshot.
      if (pending && Number(pending.baseRevision) !== cloudRevision) {
        try {
          const backupKey = pendingSaveKey + "-conflict-backup-" + Date.now();
          localStorage.setItem(backupKey, pendingRaw);
          localStorage.removeItem(pendingSaveKey);
        } catch (backupError) {
          throw new Error("Der lokale Zwischenstand konnte nicht sicher gesichert werden. Bitte Gerätespeicher prüfen; es wurde nichts überschrieben.");
        }
      }
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
      const pendingMatchesCloud = !!(pending && Number(pending.baseRevision) === cloudRevision);
      const chosenState = (pendingMatchesCloud ? pending.state : null) || cloudState || (pending && pending.state) || localState || legacyState || null;
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
      // If this account has no Firestore document yet, explicitly seed it from the
      // already-selected initial state. Existing cloud documents are never replaced here.
      if (!snap.exists()) {
        await writeCloudSnapshot(user, chosenState || {});
      }
      lastCloudState = cloneState(cloudState || chosenState || {});
      showApp();
      window.render();
      startCloudRealtimeSync(uid);
      // render() below queues the initial snapshot through the same revision-checked save path.
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
      showCloudLoadFailure(e);
    }
  }, e => {
    setupMissing(e);
    msg(authError(e), true);
  });
} catch (e) {
  setupMissing(e);
  msg(authError(e), true);
}
