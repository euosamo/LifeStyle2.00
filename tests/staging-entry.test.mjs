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
  assert.match(html, /name="firebase-staging-api-key" content="AIzaSyB6aWHfUix_x6HvHDNw1-kx6_nPBnhu7iU"/);
  assert.match(html, /name="firebase-staging-app-check-site-key" content="6LeNHRguAAAAABXpe0y0EIrV3GpTUw3gaPO1FGaf"/);
  assert.doesNotMatch(html, /AIzaSyBsklHgKgsiwEmY_PhmLxhYTdiGlbXpCqc/);
  assert.match(html, /name="firebase-staging-storage-bucket" content="lifestyle200-staging.firebasestorage.app"/);
  assert.match(html, /name="firebase-staging-app-id" content="1:597956662554:web:3a1182d7f15b89ac9908a3"/);
});

test("staging entry point does not register production PWA service worker or manifest", () => {
  assert.doesNotMatch(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /sw-register\.js/);
});


test("CSP permits the dedicated staging Firebase auth frame", async () => {
  const headers = await readFile(new URL("../_headers", import.meta.url), "utf8");
  assert.match(headers, /frame-src[^\\n]*https:\\/\\/lifestyle200-staging\\.firebaseapp\\.com/);
});
