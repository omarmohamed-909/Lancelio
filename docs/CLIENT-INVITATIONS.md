# Account-bound client portals

Owners and admins can invite the saved email on an active client from **Clients → Client portal → Invite your client**. The owner must review the client-facing preview and email before confirming. Sending a replacement invitation removes that client's previous account access. Existing anonymous portal links are independent and remain under their existing expiry/revocation controls.

Invitations appear under **Working with** (`/connections`), with a pending badge in the navigation. Recipients can accept, decline, open a read-only portal, or leave. Their own workspace, membership and session scope never change. An invitation does not create an administrator, employee or team membership.

## Email and identity

- When the verified welcome-email sender is configured (`WELCOME_EMAIL_ENABLED`, `RESEND_API_KEY`, `EMAIL_FROM`), invitations use the same server-only sender. They have their own Arabic/English template and provider idempotency key `client-invitation/<id>/<version>`.
- The owner action awaits the delivery attempt; it does not depend on a background timer surviving Vercel. Provider acceptance is reported separately from delivery. There is no automatic resend or historical backfill.
- If sending is disabled, fails, or times out, the owner can copy the newly generated invitation link. A new confirmed invitation rotates the secret and invalidates the previous link; refreshing the status does not send mail.
- Pending invitations expire after seven days. The raw secret is returned only on creation and delivered in a URL fragment. Only its digest is persisted in MongoDB. Secrets, recipient addresses and provider bodies are not logged.
- Google-verified accounts can discover and accept pending invitations for their verified address. A password account without verified email must use the secret invitation link for that specific address. Registering an unverified account with another person's address is insufficient to discover or accept their invitations.
- Links require authentication with the matching current email. They never accept an invitation automatically. The browser keeps a pending secret in session storage only to return to `/connections` after password/Google sign-in or signup, and clears it after a decision or explicit dismissal. The return path is fixed, preventing open redirects.

## Authorization and data

The `ClientAccess` collection has one versioned invitation/access record per workspace/client. Creation and acceptance use transactions and conditional versions. Simultaneous creation/acceptance has one winner. Owner controls are workspace scoped and limited to owner/admin; mutations require the configured trusted origin. Endpoints are authenticated, rate limited per authenticated account and return `Cache-Control: no-store`. Client-portal limits do not combine different accounts behind Vercel or a shared device, and forwarded headers cannot bypass an account's quota.

Acceptance binds access to the authenticated user ID and invited email. Every portal read checks the current active user, accepted record, current client email and non-archived client inside the same snapshot transaction used to read the portal. The portal reuses the existing client-scoped projection: this client's projects, explicitly visible tasks, issued invoices and computed balances. It excludes private notes, drafts, other clients, and payment ledger details. Revocation/leave blocks later reads; neither modifies the recipient's own workspace.

Accepted access lasts until revoked, left, replaced or otherwise invalidated; the seven-day deadline governs acceptance only. Archived clients are inaccessible while archived. Changing a client email invalidates the old address's access; the owner must send a new invitation for the new address. An already rendered page cannot be recalled from a recipient, but fresh reads and focus/reload revalidate access.

## Verification

```sh
npm run test --workspace @lancelio/api -- tests/client-access.integration.test.ts tests/portal.integration.test.ts
npm run test:e2e -- tests/connections.spec.ts --project chromium
npm run test:e2e -- tests/auth.spec.ts --grep 'ACC-001|PRT-001' --project chromium
npm run test:localization
npm run architecture:check
```

API tests use a temporary replica set. Browser tests include a real two-account acceptance/revocation flow, Arabic/English mobile layouts, accessibility checks, and a failed-email/manual-link path. No test sends real invitation mail or changes production accounts.
