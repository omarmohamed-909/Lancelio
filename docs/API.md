# API contract — authentication, sessions and clients

## Health

`GET /api/v1/health` returns 200 for a running process. `GET /api/v1/health/ready` returns 200 only when the live Mongo connection passes a bounded ping, otherwise 503. Both use `Cache-Control: no-store`; readiness never includes connection strings or provider errors. Use readiness for the hosting health check and liveness for process diagnosis. A fixture without a readiness dependency reports 503.

## Register

`POST /api/v1/auth/register` with `Content-Type: application/json`.

```json
{
  "name": "Ahmed",
  "email": "ahmed@example.com",
  "password": "a-long-unique-password",
  "workspaceName": "Ahmed Studio"
}
```

`workspaceName` is optional and defaults to the trimmed account name.
Names have 2–100 characters; password length is 15–128 Unicode code points.
Email is trimmed/lowercased, conventional ASCII syntax, maximum 254 characters and a 64-character local part.
Unknown fields, including role, owner, workspace IDs, plan, and passwordHash, are rejected.

### 201 Created

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "name": "Ahmed", "email": "ahmed@example.com" },
    "workspace": {
      "id": "...",
      "name": "Ahmed Studio",
      "slug": "workspace-..."
    },
    "membership": { "id": "...", "role": "owner" }
  }
}
```

All three records are committed together. A failure leaves none of the records behind.
This endpoint does not create a session, return tokens, or set auth cookies. Login is a separate endpoint.

### Errors

| HTTP | Code                     | Meaning                                                              |
| ---- | ------------------------ | -------------------------------------------------------------------- |
| 400  | INVALID_JSON             | Malformed JSON                                                       |
| 409  | EMAIL_ALREADY_REGISTERED | A normalized email already exists, including concurrent requests     |
| 413  | PAYLOAD_TOO_LARGE        | Body exceeds 100 KiB                                                 |
| 422  | VALIDATION_ERROR         | Invalid registration input; domain errors may include field messages |
| 429  | RATE_LIMITED             | More than 20 attempts per 15 minutes per IP                          |
| 500  | INTERNAL_ERROR           | A failure with no internal exception details exposed                 |

Every error uses `{ "success": false, "error": { "code": "...", "message": "..." } }`.
No request values are included in error messages. Duplicate email currently returns an explicit 409; account-existence hiding is not part of this contract.

## Health

`GET /api/v1/health` returns `{ "success": true, "data": { "status": "ok", "service": "lancelio-api" } }`.
It is liveness, not a continuing database readiness check.

## Login — AUTH-002

`POST /api/v1/auth/login`, JSON content type, and mandatory `Origin` matching `WEB_ORIGIN` exactly.

```json
{
  "email": "ahmed@example.com",
  "password": "a-long-unique-password"
}
```

Optional `workspaceId` selects an existing workspace membership; foreign workspace IDs are denied.
No selection chooses the earliest membership. Unknown fields are rejected.
Email is trimmed and lowercased. Password is not altered. Login accepts 1–128 password code points
to verify existing credentials; registration enforces its stronger minimum independently.

### 200 OK

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "name": "Ahmed", "email": "ahmed@example.com" },
    "workspace": { "id": "...", "name": "Ahmed", "slug": "workspace-..." },
    "membership": { "id": "...", "role": "owner" },
    "accessToken": "<signed JWT>",
    "tokenType": "Bearer",
    "expiresIn": 900
  }
}
```

The response has `Cache-Control: no-store` and sets an HttpOnly, SameSite=Strict, host-only refresh cookie
with a 7-day expiry and `/` path. In production its name is `__Host-lancelio_refresh` and it is Secure;
development uses `lancelio_refresh`. The raw refresh secret is not returned in JSON.

| HTTP | Code                    | Meaning                                                               |
| ---- | ----------------------- | --------------------------------------------------------------------- |
| 401  | INVALID_CREDENTIALS     | Incorrect email/password or inactive user; identical response         |
| 403  | WORKSPACE_ACCESS_DENIED | Password verified but no allowed workspace membership                 |
| 403  | UNTRUSTED_ORIGIN        | Absent or mismatched browser Origin                                   |
| 422  | VALIDATION_ERROR        | Invalid body shape, injected fields, password length, or workspace ID |
| 429  | RATE_LIMITED            | More than 10 login attempts per 15 minutes per IP                     |

The common 400/413/500 error contracts also apply. No cookie or successful auth response is issued on failure.
This policy expects same-site frontend/API hosting in production; CORS alone does not make unrelated domains same-site.

## Current identity — AUTH-002

`GET /api/v1/auth/me` with `Authorization: Bearer <accessToken>`.

Returns 200 with the same allowlisted `user`, `workspace`, and current `membership`, without tokens.
This endpoint takes no caller-selected user or workspace ID: the signed claims bind the identity to the session.
Invalid/expired tokens, missing/revoked/expired sessions, inactive users, deleted workspaces,
or removed memberships return 401 `UNAUTHENTICATED` with `WWW-Authenticate: Bearer`.
Session binding checks all three signed identifiers; roles are refreshed from current membership data.
All responses are `Cache-Control: no-store`. Refresh cookies cannot authorize this endpoint.

## Refresh — AUTH-003

`POST /api/v1/auth/refresh`, exact allowed `Origin`, and the refresh cookie issued at login.
Use an absent body or `{}`; tokens, workspace IDs, or any other body fields are rejected.
The cookie is required; an access Bearer token cannot replace it. Duplicate cookie names are not accepted.

Success is 200 with the same identity/access-token response shape as login, plus a newly rotated refresh cookie.
The token expiry is 15 minutes. The session ID and original 7-day absolute expiry remain unchanged.
An unexpired access token remains valid after ordinary rotation until its expiry or session revocation.

| HTTP | Code             | Meaning                                                                             |
| ---- | ---------------- | ----------------------------------------------------------------------------------- |
| 401  | UNAUTHENTICATED  | Missing/invalid/expired/revoked/reused credential, or lost account/workspace access |
| 403  | UNTRUSTED_ORIGIN | Missing or disallowed Origin; cookie remains untouched                              |
| 422  | VALIDATION_ERROR | Body has fields or an invalid shape; cookie remains untouched                       |
| 429  | RATE_LIMITED     | More than 30 refresh attempts per 15 minutes per IP                                 |
| 500  | INTERNAL_ERROR   | No successful response/cookie is issued; failed transactional writes roll back      |

401 clears the matching refresh cookie. Other failure types do not clear it.
Reusing a consumed token revokes the entire session, including its latest refresh secret and access tokens.
This works across multiple generations, while leaving other device sessions unaffected.

**Concurrency contract:** only one of two simultaneous requests using the same refresh token can succeed.
The losing request detects reuse, returns 401, and revokes that session. Even the winning response's credentials
will then be unusable. Clients must coordinate refresh across requests and browser tabs and avoid blind retries;
if the response containing a new cookie is lost, login is required again. There is no retry grace window.

All refresh responses are `Cache-Control: no-store`.

## Logout — AUTH-003

`POST /api/v1/auth/logout`, exact allowed `Origin`, optional current or previously consumed refresh cookie,
and an absent or empty-object body. Access tokens and body credentials are not used to choose a session.

Returns **204 No Content** after revoking the selected session and clearing its cookie with the same name/path/security options.
Missing, malformed, unknown, or already-revoked cookies also return 204; repeated logout is idempotent.
All access tokens for that session immediately fail protected requests. Other devices are unaffected.

403/422 are returned for invalid Origin/body before mutation or cookie clearing. A revocation database failure returns 500
and leaves the cookie intact for an explicit retry. Logout responses are `Cache-Control: no-store`.

