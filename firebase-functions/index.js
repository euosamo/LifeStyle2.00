import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { validateAppState, validateAppStateBase, encodeFirestoreValue, decodeFirestoreValue } from "./app-data-validation.js";

initializeApp();
const REGION = "europe-west3";
const MAX_AUTH_AGE_SECONDS = 5 * 60;

/**
 * Retryable own-account deletion. Deletes the complete users/{uid} document tree
 * before deleting Authentication. Firestore recursiveDelete is not transactional;
 * a failed invocation may remove some documents, and retrying completes the cleanup.
 */
export const deleteOwnAccount = onCall(
  { region: REGION, timeoutSeconds: 540, memory: "512MiB", enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" },
  async request => {
    const auth = request.auth;
    if (!auth?.uid) throw new HttpsError("unauthenticated", "Anmeldung erforderlich.");
    if (auth.token.email_verified !== true) {
      throw new HttpsError("permission-denied", "E-Mail muss bestätigt sein.");
    }
    const authTime = Number(auth.token.auth_time);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(authTime) || authTime > now || now - authTime > MAX_AUTH_AGE_SECONDS) {
      throw new HttpsError("failed-precondition", "Bitte erneut anmelden und die Kontolöschung wiederholen.");
    }

    const uid = auth.uid;
    try {
      const userDocument = getFirestore().doc(`users/${uid}`);
      await getFirestore().recursiveDelete(userDocument);
      await getAuth().deleteUser(uid).catch(error => {
        if (error?.code !== "auth/user-not-found") throw error;
      });
      return { deleted: true };
    } catch (error) {
      console.error("Account deletion failed; retry may complete remaining cleanup", {
        uid,
        code: error?.code || "unknown"
      });
      throw new HttpsError("internal", "Löschung nicht vollständig. Bitte nach erneuter Anmeldung wiederholen.");
    }
  }
);


const MAX_REVISION = 2147483647;

/**
 * Authenticated, App-Check protected write path for the complete personal finance
 * snapshot. The merge is performed transactionally on the server so concurrent
 * devices do not overwrite unrelated top-level state.
 */
export const saveOwnAppData = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
    enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true"
  },
  async request => {
    const auth = request.auth;
    if (!auth?.uid) throw new HttpsError("unauthenticated", "Anmeldung erforderlich.");
    if (auth.token.email_verified !== true) {
      throw new HttpsError("permission-denied", "E-Mail muss bestätigt sein.");
    }

    const incoming = request.data?.state;
    const base = request.data?.baseState;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming) ||
        !base || typeof base !== "object" || Array.isArray(base)) {
      throw new HttpsError("invalid-argument", "Ungültige Finanzdaten.");
    }

    try {
      validateAppState(incoming);
      validateAppStateBase(base);
      const db = getFirestore();
      const document = db.doc(`users/${auth.uid}/appData/main`);
      let savedState;
      let savedRevision;

      await db.runTransaction(async transaction => {
        const current = await transaction.get(document);
        const currentData = current.exists ? current.data() : {};
        const revision = Number(currentData.revision || 0);
        if (!Number.isSafeInteger(revision) || revision < 0 || revision >= MAX_REVISION) {
          throw new HttpsError("failed-precondition", "Ungültige oder ausgeschöpfte Datenrevision.");
        }
        const remoteState = current.exists ? decodeFirestoreValue(currentData.state || {}) : {};
        const nextState = { ...remoteState };
        const changedKeys = new Set([...Object.keys(base), ...Object.keys(incoming)]);
        const conflicts = [];
        for (const key of changedKeys) {
          const baseValue = JSON.stringify(base[key]);
          const localValue = JSON.stringify(incoming[key]);
          const remoteValue = JSON.stringify(remoteState[key]);
          const localChanged = localValue !== baseValue;
          const remoteChanged = remoteValue !== baseValue;

          if (localChanged && remoteChanged && localValue !== remoteValue) {
            conflicts.push(key);
            continue;
          }
          if (!localChanged) continue;
          if (Object.hasOwn(incoming, key)) nextState[key] = incoming[key];
          else delete nextState[key];
        }
        if (conflicts.length) {
          throw new HttpsError(
            "aborted",
            "Gleichzeitige Änderungen erkannt. Bitte synchronisieren und erneut speichern.",
            { fields: conflicts }
          );
        }

        try {
          validateAppState(nextState);
        } catch (error) {
          throw new HttpsError("invalid-argument", error.message || "Ungültige Finanzdaten.");
        }

        if (JSON.stringify(nextState) === JSON.stringify(remoteState)) {
          savedState = remoteState;
          savedRevision = revision;
          return;
        }

        const encodedState = encodeFirestoreValue(nextState);
        const encodedBytes = Buffer.byteLength(JSON.stringify(encodedState), "utf8");
        if (encodedBytes > 950 * 1024) {
          throw new HttpsError(
            "invalid-argument",
            "Die Finanzdaten sind nach der Firestore-Kodierung zu groß. Bitte Einträge archivieren."
          );
        }

        savedState = nextState;
        savedRevision = revision + 1;
        transaction.set(document, {
          state: encodedState,
          revision: savedRevision,
          updatedAt: new Date()
        });
      });

      return { state: savedState, revision: savedRevision };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error?.code === "invalid-argument") {
        throw new HttpsError("invalid-argument", error.message);
      }
      console.error("Finance snapshot save failed", {
        uid: auth.uid,
        code: error?.code || "unknown"
      });
      throw new HttpsError("internal", "Finanzdaten konnten nicht gespeichert werden.");
    }
  }
);
