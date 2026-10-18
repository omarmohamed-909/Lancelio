# Lancelio — implementation architecture

Status: foundation, registration, login, refresh rotation, logout, and browser authentication with a protected workspace dashboard. This document supersedes the original MVC implementation proposal.
The original document remains a product reference, not an instruction to implement every feature.

## Decision

Use a modular monolith with Clean Architecture inside business modules.
Keep Next.js and Express as delivery mechanisms; use MongoDB through adapters when persistence is introduced.
No microservices, generic base repositories, dependency injection container, or speculative abstractions.

```text
apps/api/src/
  main/                    composition root, environment, process lifecycle
  modules/<feature>/
    domain/                entities, value objects, business rules
    application/           use cases, input/output types, ports
    infrastructure/        MongoDB repositories, token/email/password adapters
    presentation/          HTTP routes, controllers, request validation, mapping
  shared/
    domain/                genuinely shared business primitives, when needed
    presentation/http/     common HTTP response/error handling
```

Dependencies point inward:

```text
HTTP → application → domain
infrastructure → application ports + domain
main → concrete adapters + use cases + HTTP wiring
```

- Domain and application import no Express, Mongoose, Zod, Node APIs, or framework types.
- Application defines only the ports required by an actual use case. Adapters implement them.
- Inject dependencies through constructors or factory arguments; no service locator.
- Controllers validate and map HTTP input, call one use case, then map its result.
- Database documents stay inside infrastructure. Return domain entities or explicit read DTOs.
- One module cannot directly import another. Cross-module workflows use explicit ports wired in `main`.
- The health route is a delivery concern, so it has no artificial entity, repository, or use case.
- Create layers when code needs them; empty folders are not evidence of architecture.

`npm run architecture:check` parses imports, re-exports, dynamic imports, and require calls in API source.
It checks dependency direction, inner-layer external imports, shared-to-module coupling, and direct cross-module imports.
It is a structural guard, not a substitute for code review; the frontend currently has lint/type/build checks.

## Frontend

Next.js `src/app` owns routes and composition. Introduce `src/features/<feature>` for feature UI,
schemas, API calls, and hooks when a story needs them. Shared UI belongs in `src/components/ui`.
Components display state; API adapters handle transport. Business invariants remain enforced by the API.
Do not reproduce four backend layers around every React component.
Arabic/RTL is the initial UI direction; the target market and localization scope remain hypotheses to validate.

## Critical decisions for upcoming stories

- Auth/workspace: explicit authenticated identity and authorized workspace context. Never accept an arbitrary workspace ID as proof of permission.
- Refresh sessions: store hashed tokens, rotate atomically, revoke on logout, detect reuse. Cookies and CSRF rules must match the actual deployment topology.
- Tenant repositories: require workspace scope for reads, writes, aggregates, and relationship checks; public access uses a separate scoped grant.
- Registration: user, workspace, and owner membership are one atomic workflow. MongoDB tests require a replica set. Sessions are introduced by AUTH-002.
- Proposal acceptance: transaction plus conditional state change and a unique project-per-proposal constraint; retries return the existing result.
- Money: amounts use integer minor units with currency-specific precision; totals are computed on the server with documented rounding. Aggregate revenue per currency.
- Payments: include a manual payment ledger in the MVP to support partial payments; provider integration is deferred.
- Public links: hash stored secrets, separate grants by purpose, expiry and revocation, response allowlists, request limits, and no raw token logging.
- Archive referenced business records rather than breaking historical proposals/invoices with hard deletion.
- Domain errors contain safe codes; presentation maps them to HTTP. Unknown errors never expose stacks or database details.

## Verification

Use unit tests for business invariants, real-database integration tests for adapter behavior and transactions,
HTTP tests for validation/authorization/error contracts, and end-to-end tests for complete user journeys.
Prioritize cross-workspace access, refresh replay, concurrent acceptance, monetary calculations, and portal visibility.
Do not create tests just to mirror trivial implementation details.

AUTH-001 implements account registration with an atomic MongoDB adapter and Argon2id password hashing.
The identity module owns the initial User, Workspace, and WorkspaceMember persistence models for this onboarding workflow.
Future workspace features must use explicit application ports rather than importing these models across modules.
Registration replies with an allowlisted account summary; sessions are created by the separate login endpoint.
The production API connects and establishes collection/index constraints before listening, and requires a transaction-capable MongoDB deployment.
The health endpoint remains liveness only; it does not claim database readiness or production deployment readiness.
Password storage parameters: Argon2id, 64 MiB, 3 iterations, 1 lane, random salt from the hashing library.
Names are trimmed; email is trimmed/lowercased; dots and plus aliases remain significant.
Supported emails are conventional ASCII mailboxes; IDN domains must use punycode and quoted/Unicode local parts are currently unsupported.
Passwords contain 15–128 Unicode code points and are never trimmed or silently truncated.
Registration is limited to 20 requests per 15 minutes per IP using an in-process store. Proxy trust and a distributed rate-limit store must be configured for the production topology before scaling.

