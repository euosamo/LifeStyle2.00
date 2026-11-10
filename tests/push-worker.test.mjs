import { test } from "node:test";
import assert from "node:assert/strict";
import { b64url } from "../push-worker/src/encoding.js";
import { collectionGroup, removeSubscription } from "../push-worker/src/index.js";

test("push marker IDs encode German and Unicode reminder text safely", () => {
  const text = "Miete 🌴 – Rücklage €";
  const decoded = Buffer.from(b64url(text), "base64url").toString("utf8");
  assert.equal(decoded, text);
});

test("push marker IDs use URL-safe unpadded base64", () => {
  const encoded = b64url("safe/id+value=");
  assert.doesNotMatch(encoded, /[+/=]/);
});

test("collectionGroup paginates beyond Firestore's 1000-document page limit", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const firstPage = Array.from({ length: 1000 }, (_, i) => ({
    document: {
      name: `projects/lifestyle2-login/databases/(default)/documents/users/u/pushSubscriptions/${String(i).padStart(4, "0")}`,
      fields: { timezone: { stringValue: "Europe/Berlin" } }
    }
  }));
  const secondPage = [{
    document: {
      name: "projects/lifestyle2-login/databases/(default)/documents/users/u/pushSubscriptions/1000",
      fields: { timezone: { stringValue: "Europe/Berlin" } }
    }
  }];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body.structuredQuery);
    const page = requests.length === 1 ? firstPage : secondPage;
    return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const docs = await collectionGroup("test-token", "pushSubscriptions", ["timezone"]);
    assert.equal(docs.length, 1001);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].limit, 1000);
    assert.equal(requests[0].startAt, undefined);
    assert.deepEqual(requests[1].startAt, {
      values: [{ referenceValue: firstPage.at(-1).document.name }],
      before: false
    });
    assert.deepEqual(requests[0].select.fields, [{ fieldPath: "__name__" }, { fieldPath: "timezone" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("collectionGroup rejects failed Firestore queries", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("denied", { status: 403 });
  try {
    await assert.rejects(collectionGroup("test-token", "appData"), /Firestore query appData: 403/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("removeSubscription deletes only a valid user's push subscription document", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };
  try {
    await removeSubscription(
      "test-token",
      "projects/lifestyle2-login/databases/(default)/documents/users/user-123/pushSubscriptions/0123456789abcdef0123456789abcdef01234567"
    );
    assert.equal(request.options.method, "DELETE");
    assert.match(request.url, /users\/user-123\/pushSubscriptions\/0123456789abcdef0123456789abcdef01234567$/);
    await assert.rejects(
      removeSubscription("test-token", "projects/other/databases/(default)/documents/users/u/pushSubscriptions/id"),
      /Invalid push subscription document path/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
