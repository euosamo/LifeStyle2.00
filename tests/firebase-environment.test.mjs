import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFirebaseEnvironment } from "../firebase-environment.js";

const production = {
  apiKey: "production-api-key",
  authDomain: "lifestyle2-login.firebaseapp.com",
  projectId: "lifestyle2-login",
  storageBucket: "lifestyle2-login.firebasestorage.app",
  messagingSenderId: "436328668120",
  appId: "production-app-id"
};
const staging = {
  "firebase-environment": "staging",
  "firebase-staging-api-key": "staging-api-key",
  "firebase-staging-auth-domain": "lifestyle200-staging.firebaseapp.com",
  "firebase-staging-project-id": "lifestyle200-staging",
  "firebase-staging-storage-bucket": "lifestyle200-staging.firebasestorage.app",
  "firebase-staging-messaging-sender-id": "123456",
  "firebase-staging-app-id": "1:123456:web:staging",
  "firebase-staging-app-check-site-key": "staging-site-key"
};

function meta(values) {
  return name => values[name] || "";
}

test("production remains the default and keeps its existing project config", () => {
  const result = resolveFirebaseEnvironment(meta({}), production);
  assert.equal(result.environment, "production");
  assert.deepEqual(result.firebaseConfig, production);
});

test("staging selects only the dedicated staging project and its App Check key", () => {
  const result = resolveFirebaseEnvironment(meta(staging), production);
  assert.equal(result.environment, "staging");
  assert.equal(result.firebaseConfig.projectId, "lifestyle200-staging");
  assert.equal(result.firebaseConfig.apiKey, "staging-api-key");
  assert.equal(result.appCheckSiteKey, "staging-site-key");
  assert.notEqual(result.firebaseConfig.apiKey, production.apiKey);
});

test("staging fails closed when any required setting is missing", () => {
  const incomplete = { ...staging };
  delete incomplete["firebase-staging-app-id"];
  assert.throws(
    () => resolveFirebaseEnvironment(meta(incomplete), production),
    /Staging-Firebase-Konfiguration unvollständig/
  );
});

test("staging refuses a project ID that points at production", () => {
  const wrongProject = { ...staging, "firebase-staging-project-id": "lifestyle2-login" };
  assert.throws(
    () => resolveFirebaseEnvironment(meta(wrongProject), production),
    /verweist nicht auf lifestyle200-staging/
  );
});

test("unknown environment fails closed", () => {
  assert.throws(
    () => resolveFirebaseEnvironment(meta({ "firebase-environment": "prod-ish" }), production),
    /Unbekannte Firebase-Umgebung/
  );
});