## AUTH-002 — login and session authorization

`Login` and `AuthenticateSession` depend only on application ports and domain types.
Concrete adapters provide Argon2 verification, MongoDB identity/session persistence, and JWT signing via `jose`.
The composition root injects the clock, signing key, and cookie deployment settings.

- An unknown email still triggers verification against a random dummy Argon2 hash prepared at startup; this reduces the obvious password-hashing timing difference without claiming perfectly equal request timings.
- Incorrect credentials, suspended users, and deleted users return the same 401 error. Missing workspace membership returns 403 after password verification.
- The user may select a workspace on login, but only an existing membership permits it. Without a selection, the earliest membership is chosen deterministically.
- Access JWTs live for 15 minutes, use HS256 with an explicit issuer, audience, `at+jwt` type, issue/expiry times, and required user/workspace/session claims.
- Refresh credentials are opaque 256-bit random values; only their SHA-256 digests are stored. Refresh session IDs are random UUIDs.
- Session records last 7 days and have expiry and revocation checks. TTL indexes provide eventual cleanup; authorization always explicitly checks expiry and never depends on the TTL cleanup schedule.
- Every authenticated request verifies the JWT, then a live session bound to the exact user/workspace/session, then the current active user and membership. Role is read from the database, never trusted from a token or request field.
- No successful session or auth cookie is issued if token signing or session persistence fails.
- Login accepts only the exact configured browser Origin to prevent login CSRF. The route limits all login attempts to 10 per 15 minutes per IP, before expensive password work.
- The access token is returned to the caller for a Bearer header. Browser code must keep it in memory. Refresh secrets appear only in HttpOnly, SameSite=Strict, host-only cookies.
- Production uses a Secure `__Host-lancelio_refresh` cookie with `/` path and no Domain attribute. Development uses `lancelio_refresh` on localhost without Secure.
- `WEB_ORIGIN` must be a canonical origin and HTTPS in production. This cookie policy requires the web and API to be on the same site (for example, app.example.com and api.example.com); unrelated provider domains need a same-site proxy/custom-domain deployment.
- `/login` and `/me` responses, including errors, are non-cacheable. Authenticated middleware is reusable by future protected routes.

## AUTH-003 — refresh rotation and logout

`RefreshSession` and `Logout` depend on dedicated refresh persistence/codec ports. `SessionStore` retains its smaller login/authorization contract.
Current refresh digests live in AuthSession. Consumed digests live in a separate indexed ConsumedRefreshToken collection,
referencing the stable session ID and sharing the original expiry. This avoids indefinitely growing arrays in session documents.
Both collections retain only digests; no raw refresh secret is persisted.

- A refresh token is accepted only from its matching cookie. Body tokens, session/workspace IDs, duplicate cookies, and oversized cookie headers are rejected as credentials.
- Every refresh validates the current active account and workspace membership. Removal of that access revokes the session.
- Ordinary rotation keeps the session ID stable, preserving still-unexpired access tokens. New JWTs get random `jti` values.
- Changing the current digest and saving its consumed-digest record happen in a MongoDB transaction. A failure rolls both back, so the original credential is still usable.
- Known consumed credentials revoke the session before token signing. If consumption happens during a request, the transactional retry detects it and commits revocation before the application returns 401.
- Reuse revokes the whole session, including its newest refresh token and all associated access tokens. Other login/device sessions remain valid.
- Strict concurrency policy: two requests sharing a refresh credential yield at most one 200 response. The other returns 401 and revokes that same session. There is no grace period or transparent retry of a consumed token. The browser must serialize refresh across requests and tabs; a lost refresh response requires login again.
- The 7-day expiry is absolute from login; refresh never extends it. TTL cleanup is eventual and authorization enforces expiry explicitly.
- Refresh has a 30-attempt/15-minute per-IP limit, stored in process. Login/refresh/logout require the exact allowed Origin. Refresh/logout accept an absent or empty object body only.
- A refresh authentication failure clears its cookie. Origin/schema/rate-limit errors and transient server failures do not erase the credential.
- Logout revokes the session identified by a current or consumed refresh secret, then clears the matching cookie and returns 204. Missing/invalid/already-revoked cookies also return 204. It is current-session logout, not logout of all devices.
- Logout has an immediate effect on existing access tokens because each protected request checks session revocation. A database failure returns 500 and preserves the cookie rather than reporting a false success.

