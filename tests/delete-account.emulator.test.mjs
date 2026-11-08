import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(new URL("../firebase-functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

async function signIn(email, password) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const result = await response.json();
  assert.equal(response.ok, true, `emulator sign-in failed: ${JSON.stringify(result)}`);
  return result.idToken;
}

async function callDelete(idToken, data = {}) {
  return fetch("http://127.0.0.1:5001/demo-lifestyle-rules/europe-west3/deleteOwnAccount", {
    method: "POST",
    headers: { "content-type": "application/json", ...(idToken ? { authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ data })
  });
}

test("server account deletion requires verified auth and recursively removes only the caller subtree", async () => {
  const app = initializeApp({ projectId: "demo-lifestyle-rules" }, `delete-test-${randomUUID()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const suffix = randomUUID();
  const password = "Delete-Emulator-Test-123!";
  const victimEmail = `delete-owner-${suffix}@example.test`;
  const otherEmail = `delete-other-${suffix}@example.test`;
  const unverifiedEmail = `delete-unverified-${suffix}@example.test`;
  let victim;
  let other;
  let unverified;
  try {
    const missingAuth = await callDelete();
    assert.equal(missingAuth.status, 401, "unauthenticated requests must be rejected");

    victim = await auth.createUser({ email: victimEmail, password, emailVerified: true });
    other = await auth.createUser({ email: otherEmail, password, emailVerified: true });
    unverified = await auth.createUser({ email: unverifiedEmail, password, emailVerified: false });
    await db.doc(`users/${victim.uid}/appData/main`).set({ state: { transactions: [{ name: "synthetic" }] } });
    await db.doc(`users/${victim.uid}/pushSubscriptions/endpoint`).set({ subscription: { endpoint: "https://example.test/push" } });
    await db.doc(`users/${other.uid}/appData/main`).set({ state: { transactions: [{ name: "must-remain" }] } });
    await db.doc(`users/${unverified.uid}/appData/main`).set({ state: { transactions: [{ name: "must-remain-unverified" }] } });

    const unverifiedResponse = await callDelete(await signIn(unverifiedEmail, password));
    assert.equal(unverifiedResponse.status, 403, "unverified accounts must not be deleted through the endpoint");
    assert.equal((await db.doc(`users/${unverified.uid}/appData/main`).get()).exists, true);

    const idToken = await signIn(victimEmail, password);
    const response = await callDelete(idToken, { uid: other.uid });
    const responseText = await response.text();
    assert.equal(response.status, 200, `verified caller deletion failed: ${responseTex