## Clients — CLT-001

All client endpoints require `Authorization: Bearer <accessToken>`. The server checks the live session, active account and workspace membership before entering the client module. Every current member (owner/admin/member) can manage clients in that workspace. Workspace/user IDs and role fields are never accepted as client input.

| Method | Path                          | Body / query                                              | Success                                 |
| ------ | ----------------------------- | --------------------------------------------------------- | --------------------------------------- |
| POST   | `/api/v1/clients`             | Client details                                            | 201, client                             |
| GET    | `/api/v1/clients`             | Optional `q`, `status`, `contact`, `cursor` (see CLT-002) | 200, `{ items, nextCursor }`            |
| GET    | `/api/v1/clients/:id`         | None                                                      | 200, client, including archived records |
| PUT    | `/api/v1/clients/:id`         | Client details plus `version`                             | 200, updated client                     |
| POST   | `/api/v1/clients/:id/archive` | `{ "version": 1 }`                                        | 200, archived client                    |

Client details:

```json
{
  "name": "Sara Ali",
  "email": "sara@example.com",
  "phone": "+20 100 555 4444",
  "company": "Sara Studio",
  "notes": "Contact by email in the morning"
}
```

Only `name` is required. Optional fields default to empty strings. All fields are trimmed; email is lowercased. Name is 2–100 Unicode code points, company up to 120, notes up to 2000. Email uses conventional ASCII syntax with a 254-character maximum. Phone accepts 3–40 ASCII digits, spaces, `+`, parentheses, dots and hyphens, with at least one digit. Empty optional fields are valid. Unknown fields are rejected.

A client response exposes only `id`, these five details, `version`, ISO `createdAt`/`updatedAt`, and nullable ISO `archivedAt`. It uses the standard success envelope. Workspace IDs and MongoDB metadata are omitted.

`PUT` replaces all five details: omitted optional fields are cleared. Send the current positive integer `version` from a read response. Update/archive atomically match workspace, ID, current version, and active state, then increment the version. A stale write returns `409 CLIENT_CONFLICT`; reload and review before saving. An archived client returns `409 CLIENT_ARCHIVED` for either mutation. There is no hard-delete or restore endpoint in this story.

Foreign and nonexistent clients both return `404 CLIENT_NOT_FOUND`, including on update/archive. Every lookup and mutation is workspace-scoped. Invalid IDs, versions, details, query values or unknown fields return `422 VALIDATION_ERROR`. Missing/revoked/expired credentials return 401 before any client write. Unexpected failures retain the existing safe generic error contract.

Lists contain at most 25 records, sorted by descending immutable ID. `nextCursor` is the last returned ID when more records exist; pass it unchanged for the next page. No total count is promised, and concurrent archival/creation can change which records belong to later pages. Results remain scoped even with a foreign cursor. Clients sharing a name or email are allowed; uniqueness is not a business requirement. Literal search and contact filtering are implemented in CLT-002 below.

The browser retries a protected operation once only after an explicit 401 from authentication, following coordinated refresh. It never retries a network/timeout/server failure automatically. Create has no idempotency key: if its outcome is uncertain, the editor disables another submission and asks the user to close it and refresh the list before trying again.

## Client search and filtering — CLT-002

`GET /api/v1/clients` accepts only these query fields:

| Field     | Values / limit                                                                                   | Default    |
| --------- | ------------------------------------------------------------------------------------------------ | ---------- |
| `q`       | A trimmed literal substring, up to 100 Unicode code points; no embedded ASCII control characters | Empty      |
| `status`  | `active` or `archived`                                                                           | `active`   |
| `contact` | `all`, `email`, `phone`, or `none`                                                               | `all`      |
| `order`   | `newest` (descending ID) or `oldest` (ascending ID)                                              | `newest`   |
| `cursor`  | The previous page's 24-hex `nextCursor`                                                          | First page |

Search matches `name`, `company` or `email`, case-insensitively. It does not search notes or phone numbers. Regex punctuation is escaped by the persistence adapter; `.*`, brackets and backslashes are literal text. Whitespace-only `q` is an empty search. Oversized text, embedded controls, repeated fields, objects/arrays, unknown query keys and non-allowlisted filter values return 422.

`email` means nonempty email, `phone` means nonempty phone, and `none` means both are empty. Email and phone filters can match the same client. Contact, status, literal search, workspace scope and cursor predicates are combined in every query. Name/company/email matches cannot bypass the workspace condition.

The page size stays fixed at 25. Continue with `nextCursor` and the same `q`, `status`, `contact` and `order`. Changing a filter or order starts again without a cursor. A cursor marks a position, not a frozen snapshot or a saved set of filters. Concurrent data changes may affect later pages. No total count is computed. Each list operation has a 3-second MongoDB execution limit; timeout/failure uses the safe generic 500 contract. Literal substring matching can scan records within the scoped workspace; response/time bounds do not promise an indexed full-text search.

The browser waits 300 ms after a nonempty search change, cancels pending work immediately when criteria change, and shows loading for the new criteria. Search controls remain mounted to preserve focus. Old search/page responses cannot overwrite or append to a newer list. Pagination retains all active filters and prevents simultaneous duplicate page submissions. A page failure keeps the already loaded rows and offers explicit retry of that page. A first-page failure offers explicit reload with the same filters. The displayed count is the number currently loaded, never an invented workspace total.

## Draft proposals — PRP-001

All endpoints use the existing live-session Bearer authentication and `Cache-Control: no-store`. Any current workspace member can manage drafts. The workspace comes exclusively from the authenticated identity.

| Method | Path                    | Input                                | Success                      |
| ------ | ----------------------- | ------------------------------------ | ---------------------------- |
| POST   | `/api/v1/proposals`     | Draft details                        | 201, full proposal           |
| GET    | `/api/v1/proposals`     | Optional `cursor`, `order`           | 200, `{ items, nextCursor }` |
| GET    | `/api/v1/proposals/:id` | None                                 | 200, full proposal           |
| PUT    | `/api/v1/proposals/:id` | Draft details plus current `version` | 200, updated proposal        |

Draft details:

```json
{
  "clientId": "24hexClientIdFromThisWorkspace",
  "title": "Restaurant brand identity",
  "summary": "Logo and a visual identity guide",
  "terms": "Two revision rounds; 10 working days",
  "currency": "EGP",
  "items": [
    { "title": "Logo design", "quantity": 3, "unitPrice": "1250.50" },
    { "title": "Identity guide", "quantity": 1, "unitPrice": "600" }
  ]
}
```

`summary` and `terms` default to empty strings. All text is trimmed. Title and each item title require 2–120 Unicode code points; summary allows 3000, terms 2000. Include 1–50 items, with integer quantity 1–10000. Client IDs must be 24-hex identifiers. Unknown fields are rejected at both the root and item level: `workspace`, `status`, client snapshots, calculated totals and line totals cannot be assigned by callers.

This release explicitly supports EGP/USD/EUR/SAR with two decimal places. A unit price is a nonnegative ASCII decimal **string**, with 1–10 integer digits and up to two fraction digits. Leading zeros and outer whitespace are accepted. Signs, exponent notation, comma separators, bare `.5`, trailing `1.`, more fraction digits, non-string prices and unsupported currencies return 422. Zero-priced items are allowed. Unit price, each line and the overall total cannot exceed 100,000,000,000 minor units (one billion whole units). No taxes, discounts, exchange conversion or silent rounding are applied. Changing currency replaces the pricing unit and does not convert amounts.

The server parses prices and multiplies/sums with integer arithmetic. Responses expose `unitPriceMinor` and `totalMinor` for each item, and proposal `totalMinor`/`itemCount`. For the example above the total is 435150 minor units. The browser preview uses the same exact-input policy; the saved response is authoritative.

