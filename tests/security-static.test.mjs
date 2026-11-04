import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

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
  const app = read("index.html");
  assert.match(app, /escapeHTML\(t\.name\|\|\x27\x27\)/);
  assert.match(app, /escapeHTML\(x\[0\]\|\|\x27\x27\)/);
  assert.match(app, /escapeHTML\(row\[0\]\|\|\x27\x27\)/);
  assert.match(app, /LAYOUT_KEYS=\[\x27fixed\x27,\x27one\x27,\x27installments\x27,\x27goals\x27\]/);
  assert.match(app, /next\.currency=\[\x27EUR\x27,\x27USD\x27,\x27GBP\x27\]/);
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
    "Strict-Transport-Security:"
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
});

test("Firestore rules require verified ownership and deny unmatched paths", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write: if false/);
});
