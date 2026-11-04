import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const read = path => readFileSync(path, "utf8");

test("new account password policy and verified-email gate are present", () => {
  const auth = read("firebase-login.js");
  assert.match(auth, /password\.length < 12/);
  assert.match(auth, /passwordInput\.minLength = reg \? 12 : 6/);
  assert.match(auth, /if \(!user\.emailVerified\)/);
  const rules = read("firestore.rules");
  assert.match(rules, /request\.auth\.token\.email_verified/);
  assert.match(auth, /deleteOwnCollection\(current\.uid, "pushSubscriptions"\)/);
  assert.match(auth, /deleteOwnCollection\(current\.uid, "pushDeliveries"\)/);
  assert.match(auth, /window\.appPrompt\("Bitte gib zur Sicherheitsprüfung dein Passwort ein:", "", "password"\)/);
  assert.match(read("index.html"), /safeInputType=inputType===\x27password\x27\?\x27password\x27:\x27text\x27/);
  assert.match(auth, /localStorage\.removeItem\("lifestyle-finanz-app-v3-empty"\)/);
  assert.match(auth, /localStorage\.removeItem\("lifestyle-finanz-app-v2"\)/);
  const app = read("index.html");
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
  assert.match(app, /data-account-name=/);
  assert.ok(app.includes("escapeHTML(t.date||'')"));

});

test("HTML escaping and CSS class allowlist resist hostile stored values", () => {
  const app = read("index.html");
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

test("main inline application script parses without syntax errors", () => {
  const html = read("index.html");
  const start = html.indexOf("<script>");
  const end = html.indexOf("</script>", start + 8);
  assert.ok(start >= 0 && end > start, "inline app script not found");
  assert.doesNotThrow(() => new vm.Script(html.slice(start + 8, end), { filename: "index.html:inline-script" }));
});

test("Cloudflare response headers provide core browser protections", () => {
  const headers = read("_headers");
  for (const token of [
    "Content-Security-Policy:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "Referrer-Policy:",
    "Permissions-Policy:",
    "Strict-Transport-Security:",
    "Cache-Control: no-cache"
  ]) assert.ok(headers.includes(token), "Missing header or CSP directive: " + token);
});

test("notification clicks cannot navigate outside the app origin", () => {
  const worker = read("sw.js");
  assert.match(worker, /targetUrl\.origin !== self\.location\.origin/);
  assert.match(worker, /new URL\('\.\/', self\.location\.origin\)/);
});

test("push worker only sends to trusted browser push providers", () => {
  const worker = read("push-worker/src/index.js");
  assert.match(worker, /trustedPushHost/);
  assert.match(worker, /host==="fcm\.googleapis\.com"/);
  assert.match(worker, /host==="web\.push\.apple\.com"/);
  assert.match(worker, /host\.endsWith\("\.notify\.windows\.com"\)/);
  assert.match(worker, /Array\.isArray\(safeState\.notes\)/);
  assert.match(worker, /localParts\(now,"Europe\/Berlin"\)/);
  assert.match(worker, /slice\(0,220\)/);
});

test("push worker public endpoint is read-only and cache-safe", () => {
  const worker = read("push-worker/src/index.js");
  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /"Cache-Control": "no-store"/);
  assert.match(worker, /endpoint\.username \|\| endpoint\.password/);
  assert.match(worker, /endpoint\.port && endpoint\.port !== "443"/);
});

test("Firestore rules require verified ownership and deny unmatched paths", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /request\.resource\.data\.revision == 1/);
  assert.match(rules, /request\.resource\.data\.revision == resource\.data\.revision \+ 1/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write: if false/);
});
