import assert from "node:assert/strict";
import { createServer } from "node:https";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(process.env.LIFESTYLE_WEB_ROOT || fileURLToPath(new URL("..", import.meta.url)));
const pfxPath = process.env.LIFESTYLE_LOCAL_TLS_PFX;
const chromePath = process.env.LIFESTYLE_CHROME_PATH;
assert.ok(pfxPath, "Set LIFESTYLE_LOCAL_TLS_PFX to a temporary local certificate.");
assert.ok(chromePath, "Set LIFESTYLE_CHROME_PATH to an installed Chromium browser.");
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const headerRules = await readFile(join(root, "_headers"), "utf8");
const enforcementPolicy = headerRules.match(/^\s+Content-Security-Policy:\s*(.+)$/m)?.[1];
const reportOnlyPolicy = headerRules.match(/^\s+Content-Security-Policy-Report-Only:\s*(.+)$/m)?.[1];
assert.ok(enforcementPolicy, "enforced CSP must be present in _headers.");
assert.ok(reportOnlyPolicy, "CSP report-only policy must be present in _headers.");
const localEnforcementPolicy = enforcementPolicy.replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:8080 http://127.0.0.1:9099 http://127.0.0.1:5001");
const localReportOnlyPolicy = reportOnlyPolicy.replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:8080 http://127.0.0.1:9099 http://127.0.0.1:5001");
async function waitForOob(email, requestType) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-lifestyle-rules/oobCodes");
    assert.equal(response.ok, true);
    const codes = (await response.json()).oobCodes || [];
    const item = codes.find(code => code.email === email && code.requestType === requestType);
    if (item?.oobCode) return item.oobCode;
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  assert.fail(`No emulator ${requestType} code for synthetic account`);
}
async function applyOob(action, body) {
  const response = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${action}?key=demo-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  const result = await response.json();
  assert.equal(response.ok, true, `Auth emulator ${action} failed: ${JSON.stringify(result)}`);
  return result;
}

