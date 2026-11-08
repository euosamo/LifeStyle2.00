import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = path => readFileSync(path, "utf8");

test("new account password policy and verified-email gate are present", () => {
  const auth = read("firebase-login.js");
  assert.match(auth, /initializeAppCheck/);
  assert.match(auth, /ReCaptchaEnterpriseProvider/);
  assert.match(auth, /isTokenAutoRefreshEnabled: true/);
  assert.match(auth, /firebase-app-check-site-key/);
  assert.match(auth, /password\.length < 12/);
  assert.match(auth, /passwordInput\.minLength = reg \? 12 : 6/);
  assert.match(auth, /if \(!user\.emailVerified\)/);
  const rules = read("firestore.rules");
  assert.match(rules, /request\.auth\.token\.email_verified/);
  assert.match(auth, /httpsCallable\(functions, "deleteOwnAccount"\)/);
  assert.match(auth, /window\.appPrompt\("Bitte gib zur Sicherheitsprüfung dein Passwort ein:", "", "password"\)/);
  assert.match(read("app.js"), /safeInputType=inputType===\x27password\x27\?\x27password\x27:\x27text\x27/);
  assert.match(auth, /localStorage\.removeItem\("lifestyle-finanz-app-v3-empty"\)/);
  assert.match(auth, /localStorage\.removeItem\("lifestyle-finanz-app-v2"\)/);
  const app = read("app.js");
  assert.match(app, /escapeHTML\(t\.name\|\|\x27\x27\)/);
  assert.match(app, /escapeHTML\(x\[0\]\|\|\x27\x27\)/);
  assert.match(app, /escapeHTML\(row\[0\]\|\|\x27\x27\)/);
  assert.match(app, /LAYOUT_KEYS=\[\x27fixed\x27,\x27one\x27,\x27installments\x27,\x27goals\x27\]/);
  assert.match(app, /next\.currency=\[\x27EUR\x27,\x27USD\x27,\x27GBP\x27\]/);
  assert.match(app, /function safeIconClass\(value\)/);
  assert.match(app, /Object\.prototype\.hasOwnProperty\.call\(pages,state\.page\)/);
  assert.match(app, /function normalizeSavedState\(saved,page\)/);
  assert.match(app, /safeIconClass\(t\.color\)/);
  assert.match(app, /safeIconClass\(row\[4\]\)/);
  assert.match(app, /safeIconClass\(x\[4\]\)/);
  assert.match(app, /data-account-action="edit"/);
  assert.ok(app.includes("escapeHTML(t.date||'')"));

});

