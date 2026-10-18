# Lancelio assistant

The authenticated assistant combines natural conversation with read-only workspace queries. Gemini or OpenAI can greet the user by first name, discuss ordinary questions, brainstorm, draft text and explain Lancelio in context. The floating message button opens a native modal side panel, using the site's language, direction and appearance. Real summaries, project lists, outstanding invoice balances and literal record search use scoped data cards, with read timestamps and source links. The conversation and typed draft survive workspace navigation and language changes in the current tab. They clear on page reload, sign-out, unavailable authentication, or a user/workspace change; a new-conversation action also clears them. No transcript is written to browser storage or MongoDB.

Each reply follows the language of its question rather than the interface language. Arabic questions receive Arabic instructions, read results and errors with RTL direction and Arabic date/money formatting, even on an English interface; English questions receive English with LTR direction. Technical English words in Arabic questions do not force an English reply. A leading English question/search command keeps its language when a literal record name uses Arabic. Questions without letters inherit the last successful turn's language, then the interface language. This is a bounded Arabic/English text heuristic, not general multilingual language identification. The chosen reply language stays with that turn when the site language changes or the request is retried; record titles and other user data remain untouched.

## Available without a key

`ASSISTANT_PROVIDER=guided` is the default. Bilingual suggested questions, known help questions and a small set of explicit read queries work without an external model:

- `ملخص شغلي` / `My work summary`
- `كلمني ع المشروع بتاعنا` / `What is Lancelio?`
- `إيه المشاريع المفتوحة؟` / `What are my open projects?`
- `مين العملاء اللي عليهم مستحقات؟` / `Which clients have outstanding payments?`
- `إزاي أعمل فاتورة؟` / `How do I create an invoice?`
- `ابحث عن اسم العميل` / `find INV-001`

Guided mode is labelled clearly in the panel. Basic greetings use the authenticated first name. Unrecognized questions explain the supported queries; open-ended conversation requires an external provider. Instructions link to existing forms; the assistant does not create, edit, issue, share, send, pay or delete records. A provider may draft text in the conversation, but saving a proposal or sending a message remains a separate user action.

Product questions have a dedicated `help/product` topic with reviewed knowledge covering Lancelio's purpose, client-to-proposal-to-project workflow, tasks and client visibility, invoicing and manually recorded payments, settings, notifications and assistant limits. Guided explanations use the bilingual catalog; provider explanations use this reviewed knowledge and temporary conversational context. Generic phrases such as `كلمني ع المشروع بتاعنا` refer to Lancelio, not a list of client projects or instructions for creating one. Product follow-ups such as `وايه مميزاته؟` keep that context; explicit project lists, named searches and feature instructions retain their separate routes. No source code, deployment knowledge or unreleased capabilities are implied.

Short project-status follow-ups such as `والمتوقفة؟`, `طب المكتملة؟` and `and on hold?` retain the immediately preceding project-list context, including a chain of those follow-ups. A topic change, an unsupported question or help instructions ends that context. Neither guided follow-ups nor intelligent interpretation grant write access.

Open projects includes active and on-hold projects. Project and receivable answers show at most six recent matches and explicitly report when more exist. Search uses the existing five-per-notebook search cap. Receivables are **outstanding**, not necessarily overdue: Lancelio does not infer a due date. Issued invoice snapshots provide titles/client names; only non-voided ledger entries in the same workspace reduce the balance. Drafts and settled invoices are excluded. Decimal aggregation and integer minor-unit strings preserve exact money; currencies remain separate. The summary reuses the dashboard's snapshot reader.

## Configure natural conversation

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

