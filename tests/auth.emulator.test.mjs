import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase/app";
import {
  applyActionCode,
  confirmPasswordReset,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  verifyPasswordResetCode
} from "firebase/auth";

const projectId = "demo-lifestyle-rules";
let app;
let auth;

async function waitForOobCode(email, requestType) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/oobCodes`);
    assert.equal(response.ok, true, "Auth emulator OOB endpoint is unavailable");
    const payload = await response.json();
    const match = payload.oobCodes?.find(code => code.email === email && code.requestType === requestType);
    if (match?.oobCode) return match.oobCode;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(`No ${requestType} code found for test account`);
}

before(() => {
  app = initializeApp({ apiKey: "demo-api-key", authDomain: "localhost", projectId }, `auth-test-${randomUUID()}`);
  auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
});

after(async () => {
  try { if (auth?.currentUser) await signOut(auth); } catch (_) {}
  if (app) await deleteApp(app);
});

test("Auth emulator covers two isolated accounts, email verification, sign-in, reset, and sign-out", async () => {
  const suffix = randomUUID();
  const emailA = `lifestyle-a-${suffix}@example.test`;
  const emailB = `lifestyle-b-${suffix}@example.test`;
  const passwordA = "Lifestyle-Test-A-123!";
  const passwordB = "Lifestyle-Test-B-123!";
  const first = await createUserWithEmailAndPassword(auth, emailA, passwordA);
  assert.equal(first.user.emailVerified, false);
  await sendEmailVerification(first.user);
  await applyActionCode(auth, await waitForOobCode(emailA, "VERIFY_EMAIL"));
  await reload(first.user);
  assert.equal(first.user.emailVerified, true);

  await signOut(auth);
  const signedInA = await signInWithEmailAndPassword(auth, emailA, passwordA);
  assert.equal(signedInA.user.uid, first.user.uid);
  await sendPasswordResetEmail(auth, emailA);
  const resetCode = await waitForOobCode(emailA, "PASSWORD_RESET");
  assert.equal(await verifyPasswordResetCode(auth, resetCode), emailA);
  await confirmPasswordReset(auth, resetCode, "Lifestyle-Test-A-456!");
  await signOut(auth);
  const resetSignIn = await signInWithEmailAndPassword(auth, emailA, "Lifestyle-Test-A-456!");
  assert.equal(resetSignIn.user.uid, first.user.uid);
  await signOut(auth);

  const second = await createUserWithEmailAndPassword(auth, emailB, passwordB);
  assert.notEqual(second.user.uid, first.user.uid);
  await signOut(auth);
  await assert.rejects(signInWithEmailAndPassword(auth, emailB, passwordA), error => ["auth/invalid-credential", "auth/wrong-password"].includes(error.code));
  const finalSignIn = await signInWithEmailAndPassword(auth, emailA, "Lifestyle-Test-A-456!");
  assert.equal(finalSignIn.user.uid, first.user.uid);
  await signOut(auth);
  assert.equal(auth.currentUser, null);
});
