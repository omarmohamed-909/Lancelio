# Lancelio

Freelancer client workflow: client → proposal → project → tasks → invoice.

Foundation, account registration (AUTH-001), login/session authentication (AUTH-002), and refresh/logout (AUTH-003) are implemented.
Arabic authentication screens and the protected workspace dashboard (WEB-001) are implemented. Workspace-scoped client creation, listing, editing and soft archive (CLT-001) are implemented at `/clients`, with responsive dialogs and the existing motion system. Literal client search and contact filters (CLT-002) are available on the same page. Draft proposals (PRP-001) now support scoped clients, priced items, exact totals, saved reviews and versioned editing at `/proposals`. The interface uses bundled Arabic typography, a notebook identity, and a continuous proposal editor (WEB-003).

## Requirements and setup

Node.js 22.20+ within Node 22, npm 10. Run from the repository root:

```sh
npm ci
```

The API requires MongoDB Atlas or a local replica set with transactions. In PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Set `MONGODB_URI` in `apps/api/.env` to your database connection.
Generate a signing key locally and save the result as `JWT_ACCESS_SECRET` in that same untracked file:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Treat that generated value as a secret. Then:

```sh
npm run dev:api
```

In another terminal:

```sh
npm run dev:web
```

Web: `http://localhost:3000` (redirects to login). API liveness: `http://localhost:5000/api/v1/health`.
The API loads its optional workspace `.env` file; process environment variables take precedence.
`MONGODB_URI` and `JWT_ACCESS_SECRET` (at least 32 characters) are required;
`PORT`, `WEB_ORIGIN`, and `NODE_ENV` have development defaults.
`WEB_ORIGIN` must be a canonical origin with no path/trailing slash and must use HTTPS in production.
A standalone MongoDB server cannot execute the registration transaction. The API validates transaction support and creates collections/indexes before listening.
Startup logs report safe configuration guidance without printing database URIs or driver errors. Keep credentials out of tracked files.

## Quality checks

```sh
npm run check
```

Runs formatting, lint, API architecture checks, app type checks, API HTTP tests, and production builds.
`npm run format` applies formatting. CI runs the same command on pushes and pull requests.