test("HTML escaping and CSS class allowlist resist hostile stored values", () => {
  const app = read("app.js");
  const escapeLine = app.split("\n").find(line => line.startsWith("function escapeHTML("));
  const classLine = app.split("\n").find(line => line.startsWith("function safeIconClass("));
  assert.ok(escapeLine && classLine, "security helpers must exist");
  const context = vm.createContext({});
  vm.runInContext(escapeLine + "; " + classLine + "; globalThis.escapeHTML=escapeHTML; globalThis.safeIconClass=safeIconClass;", context);
  assert.equal(context.escapeHTML('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(context.escapeHTML('"\'&'), '&quot;&#39;&amp;');
  assert.equal(context.safeIconClass('ic-blue'), 'ic-blue');
  assert.equal(context.safeIconClass('x" onclick="alert(1)'), 'ic-blue');
  assert.match(app, /amount:\(typeof t\.amount==='number'\|\|typeof t\.amount==='string'\)&&Number\.isFinite\(Number\(t\.amount\)\)\?Number\(t\.amount\):0/);
});

test("connected account editor validates values and renders actions without inline handlers", () => {
  const app = read("app.js");
  assert.match(app, /function accountEditor\(existing\)/);
  assert.match(app, /data-account-action="edit"/);
  assert.match(app, /data-account-action="delete"/);
  assert.match(app, /function deleteAccount\(index\)/);
  assert.match(app, /validGermanBalance\(amount\)/);
  const accountRenderer = app.slice(app.indexOf("function accounts()"), app.indexOf("function more()"));
  assert.doesNotMatch(accountRenderer, /\sonclick\s*=/i);
  assert.match(read("tests/local-https-smoke.mjs"), /Connected account edit failed/);
});

test("synced local plaintext finance cache is cleared after logout and retained on failed sync", () => {
  const auth = read("firebase-login.js");
  assert.match(auth, /cloudSaveConfirmed = true/);
  assert.match(auth, /if \(cloudSaveConfirmed && signedOutUid\) clearUserLocalData\(signedOutUid\)/);
  assert.match(auth, /function clearUserLocalData\(uid/);
  assert.match(auth, /await httpsCallable\(functions, "deleteOwnAccount"\)\(\{\}\);[\s\S]*?const localCleanupComplete = clearUserLocalData\(current\.uid, true\)/);
  assert.match(auth, /Local user data cleanup was incomplete:[\s\S]*?return false;/);
  assert.match(auth, /lokale Gerätedaten konnten nicht vollständig entfernt werden/);
  assert.match(auth, /window\.lifestyleApplyState\(\{\}, \{ render: false \}\)/);
  const deletion = read("firebase-functions/index.js");
  assert.match(deletion, /request\.auth/);
  assert.match(deletion, /email_verified/);
  assert.match(deletion, /auth_time/);
  assert.match(deletion, /recursiveDelete\(userDocument\)/);
  assert.match(deletion, /deleteUser\(uid\)/);
});

test("backup restore validates the selected file before changing state", () => {
  const app = read("app.js");
  const backup = read("backup-utils.js");
  assert.match(app, /lifestyleCloudReady!==true/);
  assert.match(app, /lifestyleFlushCloudSave\(\)/);
  assert.match(app, /-pre-restore-/);
  assert.match(app, /LifestyleBackup\.parse/);
  assert.match(backup, /MAX_BYTES = 8 \* 1024 \* 1024/);
  assert.match(backup, /unknown|Unbekanntes Datenfeld/);
  assert.match(app, /accept="application\/json,\.json"/);
});

test("main application script is external and parses without syntax errors", () => {
  const html = read("index.html");
  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script>\s*[\s\S]*?<\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css">/);
  assert.doesNotMatch(html, /<style[\s>]/i);
  assert.doesNotMatch(html, /<script\s+[^>]*\son(?:click|change|input|submit)=/i);
  assert.doesNotThrow(() => new vm.Script(read("app.js"), { filename: "app.js" }));
  assert.doesNotThrow(() => new vm.Script(read("sw-register.js"), { filename: "sw-register.js" }));
  assert.match(read("styles.css"), /--blue:#1687ff/);
});

test("login, favicon, PWA, and push use the original LS image asset", () => {
  const html = read("index.html");
  const manifest = JSON.parse(read("manifest.webmanifest"));
  const worker = read("sw.js");
  assert.match(html, /auth-logo[^>]+src="\.\/apple-touch-icon\.png\.png"/);
  assert.match(html, /rel="icon"[^>]+href="\.\/apple-touch-icon\.png\.png"/);
  assert.deepEqual(manifest.icons.map(icon => icon.src), ["./apple-touch-icon.png.png", "./icon-192.png", "./icon-512.png"]);
  assert.match(worker, /icon: '\.\/icon-192\.png'/);
  assert.match(worker, /badge: '\.\/icon-192\.png'/);
  for (const [file, size] of [["apple-touch-icon.png.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
    const png = readFileSync(file);
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test("Cloudflare response headers provide core browser protections", () => {
  const headers = read("_headers");
  const enforced = headers.split("Content-Security-Policy:")[1].split(/\r?\n/)[0];
  assert.ok(!enforced.match(/(?:^|;\s*)script-src\s[^;]*'unsafe-inline'/));
  assert.ok(!enforced.match(/(?:^|;\s*)style-src\s[^;]*'unsafe-inline'/));
  for (const token of [
    "Content-Security-Policy:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "script-src-elem 'self'",
    "script-src-attr 'none'",
    "style-src-elem 'self'",
    "style-src-attr 'none'",
    "https://www.google.com/recaptcha/",
    "https://recaptcha.google.com/recaptcha/",
    "https://www.recaptcha.net/recaptcha/",
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "Referrer-Policy:",
    "Permissions-Policy:",
    "Strict-Transport-Security:",
    "Cache-Control: no-cache"
  ]) assert.ok(headers.includes(token), "Missing header or CSP directive: " + token);
  const reportOnly = headers.split("Content-Security-Policy-Report-Only:")[1] || "";
  assert.ok(reportOnly.includes("script-src 'self'"));
  assert.ok(!reportOnly.split(/\r?\n/)[0].includes("'unsafe-inline'"));
  assert.ok(reportOnly.includes("require-trusted-types-for 'script'"));
  assert.match(enforced, /trusted-types lifestyle-app/);
  assert.match(enforced, /require-trusted-types-for 'script'/);
  assert.doesNotMatch(enforced, /'unsafe-inline'/);
  const app = read("app.js");
  assert.match(app, /function prepareAppMarkup\(markup\)/);
  assert.match(app, /function runAppAction\(action,event,target\)/);
  assert.match(app, /new Set\(\['goBack'/);
  assert.equal((app.match(/\.innerHTML\s*=/g) || []).length, 1, "only the guarded Trusted Types template sink should remain");
  assert.match(read("firebase-login.js"), /document\.createElement\("button"\)/);
});

test("Pages build output contains only public app files and never Firebase backend source", () => {
  const result = spawnSync(process.execPath, ["scripts/build-pages.mjs"], {