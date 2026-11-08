import { test } from "node:test";
import assert from "node:assert/strict";
import { b64url } from "../push-worker/src/encoding.js";

test("push marker IDs encode German and Unicode reminder text safely", () => {
  const text = "Miete 🌴 – Rücklage €";
  const decoded = Buffer.from(b64url(text), "base64url").toString("utf8");
  assert.equal(decoded, text);
});

test("push marker IDs use URL-safe unpadded base64", () => {
  const encoded = b64url("safe/id+value=");
  assert.doesNotMatch(encoded, /[+/=]/);
});
