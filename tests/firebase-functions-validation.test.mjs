import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAppState, encodeFirestoreValue, decodeFirestoreValue } from "../firebase-functions/app-data-validation.js";

const validState = () => ({
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
  reminderFired: {}, monthlySalary: 0, userName: "", nextPay: ""
});

test("accepts a complete valid finance snapshot", () => {
  assert.equal(validateAppState(validState()).bytes > 0, true);
});

test("rejects unknown state keys and missing required fields", () => {
  const extra = validState();
  extra.isAdmin = true;
  assert.throws(() => validateAppState(extra), /Unbekanntes Datenfeld/);
  const missing = validState();
  delete missing.transactions;
  assert.throws(() => validateAppState(missing), /Erforderliche Finanzdaten/);
});

test("rejects non-finite, oversized and unsupported nested values", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const state = validState();
    state.transactions.push({ amount: value });
    assert.throws(() => validateAppState(state), /Ungültiger Zahlenwert/);
  }
  const tooLong = validState();
  tooLong.notes.push({ title: "x".repeat(10001) });
  assert.throws(() => validateAppState(tooLong), /Textfeld zu lang/);
  const deep = validState();
  let node = {};
  deep.notes.push(node);
  for (let i = 0; i < 14; i++) node = node.child = {};
  assert.throws(() => validateAppState(deep), /Zu tiefe Datenstruktur/);
});

test("rejects oversized lists and malformed list elements", () => {
  const many = validState();
  many.categories = Array.from({ length: 101 }, (_, i) => String(i));
  assert.throws(() => validateAppState(many), /Ungültige oder zu große Liste/);
  const malformed = validState();
  malformed.transactions.push({ amount: 12, metadata: { nested: undefined } });
  assert.throws(() => validateAppState(malformed), /Nicht unterstützter Datentyp/);
});

test("rejects invalid amounts, currency, reminders and layout values", () => {
  const amount = validState();
  amount.monthlySalary = -1;
  assert.throws(() => validateAppState(amount), /Ungültiges monatliches Gehalt/);
  const currency = validState();
  currency.currency = "XYZ";
  assert.throws(() => validateAppState(currency), /Ungültige Währung/);
  const reminder = validState();
  reminder.reminders.inst.time = "28:99";
  assert.throws(() => validateAppState(reminder), /Ungültige Erinnerungen/);
  const layout = validState();
  layout.layoutOrder[1] = "unknown";
  assert.throws(() => validateAppState(layout), /Ungültige Layout-Reihenfolge/);
});

test("Firestore encoding wraps nested arrays and escapes reserved field names", () => {
  const encoded = encodeFirestoreValue({ rows: [[1, 2]], "__private__": "value" });
  assert.deepEqual(encoded.rows[0], { lifestyleFirestoreNestedArrayV1: true, items: [1, 2] });
  assert.equal(encoded.lifestyleFirestoreEscapedField___private__, "value");
});

test("Firestore array encoding round-trips without changing the finance state", () => {
  const original = { fixed: [["Rent", "500 €"]], nested: { values: [[1, 2], [3]] }, "__private__": "value" };
  assert.deepEqual(decodeFirestoreValue(encodeFirestoreValue(original)), original);
});
