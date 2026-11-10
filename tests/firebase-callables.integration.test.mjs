import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.GCLOUD_PROJECT || "demo-lifestyle-integration";
const region = "europe-west3";
const functionsOrigin = "http://127.0.0.1:5001";
const authOrigin = "http://127.0.0.1:9099";
const apiKey = "fake-api-key";
const app = initializeApp({ projectId }, "callable-integration-tests");
const auth = getAuth(app);
const db = getFirestore(app);
const users = [];

function validState() {
  return {
    page: "home", month: 0, filter: "Alle", search: "",
    bookingFilterOpen: false, bookingPeriod: "all", bookingSort: "newest",
    fixedMonth: false, oneAll: false, instOpen: false,
    transactions: [], fixed: [], one: [], inst: [], goals: [], accounts: [],
    notes: [], categories: [],
    layoutOrder: ["fixed", "one", "installments", "goals"],
    layoutVisible: { fixed: true, one: true, installments: true, goals: true },
    currency: "EUR", pushPromptSeen: false,
    reminders: {
      inst: { enabled: false, day: 1, time: "09:00" },
      one: { enabled: false, day: 1, time: "09:00" },
      goals: { enabled: false, day: 1, time: "09:00" }
    },
    reminderFired: {}, monthlySalary: 0, userName: "", nextPay: "",
    guideSeen: true, onboardingComplete: true, nextPayDay: 28
  };
}

async function makeUser(emailVerified) {
  const user = await auth.createUser({
    email: `callable-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
    emailVerified,
    password: "Test-password-Only-For-Emulator-42!"
  });
  users.push(user.uid);
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        password: "Test-password-Only-For-Emulator-42!",
        returnSecureToken: true
      })
    }
  );
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return { uid: user.uid, idToken: payload.idToken };
}

async function call(name, data, idToken) {
  const response = await fetch(
    `${functionsOrigin}/${projectId}/${region}/${name}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(idToken ? { authorization: `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({ data })
    }
  );
  return { status: response.status, body: await response.json() };
}

before(async () => {
  // Fail fast with a clear message if the emulator suite was not started.
  const response = await fetch(`${authOrigin}/`);
  assert.ok(response.status < 500, "Firebase Auth emulator is not reachable");
});

after(async () => {
  for (const uid of users) {
    await auth.deleteUser(uid).catch(() => {});
    await db.recursiveDelete(db.doc(`users/${uid}`)).catch(() => {});
  }
  await deleteApp(app);
});

test("saveOwnAppData rejects unauthenticated and unverified callers", async () => {
  const state = validState();
  const anonymous = await call("saveOwnAppData", { state, baseState: {} });
  assert.equal(anonymous.body.error?.status, "UNAUTHENTICATED");

  const unverified = await makeUser(false);
  const rejected = await call("saveOwnAppData", { state, baseState: {} }, unverified.idToken);
  assert.equal(rejected.body.error?.status, "PERMISSION_DENIED");
});

test("saveOwnAppData persists validated data, merges separate changes and rejects conflicts", async () => {
  const user = await makeUser(true);
  const firstState = validState();
  const first = await call("saveOwnAppData", { state: firstState, baseState: {} }, user.idToken);
  assert.equal(first.body.result?.revision, 1, JSON.stringify(first.body));
  assert.deepEqual(first.body.result?.state, firstState);

  const stored = await db.doc(`users/${user.uid}/appData/main`).get();
  assert.equal(stored.exists, true);
  assert.equal(stored.get("revision"), 1);
  assert.equal(stored.get("state").currency, "EUR");

  const local = { ...firstState, transactions: [{ name: "Local entry", amount: 12 }] };
  const remote = { ...firstState, goals: [["Holiday", "500", "2027-01-01", "€", "ic-blue"]] };
  // Simulate another trusted device having updated the remote snapshot since the base was read.
  const encodedRemote = (await import("../firebase-functions/app-data-validation.js"))
    .encodeFirestoreValue(remote);
  await db.doc(`users/${user.uid}/appData/main`).set({
    state: encodedRemote, revision: 2, updatedAt: new Date()
  });

  const merged = await call("saveOwnAppData", { state: local, baseState: firstState }, user.idToken);
  assert.equal(merged.body.result?.revision, 3, JSON.stringify(merged.body));
  assert.deepEqual(merged.body.result?.state.transactions, local.transactions);
  assert.deepEqual(merged.body.result?.state.goals, remote.goals);

  const conflicting = {
    ...remote,
    goals: [["Local conflicting goal", "900", "2027-02-01", "€", "ic-blue"]]
  };
  const conflict = await call("saveOwnAppData", {
    state: conflicting,
    baseState: firstState
  }, user.idToken);
  assert.equal(conflict.body.error?.status, "ABORTED", JSON.stringify(conflict.body));
  assert.deepEqual(conflict.body.error?.details?.fields, ["goals"]);
});

test("deleteOwnAccount requires verified recent authentication and removes user data", async () => {
  const unverified = await makeUser(false);
  const denied = await call("deleteOwnAccount", {}, unverified.idToken);
  assert.equal(denied.body.error?.status, "PERMISSION_DENIED");

  const user = await makeUser(true);
  await db.doc(`users/${user.uid}/appData/main`).set({ marker: "to-delete" });
  const deleted = await call("deleteOwnAccount", {}, user.idToken);
  assert.deepEqual(deleted.body.result, { deleted: true });
  await assert.rejects(() => auth.getUser(user.uid), error => error.code === "auth/user-not-found");
  const remaining = await db.doc(`users/${user.uid}/appData/main`).get();
  assert.equal(remaining.exists, false);
});