const server = createServer({ pfx: await readFile(pfxPath), passphrase: "lifestyle-local-test" }, async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "https://localhost").pathname);
    const relativePath = pathname === "/" ? "/index.html" : pathname;
    const file = resolve(root, `.${normalize(relativePath)}`);
    assert.ok(file.startsWith(root), "path traversal blocked");
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    let body = await readFile(file);
    if (relativePath === "/index.html") {
      body = body.toString("utf8").replace(/(<meta name="firebase-app-check-site-key" content=")[^"]*(">)/, "$1$2");
      assert.match(body, /name="firebase-app-check-site-key" content=""/, "demo emulator browser must not use the production App Check key");
      body = Buffer.from(body);
    }
    if (pathname === "/firebase-login.js") {
      body = body.toString("utf8")
        .replace('import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";', 'import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";\nimport { connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";\nimport { connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";\nimport { connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";')
        .replace(/const firebaseConfig = \{[\s\S]*?\n\};/, 'const firebaseConfig = { apiKey: "demo-api-key", authDomain: "localhost", projectId: "demo-lifestyle-rules" };')
        .replace('  auth = initializeAuth(app, { persistence: browserLocalPersistence });', '  auth = initializeAuth(app, { persistence: browserLocalPersistence });\n  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });')
        .replace('  db = initializeFirestore(app, { ignoreUndefinedProperties: true });', '  db = initializeFirestore(app, { ignoreUndefinedProperties: true });\n  connectFirestoreEmulator(db, "127.0.0.1", 8080);')
        .replace('  functions = getFunctions(app, "europe-west3");', '  functions = getFunctions(app, "europe-west3");\n  connectFunctionsEmulator(functions, "127.0.0.1", 5001);');
      assert.ok(body.includes('apiKey: "demo-api-key", authDomain: "localhost", projectId: "demo-lifestyle-rules"'), "test config must use only the demo project");
      assert.equal(body.includes("lifestyle2-login"), false, "production Firebase project ID must not reach the local browser test");
      assert.ok(body.includes("connectAuthEmulator(auth"), "local Auth emulator routing is active");
      assert.ok(body.includes("connectFirestoreEmulator(db"), "local Firestore emulator routing is active");
      assert.ok(body.includes("connectFunctionsEmulator(functions"), "local Functions emulator routing is active");
      body = Buffer.from(body);
    }
    res.writeHead(200, { "content-type": contentTypes[extname(file)] || "application/octet-stream", "cache-control": "no-store", "content-security-policy": localEnforcementPolicy, "content-security-policy-report-only": localReportOnlyPolicy });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

await new Promise(resolveListen => server.listen(9443, "127.0.0.1", resolveListen));
const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ["--no-sandbox"] });
const errors = [];
const cspFindings = new Set();
try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "phone-sized", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, timezoneId: "Europe/Berlin", ignoreHTTPSErrors: true, isMobile: viewport.width < 500, deviceScaleFactor: viewport.width < 500 ? 3 : 1 });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(`${viewport.name}: ${error.message}`));
    page.on("console", message => {
      const text = message.text();
      if (/executing inline event handler/i.test(text)) cspFindings.add("inline event handlers");
      else if (/violates.*style-src|style-src.*violat/i.test(text)) cspFindings.add("inline/dynamic styles");
      else if (/trusted.?types|trustedhtml/i.test(text)) cspFindings.add("Trusted Types");
      else if (/content security policy|violates the following/i.test(text)) cspFindings.add("other CSP finding");
    });
    await page.goto("https://localhost:9443/", { waitUntil: "networkidle", timeout: 60000 });
    assert.equal(await page.title(), "Finanzen – Übersicht");
    assert.equal(await page.locator("#authGate").isVisible(), true);
    assert.equal(await page.locator("#app").isVisible(), false);
    assert.equal(await page.locator(".auth-logo").getAttribute("src"), "./apple-touch-icon.png.png");
    assert.ok(await page.locator(".auth-logo").evaluate(img => img.complete && img.naturalWidth === 180));
    assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute("href"), "./apple-touch-icon.png.png");
    assert.equal(await page.locator('link[rel="icon"]').getAttribute("href"), "./apple-touch-icon.png.png");
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(dimensions.width <= dimensions.viewport + 1, `${viewport.name} layout overflows horizontally: ${JSON.stringify(dimensions)}`);
    if (viewport.name === "desktop") {
      const email = `lifestyle-ui-${Date.now()}@example.test`;
      const password = "Lifestyle-UI-Test-123!";
      await page.locator("#authSwitch").click();
      await page.locator("#authEmail").fill(email);
      await page.locator("#authPassword").fill(password);
      await page.locator("#authForm button[type=submit]").click();
      await page.getByText(/Bestätigungs-E-Mail wurde angefordert/).waitFor({ timeout: 20000 });
      const verificationCode = await waitForOob(email, "VERIFY_EMAIL");
      await applyOob("update", { oobCode: verificationCode });
      await page.locator("#checkVerification").click();
      await page.locator("#app:not([hidden])").waitFor({ timeout: 30000 });
      assert.equal(await page.evaluate(() => window.lifestyleCloudReady), true);
      if (await page.locator("#welcomeSkip").isVisible().catch(() => false)) await page.locator("#welcomeSkip").click();
      if (await page.locator("#guideSkip").isVisible().catch(() => false)) await page.locator("#guideSkip").click();
      const pushLater = page.locator("#pushLater");
      await pushLater.waitFor({ state: "visible", timeout: 5000 }).then(() => pushLater.click()).catch(() => {});

      const crud = await page.evaluate(async () => {
        const model = () => window.lifestyleGetState();
        const originalDialogs = { appPrompt: window.appPrompt, appConfirm: window.appConfirm, askValidated: window.askValidated, chooseFrequency: window.chooseFrequency, chooseStartDate: window.chooseStartDate, chooseEndDate: window.chooseEndDate };
        const prompts = values => { let queue = [...values]; window.appPrompt = async () => queue.shift() ?? null; };
        const validated = values => { let queue = [...values]; window.askValidated = async () => queue.shift() ?? null; };
        const date = todayGermanDate();
        const completed = [];
        for (const kind of ["Einnahmen", "Ausgaben"]) {
          model().filter = kind;
          prompts([`CRUD ${kind}`, "23,45"]);
          await window.addBooking();
          const index = model().transactions.findIndex(item => item.name === `CRUD ${kind}`);
          if (index < 0) throw new Error(`${kind} create failed`);
          prompts([`CRUD ${kind} bearbeitet`, "31,25", date]);
          await window.editBooking(index);
          const edited = model().transactions.find(item => item.name === `CRUD ${kind} bearbeitet`);
          if (!edited || (kind === "Einnahmen" ? edited.amount !== 31.25 : edited.amount !== -31.25)) throw new Error(`${kind} edit failed`);
          window.appConfirm = async () => true;
          await window.deleteBooking(model().transactions.indexOf(edited));
          if (model().transactions.some(item => item.name.startsWith(`CRUD ${kind}`))) throw new Error(`${kind} delete failed`);
          completed.push(kind);
        }
        prompts(["CRUD Fixkosten", "12,34 €"]);
        await window.addFixed();
        prompts(["CRUD Fixkosten bearbeitet"]); validated(["15,00"]);
        await window.editItem("fixed", model().fixed.findIndex(item => item[0] === "CRUD Fixkosten"));
        if (!model().fixed.some(item => item[0] === "CRUD Fixkosten bearbeitet" && item[1] === "15,00")) throw new Error("Fixed expense edit failed");
        window.appConfirm = async () => true;
        await window.deleteItem("fixed", model().fixed.findIndex(item => item[0] === "CRUD Fixkosten bearbeitet"));
        if (model().fixed.some(item => item[0].startsWith("CRUD Fixkosten"))) throw new Error("Fixed expense delete failed");
        completed.push("Fixkosten");

        prompts(["CRUD Einmalig"]); validated(["7,50", date]); window.appConfirm = async () => false;
        await window.addOne();
        prompts(["CRUD Einmalig bearbeitet"]); validated(["8,75", date]); window.appConfirm = async () => false;
        await window.editItem("one", model().one.findIndex(item => item[0] === "CRUD Einmalig"));
        if (!model().one.some(item => item[0] === "CRUD Einmalig bearbeitet" && item[1] === "8,75")) throw new Error("One-time expense edit failed");
        window.appConfirm = async () => true;
        await window.deleteItem("one", model().one.findIndex(item => item[0] === "CRUD Einmalig bearbeitet"));
        if (model().one.some(item => item[0].startsWith("CRUD Einmalig"))) throw new Error("One-time expense delete failed");
        completed.push("Einmalausgaben");

        prompts(["CRUD Rate"]); validated(["45,00"]); window.chooseFrequency = async () => "Monatlich"; window.chooseStartDate = async () => date; window.chooseEndDate = async () => ""; window.appConfirm = async () => false;
        await window.addInstallment();
        prompts(["CRUD Rate bearbeitet"]); validated(["47,00"]); window.appConfirm = async () => false;
        await window.editItem("inst", model().inst.findIndex(item => item[0] === "CRUD Rate"));
        if (!model().inst.some(item => item[0] === "CRUD Rate bearbeitet" && item[1] === "47,00")) throw new Error("Installment edit failed");
        window.appConfirm = async () => true;
        await window.deleteItem("inst", model().inst.findIndex(item => item[0] === "CRUD Rate bearbeitet"));
        if (model().inst.some(item => item[0].startsWith("CRUD Rate"))) throw new Error("Installment delete failed");
        completed.push("Raten");

        prompts(["CRUD Sparziel", "200,00 €"]); await window.addGoal();
        prompts(["CRUD Sparziel bearbeitet", "300,00 €", "75,00 €"]); await window.editItem("goals", model().goals.findIndex(item => item[0] === "CRUD Sparziel"));
        if (!model().goals.some(item => item[0] === "CRUD Sparziel bearbeitet" && item[1] === "300,00 €" && item[2] === "75,00 €")) throw new Error("Savings goal edit failed");
        window.appConfirm = async () => true;
        await window.deleteItem("goals", model().goals.findIndex(item => item[0] === "CRUD Sparziel bearbeitet"));
        if (model().goals.some(item => item[0].startsWith("CRUD Sparziel"))) throw new Error("Savings goal delete failed");
        completed.push("Sparziele");
        prompts(["CRUD Kategorie"]); await window.addCategory();
        prompts(["CRUD Kategorie bearbeitet"]); await window.renameCategory(model().categories.indexOf("CRUD Kategorie"));
        if (!model().categories.includes("CRUD Kategorie bearbeitet")) throw new Error("Category edit failed");
        window.appConfirm = async () => true; await window.deleteCategory(model().categories.indexOf("CRUD Kategorie bearbeitet"));
        if (model().categories.some(item => item.startsWith("CRUD Kategorie"))) throw new Error("Category delete failed");
        completed.push("Kategorien");
        prompts(["CRUD Notiz", "synthetischer Testtext"]); window.appConfirm = async () => false;
        await window.editNote(-1);
        const noteIndex = model().notes.findIndex(item => item.title === "CRUD Notiz");
        if (noteIndex < 0) throw new Error("Note create failed");
        prompts(["CRUD Notiz bearbeitet", "geänderter Testtext"]); window.appConfirm = async () => false;
        await window.editNote(noteIndex);
        if (!model().notes.some(item => item.title === "CRUD Notiz bearbeitet" && item.body === "geänderter Testtext")) throw new Error("Note edit failed");
        window.appConfirm = async () => true;
        await window.deleteNote(model().notes.findIndex(item => item.title === "CRUD Notiz bearbeitet"));
        if (model().notes.some(item => item.title.startsWith("CRUD Notiz"))) throw new Error("Note delete failed");
        completed.push("Notizen");
        const baseMonth = model().month;
        window.changeMonth(3); if (model().month !== 1) throw new Error("Month navigation upper bound failed");
        window.changeMonth(1); if (model().month !== 1) throw new Error("Month navigation upper clamp failed");
        window.changeMonth(-3); if (model().month !== -1) throw new Error("Month navigation lower bound failed");
        window.changeMonth(-1); if (model().month !== -1) throw new Error("Month navigation lower clamp failed");
        window.changeMonth(1); if (model().month !== 0) throw new Error("Month navigation return to current month failed");
        model().month = baseMonth;
        completed.push("Monatswechsel-Funktion");
        Object.assign(window, originalDialogs);
        await window.lifestyleFlushCloudSave();
        return completed;
      });
      assert.deepEqual(crud, ["Einnahmen", "Ausgaben", "Fixkosten", "Einmalausgaben", "Raten", "Sparziele", "Kategorien", "Notizen", "Monatswechsel-Funktion"]);
      console.log("PASS authenticated desktop: create/edit/delete for all financial record types, categories and notes; bounded month-change function");

      await page.evaluate(() => navigate("accounts"));
      await page.evaluate(() => { window.accountOp = window.addAccount(); });
      await page.locator("#accountNameInput").fill("CRUD verbundenes Testkonto");
      await page.locator("#accountTypeInput").selectOption("Tagesgeld");
      await page.locator("#accountBalanceInput").fill("-1250,50");
      await page.locator(".input-modal:has(#accountEditorTitle) .save").click();
      await page.evaluate(() => window.accountOp);
      let connectedAccountIndex = await page.evaluate(() => window.lifestyleGetState().accounts.findIndex(item => item[0] === "CRUD verbundenes Testkonto"));
      assert.ok(connectedAccountIndex >= 0, "Connected account create failed");
      await page.locator(`[data-account-action="edit"][data-account-index="${connectedAccountIndex}"]`).click();
      await page.locator("#accountNameInput").fill("CRUD Konto bearbeitet");
      await page.locator("#accountBalanceInput").fill("-1500,75");
      await page.locator(".input-modal:has(#accountEditorTitle) .save").click();
      const editedAccount = await page.evaluate(() => window.lifestyleGetState().accounts.find(item => item[0] === "CRUD Konto bearbeitet"));
      assert.deepEqual(editedAccount?.slice(0, 3), ["CRUD Konto bearbeitet", "Tagesgeld", "-1.500,75 €"], "Connected account edit failed");
      assert.equal(await page.locator(".account-card").filter({ hasText: "CRUD Konto bearbeitet" }).locator(".tx-amount").innerText(), "-1.500,75 €", "negative balance must be formatted for display");
      connectedAccountIndex = await page.evaluate(() => window.lifestyleGetState().accounts.findIndex(item => item[0] === "CRUD Konto bearbeitet"));
      await page.locator(`[data-account-action="delete"][data-account-index="${connectedAccountIndex}"]`).click();
      await page.locator(".lifestyle-prompt .confirm").click();
      await page.waitForFunction(() => !window.lifestyleGetState().accounts.some(item => item[0].startsWith("CRUD Konto")));
      console.log("PASS connected accounts: create, edit (type and balance), and confirmed removal");

      const { testDate, priorDate } = await page.evaluate(() => {
        const format = date => `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
        const now = new Date();
        return { testDate: format(now), priorDate: format(new Date(now.getFullYear(), now.getMonth() - 1, 15)) };
      });
      const xssPayload = '<img src=x onerror="window.__lifestyleXss=1">';
      await page.evaluate(() => { window.__lifestyleXss = 0; });
      const xssMarkup = '<img class=xss-marker src=x onerror=alert(1)>';
      const synthetic = {
        transactions: [
          { name: "Browser-Test-Einnahme", date: testDate, amount: 1234.5, kind: "Einnahmen", category: "Test" },
          { name: "Browser-Test-Ausgabe", date: testDate, amount: -125.25, kind: "Ausgaben", category: "Lebensmittel" },
          { name: "Vorperioden-Test", date: priorDate, amount: -200, kind: "Ausgaben", category: "Vorperiode" },
          { name: xssPayload, date: testDate, amount: 0, kind: "Ausgaben", category: "Sicherheitstest" },
          { name: "Kategorie-Sicherheitstest", date: testDate, amount: -0.01, kind: "Ausgaben", category: xssMarkup }
        ],
        fixed: [[xssMarkup, "19,99", "Monatlich", "●", "ic-blue"]],
        one: [[xssMarkup, "8,50", testDate, "▤", "ic-blue", { enabled: false, date: "", time: "09:00" }, "browser-test-one"]],
        inst: [[xssMarkup, "12,00", "Monatlich", "●", "ic-blue", "07.11.2026", { enabled: false, date: "", time: "09:00" }, "07.12.2026"]],
        goals: [[xssMarkup, "500", "100", "20 %", "◈", "ic-green"]],
        accounts: [[xssMarkup, "Girokonto", "-250,00 €", "▣", "ic-blue"]],
        notes: [{ id: "browser-test-note", title: xssMarkup, body: xssMarkup, reminder: { enabled: false, date: "", time: "09:00" } }],
        categories: [xssMarkup]
      };
      await page.evaluate(async data => {
        window.lifestyleApplyState(data, { render: false });
        window.lifestyleCloudSave(window.lifestyleGetState());
        await window.lifestyleFlushCloudSave();
      }, synthetic);
      await page.evaluate(() => { const s = window.lifestyleGetState(); s.filter = "Alle"; s.bookingPeriod = "all"; s.search = ""; s.bookingSort = "newest"; s.month = 0; render(); });
      await page.evaluate(() => navigate("home"));
      assert.match(await page.locator(".month-switch span").innerText(), /\d{4}$/);
      assert.match(await page.locator(".summary-value.red").innerText(), /153,75/);
      await page.locator('.month-switch button[aria-label="Vorheriger Monat"]').click();
      assert.match(await page.locator(".month-switch span").innerText(), /\d{4}$/);
      assert.match(await page.locator(".summary-value.red").innerText(), /219,99/);
      assert.equal(await page.locator('.month-switch button[aria-label="Vorheriger Monat"]').isDisabled(), true);
      await page.locator('.month-switch button[aria-label="Nächster Monat"]').click();
      assert.match(await page.locator(".summary-value.red").innerText(), /153,75/);
      await page.evaluate(() => navigate("bookings"));
      const hostileText = page.locator("#content .tx-name", { hasText: xssPayload });
      assert.equal(await hostileText.locator("img").count(), 0, "hostile financial text must remain text, not create HTML");
      assert.equal(await page.evaluate(() => window.__lifestyleXss), 0, "hostile stored text must not execute an event handler");
      await page.locator('#content .segmented button', { hasText: "Ausgaben" }).click();
      let filteredNames = await page.locator("#content .tx-name").allTextContents();
      assert.ok(filteredNames.includes("Browser-Test-Ausgabe") && filteredNames.includes("Vorperioden-Test"));
      assert.equal(filteredNames.includes("Browser-Test-Einnahme"), false, "income filter must exclude expenses and vice versa");
      await page.locator("#content button[aria-label='Buchungen filtern']").click();
      await page.locator("#content select").first().selectOption("month");
      filteredNames = await page.locator("#content .tx-name").allTextContents();
      assert.ok(filteredNames.includes("Browser-Test-Ausgabe"));
      assert.equal(filteredNames.includes("Vorperioden-Test"), false, "current-month filter must exclude the previous month");
      await page.locator("#content select").first().selectOption("previous");
      filteredNames = await page.locator("#content .tx-name").allTextContents();
      assert.deepEqual(filteredNames, ["Vorperioden-Test"]);
      await page.evaluate(() => { const s = window.lifestyleGetState(); s.bookingPeriod = "all"; s.filter = "Alle"; s.search = ""; s.bookingSort = "newest"; s.bookingFilterOpen = false; render(); });
      await page.locator("#content input.search").fill("Browser-Test-Ausgabe");
      assert.deepEqual(await page.locator("#content .tx-name").allTextContents(), ["Browser-Test-Ausgabe"]);
      await page.locator("#content input.search").fill("");
      await page.locator("#content button[aria-label='Buchungen filtern']").click();
      await page.locator("#content select").nth(1).selectOption("amount-high");
      assert.deepEqual(await page.locator("#content .tx-name").allTextContents(), ["Browser-Test-Einnahme", "Vorperioden-Test", "Browser-Test-Ausgabe", "Kategorie-Sicherheitstest", xssPayload]);
      await page.locator("#content select").nth(1).selectOption("amount-low");
      assert.deepEqual(await page.locator("#content .tx-name").allTextContents(), [xssPayload, "Kategorie-Sicherheitstest", "Browser-Test-Ausgabe", "Vorperioden-Test", "Browser-Test-Einnahme"]);
      await page.evaluate(() => { const s = window.lifestyleGetState(); s.bookingPeriod = "all"; s.filter = "Alle"; s.search = ""; s.month = 0; render(); navigate("analytics"); });
      const categories = await page.locator("#content .category-row .cat").allTextContents();
      assert.deepEqual([...new Set(categories)].sort(), [xssMarkup, "Lebensmittel"].sort());
      await page.evaluate(() => changeMonth(-1));
      assert.deepEqual(await page.locator("#content .category-row .cat").allTextContents(), ["Vorperiode"]);
      await page.evaluate(() => changeMonth(1));
      await page.evaluate(() => navigate("personal-settings"));
      await page.locator("#userNameInput").fill("Test Person");
      await page.locator("#salaryInput").fill("2200,00");
      await page.locator("#nextPayInput").fill(testDate);
      await page.locator("#personalSettingsSave").click();
      assert.equal(await page.evaluate(() => window.lifestyleGetState().userName), "Test Person");
      assert.equal(await page.evaluate(() => window.lifestyleGetState().monthlySalary), 2200);
      await page.locator("#content .menu-item select").selectOption("USD");
      assert.equal(await page.evaluate(() => window.lifestyleGetState().currency), "USD");
      await page.locator("#content .menu-item select").selectOption("EUR");
      await page.evaluate(() => window.lifestyleFlushCloudSave());
      console.log("PASS authenticated desktop: income/expense filters, current/previous-month filtering, category statistics, and personal/currency settings");
      await page.evaluate(() => navigate("backup"));
      const downloadReady = page.waitForEvent("download");
      await page.locator("#backupDownloadButton").click();
      const downloaded = await downloadReady;
      assert.match(downloaded.suggestedFilename(), /^lifestyle2-sicherung-\d{4}-\d{2}-\d{2}\.json$/);
      const exported = await readFile(await downloaded.path(), "utf8");
      const parsed = await page.evaluate(json => window.LifestyleBackup.parse(json), exported);
      assert.equal(parsed.transactions[0].name, "Browser-Test-Einnahme");
      await assert.rejects(page.evaluate(() => window.LifestyleBackup.parse('{"format":"lifestyle2-backup","version":1,"exportedAt":"2026-11-07T00:00:00.000Z","state":{"transactions":[{"name":"x","date":"x","amount":1,"kind":"Einnahmen","__proto__":{"polluted":true}}]}}')));
      const restored = { ...synthetic, transactions: [{ name: "Wiederhergestellt", date: "2026-11-07", amount: -5, kind: "Ausgaben" }] };
      const restoreFile = JSON.stringify({ format: "lifestyle2-backup", version: 1, exportedAt: new Date().toISOString(), state: restored });
      await page.locator("#backupRestoreFile").setInputFiles({ name: "synthetic-backup.json", mimeType: "application/json", buffer: Buffer.from(restoreFile) });
      await page.locator(".lifestyle-prompt .confirm").click();
      await page.waitForFunction(() => window.lifestyleGetState().transactions?.[0]?.name === "Wiederhergestellt", null, { timeout: 20000 });
      await page.evaluate(() => window.lifestyleFlushCloudSave());
      assert.equal(await page.evaluate(() => window.lifestyleGetState().transactions[0].amount), -5);
      for (const view of ["home", "bookings", "analytics", "fixed", "one", "installments", "goals", "accounts", "notes", "settings", "personal-settings", "reminders", "backup", "delete-account"]) {
        await page.evaluate(name => navigate(name), view);
        const content = await page.locator("#content").innerText();
        assert.ok(content.trim().length > 0, `page ${view} rendered no content`);
        const layout = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(layout.page <= layout.viewport + 1, `${view} overflows horizontally: ${JSON.stringify(layout)}`);
        assert.equal(await page.locator(".xss-marker").count(), 0, `hostile saved data rendered as HTML on ${view}`);
        assert.equal(await page.locator("#content [onclick],#content [onchange],#content [oninput],#content [onfocus],#content [style]").count(), 0, `inline handler/style remains on ${view}`);
      }
      console.log("PASS authenticated desktop: existing financial and settings pages render synthetic records without JavaScript page errors or horizontal overflow");
      await page.setViewportSize({ width: 390, height: 844 });
      for (const view of ["home", "bookings", "analytics", "fixed", "one", "installments", "goals", "accounts", "notes", "settings", "personal-settings", "reminders", "backup", "delete-account"]) {
        await page.evaluate(name => navigate(name), view);
        const layout = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(layout.page <= layout.viewport + 1, `phone ${view} overflows horizontally: ${JSON.stringify(layout)}`);
        assert.equal(await page.locator(".xss-marker").count(), 0, `hostile saved data rendered as HTML on phone ${view}`);
        assert.equal(await page.locator("#content [onclick],#content [onchange],#content [oninput],#content [onfocus],#content [style]").count(), 0, `phone ${view} has inline handler/style`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      console.log("PASS authenticated phone-sized viewport: all financial and settings views fit without inline markup or XSS execution");

      await page.locator('.nav-btn[data-page="more"]').click();
      await page.locator("#authLogout").click();
      await page.locator("#authForm").waitFor({ state: "visible", timeout: 20000 });
      await page.locator("#authEmail").fill(email);
      await page.locator("#authForgot").click();
      await page.waitForFunction(() => document.getElementById("authMessage")?.textContent.includes("Falls ein Konto besteht"), null, { timeout: 20000 });
      const resetCode = await waitForOob(email, "PASSWORD_RESET");
      await applyOob("resetPassword", { oobCode: resetCode, newPassword: "Lifestyle-UI-Test-456!" });
      await page.locator("#authEmail").fill(email);
      await page.locator("#authPassword").fill("Lifestyle-UI-Test-456!");
      await page.locator("#authForm button[type=submit]").click();
      await page.locator("#app:not([hidden])").waitFor({ timeout: 30000 });
      assert.equal(await page.evaluate(() => window.lifestyleGetState().transactions[0]?.name), "Wiederhergestellt");
      await page.locator('.nav-btn[data-page="more"]').click();
      await page.locator("#authLogout").click();
      await page.locator("#authForm").waitFor({ state: "visible", timeout: 20000 });
      const emailB = `lifestyle-ui-b-${Date.now()}@example.test`;
      const passwordB = "Lifestyle-UI-B-Test-123!";
      await page.locator("#authSwitch").click();
      await page.locator("#authEmail").fill(emailB);
      await page.locator("#authPassword").fill(passwordB);
      await page.locator("#authForm button[type=submit]").click();
      await page.getByText(/Bestätigungs-E-Mail wurde angefordert/).waitFor({ timeout: 20000 });
      await applyOob("update", { oobCode: await waitForOob(emailB, "VERIFY_EMAIL") });
      await page.locator("#checkVerification").click();
      await page.locator("#app:not([hidden])").waitFor({ timeout: 30000 });
      await page.locator("#welcomeSkip").waitFor({ state: "visible", timeout: 5000 }).then(() => page.locator("#welcomeSkip").click()).catch(() => {});
      await page.locator("#guideSkip").waitFor({ state: "visible", timeout: 5000 }).then(() => page.locator("#guideSkip").click()).catch(() => {});
      await page.locator("#pushLater").waitFor({ state: "visible", timeout: 5000 }).then(() => page.locator("#pushLater").click()).catch(() => {});
      assert.equal(await page.evaluate(() => window.lifestyleGetState().transactions.some(item => item.name === "Wiederhergestellt")), false, "Account B must not see account A financial data");
      await page.locator('.nav-btn[data-page="more"]').click();
      await page.locator("#authLogout").click();
      await page.locator("#authEmail").fill(email);
      await page.locator("#authPassword").fill("Lifestyle-UI-Test-456!");
      await page.locator("#authForm button[type=submit]").click();
      await page.locator("#app:not([hidden])").waitFor({ timeout: 30000 });
      assert.equal(await page.evaluate(() => window.lifestyleGetState().transactions[0]?.name), "Wiederhergestellt", "Account A data must remain after switching back");
      await page.evaluate(() => {
        const userPrefix = window.lifestyleUserStorageKey;
        const removeItem = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function (key) {
          if (String(key).startsWith(userPrefix)) throw new DOMException("Synthetic storage deletion failure", "SecurityError");
          return removeItem.call(this, key);
        };
      });
      await page.evaluate(() => { window.appConfirm = async () => true; window.appPrompt = async () => "Lifestyle-UI-Test-456!"; });
      await page.evaluate(() => navigate("delete-account"));
      await page.locator("#content button").getByText("Konto dauerhaft löschen").click();
      await page.locator("#authForm").waitFor({ state: "visible", timeout: 30000 });
      await page.waitForFunction(() => document.getElementById("authMessage")?.textContent.includes("lokale Gerätedaten konnten nicht vollständig entfernt werden"), null, { timeout: 10000 });
      assert.equal(await page.evaluate(() => window.lifestyleGetState().transactions.length), 0, "deleted account financial state must be removed from memory");
      await page.locator("#authEmail").fill(email);
      await page.locator("#authPassword").fill("Lifestyle-UI-Test-456!");
      await page.locator("#authForm button[type=submit]").click();
      await page.waitForFunction(() => /Anmeldung fehlgeschlagen|stimmt nicht|gibt es noch kein Konto/i.test(document.getElementById("authMessage")?.textContent || ""), null, { timeout: 20000 });
      assert.equal(await page.locator("#app").isVisible(), false, "Deleted account A must no longer sign in");
      await page.locator("#authEmail").fill(emailB);
      await page.locator("#authPassword").fill(passwordB);
      await page.locator("#authForm button[type=submit]").click();
      await page.locator("#app:not([hidden])").waitFor({ timeout: 30000 });
      assert.equal(await page.evaluate(() => window.lifestyleGetState().transactions.some(item => item.name === "Wiederhergestellt")), false, "Account B must remain active and isolated after deleting A");
      console.log("PASS HTTPS desktop: two-account isolation, registration, email verification, cloud data load, synthetic export/restore/validation, password reset, sign-in, logout, owner-scoped account deletion, and visible local-cache cleanup failure");
    }
    await context.close();
    console.log(`PASS HTTPS ${viewport.name}: login gate and original logo render; no horizontal overflow`);
  }
  assert.deepEqual(errors, [], `Browser JavaScript errors: ${errors.join("; ")}`);
  assert.deepEqual([...cspFindings], [], `CSP/Trusted Types violations: ${[...cspFindings].join("; ")}`);
  console.log(`CSP enforcement + report-only findings: ${[...cspFindings].join(", ") || "none"}`);
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