The integrations use [Gemini's Interactions API](https://ai.google.dev/api/interactions-api), or [OpenAI's Responses API](https://developers.openai.com/api/docs/guides/text) and [strict Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Both share the same classification and conversation contracts. Credentials travel only in headers to the provider's fixed HTTPS endpoint. One bounded call classifies each question into an allowlisted intent, help topic, project status and literal search phrase. It receives the question, up to six previous successful questions and excerpts from generated replies in those turns. For `chat`, `help` and `clarify`, a second call generates `{ message }`, using that context, the first name from the authenticated server identity, the reply locale and reviewed product knowledge. The browser sends no identity override. Excerpts contain at most 1000 question characters and 2000 answer characters per turn. Read cards and database records, balances, share tokens and IDs are never automatically sent to either model call. Users' own typed questions can contain information they choose to share; the welcome panel explains the selected provider data flow.

`store: false`, no automatic retries and an 800-output-token cap are configured for each call. Gemini uses a fifteen-second timeout and non-streaming requests, with minimal thinking for the supported 3.1/3.5 Flash-Lite models and low thinking for other models; OpenAI uses an eight-second timeout. Conversation takes two sequential calls, so latency and token use are higher than guided help. Refusals, timeouts, incomplete output and invalid prose fall back to labelled guided help; cancellation propagates instead of showing success. Raw provider error bodies are never returned.

From the repository root, `npm run assistant:check` validates the server environment without making a provider call or connecting to MongoDB. `npm run assistant:check -- --live` sends one synthetic open-project question and requires a valid structured interpretation; it deliberately does not fall back to guided mode, so an authentication failure cannot appear as a successful connection check. It logs configuration identifiers, success or sanitized diagnostics, never a credential or provider response body. The check also validates the API's required environment fields, so use the normal local API environment.

Generated prose is displayed as escaped plain text, with a 4000-character cap and no executable HTML, Markdown renderer or automatic links. It can still be mistaken; current workspace facts come from separate scoped read cards. Questions and prior answers are explicitly untrusted context, never system instructions or authorization. The assistant has no model tools or write access. For data intents the server dispatches only fixed reads and skips response generation; actual facts and IDs come from scoped readers, and the client constructs local record URLs.

## HTTP and UI behavior

- `GET /api/v1/assistant`: authenticated configured capability (`guided`, `gemini` or `openai`); this does not perform a live provider health check.
- `POST /api/v1/assistant`: authenticated same-origin request with `{ message, history?, conversation?, locale? }`. Message: 1–1000 characters; history: up to six questions of that size. Conversation: up to six strict `{ question, answer }` objects, capped at 1000/2000 characters. Optional locale is `ar` or `en`. Unknown fields, identity and scope overrides are rejected. Server session identity supplies workspace, user and first name.
- Replies contain a validated plan (including `chat`), nullable `message` for prose, effective engine, degradation flag, read timestamp, bounded records, `hasMore`, and optional summary facts. Responses use `Cache-Control: no-store`.
- Twenty questions per minute per authenticated workspace member, using the same in-process deployment constraint as existing limits. No public assistant endpoint.
- Stop aborts the current request. Closing retains a pending request and conversation; reopening reveals its eventual result. New conversation aborts pending work. Authentication changes unmount and abort the assistant.
- Request errors preserve the question and offer explicit retry. Failure never becomes invented zeroes. Input remains editable while a request is pending. A conversation is capped at twenty turns before starting a new one.
- Native modal semantics, cancel/close controls, focus restoration/trapping, live status, reduced motion and short-height scrolling are included. Existing unsaved-change guards apply to source links.
- The compact welcome uses a two-column shortcut grid and expandable conversation/privacy details. Fresh conversations open at the top; reopening a transcript restores its reading position. Sending a question reveals that turn, while long replies start at their beginning. Incoming replies do not pull a reader away from older messages. A latest-messages button offers an explicit jump to the end, respecting reduced motion. Overflow uses a thin themed scrollbar; short screens still scroll when needed.

## Verification

The compact welcome and scroll correction passed the new scroll journey and the existing language/theme/layout audit in Chromium, Firefox and WebKit. The scroll journey checks Arabic/English at four viewport sizes, first-open and fresh-conversation position, keyboard-operated privacy details, reading the beginning of a long reply, incoming replies while reading older messages, reopening at the saved position and an explicit reduced-motion jump to the latest messages. Firefox's intrinsic grid-column overflow at 320px is constrained with a zero-minimum column. Existing Chromium assistant journeys continued to pass.

The natural conversation update on 2026-10-18 passed 124 assistant/dashboard API cases, seven Chromium journeys, seven localization checks, lint, architectural boundaries, application/release types and both production builds. New cases cover arbitrary contextual replies, authenticated first-name personalization, context limits, provider generation failures, cancellation, escaped HTML, independent answer language and clearing on new conversation/reload. Injected HTTP tests cover both providers; synthetic live Gemini trials exercised greetings by name, advice with a follow-up, English text drafting, reviewed Lancelio explanation and a separate project read. One live trial degraded during classification, which remained visibly guided; local passing checks do not promise uninterrupted provider availability. No real workspace records were sent in these trials. OpenAI generation was tested with injected responses, without a live key.

The product-context correction on 2026-10-18 passed 95 assistant/dashboard API tests, seven localization checks, architectural boundaries, lint and application types. Three Chromium journeys passed across targeted runs: product explanation and follow-up with a separate real project read, independent question/answer language, and the twenty-combination language/theme/viewport audit. Six synthetic live Gemini questions correctly distinguished Arabic/English product explanations, a product follow-up, open project records, project-creation help and literal named search. No workspace records or credentials were logged by those live checks. Both local development health checks returned HTTP 200 afterward.

The adapters are tested with injected HTTP responses. Unit and real MongoDB/HTTP cases cover classification, schema/refusal failures, safe fallback, membership revocation, origin validation, scope override rejection, per-member rate limits, literal search, bounded lists, cross-workspace records/ledgers and exact balances with voided payments. Gemini cases also cover cancellation, response size, stateless structured requests and explicit composition/provider reporting. Browser cases exercise real data, sources, navigation/language persistence, retries, stop, sign-out, Gemini reply parsing, capability refresh, composer focus after the twenty-turn cap and Arabic/English layouts in both themes. Screenshots live under `.cache/ui/assistant`.

A local live Gemini connection succeeded on 2026-10-17 using the final `gemini-3.5-flash-lite` configuration: the normal readiness command returned a completed structured plan with intent `projects` and status `open` for a synthetic English question. A second live check correctly interpreted `والمتوقفة؟` following `إيه المشاريع المفتوحة؟` as `projects` / `on_hold`. Both checks completed within three seconds including command startup. The configured key is held only in the ignored API environment file; no key or project identifier is recorded here. Local tests do not claim a deployment to an external hosting environment.

Earlier application verification on 2026-10-17 covered 831 API cases across the regular run and targeted retries. The Gemini completion pass reran 81 related API cases and all four assistant Chromium journeys successfully. Six localization checks, architectural boundaries, formatting, lint, application/release types and both production builds passed. The assistant layout journey covers twenty combinations of Arabic/English, light/dark and five viewport sizes from 320×256 to 1440×900, with forty layout inspections and twenty Axe scans. Desktop/mobile screenshots were visually reviewed; no live OpenAI call or physical-device run is claimed.
