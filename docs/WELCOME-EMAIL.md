# Welcome email and Google identity

Welcome emails are optional and **disabled by default**. Google sign-in continues using the currently configured client until a separate Lancelio client is ready and its public client ID is installed. No existing Google project or OAuth client needs to be renamed or deleted.

Production welcome delivery was enabled on **2026-10-24** after Resend verified `updates.lancelio.tech` in Ireland (`eu-west-1`). The sender is **Lancelio <hello@updates.lancelio.tech>**. A Sending access key restricted to this domain is stored as a Production secret on `lancelio-api`; the feature flag and sender are Production config values. One owner-approved Arabic preview was accepted and subsequently reported **Delivered** by Resend. This does not confirm inbox placement or a recipient read.

## Enable email

1. Create a [Resend account](https://resend.com/signup). Add a sending subdomain you control, for example `updates.lancelio.tech`, and publish the exact SPF/DKIM records supplied by the dashboard. Follow [Resend's domain instructions](https://resend.com/docs/dashboard/domains/introduction). Do not replace existing website records or root-domain mail records.
2. Wait for domain verification, then create a sending API key restricted to that domain. Store it in the API project's server environment; never in a `NEXT_PUBLIC_` variable, source file or chat.
3. Set these API environment variables and redeploy:

   ```dotenv
   WELCOME_EMAIL_ENABLED=true
   RESEND_API_KEY=<server-side sending key>
   EMAIL_FROM=hello@updates.lancelio.tech
   WEB_ORIGIN=https://www.lancelio.tech
   ```

   `EMAIL_FROM` is a bare verified email address; the welcome adapter adds the display name **Lancelio**. Replies go to the public support contact `omar.m.ombark@gmail.com`.

4. Leave `EMAIL_PROVIDER=disabled` if only enabling welcome mail. Password recovery has separate delivery requirements; enabling `EMAIL_PROVIDER=resend` on Vercel still requires the existing external recovery worker configuration.
5. Create a new disposable account to check both the inbox and spam folder. Do not trigger bulk sends to existing accounts. Google and password signups use the same welcome content, in the site language selected at registration.

## Behavior and reliability

- The new account stores one private welcome record in the same transaction as signup. Google onboarding queues it only when creating a new user, after name/workspace confirmation. Existing accounts, ordinary sign-ins and first-time Google linking never enqueue another welcome.
- Welcome records are created only while the feature is enabled. Turning it on later does not backfill old users. Turning it off prevents delivery and new records.
- The language is the explicit `ar`/`en` signup locale, with English as the API fallback. Recipient, name, workspace name and language are frozen so retries use the same content. User content is HTML-escaped. The email contains no password, session token, secret link or tracking pixel. The dashboard button is a normal authenticated navigation link.
- On Vercel, the official `waitUntil` integration drains one job after an HTTP response finishes; signup does not await the email provider. Later requests can retry due jobs. There is no timer assumed to survive a serverless response. During an idle period, retries wait for another request; an optional independent worker (`npm run start:recovery-worker --workspace @lancelio/api`) drains both welcome and recovery queues continuously.
- A Mongo lease prevents concurrent workers from claiming the same job. Network/429/5xx failures back off from 30 seconds to five minutes; permanent provider failures stop retries. Only active users whose current email matches the queued recipient are eligible.
- A stable `welcome/<userId>/v1` provider idempotency key prevents duplicate provider acceptance after timeouts or lost acknowledgements. All attempts expire 23 hours after creation, within [Resend's 24-hour retention window](https://resend.com/changelog/idempotency-keys). A sent record is retained and never requeued. This is one logical welcome per new account; it is not an inbox-delivery guarantee.
- Queue state and snapshots are excluded from normal user reads and every public DTO. Provider bodies, recipients, credentials and raw errors are never logged. `sent` means the provider accepted the request, not confirmed inbox delivery.

## Separate Google project

The existing Google project `vital-defender-484417-k9` serves other applications and must retain its existing branding and clients. A separate project named **Lancelio** was created with ID `quick-filament-512613-j8`.

Configure its Google Auth Platform app with the Lancelio name, the appropriate support contact, logo and these public links:

- Homepage: `https://www.lancelio.tech`
- Privacy: `https://www.lancelio.tech/privacy`
- Terms: `https://www.lancelio.tech/terms`
- Authorized domain: `lancelio.tech`

Create a **Web application** client with JavaScript origins `https://www.lancelio.tech`, `http://localhost` and `http://localhost:3000`. This integration needs no client secret in the app and no redirect URI. Keep permissions limited to basic Google sign-in information. Complete Google's required agreement and brand/domain verification with the project owner. See [Google's branding documentation](https://developers.google.com/identity/verification/authentication-verification).

Only after the new configuration is ready, replace `GOOGLE_CLIENT_ID` on the API and redeploy. Do not remove the currently working client or change existing Google subject bindings. Verify real returning-account sign-in during cutover. The form may offer only the signed-in Google owner's address as its public support email; obtain the owner's decision before publishing a different address from the site's existing public support contact.

The dedicated **Lancelio Web** client is `284374535296-spldeq3ck7ddahll7pm4touo15615q5u.apps.googleusercontent.com`. Its audience is External / In production. The approved Google support email is `om1478711@gmail.com`; the site's support and developer contact remain `omar.m.ombark@gmail.com`.

Google requires homepage ownership before showing the saved branding. The public file `apps/web/public/google385212f48908aef7.html` supports Search Console verification of `https://www.lancelio.tech/` for the approved owner `om1478711@gmail.com`. Keep the file after verification. Google's branding screen asks for 24 hours after ownership verification before requesting another review; production availability alone does not mean the name/logo are verified or visible. Check the Branding / Verification Center result separately.

Homepage ownership was verified in Search Console on **2026-10-24**. The Google branding review remains a separate follow-up after that waiting period.

## Verification

```sh
npm run test --workspace @lancelio/api -- tests/welcome-email.test.ts tests/welcome-email.integration.test.ts tests/google-auth.integration.test.ts tests/serverless.test.ts
npm run test:e2e -- tests/auth.spec.ts tests/google-auth.spec.ts
```

The package overrides and patched `fast-uri` development pin keep the email runtime's transitive validation dependencies on the audited versions until upstream dependency pins are updated.