WEB-001 implements the browser session manager, coordinated refresh behavior, and protected dashboard.

## WEB-001 — browser authentication

Routes `/register` and `/login` render Arabic RTL forms. `/dashboard` displays the authenticated user's actual workspace and membership; clients and draft proposals are available and later business modules are explicitly marked as unavailable.
Next.js routes compose feature components. Form schemas, the HTTP adapter, and session state are separate from rendering.

Each root provider owns a `SessionManager`; no identity is stored in a server-global singleton.
Access tokens exist only in that manager's memory, never in Web Storage. Refresh secrets remain in the API's HttpOnly cookie.
The manager restores from the cookie on page load, refreshes before access expiry, and refreshes once after a protected request returns 401, then retries that rejected operation once.
POST operations are never automatically retried after uncertain network outcomes. A recovery button is an explicit user attempt; if the original response's rotated cookie was lost, replay detection can require a new login.

A same-origin Web Lock serializes login, register, refresh, and logout across tabs. BroadcastChannel carries only invalidation events, never tokens or identity; recipients re-read the current cookie under the same lock.
One tab's logout revokes the family on the API and causes other tabs to resolve anonymously.
Generation checks discard stale in-flight results after a login/logout state change.
HTTP or network failure on logout keeps the current view and shows an error; it does not falsely report successful server revocation.
If a restoration fails, the dashboard offers explicit recovery instead of a refresh loop.

Supported deployment: one canonical frontend origin, a modern browser with Web Locks and BroadcastChannel, and HTTPS (localhost is supported for development).
A frontend served over non-localhost plain HTTP cannot coordinate securely and shows an unsupported-browser message.
The API remains the authorization boundary: client redirects cannot grant workspace access.

Browser tests run Next.js with the real Express handlers, Argon2, JWTs, and an isolated MongoDB replica set.
They cover the full auth journey, validation/duplicate submission, concurrent tabs, reload, token/session expiration, keyboard/mobile use, and network failures.
The test clock is injected in the test process; production exposes no clock-control endpoint.

## CLT-001 — workspace client management

The clients module owns Client records. Its domain validates plain values, its application service depends only on `ClientStore`, and its Mongo adapter owns document conversion, scoped queries, and atomic version matching. The composition root mounts the existing authentication middleware before client routes; the client module consumes a minimal authenticated workspace shape and imports no auth module code. All production collections and indexes are initialized before listening.

There is no global client lookup: the store requires workspace scope on every read, list, update and archive. Foreign IDs return the same 404 as missing IDs. The HTTP schema rejects mass assignment, and domain validation applies before persistence. All current workspace members have the same client-management permission for this story.

Archive is a soft, irreversible transition in the current API. Archived records remain readable in a separate list and cannot be edited. Atomic writes match `(workspace, id, version, archivedAt: null)` and increment `version`; this prevents lost edits and resolves concurrent edit/archive requests with one successful operation. Draft proposals validate their client relationships within the same workspace transaction, as described in PRP-001 below.

`/clients` and `/dashboard` compose the shared accessible workspace shell. The client feature separates transport/schema, list lifecycle, and the editor. Native modal dialogs handle focus isolation; Escape is disabled only while a submission is pending, and focus/scroll are restored on close. Mobile navigation retains its keyboard, inert, and reduced-motion behavior. Business tokens remain private to the session manager; protected calls use its coordinated 401 refresh path. Async list requests are cancelled on unmount/status changes and stale results are discarded.

The list uses bounded pages of 25 with descending ID cursors. The active/archive toggle is part of CLT-001; CLT-002 adds literal search and contact filters. Database tests verify real tenant isolation, live membership revocation, bounded pagination, and conflicting writes. Browser tests verify create/edit/archive, duplicate submission, conflict reload, token renewal during a write, mobile isolation, and recovery after a committed create response is lost.

## CLT-002 — literal search and allowlisted filters

`ClientListInput`/`ClientListQuery` keep search, status, contact and cursor criteria independent of Express and MongoDB. Domain validation enforces the Unicode length bound and identifier/filter rules before the store is called. The HTTP adapter rejects extra/duplicate/object query fields. The Mongo adapter alone escapes regex punctuation, combines the three search alternatives beneath the workspace predicate, and applies contact/status/cursor conditions, a fixed 25-result page and a 3-second execution limit. Search uses the existing client fields, so edits and archival are visible without a second synchronization pipeline or search cache.

Frontend schemas are separate from transport. `ClientsScreen` owns stable search/filter controls, editor state and notices; `ClientResults` owns cancellable loading and pagination, while `ClientRow` handles record presentation. A key composed from workspace, normalized search, status, contact and explicit refresh remounts only results. Cleanup aborts initial/page requests and clears the debounce timer, so old results cannot commit to a newer query. The input and filter controls stay mounted during those changes.

