# Lancelio assistant

The first version is an authenticated, read-only work assistant. The floating message button opens a native modal side panel, using the site's language, direction and appearance. It offers workflow instructions, a real work summary, project lists, outstanding invoice balances and literal record search. Every data answer includes a read timestamp and record links. The conversation and typed draft survive workspace navigation and language changes in the current tab. They clear on page reload, sign-out, unavailable authentication, or a user/workspace change; a new-conversation action also clears them. No transcript is written to browser storage or MongoDB.

Each reply follows the language of its question rather than the interface language. Arabic questions receive Arabic instructions, read results and errors with RTL direction and Arabic date/money formatting, even on an English interface; English questions receive English with LTR direction. Technical English words in Arabic questions do not force an English reply. A leading English question/search command keeps its language when a literal record name uses Arabic. Questions without letters inherit the last successful turn's language, then the interface language. This is a bounded Arabic/English text heuristic, not general multilingual language identification. The chosen reply language stays with that turn when the site language changes or the request is retried; record titles and other user data remain untouched.

## Available without a key

`ASSISTANT_PROVIDER=guided` is the default. Bilingual suggested questions, known help questions and a small set of explicit read queries work without an external model:

- `ملخص شغلي` / `My work summary`
- `كلمني ع المشروع بتاعنا` / `What is Lancelio?`
- `إيه المشاريع المفتوحة؟` / `What are my open projects?`
- `مين العملاء اللي عليهم مستحقات؟` / `Which clients have outstanding payments?`
- `إزاي أعمل فاتورة؟` / `How do I create an invoice?`
- `ابحث عن اسم العميل` / `find INV-001`

Guided mode is labelled clearly in the panel. Unrecognized questions explain the supported queries; they are not answered with generated facts. Instructions link to existing forms; the assistant does not create, edit, issue, share, send, pay or delete records. Proposal drafting remains a later feature.

Product questions have a dedicated `help/product` topic with reviewed Arabic/English content covering Lancelio's purpose, client-to-proposal-to-project workflow, tasks and client visibility, invoicing and manually recorded payments, settings, notifications and assistant limits. The classifier receives this bounded product context; the displayed explanation comes from the reviewed catalog. Generic phrases such as `كلمني ع المشروع بتاعنا` refer to Lancelio, not a list of client projects or instructions for creating one. Product follow-ups such as `وايه مميزاته؟` keep that context; explicit project lists, named searches and feature instructions retain their separate routes. No source code, deployment knowledge or unreleased capabilities are implied.

Short project-status follow-ups such as `والمتوقفة؟`, `طب المكتملة؟` and `and on hold?` retain the immediately preceding project-list context, including a chain of those follow-ups. A topic change, an unsupported question or help instructions ends that context. Neither guided follow-ups nor intelligent interpretation grant write access.

Open projects includes active and on-hold projects. Project and receivable answers show at most six recent matches and explicitly report when more exist. Search uses the existing five-per-notebook search cap. Receivables are **outstanding**, not necessarily overdue: Lancelio does not infer a due date. Issued invoice snapshots provide titles/client names; only non-voided ledger entries in the same workspace reduce the balance. Drafts and settled invoices are excluded. Decimal aggregation and integer minor-unit strings preserve exact money; currencies remain separate. The summary reuses the dashboard's snapshot reader.

## Configure intelligent question understanding

Set these **server-only** variables in `apps/api/.env` locally, or the API host's environment settings:

For Gemini:

