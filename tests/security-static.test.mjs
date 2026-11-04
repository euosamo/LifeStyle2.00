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

test("Firestore rules require verified ownership and deny unmatched paths", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write: if false/);
});