A 300 ms delay applies to nonempty searches; clearing starts the first page immediately. Changing any criterion resets pagination. Page retries retain the cursor and loaded rows, while first-page retries retain the controls. Focus returns to the search input when clearing/resetting filters. Dialog close restores its trigger when available, with the stable add-client button as the fallback after a list refresh replaces a row.

Integration tests verify literal punctuation, Unicode/control bounds, every contact mode, archived/current combinations, workspace isolation across each search alternative and bounded filtered pages. Browser coverage controls the clock for debouncing, holds old search/page responses while changing criteria, verifies pagination reset, and checks mobile error recovery and focus.

## PRP-001 — workspace draft proposals

The proposal module owns draft validation, exact line pricing and the draft-only/version transition rules. `ManageProposals` depends on `ProposalStore` and `ProposalTransactions` ports; the transaction context provides a session-bound store and a minimal `ProposalClientDirectory` port. These contracts contain no Express/Mongoose or other module imports. Shared domain ID/version validation is now used by both clients and proposals. Shared money policy explicitly supports four currencies with two decimal places and a bounded minor-unit total.

`main/create-proposals.ts` composes Mongo transaction adapters and the client directory. The directory performs a scoped, session-bound client update of an internal `referenceRevision`, rather than a read-only check. This serializes the proposal's contact snapshot with concurrent client edit/archive writes. It changes neither the visible client version nor the client timestamp. The reservation and proposal mutation commit or roll back together. Missing/foreign/archived new relationships share the same error. A saved draft can retain its original archived client; replacing it requires an active client from the same workspace. Explicit draft saves refresh contact snapshots; reads preserve the previous snapshot. This composition avoids direct imports between business modules and closes the client-reference check/write race.

Price inputs are decimal strings. Parsing, multiplication and sums use BigInt until the supported safe-integer bound has been checked, then expose numeric minor units. Domain validation precedes persistence. The HTTP layer rejects caller-supplied status, calculated values and nested unknown fields. The Mongo store applies workspace scope everywhere, projects bounded list summaries, and updates drafts only on `(workspace, id, version, status: draft)`. No send/accept endpoint exists in this story; non-draft records are protected against direct edit attempts. All proposal collections/indexes initialize before the production server listens.

The frontend separates transport schemas, exact-money preview helpers, scoped loaders, searchable client selection, item editing, list lifecycle and review rendering. App Router pages compose those features under the shared workspace layout; dynamic route params use the installed Next.js async API. Neither proposal details nor tokens are stored in browser storage. Form state remounts for a new workspace or explicitly loaded version. A synchronous submission guard covers asynchronous form validation. Ambiguous writes require reading saved records before another submission, and stale versions require explicit review. Bounded lists retain existing rows on page failure and retry the failed page only on user action.

Database tests cover integer prices/overflow, nested mass assignment, name-only clients, snapshots, tenant isolation, draft locks, concurrent edits, client archive races and transaction rollback. Browser journeys cover create/reload/review/edit, precision validation, searchable/paged client selection with stale-response cancellation, version conflict recovery, archived relationships, non-draft read-only pages, lost create responses, one write after expired-access renewal, cross-workspace isolation, list failure recovery and reduced-motion mobile layouts.

## PRP-002 — scoped anonymous proposal grants

ShareProposals depends on separate ProposalShareStore / ProposalShareTokens ports and an injected clock. The domain describes grant metadata, expiry policy and the minimal PublicProposal projection. The crypto adapter generates 256-bit random credentials and SHA-256 digests; the composition root wires it to the proposal model. Inner layers import no framework or Node APIs.

A grant is embedded in the proposal document. A version/status-conditional atomic update locks the content and installs/replaces the grant together; no second collection or multi-document transaction is necessary. Edit, issue, renewal and revocation all contend on that same versioned document, so exactly one conflicting write succeeds. Revocation clears the indexed digest; expiry is enforced at lookup, independent of cleanup jobs. Owner DTOs discard private grant fields, while public lookup selects a minimal set and maps an explicit allowlist. The partial unique digest index permits multiple unshared/revoked records without null collisions. Bootstrap initializes it with the other proposal indexes.

The protected review and anonymous page share a document renderer but have separate data contracts and controls. SessionBoundary excludes shared routes from session restoration/BroadcastChannel/Web Locks; anonymous reads omit credentials and carry the secret in a POST body rather than a URL. The browser link carries a fragment, and the generic SkipLink moves focus without changing it. Hash changes remount only the public loader; abort cleanup prevents old document data from committing. Server-relative lifetime schedules revalidation without relying on the client's wall clock, with a capped timer for long grants. Visibility/BFCache restoration also rechecks access. Private sharing controls use synchronous mutation guards, preserve one-time links only until leaving the page, and require explicit recovery after uncertain outcomes or stale reviews.

