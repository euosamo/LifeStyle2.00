import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

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
