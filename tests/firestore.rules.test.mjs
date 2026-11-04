import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

let env;
const stamp = () => new Date();
const validAppData = () => ({ state: { balance: 123, transactions: [{ id: "t1" }] }, revision: 1, updatedAt: stamp() });
const validSubscription = () => ({
  subscription: {
    endpoint: "https://push.example.test/subscription",
    expirationTime: null,
    keys: { p256dh: "test-p256dh", auth: "test-auth" }
  },
  timezone: "Europe/Berlin",
  userAgent: "Lifestyle test",
  updatedAt: stamp()
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-lifestyle-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") }
  });
});

after(async () => {
  await env?.cleanup();
});

test("only a verified owner can read and write their own app data", async () => {
  const alice = env.authenticatedContext("alice", { email_verified: true }).firestore();
  const bob = env.authenticatedContext("bob", { email_verified: true }).firestore();
  const unverified = env.authenticatedContext("alice", { email_verified: false }).firestore();
  const path = doc(alice, "users/alice/appData/main");

  await assertSucceeds(setDoc(path, validAppData()));
  await assertSucceeds(getDoc(path));
  await assertFails(getDoc(doc(bob, "users/alice/appData/main")));
  await assertFails(setDoc(doc(bob, "users/alice/appData/main"), validAppData()));
  await assertFails(getDoc(doc(unverified, "users/alice/appData/main")));
  await assertFails(setDoc(doc(unverified, "users/alice/appData/main"), validAppData()));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/alice/appData/main")));
});

test("app data schema rejects unexpected fields and invalid revisions", async () => {
  const db = env.authenticatedContext("alice", { email_verified: true }).firestore();
  const path = doc(db, "users/alice/appData/main");
  await assertFails(setDoc(path, { ...validAppData(), admin: true }));
  await assertFails(setDoc(path, { ...validAppData(), revision: -1 }));
  await assertFails(setDoc(path, { ...validAppData(), state: [] }));
  await assertFails(setDoc(doc(db, "users/alice/appData/other"), validAppData()));
});

test("push subscriptions are owner-only and schema-validated", async () => {
  const alice = env.authenticatedContext("alice", { email_verified: true }).firestore();
  const bob = env.authenticatedContext("bob", { email_verified: true }).firestore();
  const path = doc(alice, "users/alice/pushSubscriptions/device1");
  await assertSucceeds(setDoc(path, validSubscription()));
  await assertSucceeds(getDoc(path));
  await assertFails(getDoc(doc(bob, "users/alice/pushSubscriptions/device1")));
  await assertFails(setDoc(path, { ...validSubscription(), extra: "not allowed" }));
  const invalidEndpoint = validSubscription();
  invalidEndpoint.subscription.endpoint = "javascript:alert(1)";
  await assertFails(setDoc(path, invalidEndpoint));
  const invalidKeys = validSubscription();
  invalidKeys.subscription.keys.extra = "not allowed";
  await assertFails(setDoc(path, invalidKeys));
  await assertFails(deleteDoc(doc(bob, "users/alice/pushSubscriptions/device1")));
});

test("verified owners can only read and delete their own push delivery markers", async () => {
  const alice = env.authenticatedContext("alice", { email_verified: true }).firestore();
  const bob = env.authenticatedContext("bob", { email_verified: true }).firestore();
  const marker = doc(alice, "users/alice/pushDeliveries/job1");
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "users/alice/pushDeliveries/job1"), { status: "sent", createdAt: stamp() });
  });
  await assertSucceeds(getDoc(marker));
  await assertFails(getDoc(doc(bob, "users/alice/pushDeliveries/job1")));
  await assertFails(setDoc(marker, { status: "tampered" }));
  await assertSucceeds(deleteDoc(marker));
});

test("all other Firestore paths remain denied", async () => {
  const db = env.authenticatedContext("alice", { email_verified: true }).firestore();
  await assertFails(setDoc(doc(db, "public/anything"), { value: true }));
});