Database integration tests exercise full DTO allowlists, atomic locking, renewal/revocation, exact expiry, live membership/tenant isolation, concurrent sharing/edit/revoke and failed writes. Browser journeys verify clipboard/fragment handling, session-free reads even with cookies or unavailable auth coordination APIs, updated-content review, cancelled stale public reads, mobile layout/reduced motion and deadline clearing.

## PRP-003 — final decisions and transactional project creation

`DecideProposal` uses pure decision-store, transaction and project-creator ports. Proposal and project modules do not import each other. `main/create-proposal-decisions.ts` translates the frozen proposal into the independent project input and composes both Mongo stores with one explicit session. The injected clock is evaluated inside each transaction callback, so driver retries recheck current expiry/permission/state.

The transaction first reserves the sent proposal with its workspace, version, grant digest, response permission, expiry and empty-decision predicates. It then creates the accepted project and links its ID on the same session. Reserving first makes conflicting decisions contend before project insertion; MongoDB transient conflict retries observe the winner and return either the original idempotent result or a final-decision conflict. A unique workspace/source-proposal index also prevents a second project for the same agreement. Every operation is awaited. Snapshot reads, majority writes and primary preference use the driver's `withTransaction` with a 10-second total deadline and a 5-second commit limit; sessions always close. Failed create/link operations roll back both decision and project.

Private persistence stores a canonical UUID v4 request ID, grant digest, decision/outcome time and optional project reference. DTOs expose only the decision/time, plus project ID for private detail reads. Same-grant/same-ID/same-outcome replay returns the original result while access remains valid; grant expiry/revocation/renewal/read-only permission is checked first. Legacy grants default to read-only, and explicit owner renewal installs response permission. Final states cannot be renewed or edited. The project captures the accepted agreement and prior client snapshot without a live client refresh or archive veto.

The anonymous response route is independent from account sessions, requires the exact configured web origin, applies strict body validation and its own rate limit, and retains public privacy headers. React keeps a pending attempt only in parent component memory across explicit public rechecks. Unknown outcomes block further writes; a fresh read either reveals the committed decision or permits an explicit retry with the same ID/choice. Confirmation and final-state reveals use the existing reduced-motion-aware CSS. Project details use authenticated workspace loading and the shared agreement document renderer.

Real replica-set integration tests cover acceptance/rejection, same-attempt replay, concurrent duplicate and competing decisions, grant upgrade/expiry/revocation/renewal races, archived snapshots, create/link rollback, source uniqueness, public allowlists, exact origin, validation/rate limits and scoped live-member project reads. Browser journeys cover confirmation/cancel focus, duplicate events, rejection/mobile/reduced motion, committed-but-lost responses, precommit connection failure with explicit same-attempt recovery, conflicting viewers and revoked access. Project management is described in PRJ-001 below.

## PRJ-001 — project lifecycle and manual creation

The project domain owns manual input validation, list criteria and the transition policy. ManageProjects uses project store and transaction/client-directory ports; inner layers remain independent of MongoDB, HTTP and the client/proposal modules. The composition root supplies a live client reservation adapter. Manual creation uses a snapshot/majority transaction with the same bounded 10-second deadline and 5-second commit limit as proposal creation. A client reference revision serializes snapshot capture against edits/archive without altering its visible version or update time. Failed storage rolls back the reservation.

Status updates read the scoped project, enforce version/transition rules, then atomically match scope/version/current status. A missing match requires another scoped read to distinguish not-found from conflict. Only lifecycle fields are updated; accepted agreements and proposal decisions are independent and immutable through this API. Legacy missing versions use a conditional version-1 compatibility predicate.

The persistence adapter exposes explicit detail/summary allowlists. Listing uses status/descending-ID indexes, 25-result pages and a 3-second bound. Manual financial/source fields are null. The source uniqueness index is partial; bootstrap installs the replacement before removing only the recognized legacy unique index. Concurrent startup tolerates IndexNotFound for that removal alone. Database tests cover multiple manual projects, preserved source uniqueness and concurrent bootstrap migration.

Frontend list, creation, details and status controls have separate responsibilities, validated response schemas and cancellable lifetimes. Workspace-keyed loaders discard old results. Synchronous guards prevent repeated writes through validation, response handling and delayed navigation. Unknown create outcomes require list review; unknown/conflicting status outcomes require an explicit state read and a new confirmation. Shared client selection and agreement rendering retain their own contracts. No task, scheduling or financial editing abstraction is introduced before its story.

