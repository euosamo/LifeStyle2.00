const STATE_KEYS = new Set([
  "page", "month", "filter", "search", "bookingFilterOpen", "bookingPeriod",
  "bookingSort", "fixedMonth", "oneAll", "instOpen", "transactions", "fixed",
  "one", "inst", "goals", "accounts", "notes", "categories", "layoutOrder",
  "layoutVisible", "currency", "pushPromptSeen", "guideSeen",
  "onboardingComplete", "reminders", "reminderFired", "monthlySalary",
  "userName", "nextPay", "nextPayDay"
]);
const REQUIRED_KEYS = [
  "page", "month", "filter", "search", "bookingFilterOpen", "bookingPeriod",
  "bookingSort", "fixedMonth", "oneAll", "instOpen", "transactions", "fixed",
  "one", "inst", "goals", "accounts", "notes", "categories", "layoutOrder",
  "layoutVisible", "currency", "pushPromptSeen", "reminders", "monthlySalary",
  "userName", "nextPay"
];
const LIST_LIMITS = {
  transactions: 10000, fixed: 2000, one: 2000, inst: 2000,
  goals: 2000, accounts: 2000, notes: 500, categories: 100,
  layoutOrder: 4
};
const MAX_DOCUMENT_BYTES = 850 * 1024;

function fail(message) {
  const error = new Error(message);
  error.code = "invalid-argument";
  throw error;
}

