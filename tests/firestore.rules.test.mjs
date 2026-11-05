import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";

let env;
const validAppState = () => ({
  page: "home",
  month: 0,
  filter: "Alle",
  search: "",
  bookingFilterOpen: false,
  bookingPeriod: "all",
  bookingSort: "newest",
  fixedMonth: false,
  oneAll: false,
  instOpen: false,
  transactions: [],
  fixed: [],
  one: [],
  inst: [],
  goals: [],
  accounts: [],
  notes: [],
  categories: [],
  layoutOrder: ["fixed", "one", "installments", "goals"],
  layoutVisible: { fixed: true, one: true, installments: true, goals: true },
  currency: "EUR",
  pushPromptSeen: false,
  reminders: {
    inst: { enabled: false, day: 1, time: "09:00" },
    one: { enabled: false, day: 1, time: "09:00" },
    goals: { enabled: false, day: 1, time: "09:00" }
  },
  reminderFired: {},
  monthlySalary: 0,
  userName: "",
  nextPay: ""
});
const validAppData = (revision = 1) => ({ state: validAppState(), revision, updatedAt: serverTimestamp() });
const validSubscription = () => ({
  subscription: {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    expirationTime: null,
    keys: { p256dh: "p256dh-test_00123", auth: "auth-test_00123" }
  },
  timezone: "Europe/Berlin",
  userAgent: "Lifestyle test",
  updatedAt: serverTimestamp()
});
const verified = uid => env.authenticatedContext(uid, { email_verified: true }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-lifestyle-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") }
  });
});

after(async () => {
  await env?.cleanup();
});