## Task management — TSK-001

The tasks module owns framework-independent content/status/order rules and the ManageTasks application service. Board storage, scoped project access, transactions, identity and clock are explicit ports/dependencies. HTTP validates strict payloads and maps application errors; Mongoose adapters own persistence. The composition root bridges the projects model into TaskProjectDirectory, so task application/domain code does not import another module's persistence or HTTP layers.

A unique workspace/project board embeds at most 200 tasks in a stable array. One revision protects creation, editing, moving and deletion, preventing a simultaneous reorder from silently overwriting an edit. Reads of a missing board are virtual revision 0; a persisted empty board retains its revision. Moves remove/insert one task while preserving all other relative order, avoiding floating rank drift and unbounded renumbering. The deliberate 200-task bound keeps the complete board and atomic replacement finite.

Each mutation runs in a real snapshot/majority MongoDB transaction, reserving the project through a private taskReferenceRevision increment before matching the board revision. Project lifecycle writes touch the same document, so concurrent closure forces serialization/retry and a final status check. Reservation timestamps are disabled; task edits never advance the public project version or alter frozen agreement fields. Failed writes roll back both documents. Bootstrap creates the task collection and unique index before listening.

Frontend schemas/API, cancellable board hook, board composition, task card and native editor dialog have separate roles. Synchronous write guards and explicit uncertain-result recovery preserve user input and prevent blind retries. Project/workspace keys and abort signals isolate old results; terminal-state recovery also reloads project details. Database tests cover isolation, strict contracts, ordering, revisions, closure races, capacity and rollback. Browser journeys use the real API/database for writes, confirmation, focus, recovery and responsive layout. No progress/public visibility abstraction is added before TSK-002.

## Derived progress and visibility — TSK-002

The task domain owns taskProgress and clientTaskView as pure functions over the current task array. TaskProgress defines the empty-state null percentage and equal task weighting, with rounding capped below 100 until all tasks are done. ManageTasks applies these functions after scoped reads and committed changes; neither projection is stored, so counters cannot drift from board content. Lifecycle status remains an independent project concern.

clientVisible belongs to task state and has a separate revision-guarded application operation. Content input deliberately excludes the flag. Storage adapters interpret only true as eligible and safely default missing legacy values to false. A normal saved replacement materializes the defaults; reads cause no migration writes. The existing transaction/reservation path handles flag changes, contention with edits and project closure, and rollback without advancing public project timestamps/versions.

The client projection explicitly selects title/description/status and derives its counts solely from eligible tasks. This avoids exposing hidden denominators or spreading private metadata into a future client DTO. It is currently used for an authenticated owner preview; it does not add public authorization or reuse proposal grants. PRT-001 must add scoped project access separately.

Frontend schemas validate the new response contract. Separate progress and client-preview components render the server-derived state without duplicating business calculations. The native task dialog confirms visibility changes, and the existing write guard/recovery flow handles explicit targets and unknown outcomes. Tests cover calculation limits, projection allowlists, defaults, preservation through edits/moves, revisions, tenant isolation, rollback, terminal states and real-browser confirmation/recovery and reflow.

## Invoice creation boundary — INV-001

Invoices have their own domain, ManageInvoices use case, persistence/reference ports, Mongo adapters and HTTP router. main/create-invoices bridges client/project models to explicit invoice ports; inner modules never import another feature. The shared domain priced-items calculation now serves proposals and invoices, preserving proposal validation messages and using shared currency precision/caps.

MongoInvoiceTransactions provisions a zero workspace counter, then runs snapshot capture, bounded number allocation and invoice insertion in one transaction. Unique workspace+sequence and workspace+requestId indexes protect concurrent numbering and creation intent. Request replay compares normalized invoice content before reference reservation or allocation; it returns the stored allowlisted document and leaves the sequence unchanged. Failed insertions roll back allocation and contact reservation. Infrastructure retry of aborted transient Mongo transactions does not replay a committed invoice as a new request.

The project reference is scoped and read in the same transaction. The current API does not mutate project identity/title/client associations, so there is no extra project write or lifecycle lock for an invoice. Invoicing a completed/on-hold/cancelled project does not reopen it or alter its agreement. No project currency/price is inferred.

The web invoice feature composes shared money previews, priced form schema, line-item editor, accessible scrolling table and priced-document renderer. Feature wrappers supply document labels/status; invoice creation owns its guard, creation key, abort lifetime, optional scoped project picker and uncertain-outcome state. The list uses bounded pages and retains earlier results after a later-page failure. No public issuance/payment abstraction is introduced ahead of INV-002/PAY-001.