function inspectValue(value, path, depth = 0) {
  if (depth > 12) fail(`Zu tiefe Datenstruktur: ${path}`);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > 10000) fail(`Textfeld zu lang: ${path}`);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) fail(`Ungültiger Zahlenwert: ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 10000) fail(`Liste zu groß: ${path}`);
    value.forEach((item, index) => inspectValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value);
    if (entries.length > 100) fail(`Zu viele Felder: ${path}`);
    for (const [key, item] of entries) {
      if (!key || key.length > 128 || key.startsWith("__") || key.endsWith("__")) {
        fail(`Ungültiger Feldname: ${path}`);
      }
      inspectValue(item, `${path}.${key}`, depth + 1);
    }
    return;
  }
  fail(`Nicht unterstützter Datentyp: ${path}`);
}

export function validateAppState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) fail("Finanzdaten müssen ein Objekt sein.");
  const keys = Object.keys(state);
  if (keys.some(key => !STATE_KEYS.has(key))) fail("Unbekanntes Datenfeld in den Finanzdaten.");
  if (REQUIRED_KEYS.some(key => !Object.hasOwn(state, key))) fail("Erforderliche Finanzdaten fehlen.");
  if (keys.length > 29) fail("Zu viele Hauptfelder.");
  for (const [key, limit] of Object.entries(LIST_LIMITS)) {
    if (!Array.isArray(state[key]) || state[key].length > limit) fail(`Ungültige oder zu große Liste: ${key}`);
  }
  if (typeof state.page !== "string" || state.page.length > 32) fail("Ungültige Seite.");
  if (!Number.isInteger(state.month) || state.month < -1 || state.month > 1) fail("Ungültiger Monatsfilter.");
  if (!["Alle", "Einnahmen", "Ausgaben"].includes(state.filter)) fail("Ungültiger Buchungsfilter.");
  if (typeof state.search !== "string" || state.search.length > 100) fail("Ungültige Suche.");
  if (typeof state.bookingFilterOpen !== "boolean" || typeof state.fixedMonth !== "boolean" ||
      typeof state.oneAll !== "boolean" || typeof state.instOpen !== "boolean" ||
      typeof state.pushPromptSeen !== "boolean") fail("Ungültige Anzeigeeinstellung.");
  if (!["all", "month", "previous"].includes(state.bookingPeriod) ||
      !["newest", "oldest", "amount-high", "amount-low"].includes(state.bookingSort)) fail("Ungültige Sortierung.");
  if (!["EUR", "USD", "GBP"].includes(state.currency)) fail("Ungültige Währung.");
  if (typeof state.monthlySalary !== "number" || state.monthlySalary < 0 || state.monthlySalary > 1e9) fail("Ungültiges monatliches Gehalt.");
  if (typeof state.userName !== "string" || state.userName.length > 50 ||
      typeof state.nextPay !== "string" || state.nextPay.length > 10) fail("Ungültige persönliche Angaben.");
  const layoutKeys = ["fixed", "one", "installments", "goals"];
  if (!Array.isArray(state.layoutOrder) || state.layoutOrder.length !== 4 ||
      new Set(state.layoutOrder).size !== 4 || state.layoutOrder.some(key => !layoutKeys.includes(key))) fail("Ungültige Layout-Reihenfolge.");
  if (!state.layoutVisible || typeof state.layoutVisible !== "object" ||
      Object.keys(state.layoutVisible).length !== 4 ||
      layoutKeys.some(key => typeof state.layoutVisible[key] !== "boolean")) fail("Ungültige Layout-Einstellungen.");
  if (!state.reminders || typeof state.reminders !== "object" ||
      Object.keys(state.reminders).some(key => !["inst", "one", "goals"].includes(key)) ||
      ["inst", "one", "goals"].some(key => {
        const item = state.reminders[key];
        return !item || typeof item.enabled !== "boolean" || !Number.isInteger(item.day) ||
          item.day < 1 || item.day > 31 || typeof item.time !== "string" ||
          !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(item.time) ||
          Object.keys(item).some(field => !["enabled", "day", "time"].includes(field));
      })) fail("Ungültige Erinnerungen.");
  if (state.guideSeen !== undefined && typeof state.guideSeen !== "boolean") fail("Ungültiger Guide-Status.");
  if (state.onboardingComplete !== undefined && typeof state.onboardingComplete !== "boolean") fail("Ungültiger Onboarding-Status.");
  if (state.nextPayDay !== undefined && state.nextPayDay !== null &&
      (!Number.isInteger(state.nextPayDay) || state.nextPayDay < 1 || state.nextPayDay > 31)) fail("Ungültiger Zahltag.");
  if (state.reminderFired !== undefined &&
      (!state.reminderFired || typeof state.reminderFired !== "object" || Array.isArray(state.reminderFired) ||
       Object.keys(state.reminderFired).length > 1000)) fail("Ungültiger Erinnerungsstatus.");
  inspectValue(state, "state");
  const bytes = Buffer.byteLength(JSON.stringify(state), "utf8");
  if (bytes > MAX_DOCUMENT_BYTES) fail("Die Finanzdaten sind zu groß. Bitte alte Einträge archivieren.");
  return { bytes };
}

export function encodeFirestoreValue(value, arrayElement = false) {
  const ARRAY_TAG = "lifestyleFirestoreNestedArrayV1";
  const ESCAPED_PREFIX = "lifestyleFirestoreEscapedField_";
  if (Array.isArray(value)) {
    const items = value.map(item => encodeFirestoreValue(item, true));
    return arrayElement ? { [ARRAY_TAG]: true, items } : items;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const safeKey = /^__.*__$/.test(key) ? ESCAPED_PREFIX + encodeURIComponent(key) : key;
      out[safeKey] = encodeFirestoreValue(item, false);
    }
    return out;
  }
  return value;
}

export function decodeFirestoreValue(value) {
  const ARRAY_TAG = "lifestyleFirestoreNestedArrayV1";
  const ESCAPED_PREFIX = "lifestyleFirestoreEscapedField_";
  if (Array.isArray(value)) return value.map(decodeFirestoreValue);
  if (value && typeof value === "object") {
    if (value[ARRAY_TAG] === true && Array.isArray(value.items)) {
      return value.items.map(decodeFirestoreValue);
    }
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      let decodedKey = key;
      if (key.startsWith(ESCAPED_PREFIX)) {
        try {
          const original = decodeURIComponent(key.slice(ESCAPED_PREFIX.length));
          if (/^__.*__$/.test(original)) decodedKey = original;
        } catch (_) {}
      }
      out[decodedKey] = decodeFirestoreValue(item);
    }
    return out;
  }
  return value;
}