test("only a verified owner can read, list, write, or delete their own app data", async () => {
  const alice = verified("alice");
  const bob = verified("bob");
  const unverified = env.authenticatedContext("alice", { email_verified: false }).firestore();
  const path = doc(alice, "users/alice/appData/main");

  await assertSucceeds(setDoc(path, validAppData()));
  await assertSucceeds(getDoc(path));
  await assertFails(getDoc(doc(bob, "users/alice/appData/main")));
  await assertFails(setDoc(doc(bob, "users/alice/appData/main"), validAppData()));
  await assertFails(deleteDoc(doc(bob, "users/alice/appData/main")));
  await assertFails(getDoc(doc(unverified, "users/alice/appData/main")));
  await assertFails(setDoc(doc(unverified, "users/alice/appData/main"), validAppData()));
  await assertFails(deleteDoc(doc(unverified, "users/alice/appData/main")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/alice/appData/main")));
  await assertSucceeds(deleteDoc(path));
});

test("app data rejects unknown fields, invalid types, invalid nested settings, and oversized lists", async () => {
  const db = verified("schema-owner");
  const path = doc(db, "users/schema-owner/appData/main");

  await assertSucceeds(setDoc(path, validAppData()));
  await assertFails(setDoc(path, { ...validAppData(), admin: true }));

  const extraStateField = validAppData();
  extraStateField.state.isAdmin = true;
  await assertFails(setDoc(path, extraStateField));

  const invalidFilter = validAppData();
  invalidFilter.state.filter = "public";
  await assertFails(setDoc(path, invalidFilter));

  const invalidLayout = validAppData();
  invalidLayout.state.layoutVisible.extra = true;
  await assertFails(setDoc(path, invalidLayout));

  const invalidReminder = validAppData();
  invalidReminder.state.reminders.inst.time = "29:99";
  await assertFails(setDoc(path, invalidReminder));

  const oversizedList = validAppData();
  oversizedList.state.transactions = Array.from({ length: 10001 }, (_, id) => ({ id: String(id) }));
  await assertFails(setDoc(path, oversizedList));

  await assertFails(setDoc(doc(db, "users/schema-owner/appData/other"), validAppData()));
});

test("app data creation and updates both validate schema and monotonic revisions", async () => {
  const db = verified("revision-owner");
  const path = doc(db, "users/revision-owner/appData/main");

  await assertFails(setDoc(path, validAppData(2)));
  await assertSucceeds(setDoc(path, validAppData()));
  await assertSucceeds(setDoc(path, validAppData(2)));
  await assertFails(setDoc(path, validAppData(4)));
  await assertFails(setDoc(path, validAppData(2)));

  const invalidUpdate = validAppData(3);
  invalidUpdate.state.search = "x".repeat(101);
  await assertFails(setDoc(path, invalidUpdate));
  await assertSucceeds(setDoc(path, validAppData(3)));

  const staleTimestamp = validAppData(4);
  staleTimestamp.updatedAt = new Date();
  await assertFails(setDoc(path, staleTimestamp));
});

test("push subscriptions are verified-owner-only, scoped, and schema-validated", async () => {
  const alice = verified("alice");
  const bob = verified("bob");
  const unverified = env.authenticatedContext("alice", { email_verified: false }).firestore();
  const path = doc(alice, "users/alice/pushSubscriptions/" + "a".repeat(40));

  await assertSucceeds(setDoc(path, validSubscription()));
  await assertSucceeds(getDoc(path));
  await assertSucceeds(getDocs(collection(alice, "users/alice/pushSubscriptions")));
  await assertFails(getDoc(doc(bob, "users/alice/pushSubscriptions/" + "a".repeat(40))));
  await assertFails(getDocs(collection(bob, "users/alice/pushSubscriptions")));
  await assertFails(setDoc(doc(bob, "users/alice/pushSubscriptions/" + "a".repeat(40)), validSubscription()));
  await assertFails(deleteDoc(doc(bob, "users/alice/pushSubscriptions/" + "a".repeat(40))));
  await assertFails(getDoc(doc(unverified, "users/alice/pushSubscriptions/" + "a".repeat(40))));

  for (const [index, endpoint] of [
    "https://updates.push.services.mozilla.com/subscription",
    "https://web.push.apple.com/subscription",
    "https://wns2-example.notify.windows.com/subscription"
  ].entries()) {
    const allowed = validSubscription();
    allowed.subscription.endpoint = endpoint;
    await assertSucceeds(setDoc(doc(alice, "users/alice/pushSubscriptions/" + String(index + 1).padStart(40, "0")), allowed));
  }

  const extraField = validSubscription();
  extraField.extra = "not allowed";
  await assertFails(setDoc(path, extraField));

  const invalidEndpoint = validSubscription();
  invalidEndpoint.subscription.endpoint = "https://evil.example.test/endpoint";
  await assertFails(setDoc(path, invalidEndpoint));

  const invalidKeys = validSubscription();
  invalidKeys.subscription.keys.extra = "not allowed";
  await assertFails(setDoc(path, invalidKeys));

  const invalidKeyEncoding = validSubscription();
  invalidKeyEncoding.subscription.keys.p256dh = "not base64!";
  await assertFails(setDoc(path, invalidKeyEncoding));

  const oversizedUserAgent = validSubscription();
  oversizedUserAgent.userAgent = "x".repeat(181);
  await assertFails(setDoc(path, oversizedUserAgent));

  const invalidTimezone = validSubscription();
  invalidTimezone.timezone = "Europe/Berlin ";
  await assertFails(setDoc(path, invalidTimezone));

  const invalidExpiration = validSubscription();
  invalidExpiration.subscription.expirationTime = -1;
  await assertFails(setDoc(path, invalidExpiration));

  const badId = doc(alice, "users/alice/pushSubscriptions/not-a-hash");
  await assertFails(setDoc(badId, validSubscription()));

  const staleTimestamp = validSubscription();
  staleTimestamp.updatedAt = new Date();
  await assertFails(setDoc(path, staleTimestamp));

  const unverifiedWrite = doc(unverified, "users/alice/pushSubscriptions/" + "b".repeat(40));
  await assertFails(setDoc(unverifiedWrite, validSubscription()));
});

test("verified owners can only read and delete their own push delivery markers", async () => {
  const alice = verified("alice");
  const bob = verified("bob");
  const unverified = env.authenticatedContext("alice", { email_verified: false }).firestore();
  const marker = doc(alice, "users/alice/pushDeliveries/job1");

  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    const { setDoc: adminSetDoc, doc: adminDoc } = await import("firebase/firestore");
    await adminSetDoc(adminDoc(admin, "users/alice/pushDeliveries/job1"), { status: "sent" });
  });

  await assertSucceeds(getDoc(marker));
  await assertFails(getDoc(doc(bob, "users/alice/pushDeliveries/job1")));
  await assertFails(setDoc(marker, { status: "tampered" }));
  await assertFails(setDoc(doc(bob, "users/alice/pushDeliveries/job2"), { status: "sent" }));
  await assertFails(getDoc(doc(unverified, "users/alice/pushDeliveries/job1")));
  await assertSucceeds(deleteDoc(marker));
});

test("all unmatched Firestore paths remain denied", async () => {
  const db = verified("alice");
  await assertFails(setDoc(doc(db, "public/anything"), { value: true }));
  await assertFails(getDoc(doc(db, "users/bob/appData/main")));
  await assertFails(setDoc(doc(db, "users/bob/pushSubscriptions/" + "c".repeat(40)), validSubscription()));
});