## INV-002 — frozen invoices and independent grants

ManageInvoices owns draft updates and issuance through the existing invoice transaction/reference ports. Both reserve the client inside the transaction and match invoice scope/version/draft status before committing. Issue captures the injected clock inside the transaction callback, plus the authenticated workspace name supplied by the composition boundary. The project reference remains independent and immutable through its own API. Issuance cannot modify the agreed project prices or increment the invoice counter.

A private creation fingerprint separates request replay identity from editable document state. The adapter conditionally backfills missing fingerprints in the same transaction as the first mutation, without changing timestamps; new records store it on creation. Application code preserves the first value and presentation excludes it. This allows old creation requests to return their current record without treating draft editing as another creation.

ShareInvoices depends on invoice grant storage, token and clock ports. Its Mongo adapter matches the common revision and issued status for every grant write, and uses a unique partial digest index. Frozen invoice fields are never part of the grant update. Public projection selects only allowed fields and enforces issued status, captured identity/date and current unrevoked expiry in the database query.

The shared domain owns public grant expiry/state and the shared infrastructure owns cryptographic generation/digesting, reused by proposals and invoices. Feature modules still do not import each other's persistence or use cases. The frontend shares cancellable public-document location/loading hooks, exact pricing and paper rendering. Feature schemas and action controls remain distinct: invoices expose no proposal decision controls. Tests exercise actual transaction rollback, edit/issue and renewal/revocation races, legacy replay identity, strict contracts, private/public isolation and explicit uncertain-write recovery.

## PAY-001 — independent bounded payment ledgers

The payments module owns exact positive payment validation, calendar dates, correction policy and pure derived balances. ManagePayments depends on payment storage, a scoped invoice directory, identity generation and an injected clock. The composition root bridges the issued invoice projection into that directory; payments application/domain layers never import invoice infrastructure or HTTP.

A unique workspace/invoice ledger embeds up to 200 entries with one revision. Invoice totals and currency are frozen at issuance, and payment mutations change only this ledger. A single-document create or version-matched array replacement commits the entire payment/correction atomically, avoiding a transaction/reservation that would unnecessarily advance invoice state. Initial duplicate-key contention and later revision mismatch return a failed save; the application rereads solely to identify an identical request replay. Other storage failures propagate through the safe error boundary. Add and void share the ledger revision, so neither can silently overwrite the other. Both the public invoice and its grant remain independent.

The original normalized payment identity is retained in each private entry, including cancelled entries, while explicit DTO mapping excludes its key. Balances use integer minor units and BigInt accumulation, and are calculated from active records after committed writes/reads. A void preserves the original record and first correction reason/date; it changes the derived balance without altering the issued invoice. Reading an empty ledger is virtual revision 0, with no implicit writes.

Frontend schemas/API, a cancellable ledger hook, invoice composition and native payment editor have separate roles. Workspace/invoice lifetimes reject stale responses; a change from draft to issued remounts the ledger reader. Synchronous guards cover confirmation, validation and response handling. An unknown result retains the open attempt across an explicit read and manual confirmation, supporting the backend key replay without automatic mutation retries. Real database tests cover creation races, repeated/voided keys, revision conflicts, exact balances, write failure, member/workspace isolation and unchanged public grants; browser tests exercise the corresponding recovery, keyboard and responsive behavior.

## DSH-001 — read-only cross-feature overview

Dashboard owns a domain read contract, ReadWorkspaceOverview application use case and reader port, a Mongo snapshot adapter and an authenticated HTTP router. The composition root supplies collection names from existing models; the dashboard never imports other feature modules. No feature schema or stored counters are added. Existing workspace indexes bound the initial matches, payment joins use invoice ID plus workspace/issued constraints, and task joins require an active/held scoped project.

One primary snapshot transaction reads counts, invoice totals, active received totals and live proposal-link dates sequentially; financial aggregation starts from each relevant collection instead of performing a payment lookup for every invoice. Mongo Decimal128 sums preserve exact minor units; the domain normalizes integer/scientific Decimal128 strings with BigInt and rejects fractional/invalid values. HTTP returns canonical decimal integer strings, and the browser formats them without conversion of the whole value to Number. A concurrency integration test commits a payment after the first count read and verifies the current snapshot remains unchanged while the next read observes it. A 90,073-invoice fixture exceeds Number.MAX_SAFE_INTEGER using individually valid maximum totals.

The client reader is keyed to workspace identity, aborts on disposal, locks simultaneous refresh and removes old figures before explicit reading. Failures display an error without a zero or stale financial summary. It uses the established authorized session coordinator, with explicit read recovery and no polling or automatic network retry.

## PRT-001 — independently scoped client capabilities

