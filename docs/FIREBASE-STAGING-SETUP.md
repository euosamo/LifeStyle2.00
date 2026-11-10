# Firebase staging setup (safe, separate from production)

## Current code behavior

- The default environment remains `production` and uses the existing `lifestyle2-login` web-app configuration.
- Staging is opt-in via page metadata `firebase-environment=staging`.
- Staging fails closed unless all six staging web-app settings are present and the project ID is exactly `lifestyle200-staging`.
- The staging App Check site key is separate from the production site key.
- This change does not deploy functions, alter Firebase Console settings, or change the production Pages site.

## Required staging page metadata

On a dedicated staging HTML page/build only, add these metadata entries in the document head and populate them from the Firebase Console web-app configuration for project `lifestyle200-staging`:

```html
<meta name="firebase-environment" content="staging">
<meta name="firebase-staging-api-key" content="STAGING_WEB_API_KEY">
<meta name="firebase-staging-auth-domain" content="lifestyle200-staging.firebaseapp.com">
<meta name="firebase-staging-project-id" content="lifestyle200-staging">
<meta name="firebase-staging-storage-bucket" content="STAGING_STORAGE_BUCKET">
<meta name="firebase-staging-messaging-sender-id" content="STAGING_MESSAGING_SENDER_ID">
<meta name="firebase-staging-app-id" content="STAGING_WEB_APP_ID">
<meta name="firebase-staging-app-check-site-key" content="STAGING_RECAPTCHA_ENTERPRISE_SITE_KEY">
```

The values above are placeholders except the known staging project ID and conventional auth-domain form; verify every value in Firebase Console. A Firebase Web API key and App Check site key are public client identifiers, not server secrets. Never put service-account JSON, private VAPID keys, private API credentials, or other secrets in HTML or Git.

## Firebase Console checklist (manual, read-only until approved)

1. Open project `lifestyle200-staging`, not `lifestyle2-login`.
2. Confirm the registered Web App and copy its exact config values.
3. In App Check, confirm a reCAPTCHA Enterprise provider is registered for that staging Web App with the staging site key and correct allowed domains.
4. Confirm the App Check metrics show valid requests before enforcing enforcement.
5. Confirm Authentication email/password and authorized domains are configured for the staging host.
6. Confirm Functions are deployed only to staging and that the deployed callable region is `europe-west3`.
7. Only after a separate explicit approval, perform a live staging write/delete test using a dedicated disposable test account and synthetic data.

## Important

Do not add these metadata entries to the production `index.html`. Do not enable App Check enforcement, deploy functions, enable APIs/billing, or modify production settings as part of setup. GitHub Actions tests only validate local configuration selection and emulator behavior; they cannot prove Firebase Console registration or real App Check token acceptance.
