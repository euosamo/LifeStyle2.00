import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const source = readFileSync("backup-utils.js", "utf8");
const context = vm.createContext({ window: {}, TextEncoder, Date });
vm.runInContext(source, context, { filename: "backup-utils.js" });
const backup = context.window.LifestyleBackup;

const validState = () => ({
  page: "home", month: 0, filter: "Alle", search: "", bookingFilterOpen: false,
  bookingPeriod: "all", bookingSort: "newest", fixedMonth: false, oneAll: false,
  instOpen: false, transactions: [{ name: "Gehalt", date: "06.11.2026", amount: 2500, kind: "Einnahmen", icon: "＋", color: "ic-green" }],
  fixed: [["Miete", "900,00", "Monatlich", "●", "ic-blue"]], one: [], inst: [], goals: [],
  accounts: [], notes: [{ id: "n1", title: "Notiz", body: "Text", reminder: { enabled: false, date: "", time: "09:00" } }],
  categories: [], layoutOrder: ["fixed", "one", "installments", "goals"],
  layoutVisible: { fixed: true, one: true, installments: true, goals: true }, currency: "EUR",
  pushPromptSeen: false, reminders: Object.fromEntries(["inst", "one", "goals"].map(key => [key, { enabled: false, day: 1, time: "09:00" }])),
  monthlySalary: 2500, userName: "Alex", nextPay: "", reminderFired: {}
});

test("backup export wraps and round-trips all financial state", () => {
  const state = validState();
  const serialized = backup.create(state);
  const parsed = backup.parse(serialized);
  assert.equal(parsed.transactions[0].name, "Gehalt");
  assert.equal(parsed.fixed[0][0], "Miete");
  assert.equal(parsed.notes[0].title, "Notiz");
});

test("legacy raw-state exports remain importable", () => {
  assert.equal(backup.parse(JSON.stringify(validState())).accounts.length, 0);
});

test("invalid JSON, unsupported versions, unknown fields, and malformed data are rejected", () => {
  assert.throws(() => backup.parse("{"), /beschädigt/);
  assert.throws(() => backup.parse(JSON.stringify({ format: "lifestyle2-backup", version: 999, exportedAt: new Date().toISOString(), state: validState() })), /version/i);
  assert.throws(() => backup.parse(JSON.stringify({ ...validState(), admin: true })), /Unbekanntes Datenfeld/);
  const badAmount = validState(); badAmount.transactions[0].amount = "alert(1)";
  assert.throws(() => backup.parse(JSON.stringify(badAmount)), /Buchungsbetrag/);
});

test("dangerous prototype keys and oversized files are rejected", () => {
  const hostile = JSON.parse(JSON.stringify(validState