```dotenv
ASSISTANT_PROVIDER=gemini
GEMINI_API_KEY=your-private-api-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Or for OpenAI:

```dotenv
ASSISTANT_PROVIDER=openai
OPENAI_API_KEY=your-private-api-key
OPENAI_MODEL=your-supported-model-id
```

Choose a model available to the selected API project that supports structured JSON output. For OpenAI it must support Responses and strict Structured Outputs. Gemini uses the Interactions API with JSON Schema output; `gemini-3.5-flash-lite` is the lightweight model verified with the configured local project. Restart the API after changing its environment, then start a new assistant conversation to refresh capabilities. Do not put the key in `NEXT_PUBLIC_*`, source control or browser code. Guided mode needs neither an API key nor a model. Explicitly selecting a provider with either setting missing prevents API startup, naming only the missing configuration field. Provider selection is explicit; configured credentials for another provider are not used automatically.

The integrations use [Gemini's Interactions API](https://ai.google.dev/api/interactions-api), or [OpenAI's Responses API](https://developers.openai.com/api/docs/guides/text) and [strict Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Both share the same interpretation instructions and output schema. Gemini credentials travel only in the `x-goog-api-key` header to Google's fixed HTTPS endpoint; OpenAI uses its authorization header and fixed endpoint. One bounded request interprets each question into an allowlisted intent, help topic, project status and literal search phrase. It receives only the question and up to six previous successful user questions. Workspace records, balances, share tokens and assistant answers are not sent to the interpreter. `store: false`, no automatic retries and an 800-output-token cap are configured. Gemini uses a fifteen-second timeout and non-streaming requests, with minimal thinking for the supported 3.1/3.5 Flash-Lite classifiers and low thinking for other models; OpenAI uses an eight-second timeout. A model refusing, timing out, returning incomplete output or failing validation falls back to the labelled guided mode for that answer. The adapters never return raw provider error bodies.

From the repository root, `npm run assistant:check` validates the server environment without making a provider call or connecting to MongoDB. `npm run assistant:check -- --live` sends one synthetic open-project question and requires a valid structured interpretation; it deliberately does not fall back to guided mode, so an authentication failure cannot appear as a successful connection check. It logs configuration identifiers, success or sanitized diagnostics, never a credential or provider response body. The check also validates the API's required environment fields, so use the normal local API environment.

Model output is never displayed as factual answer text, executed as a query or used as a workspace ID/URL. The server dispatches only the fixed read operations; actual data and identifiers come from scoped readers, and the client constructs local record URLs. Instructions come from reviewed bilingual help content. This intentionally limits the first version to product help and trusted reads.

## HTTP and UI behavior

- `GET /api/v1/assistant`: authenticated configured capability (`guided`, `gemini` or `openai`); this does not perform a live provider health check.
- `POST /api/v1/assistant`: authenticated same-origin request with `{ message, history? }`. Message: 1–1000 characters; history: up to six questions of that size. Query/body scope overrides are rejected. Server session identity supplies workspace and user.
- Replies contain a validated plan, effective engine, degradation flag, read timestamp, bounded records, `hasMore`, and optional summary facts. Responses use `Cache-Control: no-store`.
- Twenty questions per minute per authenticated workspace member, using the same in-process deployment constraint as existing limits. No public assistant endpoint.
- Stop aborts the current request. Closing retains a pending request and conversation; reopening reveals its eventual result. New conversation aborts pending work. Authentication changes unmount and abort the assistant.
- Request errors preserve the question and offer explicit retry. Failure never becomes invented zeroes. Input remains editable while a request is pending. A conversation is capped at twenty turns before starting a new one.
- Native modal semantics, cancel/close controls, focus restoration/trapping, live status, reduced motion and short-height scrolling are included. Existing unsaved-change guards apply to source links.

## Verification

The product-context correction on 2026-10-18 passed 95 assistant/dashboard API tests, seven localization checks, architectural boundaries, lint and application types. Three Chromium journeys passed across targeted runs: product explanation and follow-up with a separate real project read, independent question/answer language, and the twenty-combination language/theme/viewport audit. Six synthetic live Gemini questions correctly distinguished Arabic/English product explanations, a product follow-up, open project records, project-creation help and literal named search. No workspace records or credentials were logged by those live checks. Both local development health checks returned HTTP 200 afterward.

The adapters are tested with injected HTTP responses. Unit and real MongoDB/HTTP cases cover classification, schema/refusal failures, safe fallback, membership revocation, origin validation, scope override rejection, per-member rate limits, literal search, bounded lists, cross-workspace records/ledgers and exact balances with voided payments. Gemini cases also cover cancellation, response size, stateless structured requests and explicit composition/provider reporting. Browser cases exercise real data, sources, navigation/language persistence, retries, stop, sign-out, Gemini reply parsing, capability refresh, composer focus after the twenty-turn cap and Arabic/English layouts in both themes. Screenshots live under `.cache/ui/assistant`.

A local live Gemini connection succeeded on 2026-10-17 using the final `gemini-3.5-flash-lite` configuration: the normal readiness command returned a completed structured plan with intent `projects` and status `open` for a synthetic English question. A second live check correctly interpreted `والمتوقفة؟` following `إيه المشاريع المفتوحة؟` as `projects` / `on_hold`. Both checks completed within three seconds including command startup. The configured key is held only in the ignored API environment file; no key or project identifier is recorded here. Local tests do not claim a deployment to an external hosting environment.

Earlier application verification on 2026-10-17 covered 831 API cases across the regular run and targeted retries. The Gemini completion pass reran 81 related API cases and all four assistant Chromium journeys successfully. Six localization checks, architectural boundaries, formatting, lint, application/release types and both production builds passed. The assistant layout journey covers twenty combinations of Arabic/English, light/dark and five viewport sizes from 320×256 to 1440×900, with forty layout inspections and twenty Axe scans. Desktop/mobile screenshots were visually reviewed; no live OpenAI call or physical-device run is claimed.
