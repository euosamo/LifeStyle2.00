import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = path => readFileSync(path, "utf8");

test("main application interface remains the original authenticated inline app", () => {
  const html = read("index.html");
  assert.match(html, /<title>Finanzen – Übersicht<\/title>/);
  assert.match(html, /id="authGate"/);
  assert.match(html, /id="app" hidden/);
  assert.match(html, /id="content"/);
  assert.match(html, /function render\(/);
  assert.match(html, /window\.lifestyleApplyState/);
  assert.match(html, /src="\.\/firebase-login\.js"/);
  assert.match(html, /src="\.\/backup-utils\.js"/);
  assert.match(html, /LifestyleBackup\.create\(state\)/);
  assert.match(html, /firebase-app-check-site-key/);
  assert.match(html, /nextPay:''/);
  assert.match(html, /<style>/);
  assert.match(html, /onclick=/);
});

test("Firebase authentication requires verified email and App Check", () => {
  const auth = read("firebase-login.js");
  assert.match(auth, /initializeAppCheck/);
  assert.match(auth, /ReCaptchaEnterpriseProvider/);
  assert.match(auth, /isTokenAutoRefreshEnabled: true/);
  assert.match(auth, /if \(!user\.emailVerified\)/);
  assert.match(auth, /password\.length < 12/);
  assert.match(auth, /httpsCallable\(functions, "saveOwnAppData"\)/);
  assert.match(auth, /httpsCallable\(functions, "deleteOwnAccount"\)/);
});

test("financial Firestore documents are written through validated backend only", () => {
  const rules = read("firestore.rules");
  const functions = read("firebase-functions/index.js");
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /allow create, update: if false/);
  assert.match(functions, /export const saveOwnAppData/);
  assert.match(functions, /validateAppState/);
  assert.match(functions, /enforceAppCheck/);
});

test("production and staging Firebase environments are explicitly separated", () => {
  const resolver = read("firebase-environment.js");
  const html = read("index.html");
  assert.match(resolver, /lifestyle200-staging/);
  assert.match(resolver, /firebase-staging-api-key/);
  assert.match(html, /firebase-staging-project-id/);
});

test("security headers protect the app without breaking the legacy main UI", () => {
  const headers = read("_headers");
  const enforced = headers.match(/^\s+Content-Security-Policy:\s*(.+)$/m)?.[1] || "";
  const reportOnly = headers.match(/^\s+Content-Security-Policy-Report-Only:\s*(.+)$/m)?.[1] || "";
  assert.match(enforced, /object-src 'none'/);
  assert.match(enforced, /frame-ancestors 'none'/);
  assert.match(enforced, /script-src[^;]*'unsafe-inline'/);
  assert.match(enforced, /style-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(reportOnly, /'unsafe-inline'/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /Strict-Transport-Security/);
  assert.match(headers, /https:\/\/\*\.cloudfunctions\.net/);
});

test("service worker caches current auth modules and does not replace the main UI", () => {
  const sw = read("sw.js");
  assert.match(sw, /lifestyle-finanz-app-v24/);
  assert.match(sw, /firebase-environment\.js/);
  assert.match(sw, /backup-utils\.js/);
  assert.match(sw, /firebase-login\.js/);
});

test("Pages build publishes only the explicit web-app allowlist", () => {
  const result = spawnSync(process.execPath, ["scripts/build-pages.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const file of ["index.html", "firebase-login.js", "firebase-environment.js", "backup-utils.js", "sw.js", "_headers", "manifest.webmanifest"]) {
    assert.ok(existsSync(`dist/${file}`), `missing public asset: ${file}`);
  }
  for (const file of ["firebase-functions/index.js", "firestore.rules", "tests/security-static.test.mjs", "FIREBASE-SETUP.md"]) {
    assert.equal(existsSync(`dist/${file}`), false, `backend/internal file leaked into Pages output: ${file}`);
  }
});

test("user-controlled finance labels and icon classes are escaped before HTML rendering", () => {
  const html = read("index.html");
  assert.match(html, /function safeIconClass\(value\)/);
  assert.match(html, /function tx\(t\)[\s\S]*?escapeHTML\(t\.name\)/);
  assert.match(html, /function accounts\(\)[\s\S]*?escapeHTML\(x\[0\]\)/);
  assert.match(html, /safeIconClass\(x\[4\]\)/);
  assert.match(html, /safeIconClass\(x\[5\]\)/);
  assert.doesNotMatch(html, /onclick="showToast\('\$\{x\[0\]\}/);
});