Integration tests start and stop a temporary MongoDB replica set, never connect to `MONGODB_URI`, and verify real transactions and unique indexes.
The API suite caps Vitest at two workers because each integration file runs a real replica set and Argon2 operations; this bounds memory/CPU pressure without extending assertion or hook timeouts. See [Vitest worker configuration](https://vitest.dev/config/maxworkers).
They use `mongod` from PATH when installed; otherwise they download MongoDB 8.0.16 to `.cache/mongodb-binaries`.
Set `MONGOMS_SYSTEM_BINARY` for a custom local executable or `MONGOMS_VERSION` for a desired test binary version.
Binary setup is explicit in the test harness; dependency installation does not trigger a MongoDB postinstall download.
First-time test downloads require network access. The first replica-set setup has a 240-second hook timeout; tests are not silently skipped if setup fails.

## Design and delivery

- [Architecture](docs/ARCHITECTURE.md)
- [Visual language and motion](docs/DESIGN.md)
- [Responsive verification and device matrix](docs/RESPONSIVE.md)
- [Epics, stories, acceptance criteria, and working board](docs/BACKLOG.md)
- [Implemented API contract](docs/API.md)

Use feature modules and explicit use cases/ports when business functionality is added.
Only add abstractions required by a real story. Client search/filtering and draft proposal creation/editing are implemented. Reviewed proposals can now be shared with expiring, revocable links (PRP-002), through an anonymous document page at `/share/proposal`. Creating a link locks the draft; users copy and send the link themselves. Client acceptance/rejection (PRP-003) now records final decisions with explicit confirmation. Acceptance creates one active project from the frozen agreement in the same transaction, available to its workspace at `/projects/:id`. Legacy links remain read-only until explicitly renewed. PRJ-001 adds `/projects`, `/projects/new`, status filtering and confirmed lifecycle changes. Manual projects capture an active workspace client without inventing an agreement or financial total; accepted projects retain their frozen agreement. Concurrent status changes require the current version, and ambiguous writes require explicit review. TSK-001 adds private project tasks with creation, editing, deletion, priorities and stable ordering across todo/in-progress/done lanes. Every change matches the current board revision; closed projects retain read-only tasks. TSK-002 derives real completion progress from the current tasks, with an explicit unknown state for empty work. Task client visibility is a separate confirmed choice, defaulting to private, and the owner can inspect an allowlisted client preview with its own visible-task progress. This prepares client access without publishing a project link; the actual client portal belongs to PRT-001. INV-001 adds `/invoices`, `/invoices/new` and private saved invoice reviews. Active workspace clients and optional matching-client projects are checked on the server. Totals use the same exact minor-unit pricing rules as proposals; invoice creation and a per-workspace sequence commit together. UUIDv4 creation keys prevent repeated submissions from allocating another invoice. INV-002 adds versioned draft editing at /invoices/:id/edit, explicit transactional issuance and scoped, expiring, revocable public reading at /share/invoice. Issuance captures current client identity, workspace name and server date and permanently locks financial content. Renewal changes the link without changing the issued document; public readers receive no contact fields or internal IDs. Creation replay retains its original identity after editing and issuance. PAY-001 adds a private manual payment ledger to each invoice review. Positive received payments use the invoice currency, support partial/full settlement and cannot exceed the remaining amount. Corrections retain original entries with their reason/date; balances and payment state are derived from active records. The independent ledger revision and UUIDv4 attempt keys protect concurrent and repeated writes, while the issued document/public grant remain unchanged. Recovery retains the same open attempt through an explicit read and confirmed retry. DSH-001 adds real workspace counts, active-project task states and exact issued/received/outstanding totals per currency on /dashboard. Counts, ledger balances and nearest available proposal-link expiries share one database snapshot; delivery dates are explicitly unavailable until recorded. Failed reads hide figures and require explicit recovery. PRT-001 adds /clients/:id/portal with an actual client-facing preview and independent expiring/revocable grants for /share/portal. The owner explicitly shares current and future same-client projects and issued invoice summaries, while only client-visible tasks contribute to public progress. Contacts, private notes and ledger history remain excluded. Each bounded page reads grant eligibility, work and exact invoice balances from one database snapshot; public cursors are encrypted and scoped to the grant/list type. Archive disables access. Unknown grant writes require explicit review/renewal, and public expiry/hash/restoration removes old content. NTF-001 adds /notifications and a header bell for committed proposal responses, issued invoices and payment/correction events, including existing history. Each member keeps independent read state; pagination and filtering preserve the overall unread count. Read changes use revisions, recover uncertain results through explicit reading, and refresh the authoritative list/count. Motion is finite and respects reduced-motion preferences. AUTH-004 adds password recovery with durable Resend delivery, one-time reset and atomic session revocation. The next story is REL-001 (release verification).

Login, refresh, and logout require an `Origin` header exactly matching `WEB_ORIGIN`, including for CLI clients.
The response access token is sent as `Authorization: Bearer <token>` to `/api/v1/auth/me`.
Store access tokens in browser memory; the API sets an HttpOnly refresh cookie and never returns the refresh token in JSON.
Production cookies require a same-origin browser-facing API and HTTPS; Next rewrites support a separate upstream service.
Send the refresh cookie with `POST /api/v1/auth/refresh` to receive a new access token and rotated cookie.
Refresh and logout accept no body fields. `POST /api/v1/auth/logout` revokes the cookie's session and returns 204.
Session lifetime is an absolute 7 days from login. Serialize refresh across requests/tabs: reusing an old refresh token revokes the entire session and requires login again.

## Browser verification

The workspace includes a bilingual assistant for product help and scoped work queries. Guided mode works without an external key. Gemini and OpenAI question interpretation are available through explicit server configuration; see [assistant setup and behavior](docs/ASSISTANT.md). Run `npm run assistant:check` to validate configuration, or add `-- --live` for one synthetic connection test.

Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` to the API prefix (default `http://localhost:5000/api/v1`). It is public configuration, never a signing key.
Production browser requests must use the canonical HTTPS frontend origin for both pages and `/api/v1`; the separate API service is reached through the server-side rewrite. The browser requires Web Locks and BroadcastChannel to coordinate cookie rotation across tabs.

Install the browsers once, then run:

```sh
npm exec --workspace @lancelio/web -- playwright install chromium firefox webkit
npm run test:e2e
```

This starts an isolated API on localhost:5100 and Next.js on localhost:3100; keep those ports free.
It never uses your configured MongoDB database. The same `MONGOMS_SYSTEM_BINARY` / PATH rules as API integration tests apply.
Browser artifacts use `.cache/playwright-results`, and desktop/mobile screenshots use `.cache/ui`.
Run `npm run test:responsive` for the 25-viewport audit on Chromium, Firefox and WebKit, including live orientation and short viewport checks. See [coverage and physical-device limits](docs/RESPONSIVE.md).
CI installs all three engines and runs the combined suite after `npm run check`; no remote CI run has been claimed.

## Account security (SET-002)

Open Settings → Account security to change your password after verifying the current one. Explicit confirmation ends all account sessions and requires login with the new password. Attempts are limited across devices through Mongo. An unknown result directs you to login verification without resending the request. See [ACCOUNT-SECURITY.md](docs/ACCOUNT-SECURITY.md) for the contract, credential races and recovery behavior.

## Workspace settings (SET-003)

Open Settings → Workspace to rename the current workspace as its owner. Other roles see the name and their role without editing controls. Saves preserve workspace identity, public links and issued documents; conflicts or unknown outcomes retain your draft for an explicit current-state review. See [WORKSPACE-SETTINGS.md](docs/WORKSPACE-SETTINGS.md).

## Password recovery delivery (AUTH-004)

The login screen links to /forgot-password; /reset-password accepts the email link. Resend integration is implemented but actual sending requires your own verified sender and server key. No real email delivery has been performed in automated verification.

In the existing untracked apps/api/.env file, configure:

```dotenv
EMAIL_PROVIDER=resend
RESEND_API_KEY=<your-server-side-key>
EMAIL_FROM=<verified-sender-mailbox>
```

Follow [Resend's domain verification instructions](https://resend.com/docs/dashboard/domains/introduction) and [sending contract](https://resend.com/docs/api-reference/emails/send-email). Use a verified sender from that domain; keep keys server-side, outside Git and out of chat. Restart the API after editing configuration. WEB_ORIGIN determines the email destination and must be your canonical HTTPS frontend origin in production. Keep click tracking disabled for recovery email so the secret link is not transformed into analytics data. Delivery is explicitly disabled by default; the UI reports unavailability instead of claiming an email was sent.

The API process handles the durable Mongo queue; there is no additional worker command. Jobs survive restarts and lease safely across instances. Queued recipient/token payloads are AES-GCM encrypted with a purpose-derived key from JWT_ACCESS_SECRET; raw tokens are never stored in plaintext or logged. Rotating that secret makes previously queued encrypted payloads unreadable; request new links and allow old jobs to expire. Already delivered links still follow their digest/expiry/consumption checks. Monitor pending/expired queue counts and provider delivery status without recording payloads or links.

Release verification must include delivery to an explicitly designated test mailbox on the configured Resend domain, inbox/spam behavior and HTTPS links. Local/API/browser tests use an injected fake mailer and isolated Mongo, never the configured database or a real recipient. Do not claim real inbox delivery from those tests.

## Profile settings (SET-001)

Profile settings are available at `/settings`: members can edit their own display name with revision conflict recovery and refresh the current identity across tabs. Email and current-workspace role are readonly. See [the profile contract and verification](docs/PROFILE.md); password/workspace changes are subsequent stories.

## Release preparation (REL-001)

The selected deployment is Vercel for the frontend with a separate persistent Node API. Use `NEXT_PUBLIC_API_URL=/api/v1` and a server-only `API_UPSTREAM_ORIGIN` before the frontend build; the same-origin rewrite preserves the secure session cookie. `render.yaml` is a backend example, not an active deployment.

See [the release runbook](docs/RELEASE.md) for configuration, local production HTTPS smoke (`npm run test:release`), encrypted BSON backups/restore drills and the remaining hosted activation gates. The normal app environment is never used by the backup drill. REL-001 remains open until hosted routing/rate limits, real Resend delivery and operational/device checks are completed.