A full response also contains `id`, `title`, `summary`, `terms`, `currency`, `status`, positive `version`, ISO `createdAt`/`updatedAt` and a `client` snapshot with `id`, `name`, `email`, `phone`, `company`. Client notes, workspace IDs and MongoDB metadata are omitted. Name-only clients are valid. Lists return the summary fields, including the client snapshot, and omit `items`, `summary` and `terms`.

Create always produces a private `draft`, version 1. It requires an active client in the same workspace. Foreign, nonexistent and archived clients return the same `422 PROPOSAL_CLIENT_UNAVAILABLE`. Existing drafts may retain their original client after archive; selecting another archived client is rejected. An explicit draft save captures that client's current contact details in the same transaction as the proposal write. Later contact edits do not change a proposal on read. There are no sending, public links, acceptance, deletion or duplication endpoints in this story.

Updates replace all draft details and require the current positive safe-integer version. They atomically match workspace, ID, `status: draft` and version. A stale edit returns `409 PROPOSAL_CONFLICT`; any non-draft state returns `409 PROPOSAL_LOCKED`. The API exposes non-draft records read-only in preparation for later workflow stories. Foreign and missing proposal IDs both return `404 PROPOSAL_NOT_FOUND`. Invalid IDs, versions, query fields, currencies or details return `422 VALIDATION_ERROR`. Removed membership or invalid credentials return 401 before any write. Transaction failures roll back both proposal changes and the internal client reference reservation; unexpected failures use the generic 500 contract.

Lists contain up to 25 records ordered by immutable ID, descending by default (`order=newest`) or ascending with `order=oldest`, with a last-returned-ID `nextCursor` when another page exists. Only `cursor` and `order` query parameters are accepted. Keep the same order for later pages and omit the cursor when changing order. Every page remains scoped, including a foreign cursor; there is no total count or frozen snapshot. List execution has a 3-second MongoDB time limit. Concurrent changes may affect later pages.

Browser routes are `/proposals`, `/proposals/new`, `/proposals/:id` and `/proposals/:id/edit`. Active client selection supports literal search and pagination using CLT-002. After selection, the picker collapses to a client summary and an explicit change button; changing/cancelling selection preserves the current client and restores focus to that button. Closing the picker cancels its pending search/page requests. List/search requests are cancelled and stale results discarded on criteria, workspace or route changes. Protected writes retry only after an explicit authentication 401 and coordinated refresh. Simultaneous submissions are guarded before form validation resolves. Network/timeout/server failures never trigger automatic writes: the form disables another submission and directs the user to inspect the list/saved draft. Conflicts keep typed input until the user explicitly confirms loading the latest version. Cancel/back controls ask before discarding dirty edits; page unload also warns while edits remain unsaved.

## Reviewed proposal sharing — PRP-002

Owner endpoints require the same live Bearer session/workspace membership as draft endpoints. Every current workspace member may issue/revoke grants. Workspace IDs, sender identity, digests and credentials are never accepted from the request body.

| Method | Path                                 | Body                                 | Success                                  |
| ------ | ------------------------------------ | ------------------------------------ | ---------------------------------------- |
| GET    | `/api/v1/proposals/:id/share`        | None                                 | 200, sharing state                       |
| POST   | `/api/v1/proposals/:id/share`        | `{ "version": 1, "days": 7 }`        | 201, sharing state plus one-time `token` |
| POST   | `/api/v1/proposals/:id/share/revoke` | `{ "version": 2 }`                   | 200, sharing state                       |
| POST   | `/api/v1/public/proposals/read`      | `{ "token": "<issued credential>" }` | 200, anonymous proposal document         |

Sharing state contains `proposalVersion`, `proposalStatus`, ISO `updatedAt`, and nullable `share`. Share metadata contains ISO `issuedAt` / `expiresAt` / nullable `revokedAt` and `state: active|expired|revoked`, plus boolean `allowResponse` (PRP-003); it never contains a digest or raw credential. Only a successful issue response contains `token`. Unknown request fields and invalid versions/lifetimes return 422.

Lifetimes are integer 1–30 days from the server clock. Issuing a draft atomically moves it to `sent`, installs the grant and increments the proposal version. The reviewed version must match; a concurrent edit/issue/revoke produces 409, so an unseen revision is never shared. Sent proposals can renew a grant; accepted/rejected/expired proposals cannot issue another. Renewal replaces the one current digest and invalidates the preceding link immediately. Revocation clears the digest, records its timestamp and increments the version. Repeating revocation with the current version is idempotent. It never unlocks proposal content. Foreign/nonexistent proposal IDs return the same 404 as private reads; revocation before a grant exists returns 404.

Each credential is 32 random bytes encoded as 43 base64url characters. Only SHA-256 digests are stored, with a unique partial index. A copied browser link has the form `<web-origin>/share/proposal#<token>`. The fragment stays in the browser; the frontend sends it only as a JSON POST body, with credentials omitted. It does not fetch authentication or require a client account. The anonymous endpoint cannot enumerate proposals by IDs and grants access to one document only. Unknown/malformed/expired/revoked grants uniformly return `404 PROPOSAL_SHARE_UNAVAILABLE`. PRP-003 adds the public final-decision endpoint described below.

The public document allowlist is title, summary, terms, currency, priced items, totalMinor, sent/accepted/rejected status, client name/company, captured senderName, issuedAt, expiresAt, server-relative validForSeconds, canRespond and nullable decision metadata (PRP-003). It excludes workspace/client/proposal IDs, client email/phone/notes, owner account data, versions, digests and internal timestamps. Content remains the locked proposal; contact snapshots are not silently refreshed. Expiry is checked in the database lookup, without TTL cleanup or a public response cache. Public lookup has a 3-second execution limit. Anonymous reads are limited to 60 per IP per minute in the current process and return 429 with Retry-After on excess.

Owner/public API responses use Cache-Control: no-store; the public path also sets no-referrer and noindex/noarchive headers. The shared page has noindex/nofollow metadata and no-referrer policy. It clears/rechecks content at its grant deadline, when its fragment changes, on visibility restoration and on BFCache restoration. Revocation denies subsequent reads; content already seen or copied cannot be erased remotely. A failed read offers an explicit retry; changed/closed loaders abort old requests. Keyboard skip navigation preserves the fragment.

The owner reviews a draft before issuing a link, chooses its lifetime and copies/sends it themselves. No email or other message is sent. Raw links remain only in current component memory/DOM and the user's clipboard/history after copying/opening; reload cannot recover them, so the user explicitly renews a missing link. Ambiguous issue/revoke responses block another write until an explicit state reload; version conflicts require reloading and reviewing current content. As with other protected operations, an explicit authentication 401 can trigger coordinated renewal and one retry; network/server errors never replay writes automatically.

## Client decisions and accepted projects — PRP-003

Freshly issued or explicitly renewed grants permit a final response. `share.allowResponse` is included in private sharing metadata; legacy grants without that field remain read-only (`false`) until their owner renews them. Public reads add `canRespond` (true only for a sent proposal with response permission) and nullable `decision: { outcome: accepted|rejected, at: ISO date }`. Private full proposal reads add the same decision metadata and nullable `projectId`; summaries remain unchanged. Request IDs, grant digests and project IDs are never exposed publicly.

`POST /api/v1/public/proposals/decide` requires an `Origin` exactly matching `WEB_ORIGIN`, including for CLI clients. No account/cookie is required. The body is strict:

```json
{
  "token": "<current 43-character grant credential>",
  "decision": "accept",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

`decision` is `accept` or `reject`; `requestId` must be a UUID v4 and is canonicalized to lowercase. A successful response is `200 { success: true, data: { status: "accepted", decidedAt: "<ISO date>" } }` (or `rejected`). Only `sent` can transition to a final decision. Acceptance saves the decision, creates one active project from the frozen agreement/client snapshot, and links it to the proposal in one MongoDB transaction. Rejection creates no project. Neither decision changes the agreement or refreshes contact details; an archived client can still have an already-shared agreement accepted.

Replaying the **same current grant, request ID and outcome** returns the original result/time without another version increment or project. An independent attempt or opposite choice after a final decision returns `409 PROPOSAL_DECISION_CONFLICT`. This replay permission remains bounded by grant access: expired/revoked/replaced/read-only/unknown grants uniformly return `404 PROPOSAL_SHARE_UNAVAILABLE`, even for previously committed attempts. Invalid payloads return `422 VALIDATION_ERROR`, untrusted/missing origins return `403 UNTRUSTED_ORIGIN`, and unexpected failures return a generic 500. Decisions are independently limited to 20 requests per IP per 15 minutes in the current process; excess returns 429 with Retry-After. All public responses retain no-store/no-referrer/noindex headers.

Anyone holding a response-enabled grant can decide. This records a bearer-link decision; it does not authenticate the client's identity or provide an electronic signature. Owners must review this permission before sharing. Final decisions cannot be edited or replaced; accepted/rejected proposals cannot issue another grant, but the owner can revoke current access without deleting the decision/project.

The browser asks for explicit confirmation, moves focus into confirmation and restores it on cancellation. A synchronous guard prevents repeat submission. Network/server/invalid-response errors never cause an automatic write retry: controls pause until the user explicitly reads current state. The same attempt ID/choice survives those in-page rechecks and is reused only after explicit confirmation if the proposal remains sent; navigation/reload clears this memory. A read after a lost successful response reveals the final decision. Competing viewers see conflict and must recheck. Public decision requests omit cookies and authorization.

## Project management — PRJ-001

All routes require a live Bearer session and current workspace membership. Every current role can manage projects in its own workspace. Scope comes from the session only; responses use no-store.

| Method | Path                        | Input                            | Success                    |
| ------ | --------------------------- | -------------------------------- | -------------------------- |
| GET    | /api/v1/projects            | status, cursor, order parameters | 200, { items, nextCursor } |
| POST   | /api/v1/projects            | { clientId, title, summary? }    | 201, full manual project   |
| GET    | /api/v1/projects/:id        | None                             | 200, full project          |
| POST   | /api/v1/projects/:id/status | { version, status }              | 200, updated full project  |

Unknown fields in list queries or write bodies, duplicate/object list query values, malformed IDs or invalid versions return 422 VALIDATION_ERROR. Missing/foreign projects return the same 404 PROJECT_NOT_FOUND. Invalid/revoked sessions or removed membership return 401.

Manual creation trims title and summary. Title requires 2–120 Unicode code points and rejects C0/DEL control characters; summary defaults to an empty string and permits 3000 code points. The client must be active in this workspace; archived/foreign/missing clients return 422 PROJECT_CLIENT_UNAVAILABLE. Creation reserves the client and captures id/name/company/email/phone inside one MongoDB transaction. Client notes and workspace IDs are omitted. Later contact edits or archival never alter the saved snapshot.

Full responses contain id, origin (manual/proposal), sourceProposalId, title, summary, terms, currency, items, totalMinor, client, acceptedAt, status, positive version and ISO createdAt/updatedAt. Manual projects have null sourceProposalId/currency/totalMinor/acceptedAt, empty terms and items; they start active at version 1. Proposal projects retain their accepted content, currency, prices and acceptance time. There is no manual financial agreement or task progress in this story.

Lists default to status=all, otherwise accept active/on_hold/completed/cancelled. Pages contain at most 25 summaries sorted by descending ID (`order=newest`, default) or ascending ID (`order=oldest`); nextCursor is a nullable last returned ID. Summaries contain id/origin/sourceProposalId/title/client/status/version/createdAt/updatedAt and omit agreement content and pricing. Cursor is a validated 24-hex ID. MongoDB listing is bounded to 3 seconds; no full count is performed. Filter or order changes require a fresh first page, and subsequent pages keep both choices.

Allowed transitions:

| Current   | Allowed next                  |
| --------- | ----------------------------- |
| active    | on_hold, completed, cancelled |
| on_hold   | active, cancelled             |
| completed | None                          |
| cancelled | None                          |

No-op or forbidden transitions return 409 PROJECT_STATUS_INVALID. Completed/cancelled are final; resume a held project before completing it. A stale version returns 409 PROJECT_CONFLICT. The write atomically matches workspace, ID, version and current status, then increments version; concurrent attempts cannot both succeed. Legacy projects lacking version read as 1 and become version 2 on their first successful status change. Status writes change only status/version/update time; agreement/contact/source fields and the original proposal decision remain unchanged.

Bootstrap installs the unique partial project_proposal_source index, restricted to ObjectId sourceProposal values, before removing the exact legacy workspace_1_sourceProposal_1 unique index. It permits multiple manual projects while retaining one project per workspace/source proposal. Concurrent bootstraps tolerate only an already-removed legacy index; other failures stop startup.

Browser routes are /projects, /projects/new and /projects/:id. Filtering cancels and discards stale loads and resets pagination. Status changes require focused confirmation, explain final states, restore focus on cancellation and announce successful saves. Conflicts and ambiguous status responses block further writes until an explicit read; manual creation with an ambiguous outcome requires inspecting the list. A confirmed create remains blocked until navigating to its saved project. Network/server errors never replay writes; the established explicit-authentication-401 renewal policy still applies. Manual creation warns on page unload or its back action while unsaved.

## Project tasks — TSK-001

All routes require the existing authenticated live workspace membership and return no-store responses. Workspace/project scoping is enforced by the server; unknown/foreign projects return 404 TASK_PROJECT_NOT_FOUND, and unknown/foreign tasks within an authorized project return 404 TASK_NOT_FOUND. Bodies and query fields are strict; GET and mutations accept no query parameters.

| Method | Route under /api/v1/projects/:projectId | Body                                          | Success   |
| ------ | --------------------------------------- | --------------------------------------------- | --------- |
| GET    | /tasks                                  | None                                          | 200 board |
| POST   | /tasks                                  | version, title, optional description/priority | 201 board |
| PUT    | /tasks/:taskId                          | version, title, optional description/priority | 200 board |
| POST   | /tasks/:taskId/move                     | version, status, beforeTaskId                 | 200 board |
| DELETE | /tasks/:taskId                          | version                                       | 200 board |

The common envelope contains data: { projectId, projectStatus, version, tasks }. Each task exposes only id/title/description/priority/status and ISO createdAt/updatedAt. Internal workspace IDs, reservation counters and persistence metadata are excluded. A project without a stored board reads as version 0 and an empty tasks array without causing a write. Creation persists version 1; every later successful mutation increments the revision, including deletion of the last task. A stale board revision returns 409 TASK_CONFLICT; version must be a safe nonnegative integer below Number.MAX_SAFE_INTEGER.

Title is trimmed, requires 2–120 Unicode code points and rejects C0/DEL controls. Description is trimmed, defaults to an empty string and allows 2000 code points. Priority is low/normal/high and defaults to normal; a new task starts todo. PUT replaces content but cannot change status, IDs or timestamps. Status is todo/in_progress/done, with all transitions allowed. Move requires beforeTaskId: a task ID in the destination lane, or null to append. It cannot reference itself; invalid anchors return 422 TASK_POSITION_INVALID. Nonmoved tasks keep their relative order. Tasks are returned in stable board order; each lane renders its matching subsequence.

The board has at most 200 live tasks and is read in one bounded operation, without pagination. Creating at the cap returns 422 TASK_LIMIT_REACHED; deletion releases a slot. Deletion is permanent after UI confirmation and never deletes the project or accepted agreement. Invalid content/IDs/payloads return 422 VALIDATION_ERROR.

Writes transactionally reserve the scoped project before reading and replacing the revision-matched board. Active and on_hold projects allow writes; completed/cancelled reject them with 409 TASK_PROJECT_LOCKED and remain readable. Closing a project races safely with task changes. Reservation does not change the visible project version/update timestamp or agreement. Failed mutations roll back the reservation and board together.

The frontend prevents repeated submissions and does not optimistically rearrange tasks before a saved response. Conflict, missing resources, invalid positions or uncertain results require an explicit current-state read before another write. Unsaved form content is preserved until confirmed review; a recovered terminal project refreshes its project header and hides editing controls. Only an explicit authentication 401 permits coordinated token renewal and one retry. Network/server/invalid-response failures never automatically replay a mutation. Tasks remain private; progress and client visibility belong to TSK-002.

## Defined task progress and client visibility — TSK-002

Private board reads and every successful task mutation add progress and clientView. The private task allowlist adds clientVisible (boolean). New and legacy missing values default to false; only an explicit stored true is eligible for the client projection. No public endpoint, project grant or client-portal route is introduced. The existing proposal grant still grants access to its frozen proposal only.

Progress is { total, done, percentage }, calculated from the current live task array: done status contributes one, other statuses contribute zero, regardless of priority. Nonempty percentages round done × 100 / total to the nearest integer, capped at 99 when any task remains unfinished; all done yields 100. Empty arrays yield { total: 0, done: 0, percentage: null }. Deleted tasks leave the denominator. Counts and percentage are derived on every response, not persisted. Moving or deleting a task can change progress; content/priority/visibility edits do not change the full-board ratio. Task completion never changes project status, and terminal projects retain the actual task-derived percentage.

clientView is { progress, tasks }, where tasks exposes only title/description/status for clientVisible=true tasks, in their existing relative order. Its progress uses only that subset. It never includes hidden-task counts or names, task/project/workspace IDs, priorities, versions or dates. The owner sees this preview through the protected board API; it is not a public response. A future portal must authorize a scoped project grant independently and use this projection rather than the private board DTO.

POST /api/v1/projects/:projectId/tasks/:taskId/visibility accepts only { version: <current board revision>, clientVisible: true|false }, returning 200 with the updated private board. JSON boolean is required; strings/numbers/missing flags, extra fields or query parameters return 422 VALIDATION_ERROR. Normal create/edit payloads reject clientVisible so content changes cannot accidentally reset or publish a task. The operation sets an explicit target value, never a blind toggle. Like other accepted writes it increments the board revision, even for an identical target, and updates the selected task timestamp without changing order/content/status, the visible project version or the accepted agreement.

The same live workspace membership, project/task scoping, transactional reservation, stale-revision 409 TASK_CONFLICT and terminal-project 409 TASK_PROJECT_LOCKED rules apply. Unknown/foreign project/task identities retain the established 404 behavior. Persistence failure rolls back both the flag and reservation. GET does not migrate records or advance versions; a later saved board materializes any missing flags as false.

Visibility requires focused confirmation describing the permitted title, description and status, with cancellation initially focused and trigger restoration. Conflicts/uncertain writes require an explicit read before another confirmation; no network/server retry repeats a visibility change. A native progress element presents the saved server ratio, and the owner preview clearly states that no client portal or project link is available yet. Terminal projects expose both progress and preview for reading while hiding write controls.

## Invoices — INV-001

All endpoints require a bearer token with a live workspace membership and return Cache-Control: no-store. Workspace identity comes only from authentication.

| Method | Endpoint                                        | Behavior                                                                               |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| POST   | /api/v1/invoices                                | Create a private numbered draft; 201, including a replay of the same committed request |
| GET    | /api/v1/invoices?cursor=<ObjectId>&order=newest | Newest/oldest first by _id, 25 summaries, nextCursor or null                           |
| GET    | /api/v1/invoices/:id                            | Full private saved draft, or scoped 404                                                |

Creation accepts only requestId (UUIDv4), clientId, optional projectId (ObjectId or null), title, optional summary/terms, currency and items. Item fields are title, integer quantity and decimal-text unitPrice. Omitted summary/terms default to empty strings and projectId to null. No workspace, number, status, version or computed amount fields are accepted. Creation/read accept no query fields; list accepts optional cursor and order=newest/oldest (default newest). Keep the order for subsequent pages and start without a cursor when changing it.

An active client must belong to the current workspace. An optional project must belong to that same workspace and selected client; all project statuses are allowed. Invoice items are entered explicitly and never change or derive a project's agreed total. Contact snapshot reservation is transactional and does not change the client public version/updatedAt. Saved records retain client and project identity snapshots when contact details later change or a client is archived. INV-002 refreshes the client snapshot on draft edits and captures it definitively at issuance; later changes cannot alter issued content.

Title and item titles: 2–120 Unicode code points; summary up to 3000; terms up to 2000; 1–50 items; integer quantity 1–10000. EGP/USD/EUR/SAR each use two decimal places. Nonnegative price strings are parsed to integer minor units; BigInt calculates products/sum before converting bounded results to JSON numbers. The cap is 100,000,000,000 minor units (one billion major units). Extra precision, scientific notation and ambiguous decimal formats are rejected, with no silent rounding. Zero-cost drafts are permitted; no tax/discount fields or payment status is invented.

Numbers use INV-000001 and grow monotonically within each workspace, without annual reset or truncation beyond six digits. Sequence and invoice are written in the same Mongo transaction, protected by unique workspace+sequence and workspace+requestId indexes. Provisioning an empty zero counter outside that transaction consumes no number. Failed insertion rolls back both number and client reservation. The safe-integer sequence limit fails closed. Do not remove/reset counters independently of invoice data. This is internal workspace numbering, not a claim of jurisdiction-specific invoice compliance.

requestId belongs to one logical creation. The server normalizes content before comparison: a committed replay returns the saved invoice, even after contact archive; different content with that key returns 409. Keys are workspace-scoped and private. The browser creates one key per form and blocks further writes after success or an unknown response, providing ledger review. It never automatically replays a network/5xx failure. An explicit 401 may use the existing single session renewal/retry.

Summary fields: id, number, sequence, title, client (id/name/email/phone/company), project (id/title/clientId or null), status (draft or issued), currency, totalMinor, itemCount, version, issuedAt and senderName (null before issuance), createdAt, updatedAt. Detail also includes summary, terms and items (title/quantity/unitPriceMinor/totalMinor). DTOs exclude workspace, requestId, private client notes and Mongo fields.

Errors: INVOICE_NOT_FOUND 404; INVOICE_CLIENT_UNAVAILABLE / INVOICE_PROJECT_UNAVAILABLE / VALIDATION_ERROR 422; INVOICE_REQUEST_CONFLICT / INVOICE_NUMBER_EXHAUSTED 409. INV-001 introduced creation and reading; the update, issuance and public reading additions are documented below. Deletion remains unavailable; manual payment endpoints are documented in PAY-001 below.

## Draft editing, issuance and public invoice links — INV-002

Private endpoints retain live membership, workspace scoping, strict fields and no-store responses. Mutations require the current positive safe-integer version; they accept no query parameters.

| Method | Endpoint                          | Body                                                         | Success                      |
| ------ | --------------------------------- | ------------------------------------------------------------ | ---------------------------- |
| PUT    | /api/v1/invoices/:id              | version and the creation content fields, excluding requestId | 200 invoice                  |
| POST   | /api/v1/invoices/:id/issue        | version                                                      | 200 invoice                  |
| GET    | /api/v1/invoices/:id/share        | None                                                         | 200 sharing state            |
| POST   | /api/v1/invoices/:id/share        | version, days                                                | 201 sharing state plus token |
| POST   | /api/v1/invoices/:id/share/revoke | version                                                      | 200 sharing state            |
| POST   | /api/v1/public/invoices/read      | token                                                        | 200 public document          |

PUT is draft-only. Number, sequence, creation key and original creation fingerprint never change. Content is revalidated with the same exact-price rules as creation; an optional project must match the client and workspace. Keeping an existing archived client is allowed; choosing another client requires it to be active. Client snapshot reservation, legacy fingerprint preservation and the version-matched write commit together. Issued edits and repeated issuance return 409 INVOICE_LOCKED; stale draft versions return 409 INVOICE_CONFLICT.

Issuance is separate from link creation. A transaction reserves the existing client (including an archived one), captures its current contact fields, the authenticated workspace name as senderName and the server clock as issuedAt, then changes draft to issued and increments version. The financial document, client snapshot, sender and issuance date are fixed thereafter. Issuance does not allocate another invoice number or alter a project agreement. Reversal, cancellation and deletion remain unavailable; manual payment recording uses the independent ledger documented below.

The creation fingerprint is a SHA-256 digest of normalized original content, kept internal. Creation replay compares against that original identity even after editing or issuance, and returns the latest saved invoice for a matching original request. Changed content under that key remains a 409 INVOICE_REQUEST_CONFLICT. Older INV-001 drafts without a fingerprint retain their previous comparison until the first edit/issuance transaction records the original identity; failed changes roll back this preservation.

Only issued invoices may be shared; drafts return 409 INVOICE_NOT_ISSUED. days must be an integer from 1 through 30; the UI defaults to 7. Issuance, edits, link renewal and revocation use the same invoice version. One current random 256-bit secret is hashed for storage; only successful link creation returns the 43-character base64url token. Renewal invalidates the old secret atomically. Revocation clears its digest and retains the dates; an already-revoked link returns its current state with a matching version. Neither operation changes frozen invoice content or restores editing.

Sharing state contains invoiceVersion, invoiceStatus, updatedAt and a nullable share with issuedAt/expiresAt/revokedAt/state (active, expired or revoked). Link issuance date is distinct from invoice issuance date. GET never returns a secret. The browser holds the secret only in component memory and constructs /share/invoice#TOKEN; copying and sending are manual. Losing the response requires an explicit state read, followed by confirmed renewal to recover a usable secret.

Anonymous reading uses POST body, without cookies or Authorization. Public headers are Cache-Control: no-store, Referrer-Policy: no-referrer and X-Robots-Tag: noindex, nofollow; page metadata also disables indexing and referrers. Reads are limited to 60 per minute per IP and queried with a three-second database limit. Unknown, malformed, expired, revoked and superseded tokens return the same 404 INVOICE_SHARE_UNAVAILABLE. Equality with expiry is unavailable. Public GET, financial mutations and response/acceptance controls are absent.

The public allowlist is number/title/summary/terms/currency/items/totalMinor/status=issued, client name/company, senderName, invoice issuedAt, link expiresAt and server-relative validForSeconds. It excludes contact email/phone, client notes, all internal IDs, project links, sequence, versions, creation identity and digest. Invoice status makes no claim about payment.

Browser routes add /invoices/:id/edit and /share/invoice. Draft edits preserve typed input on conflict until confirmed reload. Explicit issuance requires review and confirmation; reloading a conflict resets review. Unknown writes block further mutations until an explicit current read, and never automatically replay network/server failures. Public hash changes, expiry timers and restored background pages abort previous reads, remove old content and recheck permission; network failures offer explicit retry without a polling loop.

## Manual invoice payments — PAY-001

Payment endpoints require the existing bearer session and live workspace membership, and return no-store responses. The workspace is derived from authentication; a public invoice grant grants no ledger access. All payloads and queries are strict. All routes accept no query parameters.

| Method | Endpoint                                             | Body                                                                | Success                                |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| GET    | /api/v1/invoices/:invoiceId/payments                 | None                                                                | 200 ledger                             |
| POST   | /api/v1/invoices/:invoiceId/payments                 | version, requestId, amount, paidOn, method, optional reference/memo | 201 ledger, including committed replay |
| POST   | /api/v1/invoices/:invoiceId/payments/:paymentId/void | version, reason                                                     | 200 ledger                             |

The ledger DTO contains invoiceId, invoiceStatus (draft/issued), currency, totalMinor, paidMinor, remainingMinor, paymentStatus, version and payments. Each payment exposes id, amountMinor, paidOn, method, reference, memo, createdAt, voidedAt and voidReason. It omits workspace, creation request keys and storage metadata. A ledger without any entries is virtual revision 0: GET does not create a database record. Reading drafts is allowed, but recording/correcting requires an issued invoice.

amount is positive decimal text using the invoice currency and the same exact minor-unit rules as invoice pricing. No negative/zero amount, scientific notation, extra precision, supplied currency/computed totals or overpayment is accepted. paidOn is a real YYYY-MM-DD calendar date from 1900-01-01 through the current UTC day; historical deposits may precede issuance. method is bank_transfer/cash/wallet/other; optional reference and memo are trimmed, default to empty strings and allow 100/500 Unicode code points. Disallowed control characters are rejected. The system records a received payment manually, without collecting funds or initiating a bank action.

paidMinor is the integer sum of nonvoided entries; remainingMinor is totalMinor minus that sum. The derived paymentStatus is not_issued for drafts, unpaid for an issued positive-total invoice without active payments, partially_paid for a positive remaining balance with payments, or paid when the remaining amount is zero. An issued zero-total invoice is paid without creating a zero payment. These fields are derived on every read/saved response and are never stored on the invoice. Invoice status, version, numbering, financial/contact snapshot, project agreement and public grant remain unchanged.

Each invoice has one workspace-scoped ledger with a unique index and at most 200 entries, including voided history. The common safe nonnegative version is independent of the invoice revision. Initial creation relies on the unique index; later writes replace the bounded entries array only when the stored version matches, incrementing once. This single-document commit is atomic. Simultaneous registrations or correction/registration races have one winner; a stale write returns 409 PAYMENT_CONFLICT, without changing the balance or consuming a payment slot. Invoice financial data is immutable once issued, so the application reads that scoped reference through a port without writing/reserving the invoice or opening a cross-document transaction.

requestId is a UUIDv4 for one logical payment attempt. Normalized identical content with that key returns the current ledger even with a stale version, or after that payment was voided. Changed content under a committed key returns 409 PAYMENT_REQUEST_CONFLICT. Concurrent same-key registration returns the same saved entry; a losing unique/CAS attempt rereads only to recognize the committed replay, never to repeat a different write. Keys are scoped to one workspace/invoice and never appear in the ledger DTO.

Correction accepts a trimmed reason of 2–300 Unicode code points. It sets voidedAt and voidReason while retaining the entry amount/date/method/reference/memo/creation time, removes its contribution from the sum and increments the ledger version. Already-voided entries with a current version return the existing history unchanged; an old version still conflicts. This is a record correction, not a refund. No edit, deletion, unvoiding, negative payment or refund route exists.

Errors: PAYMENT_INVOICE_NOT_FOUND / PAYMENT_NOT_FOUND (404), PAYMENT_INVOICE_LOCKED / PAYMENT_CONFLICT / PAYMENT_REQUEST_CONFLICT (409), PAYMENT_OVERPAYMENT / PAYMENT_LIMIT_REACHED / VALIDATION_ERROR (422). Missing or no-longer-live membership retains the existing authentication behavior. Private memo/reference/history and derived payment state are absent from the current frozen public invoice page; client portal access is a separate future story.

The invoice review displays balances and chronological records, with newest entries first. Registration and correction require explicit confirmation; corrections start focus on cancellation. Unknown responses/conflicts/overpayment block further writes until an explicit ledger read. The open editor retains input and its original creation key across that read, shows current balances/records and requires a new confirmation; a committed-but-lost result therefore cannot create another entry on retry. Closing and starting a distinct registration creates a fresh key only after recovery. No network/server failure replays a mutation automatically; explicit authentication 401 retains the established coordinated session renewal and one retry.

## Workspace overview — DSH-001

GET /api/v1/dashboard requires bearer authentication and live membership, derives its workspace exclusively from that identity, rejects all query parameters and returns Cache-Control: no-store. Success is 200 with the normal success/data envelope. There is no mutation or public route.

Data contains asOf (server read-start ISO date), clients {active, archived}, proposals {draft, sent, accepted, rejected, expired}, projects {active, on_hold, completed, cancelled}, tasks {todo, in_progress, done}, invoices {draft, issued}, finances and expiringProposals. Counts are nonnegative safe integers. Sent proposals whose stored link expiry is at or before asOf count as expired for this view without writing the proposal. Final accepted/rejected states remain final; sent counts can include revoked links. Task counts include private and visible tasks on existing scoped active/on_hold projects; closed and orphan boards are excluded.

Each finances row is {currency, invoicedMinor, receivedMinor, outstandingMinor}. These amounts are exact nonnegative integer strings, not JSON numbers: aggregate workspace totals can exceed the JavaScript safe-integer range. Rows occur only for currencies with issued invoices, ordered EGP/USD/EUR/SAR, including a zero-total issued invoice. Draft invoices, voided payment records, orphan ledgers and foreign-workspace invoices/ledgers are excluded. Issued invoices remain included after client archive/project closure. Received is manually recorded active money across all dates, not a period-based accounting revenue measure; outstanding is issued total minus received. No exchange conversion or all-currency total is returned.

expiringProposals contains at most five {id, title, expiresAt} rows sorted by expiry then ID, restricted to current unrevoked sent grants with digest and future expiry. This is a proposal-link deadline list, not project delivery dates. Internal grant secrets/digests, contacts, payment notes/references/attempt keys and underlying financial document details are absent. Each aggregate has a three-second limit. All queries run sequentially in one primary snapshot transaction, including both financial aggregates, so an interleaved committed payment cannot mix old counts with new balances. Storage/read failure returns a safe error rather than zero balances.

## Client portal grants and live reading — PRT-001

Management requires bearer authentication and current workspace membership, following existing client-management permissions for owner/admin/member. The workspace is derived from identity. Responses have Cache-Control: no-store. Portal revision is independent of client/project/task/invoice/payment versions; missing grant state is virtual revision zero.

| Method | Endpoint                                 | Input                                              | Success                  |
| ------ | ---------------------------------------- | -------------------------------------------------- | ------------------------ |
| GET    | /api/v1/clients/:clientId/portal         | None                                               | 200 state                |
| POST   | /api/v1/clients/:clientId/portal         | version, days                                      | 201 state plus token     |
| POST   | /api/v1/clients/:clientId/portal/revoke  | version                                            | 200 state                |
| GET    | /api/v1/clients/:clientId/portal/preview | Optional projects/invoices query cursors           | 200 private preview page |
| POST   | /api/v1/public/portal/read               | token; optional nullable projects/invoices cursors | 200 public page          |

All bodies and queries are strict. Management accepts no query except preview's two optional 24-hex ID cursors. version is a nonnegative safe integer below Number.MAX_SAFE_INTEGER. days is an integer 1–30. State contains client {id,name,company,archived}, version and nullable share {issuedAt,expiresAt,revokedAt,state:active/expired/revoked}; GET never contains a token/digest or contact/notes. Portal grant storage is unique by workspace/client, with a unique active string digest. First creation reserves an active client and inserts revision one in one transaction; renewal reserves the client and updates its current portal revision. Both preserve public client version/updatedAt, and failed grant writes roll back the private reservation. Revocation clears digest and increments the portal revision; matching current repeated revocation preserves the first dates and revision. Stale changes return 409 PORTAL_CONFLICT. Archived clients cannot receive new grants but can have existing grants revoked.

Grant scope includes all same-workspace/same-client projects and issued invoice summaries, including future records until expiry/revocation. This is stated in the owner review/confirmation. Client archive/deletion or workspace deletion blocks public reading. Per-document selection is not part of this story. Existing invoice/proposal grants are neither created nor changed; their secrets cannot substitute for a portal capability. Portal capabilities never authorize owner endpoints or write actions.

Public reading uses the 43-character random 256-bit token from the URL fragment as a POST field, with cookies omitted and no bearer header. Headers also set Referrer-Policy: no-referrer and X-Robots-Tag: noindex,nofollow,noarchive; page metadata disables indexing/referrers. The read route is limited to 60 requests/minute/IP. Unknown, malformed, expired (including equality), archived, deleted, revoked and superseded capabilities return the same 404 PORTAL_SHARE_UNAVAILABLE. Unsupported public query/body fields also return that unavailable response. Storage errors produce the standard safe error rather than empty or zero balances. There are no public GET/state/mutation endpoints.

Both preview/public pages contain client {name,company}, current workspaceName, asOf (server read-start ISO date), up to five projects, up to five invoices, nextProjectCursor and nextInvoiceCursor. Public adds expiresAt and server-relative validForSeconds. Each project contains title, summary, status, visible progress {total,done,percentage} and ordered visible tasks {title,description,status}; no private task counts/IDs/priorities/timestamps appear. Empty visible tasks have null progress; unfinished work is capped at 99%. Each invoice contains number,title,currency,totalMinor,paidMinor,remainingMinor,paymentStatus,issuedAt. Only issued invoices qualify. Balances sum active, non-voided payments in the invoice's workspace; zero invoices are paid without synthetic records. Per-invoice numbers remain bounded exact minor units. Contact data, client notes, agreement/billing terms/items, invoice project associations and payment records/references/notes/reasons/attempt keys are absent.

A primary snapshot transaction reads eligibility and all page data sequentially, with a three-second limit per query. Owner preview uses the same projection without publishing a grant. Lists sort by descending ID and replace their current page, using separate cursors. Public cursors encrypt the ID with AES-256-GCM, a fresh 12-byte nonce, grant-digest key and list-kind authenticated data; a canonical 54-character cursor cannot cross grant/kind and contains no clear internal ID. Cursor possession adds no authority: every page rechecks the capability, workspace, client and invoice issuance. Preview's cursors are private raw IDs. Each board is bounded by the existing 200-task cap.

Browser routes are /clients/:id/portal (management/preview) and /share/portal#TOKEN (read-only client view). Grant creation requires explicit review/confirmation in the UI. Unknown/conflicting writes hide the previously held secret and block changes until an explicit current state/preview read, followed by review and confirmed renewal. Network/5xx writes never replay automatically; an explicit 401 follows the established one-renewal/retry policy. Public hash/expiry/background restoration remounts and cancels readers; network failure offers manual retry without polling. Revocation prevents subsequent reads and does not retract content already received before a new check.

## Workspace notifications — NTF-001

All routes require bearer authentication and live membership, return no-store, and derive both workspace and reader identity from the authenticated session. No public route exists.

| Route                               | Input                                                                                                | Successful data                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ |
| GET /api/v1/notifications           | Optional filter=all/unread and cursor; no other query keys                                           | items, unreadCount, nextCursor, asOf |
| GET /api/v1/notifications/summary   | No query keys                                                                                        | unreadCount, asOf                    |
| POST /api/v1/notifications/:id/read | Strict body {read: boolean, version: safe nonnegative integer below MAX_SAFE_INTEGER}; no query keys | id, read, readAt, version            |

An item is {id, kind, title, occurredAt, target:{type,id}, read, readAt, version}. Kind is proposal_accepted, proposal_rejected, invoice_issued, payment_received or payment_voided. Target is the scoped proposal/invoice detail. DTOs exclude contacts, financial amounts, ledger reference/memo/correction reason, request IDs, grant tokens/digests and internal reader IDs. asOf is the server read-start date.

The inbox derives already committed facts, including existing history. Proposal outcome/date must match the final stored status; invoices must be issued with an actual issue date. Payment creation and void dates create separate historical events only when their ledger and existing issued invoice share the current workspace. A void retains the original received event. Stable IDs have forms proposal:<id>:accepted/rejected, invoice:<id>:issued, payment:<invoiceId>:<entryId>:received/voided. Replayed business operations therefore do not duplicate notifications.

Pages contain at most 25 rows, newest occurredAt then event ID descending. A canonical private base64url cursor encodes the last date/ID and grants no authority. Four bounded source reads occur sequentially in one primary snapshot transaction; their pages are merged and unread totals added from the same snapshot. unreadCount remains the overall count for this reader even on later pages or the unread filter. The summary uses the same eligibility/receipt policy. Each aggregation has a 3000ms limit; storage failures return an error, never fabricated zeroes.

Unstored state is unread/readAt=null/version=0. A unique workspace/user/eventId receipt holds independent per-reader state. Source eligibility and revision comparison share a transaction; first receipt creation and subsequent CAS writes increment once. A matching-revision no-op preserves the revision and read date; unread clears readAt and a later read sets a new date. Old revision returns 409 NOTIFICATION_CONFLICT; unavailable source returns 404 NOTIFICATION_NOT_FOUND; malformed queries, cursors, IDs and bodies return 422 VALIDATION_ERROR.

The header bell displays the last known unread count, caps the visual badge at 99+ while its accessible description retains the exact count, and shows unavailable instead of zero on a failed read. /notifications offers all/unread filters, older pages, explicit refresh, document links and explicit per-item read/unread actions. Opening a document does not mark it read. A saved change triggers a fresh first-page read before updating the count. Unknown write outcomes or failed post-save reads clear the list/count and block further writes until explicit recovery; network/5xx never replay writes automatically. Explicit 401 retains coordinated session renewal and one authorized retry. No polling, email, push, automatic marking, mark-all or scheduler is included.

## Profile settings — SET-001

- GET /api/v1/settings/profile: returns the authenticated user's `{ id, name, email, version }` only.
- PUT /api/v1/settings/profile: strict `{ name, version }`, live bearer session and exact frontend Origin; returns the trimmed current profile. All roles may update their own name. A stale version returns 409 PROFILE_CONFLICT; invalid names/revisions or extra fields return 422 VALIDATION_ERROR.

Both responses are no-store. Names contain 2–100 Unicode code points after trimming, using registration's rule. The revision is independent of credentials/sessions; existing records begin at zero. No userId, email, role or workspace/security updates are accepted. Issued snapshots are preserved. See [PROFILE.md](PROFILE.md) for concurrency, uncertain-save recovery and identity refresh.

## Account security — SET-002

POST /api/v1/settings/password accepts strict `{ currentPassword, newPassword }` for the authenticated account, with exact frontend Origin and a live bearer session. An empty 204 confirms atomic password replacement and revocation of all account sessions, including the requester, and clears the refresh cookie. New passwords follow the registration policy (15–128 Unicode code points), retain whitespace and must differ from the current password. Incorrect current passwords return 422 CURRENT_PASSWORD_INCORRECT; invalid fields use 422 VALIDATION_ERROR. Five attempts per account per fixed 15-minute bucket are shared through Mongo; the cap returns 429 RATE_LIMITED. No 401, network or server-error automatic mutation retry is allowed in this flow. See [ACCOUNT-SECURITY.md](ACCOUNT-SECURITY.md) for transaction, race and uncertain-result policies.

## Workspace settings — SET-003

GET /api/v1/settings/workspace returns `{ id, name, slug, version, role, canEdit }` for the workspace in the live bearer session. PUT at the same path accepts strict `{ name, version }`, additionally requires exact frontend Origin, and permits only the current owner membership matching the actual workspace owner. Admins/members can read but cannot write. Names are trimmed and contain 2–100 Unicode code points. Stale revisions return 409 WORKSPACE_CONFLICT, invalid or extra fields return 422 VALIDATION_ERROR, and missing owner permission returns 403 WORKSPACE_ACCESS_DENIED. All responses are no-store. The rename preserves workspace identity, public grants and issued document snapshots. See [WORKSPACE-SETTINGS.md](WORKSPACE-SETTINGS.md) for authorization fences and explicit uncertain-result recovery.

## Password recovery — AUTH-004

Both endpoints require the exact frontend Origin, strict JSON bodies, no-store responses and their own 10-attempt/15-minute IP limit. They accept no identity, workspace or authorization fields and set no authentication cookies.

- POST /api/v1/auth/forgot-password: {"email":"ahmed@example.com"}. Normalizes/validates email using registration rules. Returns 202 {"success":true,"data":{"accepted":true}} for every valid mailbox, including missing, suspended/deleted accounts and mailbox throttling. No account lookup or provider request occurs in this HTTP path. Requests enter the same encrypted durable queue. Mailbox cooldown is 60 seconds and maximum five requests in an hour, shared across API instances/IPs through Mongo. Existing usable links remain valid until reset/expiry.
- POST /api/v1/auth/reset-password: {"token":"<43-character secret>","password":"<15–128 Unicode codepoints>"}. Does not trim passwords. Returns 204 after an atomic password update, invalidation of all issued sibling tokens and revocation of every account session across workspaces. No automatic login. Invalid, expired, consumed, unissued or ineligible-account tokens uniformly return 422 RECOVERY_INVALID. Other validation failures use VALIDATION_ERROR. Password policy rejection does not consume a token.
- 503 RECOVERY_UNAVAILABLE is a configuration-wide condition for disabled delivery, identical for all mailboxes. A DB failure is a generic 500. Generic acceptance confirms queue acceptance, never mailbox existence or provider delivery.

The 256-bit random secret travels in a fragment: /reset-password#token=<secret>. The reset form removes fragment/query data from browser history on mount, keeps the secret only in mounted memory and submits it only in the reset POST body. No token check GET, query token, browser storage, access token or automatic refresh is used on recovery pages. Reload requires reopening the email link or requesting a fresh link. Token lifetime is an absolute 30 minutes from the initial request; TTL cleanup is not the authorization check.

Reset and login write the same user record inside transactions. A login that verified an older password cannot create a session after reset. Concurrent reset has one winner; rotation either commits before revocation or fails, and any earlier access/refresh is unusable afterwards. Reset invalidates older unbound jobs through the user's passwordChangedAt fence when the worker reaches them. Another account is unaffected.

Resend retries use a stable idempotency key and the same encrypted token. The worker leases one job at a time with a 30-second lease, a 10-second provider timeout and a 30-second retry delay until expiry. Unknown/ineligible addresses finish without sending. Successful delivery clears encrypted recipient/token payload while retaining the digest and eligibility binding until TTL expiry. Do not log request bodies, raw provider responses or recovery links at the proxy/APM layer.
