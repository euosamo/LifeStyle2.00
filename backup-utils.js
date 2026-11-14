(() => {
  "use strict";

  const FORMAT = "lifestyle2-backup";
  const VERSION = 1;
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_RESTORE_STATE_BYTES = 700 * 1024;
  const topLevelKeys = new Set([
    "page", "month", "filter", "search", "bookingFilterOpen", "bookingPeriod",
    "bookingSort", "fixedMonth", "oneAll", "instOpen", "transactions", "fixed",
    "one", "inst", "goals", "accounts", "notes", "categories", "layoutOrder",
    "layoutVisible", "currency", "pushPromptSeen", "guideSeen", "onboardingComplete",
    "reminders", "reminderFired", "monthlySalary", "userName", "nextPay", "nextPayDay"
  ]);
  const limits = { transactions: 10000, fixed: 2000, one: 2000, inst: 2000, goals: 2000, accounts: 2000, notes: 500, categories: 100 };

  function fail(message) { throw new Error(message); }
  function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function safeJsonTree(value, depth = 0) {
    if (depth > 12) fail("Die Sicherung ist zu tief verschachtelt.");
    if (typeof value === "string") {
      if (value.length > 10000) fail("Ein Textfeld in der Sicherung ist zu lang.");
      return;
    }
    if (value === null || typeof value === "boolean") return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("Die Sicherung enthält eine ungültige Zahl.");
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 10000) fail("Eine Liste in der Sicherung ist zu groß.");
      value.forEach(item => safeJsonTree(item, depth + 1));
      return;
    }
    if (!isRecord(value)) fail("Die Sicherung enthält einen nicht unterstützten Datentyp.");
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) fail("Die Sicherung enthält einen unzulässigen Feldnamen.");
      safeJsonTree(child, depth + 1);
    }
  }
  function text(value, max, label) {
    if (typeof value !== "string" || value.length > max) fail(`${label} ist ungültig oder zu lang.`);
  }
  function validateReminder(value, label) {
    if (!isRecord(value)) fail(`${label} ist ungültig.`);
    if (typeof value.enabled !== "boolean") fail(`${label} hat einen ungültigen Status.`);
    if (value.date !== undefined && (typeof value.date !== "string" || value.date.length > 10)) fail(`${label} hat ein ungültiges Datum.`);
    if (value.time !== undefined && (typeof value.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))) fail(`${label} hat eine ungültige Uhrzeit.`);
  }
  function validateState(state) {
    if (!isRecord(state)) fail("Die Sicherungsdatei enthält keinen gültigen Datenstand.");
    for (const key of Object.keys(state)) if (!topLevelKeys.has(key)) fail(`Unbekanntes Datenfeld: ${key}`);
    safeJsonTree(state);

    for (const [key, max] of Object.entries(limits)) {
      if (state[key] === undefined) continue; // Older exports may omit fields added later.
      if (!Array.isArray(state[key]) || state[key].length > max) fail(`Die Liste „${key}“ ist ungültig oder zu groß.`);
    }
    for (const key of ["fixed", "one", "inst", "goals", "accounts"]) {
      for (const row of state[key] || []) {
        if (!Array.isArray(row) || row.length < 2 || row.length > 8) fail(`Ein Eintrag in „${key}“ hat ein ungültiges Format.`);
        row.forEach((cell, index) => {
          const reminderIndex = key === "one" ? 5 : key === "inst" ? 6 : -1;
          if (index === reminderIndex && cell != null) validateReminder(cell, `Erinnerung in „${key}“`);
          else if (typeof cell !== "string" && typeof cell !== "number" && cell !== null) fail(`Ein Eintrag in „${key}“ enthält einen ungültigen Wert.`);
        });
      }
    }
    if (state.transactions !== undefined) for (const tx of state.transactions) {
      if (!isRecord(tx)) fail("Eine Buchung hat ein ungültiges Format.");
      text(tx.name, 120, "Buchungsname");
      text(tx.date, 24, "Buchungsdatum");
      if (typeof tx.amount !== "number" || !Number.isFinite(tx.amount) || Math.abs(tx.amount) > 1e12) fail("Ein Buchungsbetrag ist ungültig.");
      if (tx.kind !== undefined && !["Einnahmen", "Ausgaben"].includes(tx.kind)) fail("Eine Buchungsart ist ungültig.");
      for (const [field, max] of [["icon", 8], ["color", 32], ["category", 60]]) if (tx[field] !== undefined) text(tx[field], max, `Buchungsfeld ${field}`);
    }
    if (state.notes !== undefined) for (const note of state.notes) {
      if (!isRecord(note)) fail("Eine Notiz hat ein ungültiges Format.");
      text(note.title, 200, "Notiztitel");
      text(note.body, 5000, "Notiztext");
      if (note.reminder !== undefined) validateReminder(note.reminder, "Notizerinnerung");
    }
    if (state.categories !== undefined) for (const item of state.categories) text(item, 100, "Kategorie");
    if (state.page !== undefined) text(state.page, 32, "Ansicht");
    if (state.search !== undefined) text(state.search, 100, "Suchtext");
    if (state.userName !== undefined) text(state.userName, 50, "Name");
    if (state.nextPay !== undefined) text(state.nextPay, 10, "Zahltag");
    if (state.currency !== undefined && !["EUR", "USD", "GBP"].includes(state.currency)) fail("Die Währung wird nicht unterstützt.");
    if (state.monthlySalary !== undefined && (typeof state.monthlySalary !== "number" || !Number.isFinite(state.monthlySalary) || state.monthlySalary < 0 || state.monthlySalary > 1e9)) fail("Der monatliche Lohn ist ungültig.");
    if (state.layoutOrder !== undefined && (!Array.isArray(state.layoutOrder) || state.layoutOrder.length !== 4 || new Set(state.layoutOrder).size !== 4 || state.layoutOrder.some(x => !["fixed", "one", "installments", "goals"].includes(x)))) fail("Die gespeicherte Bereichsreihenfolge ist ungültig.");
    if (state.layoutVisible !== undefined && (!isRecord(state.layoutVisible) || ["fixed", "one", "installments", "goals"].some(key => typeof state.layoutVisible[key] !== "boolean"))) fail("Die Sichtbarkeitseinstellungen sind ungültig.");
    if (state.reminders !== undefined) {
      if (!isRecord(state.reminders)) fail("Die Erinnerungseinstellungen sind ungültig.");
      for (const key of ["inst", "one", "goals"]) if (state.reminders[key] !== undefined) {
        const reminder = state.reminders[key];
        validateReminder(reminder, `Erinnerung ${key}`);
        if (!Number.isInteger(reminder.day) || reminder.day < 1 || reminder.day > 31 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time)) fail(`Die Erinnerung ${key} hat ungültige Werte.`);
      }
    }
    return state;
  }

  function create(state) {
    validateState(state);
    const backup = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), state };
    const json = JSON.stringify(backup, null, 2);
    if (new TextEncoder().encode(json).byteLength > MAX_BYTES) fail("Die Sicherung ist größer als 8 MB und kann nicht exportiert werden.");
    return json;
  }

  function parse(json) {
    if (typeof json !== "string" || new TextEncoder().encode(json).byteLength > MAX_BYTES) fail("Die Sicherungsdatei ist größer als 8 MB oder nicht lesbar.");
    let value;
    try { value = JSON.parse(json); } catch (_) { fail("Die Sicherungsdatei ist beschädigt oder kein gültiges JSON."); }
    let state;
    if (isRecord(value) && value.format === FORMAT) {
      if (value.version !== VERSION) fail("Diese Sicherungsversion wird nicht unterstützt.");
      if (!/^\d{4}-\d{2}-\d{2}T/.test(value.exportedAt || "")) fail("Das Sicherungsdatum ist ungültig.");
      state = value.state;
    } else {
      // Backward-compatible import of the previous raw-state JSON exports.
      state = value;
    }
    return validateState(state);
  }

  window.LifestyleBackup = Object.freeze({ create, parse, maxBytes: MAX_BYTES, maxRestoreStateBytes: MAX_RESTORE_STATE_BYTES });
})();
