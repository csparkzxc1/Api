# Cap deployment

This walks the maintainer through getting M6 to a private beta. Skim the
README first; this doc only covers what's specific to going live.

## Backend (Fly.io)

1. **Postgres + Redis**: `fly postgres create` and `fly redis create`. Note
   the `DATABASE_URL` and `REDIS_URL` they print.
2. **Secrets**: generate the at-rest KEK and the wrapping keypair locally,
   then ship them as Fly secrets — never commit them.

   ```bash
   # 32-byte hex KEK
   openssl rand -hex 32
   # 32-byte hex X25519 private key
   openssl rand -hex 32
   ```

   ```bash
   fly secrets set \
     DATABASE_URL=postgres://… \
     REDIS_URL=redis://… \
     KEK_KID=prod-1 \
     KEK_KEYS=prod-1:<hex32> \
     WRAPPING_KID=wrap-prod-1 \
     WRAPPING_PRIVKEY=<hex32>
   ```

3. **APNs / FCM (optional, for M6 push)**:

   ```bash
   fly secrets set \
     APNS_KEY_P8="$(cat AuthKey_ABCDE12345.p8)" \
     APNS_KEY_ID=ABCDE12345 \
     APNS_TEAM_ID=ABCDEFGHIJ \
     APNS_TOPIC=app.cap.Cap \
     APNS_ENVIRONMENT=production
   fly secrets set \
     FCM_PROJECT_ID=cap-prod \
     FCM_CLIENT_EMAIL=fcm-sender@cap-prod.iam.gserviceaccount.com \
     FCM_PRIVATE_KEY="$(cat fcm-key.pem)"
   ```

4. **Deploy**: from `backend/`, `fly deploy`. The `fly.toml` ships two
   processes (`app` and `worker`), so polling and push fire-out happen on
   the worker machine while the API process serves requests.
5. **Migrate**: `fly ssh console -a cap-api -C "node dist/db/migrate.js"`.

## iOS (TestFlight)

1. In the Apple Developer portal, register `app.cap.Cap` and
   the watch app id `app.cap.Cap.watchkitapp`. Enable the
   *Push Notifications* capability for both.
2. Create an APNs auth key (`AuthKey_*.p8`); copy the Key ID and Team ID
   into the Fly secrets above.
3. From `ios/`, run `xcodegen generate` to materialise the
   `Cap.xcodeproj`, then archive in Xcode and push to App Store
   Connect → TestFlight Internal Testing. Add internal testers via email.

## Android phone (Play Console internal testing)

1. Create the Firebase project `cap-prod`. Enable Cloud Messaging.
   Download `google-services.json` and drop it into `android/app/`.
2. Create the Wear OS Firebase app under the same project. Drop its
   `google-services.json` into `android/wear/`.
3. Generate a service-account JSON for the *Firebase Cloud Messaging API
   Admin* role and feed `client_email` + `private_key` to the backend's
   `FCM_*` secrets above.
4. From `android/`, `./gradlew :app:bundleRelease` and
   `./gradlew :wear:bundleRelease`. Upload both AABs to the Play Console
   internal-testing track for the matching release.

## Desktop agent

`.github/workflows/desktop-agent-release.yml` runs on `agent-v*` tags. The
maintainer adds these repo secrets for signing:

- macOS: `APPLE_CERTIFICATE` (.p12 in base64), `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_TEAM_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`.
- Windows: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Without these the workflow still produces unsigned bundles for ad-hoc
testing.

## Sanity checklist before flipping the beta switch

- [ ] `fly logs` shows `worker started` and at least one `poll-ok` per
      enrolled account every `POLL_INTERVAL_SECONDS`.
- [ ] `GET /v1/usage/summary?window=day` returns non-zero values for a
      live-traffic test account.
- [ ] Phone enrol succeeds and a TestFlight build receives an APNs token
      that shows up in `push_tokens`.
- [ ] Watch enrolment via 6-digit pairing yields a second row in
      `push_tokens` with `platform=watchos`.
- [ ] Lowering an alert threshold to 1% briefly produces a push within the
      next poll interval, and `last_fired_at` advances on the row.
- [ ] Desktop agent reports samples and `usage_facts` rows appear with
      `source=desktop_agent`.