Portal owns its domain read models/visible progress, independent revision rules, a ShareClientPortal use case and explicit store/secrets ports. Its Mongo adapter receives collection names from main and never imports other feature modules. A separate ClientPortalGrant collection keeps workspace/client identity, revision, digest and grant dates with scoped/digest uniqueness; it adds no public fields to clients, projects or invoices.

Issuance reserves the active client and commits the independent CAS grant in a transaction. Duplicate/stale/failed writes abort that reservation; public client version/time and all work/financial document state stay unchanged. Public eligibility, scoped pages, visible task projection and active payment balances share one primary read snapshot. Boundaries are applied in the database queries and again through explicit DTO construction. Progress considers only visible tasks, and financial summaries expose no ledger history. A concurrency test commits a payment after the first scoped page read and verifies the current snapshot sees the older balance and the next request sees the payment.

CryptoPortalSecrets generates random 256-bit capabilities and stores SHA-256 digests. Public pagination uses randomized authenticated encrypted IDs, scoped to digest and list kind; cursors never replace live grant/client authorization. No external cryptography package or signing configuration is introduced. Startup initializes the unique grant collection/indexes. Expiry/revocation retain revision history rather than deleting the grant row with TTL.

Frontend schemas/services, a workspace/client-keyed owner hook, shared allowlisted document renderer and public reader are separate. The private page previews the grant scope before confirmation; unknown writes require explicit read/review/renewal. The public screen uses the existing public-document lifecycle, with fragment changes, expiry and page restoration removing stale content and aborting earlier reads. List cursors remount each page reader. Public routes bypass session provisioning and omit credentials; no auth token is persisted or portal message sent automatically.

## Committed notification inbox

NTF-001 separates NotificationStore/NotificationCursors ports and ManageNotifications from native MongoDB/Mongoose adapters and HTTP validation. main supplies collection names; the feature never imports another feature's layers. Read receipts have a unique workspace/user/eventId index. Startup also installs workspace/decision.at and workspace/issuedAt indexes on the immutable source facts.

The inbox is a derived read model of final proposal decisions, issued invoices and retained ledger event times. It requires no distributed event write, backfill or fabricated arrival date. Stable event identities deduplicate replays and expose existing history. Read state is independently stored for each live member; reading the inbox performs no receipt writes. Foreign/orphan source references are excluded, and DTOs are explicit allowlists.

MongoDB prohibits unionWith inside transactions ([official constraint](https://www.mongodb.com/docs/manual/reference/operator/aggregation/unionwith/)). Four sequential aggregations instead share one primary snapshot. Each returns at most 26 candidate rows plus its total unread count; the adapter sorts at most 104 candidates and returns 25 with a date/ID cursor. It does not materialize the whole workspace history in application memory. Scoped point predicates narrow read-state mutations before looking up the receipt; eligibility and unique/CAS state writes commit together. Any storage failure propagates.

The keyed web provider isolates counts across user/workspace changes. An epoch prevents a late summary from replacing a more recent inbox count. Requests abort when the reader unmounts; explicit refresh clears old data, and a saved mutation reads authoritative state/count rather than applying a guessed local delta. Lost replies or revision conflicts require explicit read before another write. Delivery is on demand, including historical facts; real-time subscriptions, remote delivery and automatic retention require separate stories.

Local NTF-001 verification on 2026-10-10: npm run check passed formatting, strict lint, both architecture boundary tests, API/web type checks, all 653 API tests across 24 files, and both production builds. The 48 new notification tests exercise real snapshot transactions, interleaved source commits, workspace/reader isolation, receipt races and rollback, bounded merged pagination, canonical cursor validation, strict private HTTP contracts and storage failures. Isolated browser batches passed 55 distinct cases: 27 notification and 28 existing account/dashboard cases; responsive evidence is recorded in docs/RESPONSIVE.md. No deployment or remote CI result is claimed.

## Password recovery

The auth application owns request/reset/delivery use cases through RecoveryStore, RecoverySecrets, RecoveryMailer and PasswordHasher ports. Domain policy defines expiry, cooldown and password validation without dependencies. Infrastructure handles Mongo transactions/leases, authenticated encryption and the Resend HTTP adapter; main composes these and schedules delivery. HTTP request acceptance queues an opaque job for every valid mailbox and defers account existence checks to the worker. Delivery failures never influence the account-existence response.

User authFence is a transaction serialization write used by login, recovery issuance and reset; expected passwordHash gates session creation. Existing accounts need no migration: the first increment initializes a missing fence. passwordChangedAt rejects earlier queued requests after a reset. Password/reset-token/session updates commit together, and every protected request still consults the live session record. Financial/public document snapshots are unaffected.
