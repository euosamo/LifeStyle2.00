/**
 * Select Firebase configuration from explicit page metadata.
 * Production remains the default for existing deployments. Staging is opt-in
 * and fails closed unless every staging web-app value is supplied.
 */
export function resolveFirebaseEnvironment(getMeta, productionConfig) {
  const environment = (getMeta("firebase-environment") || "production").trim().toLowerCase();

  if (environment === "production") {
    return {
      environment,
      firebaseConfig: productionConfig,
      appCheckSiteKey: getMeta("firebase-app-check-site-key") || ""
    };
  }

  if (environment !== "staging") {
    throw new Error("Unbekannte Firebase-Umgebung. Start aus Sicherheitsgründen abgebrochen.");
  }

  const firebaseConfig = {
    apiKey: getMeta("firebase-staging-api-key"),
    authDomain: getMeta("firebase-staging-auth-domain"),
    projectId: getMeta("firebase-staging-project-id"),
    storageBucket: getMeta("firebase-staging-storage-bucket"),
    messagingSenderId: getMeta("firebase-staging-messaging-sender-id"),
    appId: getMeta("firebase-staging-app-id")
  };
  const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => !value || !value.trim())
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Staging-Firebase-Konfiguration unvollständig: ${missing.join(", ")}`);
  }
  if (firebaseConfig.projectId !== "lifestyle200-staging") {
    throw new Error("Staging-Konfiguration verweist nicht auf lifestyle200-staging. Start abgebrochen.");
  }

  return {
    environment,
    firebaseConfig,
    appCheckSiteKey: getMeta("firebase-staging-app-check-site-key") || ""
  };
}
