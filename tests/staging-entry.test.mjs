import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../staging.html", import.meta.url), "utf8");

test("staging entry point explicitly selects staging project", () => {
  assert.match(html, /name="firebase-environment" content="staging"/);
  assert.match(html, /name="firebase-staging-project-id" content="lifestyle200-staging"/);
  assert.doesNotMatch(html, /name="firebase-app-check-site-key"/);
});

test("staging entry point does not silently use production credentials", () => {
  assert.match(html, /REPLACE_WITH_STAGING_WEB_API_KEY/);
  assert.match(html, /REPLACE_WITH_STAGING_RECAPTCHA_ENTERPRISE_SITE_KEY/);
  assert.doesNotMatch(html, /AIzaSyBsklHgKgsiwEmY_PhmLxhYTdiGlbXpCqc/);
});

test("staging entry point does not register production PWA service worker or manifest", () => {
  assert.doesNotMatch(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /sw-register\.js/);
});
