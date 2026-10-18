# Lancelio interface notes

## Settings sections

Settings now separates profile (`/settings`), account security (`/settings/security`) and workspace (`/settings/workspace`) into independently addressable sections. A compact internal menu sits beside the single active paper form on desktop and becomes three labelled choices above it on narrower screens. The main Settings navigation remains active throughout; each page has one primary heading. Section changes use the shared short entrance and reduced-motion policy. Unsaved names and typed password fields use the existing departure guard, including section links and browser Back; cancelled departures retain the form. Password fields are discarded after a confirmed departure. The owner-only workspace controls and explicit password-change confirmation remain in their respective sections.

## Visual refresh — October 2026

The notebook identity now pairs a deep forest sidebar and authentication panel with airy warm surfaces, soft green accents and rounded paper cards. The dashboard opens with a composed welcome panel and real shortcuts to create a proposal or review projects. The workflow guide follows the live overview so the current work remains the first priority. Counts have distinct icon accents; tasks, finances and link expiry form a two-column layout on wide screens and stack in reading order below 1100px. Financial amounts remain exact, wrap locally and keep separate currencies.

`ViewportMotion` observes shared workspace surfaces, including those arriving after API reads. Each enters once per route when it reaches the viewport; scrolling back, editing fields and refreshing existing cards do not replay entrances. Content remains visible before JavaScript and without the observer. Motion lives in `app/motion.css`: short staggered reveals, finite paper/stamp entrances, card elevation, arrow feedback and the existing focused dialog transitions. Reduced-motion changes immediately remove active entrances and preserve controls and content. The authentication illustration keeps its height-aware behavior.

Browser checks use a dedicated output directory under `.cache/next-e2e`, allowing the regular development server to stay running. Set `E2E_CHROMIUM_CHANNEL=chrome` or `msedge` to use an installed browser; leave it unset for bundled Chromium. A project-local browser installation can be selected with `PLAYWRIGHT_BROWSERS_PATH` pointing to its cache. Visual refresh screenshots are saved under `.cache/ui/visual-refresh` with isolated test-account data; they are local verification artifacts, not production data.

## Visual direction — WEB-003

Lancelio is a freelancer's work notebook. Warm neutral surfaces carry the content; forest green anchors navigation and actions, sage marks a saved client or a pricing summary, and a small ochre accent appears in the identity. Avoid invented figures and the repeated use of large coloured cards. Differentiate navigation, editable documents, lists and saved reviews through composition and typography.

The shared Brand component uses the supplied transparent logo: white on forest backgrounds and green on light surfaces, with the orange circle in both variants. Public documents use the green mark. The favicon and mobile home-screen icons remain independent assets.

IBM Plex Sans Arabic is bundled locally in three WOFF2 weights (400/500/600) through the installed `next/font/local` API. No font CDN is needed at build or page-load time. Its license and provenance are saved beside the assets in `apps/web/src/styles/fonts`. Use the bundled weights without synthetic bold. Arabic headings use natural letter spacing, a 1.5 line height, and 500 weight; body/input text is generally 14 px, with 12–13 px secondary text.

`src/styles/tokens.css` defines the palette, shared surfaces, focus colour, page gutters, radii and restrained paper shadow. `app/globals.css` owns common controls, `auth.css` the authentication layout, `workspace.css` the shell/dashboard, and `clients.css` / `proposals.css` their feature surfaces. Change the owning rule instead of stacking a second layer of overrides. Motion stays in one stylesheet. `app/responsive.css` owns the shared touch-input policy and the narrow pricing layout; feature-specific wrapping and scroll behavior stay in the feature stylesheets.

## Workspace and authentication

Authentication pairs a quiet cream form with a forest editorial panel and a composed agreement illustration. The form remains the primary interactive surface. Mobile drops the illustration and keeps the brand, form hierarchy and comfortable controls.

The workspace uses a dark forest sidebar with a pale green active row and actual workspace/user identity. The top bar is secondary to the page title. The dashboard offers real client/proposal links and a draft-writing action; its labels do not claim counts or activity that have not been fetched. Upcoming modules remain visibly unavailable and do not resemble working links.

## Client book

Client rows use restrained initial avatars with a deterministic, name-based choice of three neutral tones. Names, contact details and record actions have separate columns on desktop. The ledger has one border and a quiet header instead of individually boxed rows. On mobile contact details stack beneath the name while edit/archive actions stay reachable. Loaded counts describe only the records currently on screen.

Search and contact filters use labelled native controls and visible focus. Escape/clear keep focus in search. Empty filtered results offer to reset criteria. The native edit/archive dialog retains focus isolation, pending-write guards, Escape handling, trigger restoration and scroll cleanup. Optional fields and the archive policy remain explicit.

## Proposal documents

The editor is a continuous document with three sections: agreement details, deliverables, then terms. Borders separate those sections inside one paper surface. A narrower receipt-style tally shows the pricing unit, provisional total and save action. It becomes a normal full-width section on mobile, and each item stacks its description above labelled quantity/price inputs.

The client picker expands for searching/paging and collapses after a choice to show one selected-client summary plus a change action. Cancelling a change keeps the selection. Closing cancels pending results and restores keyboard focus. All visible client data comes from the scoped API; no demonstration records are inserted into the app.

The saved review has a document header, captured client contact details, a real item table, and the server-calculated total. Only drafts expose editing controls. Sharing controls follow the saved review and expose real expiring links. Errors retain associated labels/IDs, totals/loading use polite announcements, and write failures use an alert. Monetary inputs keep decimal strings and a decimal keyboard.

## Motion and accessibility

`app/motion.css` owns durations: 160 ms for feedback, 520 ms for headings, 560 ms for viewport surfaces, 240 ms for contextual interactions, 260 ms for the mobile drawer, and 500–700 ms for illustrations. Headings move 8 px and viewport surfaces move 18 px; illustrations settle once. The last stagger finishes within one second. No perpetual decorative motion or external animation runtime is used.

Newly appended proposal rows enter once while existing draft rows stay still; stable field IDs prevent typing or reindexing from replaying the entrance. Client choice reveals a summary with a brief checkmark confirmation, searching expands without animating every result, and native client dialogs settle with an 8 px rise and a restrained scale. Button arrows nudge in their own direction on fine-pointer hover. These effects never postpone a write, removal or focus restoration.

Reduced motion removes animations and transition delays while preserving every control. The mobile menu remains inert while closed, traps focus while open, supports Escape, restores focus, prevents background scrolling and clears modal behaviour when resized to desktop. Dirty cancellation, conflict reload and uncertain-write recovery retain their existing behaviour.

## Verification and previews

Existing real-browser journeys cover auth, clients and proposals, desktop/mobile layout, normal/reduced motion, keyboard navigation, conflict recovery, session renewal, cancelled results and lost responses. Static screenshots wait for fonts and disable transient animations. `.cache/ui` contains current previews; `.cache/ui/before-design` preserves representative images from before WEB-003. The real sign-in, client-dialog and proposal-item interactions are recorded to `.cache/ui/motion-preview.webm`.

## Proposal sharing — PRP-002

Sharing follows the saved document in a quiet section rather than interrupting editing. A draft must be reviewed before its first link is issued; the scope of sharing and the content lock are visible beside the checkbox. Native duration selection, active/expired/revoked state, copy feedback and explicit renewal/revocation keep the workflow concrete. The link tray enters with a short reveal using the shared motion rules. Creating a link does not imply a message was sent.

The client sees the same paper document in a narrow independent layout, with actual sender/recipient names, readable terms and a clear expiry. Private contact details, navigation and session controls stay within the workspace. The unavailable-link screen offers a direct explanation, without exposing which grant state caused it. Current desktop/mobile previews are public-proposal-_.png and proposal-sharing-_.png under .cache/ui.

## Proposal decisions — PRP-003

Response controls sit beneath the reviewed agreement. Choosing accept/reject opens a focused confirmation with the final effect spelled out; cancellation restores the original button after controls remount. Confirmation enters with the shared brief fade, and the saved outcome appears with the same motion tokens. Reduced motion removes both effects. Successful decisions replace all response controls with the outcome and actual time. Unknown outcomes offer one explicit state-review action before another write.

The private sharing panel distinguishes old read-only grants from response-enabled links and makes renewal's added permission explicit. The owner refreshes a saved proposal to see its final decision and open the real accepted project. That project's page reuses the agreement's typography, line items and total, with an active-project badge and the accepted date. It is available only through authenticated workspace access.

New previews in `.cache/ui`: `proposal-confirmation-desktop.png`, `proposal-confirmation-mobile.png`, `accepted-project-desktop.png`, `accepted-project-mobile.png`.

## Responsive behavior — WEB-004

On touch devices and narrow layouts, controls use 44px targets and editable fields use 16px text. Small phones place each line item's price on its own row; numeric columns have enough space for long prices and the maximum quantity. The pricing summary scales down within the smallest phone widths. Long names/company names/URLs wrap in documents and client choices instead of widening the page. Account metadata may wrap independently of the identity heading.

Both the desktop sidebar and the mobile drawer scroll vertically in short viewports. Client dialog actions wrap instead of forcing the footer wider. Price tables retain their row/column structure and scroll within a labelled keyboard-focusable region, with a visible hint only when needed. Auth forms remain disabled until their client handlers have hydrated, so an early click cannot bypass validation.

See [responsive verification](RESPONSIVE.md) for the viewport matrix, screen states, artifacts and physical-device checks.

## Projects — PRJ-001

Projects are available in the workspace navigation and overview. The list uses quiet rows with actual title, saved client, origin and status, plus a native filter and paged loading. Narrow screens place the status below the title. The manual creation form reuses the focused paper layout and searchable client picker; it captures only title/client/optional scope.

Lifecycle controls sit above the project document. Confirmation explains terminal states and uses the shared short reveal only when motion is allowed. Cancellation restores the trigger; success announces the new state and focuses its heading. Conflict/unknown results focus the recovery message and provide an explicit read. Accepted projects reuse the frozen agreement document; manual projects show client/scope/start date without a pricing table or invented totals. Select controls use 16px text and at least 44px height.

Current project previews are project-manual-_.png and projects-list-_.png under .cache/ui.

## Project tasks — TSK-001

Tasks follow the saved project document in a quiet work section. Three lanes show actual counts and the states لسه هنبدأ / شغّالين / خلصت; narrower layouts stack the lanes without horizontal scrolling. Each paper card shows its title, optional scope and restrained priority label. Long titles and unbroken URLs wrap within the card. Empty lanes explain their actual state without sample records.

Editing uses a labelled native dialog with optional description and the shared styled priority selector. Deletion names the task and starts focus on cancellation. Up/down buttons and explicit destination/position controls support ordering by keyboard and touch. Move controls reveal briefly with shared motion tokens; reduced motion removes the effect. Saving announces the result; cancellation restores the trigger, and uncertain/conflicting writes focus explicit review controls. Closed projects show a read-only explanation and retain all task content. Input fields and selectors use 16px text and 44px minimum height, and touch actions retain 44px targets.

Task styles belong to app/tasks.css. The feature reuses established dialog/button/motion primitives; it introduces no animation dependency or drag-only interaction. Current previews are tasks-{engine}-{width}.png under .cache/ui. Tasks are labelled private to the workspace; project progress and client visibility will be defined separately in TSK-002.

## Task progress and client preview — TSK-002

A quiet progress section precedes the lanes, with the actual finished/total counts, Arabic digits and a native labelled progress bar. Empty work explains that progress is not yet calculated. The copy states that finishing tasks does not automatically close a project. Client visibility appears as a restrained text label on each card and an explicit allow/hide action, followed by focused confirmation describing the fields that can be shown. The default remains private.

A native disclosure beneath the board lets the owner inspect only the permitted client tasks and their separate visible-task progress. It clearly states that this is an owner preview and no project portal/link is currently available. Titles, descriptions and status are shown; private priorities, identifiers and dates are absent. Long text wraps on small screens, the disclosure has a 44px minimum target, and it remains available for terminal projects while editing actions disappear. Opening the preview uses the shared brief reveal; reduced motion keeps the content visible without animation.

Current screenshots in .cache/ui use task-progress-{engine}-{width}.png. They contain actual isolated-test records, including long-content cases.

## Invoice notebook — INV-001

The new invoice routes follow the existing continuous paper editor: client first, optional matching project, explicit line items and a compact exact-price tally. No number is guessed before saving. Saved review puts the server-assigned INV number beside the document heading, followed by contact snapshot, project link, readable line totals and final total. INV-001 initially labels saved invoices as private drafts; INV-002 adds explicit issuance and sharing below. Payment controls belong to PAY-001.

Shared priced-document/form/table components preserve the established typography, wrapping and restrained motion of proposals without duplicating financial rendering. Labelled comboboxes and inputs, linked field errors, line-item focus and a keyboard-focusable table region remain usable on narrow layouts. Changing clients clears the project choice; the picker pages through scoped projects and offers only the selected client's records. Unknown saves lock the form and link to ledger review; successful saves stay locked while detail navigation is delayed.

## Invoice review and client reading — INV-002

Draft review exposes a quiet edit action and a separate reviewed checkbox before confirmed issuance. The issued paper shows its captured sender, client, date and number with the fixed totals. Sharing follows the document in the existing restrained paper section: the shared styled lifetime selector, current grant state, manual-copy field and client preview. Renewal and revocation explain their effect through confirmation. Recovery controls state what must be reread; forms keep their unsaved content until the user explicitly discards it.

The anonymous /share/invoice page uses the established public paper typography and wrapped pricing table, with issuance and expiry dates. It contains only the permitted client name/company and frozen document, and offers no account, project, acceptance or payment actions. Expired/revoked links show a concise unavailable state; network failure offers explicit retry. Existing motion and reduced-motion rules apply without introducing an animation library.

## Invoice payment notebook — PAY-001

The private invoice review adds a quiet received-payment notebook with three actual figures: invoice total, recorded paid amount and remaining balance. Payment state is separate from issuance. Entries show their amount, receipt date, method and optional reference/note in wrapped paper rows. Cancelled entries retain their original amount with a restrained strike-through and visible correction reason/date. The issued financial document and public client page retain their original content.

Registration uses a labelled native dialog with exact decimal text, a date input and the shared styled payment-method selector. Confirmation explicitly asks whether money was received. Correction initially focuses cancellation and explains that it changes the record rather than refunding funds. On recovery, the editor keeps its written fields and lets the owner inspect current balances/entries before confirming again. The existing dialogue typography, 44px controls, short reveals and reduced-motion rules apply. Narrow layouts stack balances and wrap record controls; no new animation package is introduced.

## DSH-001 — a working ledger overview

The dashboard begins with four compact count columns, real task states and currency rows with invoiced/received/outstanding values. The paper palette, Arabic local font and tabular numerals carry the existing identity; no invented trend chart or sample totals appear. Links go directly to the relevant client/proposal/project/invoice records. Initial onboarding remains visible only for workspaces without any clients.

A dated read and explicit refresh distinguish the shown snapshot from live updates. Loading/failure remove financial figures; empty issued invoices and empty current links have separate plain-language states. Actual proposal grant dates appear as the nearest five available link expiries, with clear copy that delivery dates are not recorded yet. Four count columns become two on smaller layouts, currency amounts stack on narrow screens, and unbroken titles/large numbers wrap locally. Existing motion and reduced-motion behavior remain in place.

## PRT-001 — client work notebook

Each client row links to a private portal-management page. The review states that current and future same-client projects and issued invoice summaries are included, then shows the actual client-facing projection before the reviewed checkbox and native confirmation. Grant dates, renewal/revocation, manual-copy fallback and uncertain-write recovery use the existing paper controls. Client archive visibly disables new sharing.

The anonymous notebook has a client/workspace heading, visible-work progress, ordered permitted tasks and invoice total/paid/remaining rows. It has no sidebar/session controls, internal notes or payment history. Empty work and unknown progress use plain language. Independent next-page controls replace a bounded list; refresh returns to the first page and rechecks access. Expired/revoked pages remove the notebook and show one unavailable state; connection failures offer explicit retry.

Responsive layouts wrap names, long URLs and actions, stack invoice balances and task status on narrow screens, and keep native controls at 44px/16px. Review checkbox labels have a 44px hit area. Existing subtle transitions and reduced-motion policy apply without an added animation library. The private preview changes heading level so the page retains one primary heading.

## Overview clarity and guided motion

Workspace counts now separate the main figure from labelled status/number pairs, instead of a single dense sentence. Three bordered notebook sections distinguish task distribution, per-currency financial balances and real proposal-link expiry dates. A task strip reflects the actual todo/in-progress/done counts, with explicit zero-work text and a visible legend; it is not a project-completion estimate. The initial client action is a short panel above the counts.

A native disclosure introduces an interactive four-stage guide: clients, proposals, projects and invoices. Each button preserves focus and announces its short explanation without changing records, requesting new figures or navigating until the user chooses the relevant link. A separate disclosure explains invoiced/received/outstanding values and draft exclusion. Finite entrance and task-strip animations direct attention; money and count text appear at their actual final values. Guide-content animation exists only while the guide is open, and the shared reduced-motion rule removes all motion. The overview keeps its previous explicit-read, snapshot and failure-clearing behavior.

## Workspace search and quick creation

The workspace header includes global search (Ctrl/Cmd+K) and a four-action create menu on every authenticated page. Native modal dialogs support Escape, Tab wrapping, arrow navigation and focus restoration; existing editors and confirmation dialogs keep the shortcut from opening another overlay. On narrow screens the actions become labelled icon controls and the breadcrumb title yields space to the page heading.

Search begins after two characters and a 300ms debounce. Authenticated `/api/v1/search?q=...` queries the current workspace's client names/company names, project/proposal titles and client snapshots, and invoice titles/client snapshots/numbers. It returns at most five matches per type and indicates when to refine a query; it does not search a downloaded first page. Arabic and Persian invoice digits are accepted, regex characters are literal, and workspace scope comes only from authenticated identity. Projection excludes notes, financial lines and sharing secrets; reads have a database timeout and no-store responses.

Results open document routes or the client's editor through `/clients?client=<id>`. Archived clients are labelled and retain their existing read-only behavior. `/clients?new=1` opens a new-client form; the other creation actions open their existing forms and never submit a record automatically. Closing or saving a routed client editor removes the entry query. Changing a query or closing the dialog aborts pending reads, and failures offer an explicit retry with stale results removed.

The shared unsaved-change guard now protects draft proposals, invoices and manual projects as well as settings, including global search and creation links. Cancelling a departure keeps the editor and its draft. Successful explicit saves retain their original navigation without an extra confirmation.

## Site appearance

The header and authentication shell offer a labelled light/dark switch. `/settings/appearance` adds native radio choices for light, dark and system appearance in a separate settings section. The browser preference applies immediately, survives navigation/reload/logout and synchronizes between tabs. System mode follows live device changes; an explicit choice stays fixed. Invalid storage follows the system, and denied storage keeps the current-tab choice usable. Theme code persists no account data and makes no API writes.

A small static inline head script resolves appearance before hydration to avoid a light first paint. The root provider handles device/storage changes, while narrowly scoped html hydration suppression accommodates the theme attribute. Dark semantic colors cover text, panels, inputs, borders, status badges, dialogs and loading placeholders; light values remain the CSS fallbacks. Existing green/white logo assets switch with surface appearance, independently of favicon files. The compact header keeps 44px controls at 320px width, and native radio labels provide a full card-sized touch target. No page-wide color animation or extra dependency is introduced.

## Shared styled selects

All finite-choice dropdowns use `components/ui/select.tsx`: language, list order/contact/project filters, document currency/project, link lifetime, payment method, task priority/destination/order and project status. Their popup uses the site surface, green selection check, rounded rows and a short reduced-motion-aware reveal. Native date inputs and radio groups retain their existing behavior.

The select-only combobox keeps DOM focus on its labelled button and uses `aria-activedescendant` for the active option. Arrow/Home/End/Page keys and typed prefixes move the preview; Enter/Space commits, Escape cancels without closing the parent dialog, and Tab commits then moves focus normally. Outside clicks dismiss it. Selecting the current locale still saves a manual preference. Controlled fields use React Hook Form Controllers so validation focus, dirty state and persisted values keep working.

An in-place manual popover places the list in the browser's top layer while preserving its dialog ancestry. Fixed viewport positioning clamps width and height, flips above the trigger when needed and follows scrolling/resizing. Long lists scroll internally; option text wraps, trigger text truncates and touch targets remain at least 44px. The implementation adds no package dependency.

Triggers remain disabled until hydration attaches their handlers, avoiding lost initial keyboard input. Verification on 2026-10-18 includes a final seven-case browser run: the twelve-combination language/theme/viewport popup audit on Chromium, Firefox and WebKit; device-default/manual language persistence; proposal currency editing; long scoped project selection; and an explicitly changed payment method checked in the stored ledger. Earlier targeted runs also passed client/list filters, sharing lifetimes, project status, portal sharing and task editing/ordering on the three engines, including Escape cancellation inside native dialogs. Localization, lint, application types, formatting, architectural checks and an isolated production web build passed. Local web/API health checks both returned HTTP 200. Screenshots are in `.cache/ui/select`.

## Arabic and English

Language defaults to the first supported browser preference. The server resolves the validated `lancelio_language` cookie before the weighted `Accept-Language` header, falling back to Arabic. It renders `lang` and `dir` on the first response. Reading request preferences makes interface routes dynamic; icon assets remain static. There are no locale path prefixes or redirects, so queries and document grant fragments keep their existing contracts.

Language controls appear in authentication, the workspace sidebar, public documents and `/settings/language`, styled as a compact pill with an integrated globe, current language and chevron. The shared styled select-only combobox offers Arabic and English, with the effective locale checked. Device-following is the implicit default until a manual choice is saved; choosing the already active language also saves an explicit preference. Manual changes apply immediately and persist for a year on the current browser. The provider refreshes server metadata while preserving client form state, including a recovery token already captured and removed from the URL. Arabic uses RTL and English LTR; directional arrows, mobile drawer entry and password controls adapt. Language changes do not write account or document data.

The paired source-message catalogs live in `src/i18n/messages`. `useI18n` translates interface copy, validation, system feedback, labels and metadata; user-entered names, titles, notes and document items bypass translation. Positional placeholders insert user content without translating it. Numbers, dates, money and common count plurals use the selected locale. Money parsing and exact minor-unit arithmetic remain independent of display locale and document currency. Inputs keep their existing decimal syntax.

`npm run test:localization` checks language negotiation, catalog parity, placeholders, static translation coverage, plural forms and exact money formatting. Browser coverage checks server defaults and manual overrides, drafts and recovery-token survival, real workspace and public-document copy, keyboard/accessibility behavior and English LTR layouts from 320px to desktop in both themes. Screenshots are saved under `.cache/ui/language`.

## Workspace assistant

An authenticated floating message control opens a modal side panel with a first-name welcome, suggested questions, a readable conversation, source cards and a fixed composer. It adapts to Arabic/English, both themes and short mobile screens. The transcript stays in memory across workspace routes, while questions and record titles keep their original language. Gemini/OpenAI generate escaped plain-text conversation and contextual help; real workspace facts use exact scoped cards, with honest timestamps and bounded-result notes. The welcome explains that first name, questions and limited reply excerpts go to the provider; database cards do not. The panel offers stop, retry, new conversation, Escape and restored launcher focus; a source link closes it and uses the existing departure guard. The assistant is absent from authentication and public documents. Guided mode is visibly distinguished from intelligent conversation. New conversations refresh configured capabilities; validated successful replies synchronize the displayed mode, while a degraded answer retains its explicit fallback notice. Configuration and behavior are documented in [ASSISTANT.md](ASSISTANT.md).

## Remembered list views

Clients remember search text, contact criteria, active/archive view and ordering; projects remember status and ordering. Proposals and invoices remember ordering, and the full notification inbox remembers all/unread independently of the header preview. Each preference belongs to a user and workspace on the current browser and is validated before use. Invalid stored values fall back to the default view; a blocked/full browser store falls back to memory for navigation in the current tab. No list rows, credentials or pagination cursors are persisted.

The four notebooks offer newest/oldest ordering through the authenticated list APIs. The database orders by the existing creation identifier and uses the corresponding cursor direction, so later pages preserve the chosen order and workspace/filter scope. Changing criteria starts a fresh first page. A visible reset action returns each notebook to its default view; preferences are read before the result component mounts. The controls wrap on narrow screens and retain native labels, touch targets and readable input text.

## Shared feedback and loading

The root feedback provider renders one native modal confirmation at a time with the original action-specific explanation, cancel-first focus, Escape cancellation, a focus trap and focus restoration. Application confirmations use an asynchronous shared service; cancellation performs no write. Document close/reload and cross-document history continue to use the browser's required beforeunload warning. Dirty settings links and same-document history retain their guard and replay navigation only after explicit acceptance.

Verified saves show a small dismissible success notification; uncertain or failed writes do not produce success. Existing inline receipts retain their announcements, while operations that navigate announce their new notification. The latest notification replaces the previous one and clears on logout. Modal and toast motion is finite and disabled with reduced motion.

Reusable placeholders reserve card and list space while dashboard, client, proposal, project, invoice, task, payment, settings and notification reads are pending. Decorative bars are hidden from assistive technology and a single labelled status describes loading. Failure removes placeholders and exposes the existing explicit retry, with no invented counts or money. Placeholder animation obeys reduced motion.

## Compact overview and notification preview

The dashboard uses a short greeting with primary actions, followed by actual counts, an optional follow-up strip for unfinished tasks and the nearest available proposal-link expiry, and task/financial/link details. The decorative hero illustration and repeated tool descriptions are removed; four small tool links and the collapsed usage guide remain below the overview. No figures are estimated or combined across currencies.

The header bell opens a non-modal preview of the latest six events with explicit read/unread actions and a link to the full inbox. Opening a document never marks its event as read. The preview reuses the inbox's authenticated reads, conflict recovery and authoritative count; loading a preview preserves the badge until success or failure. Escape and the close button restore focus, outside clicks and departing keyboard focus dismiss it, and route changes unmount pending reads. Its scrollable body keeps the close control and full-inbox link reachable on short mobile viewports. Finite entrance motion respects reduced motion.

## Notification notebook

The workspace header bell is the single navigation entry for /notifications. Each row separates a plain event label, document title, actual event time, destination and read action. Unread rows use a small dot and green notebook edge; read rows use a check and subdued paper without hiding the content. All/unread filters and the global unread total are separate from the current page. The copy explains explicit refresh and personal read state.

Entrance motion is finite (280ms, once); no pulsing badge, moving count or animation library. Reduced motion removes it. Read changes announce success, and filtering out a row restores focus to the unread filter after controls re-enable. Native 44px controls, wrapping titles and stacked actions support touch and keyboard. Failures remove rows/counts and show explicit recovery rather than keeping stale figures.

## Sidebar height and a single notification entry

The header bell is the only notification entry; the sidebar contains overview, clients, proposals, projects and invoices. Brand/workspace and account/logout rows do not shrink. A flexible middle region scrolls only its links when the viewport is too short, keeping logout and closing controls available. Navigation links retain 44px targets. Compact height rules reduce spacing and omit the decorative note; very short viewports omit the section label and workspace subtitle. Body scrolling remains available for page content. Mobile Escape/Tab behavior remains unchanged, and switching a notification-page drawer to desktop focuses the first navigation link when no sidebar link is current.

## Password recovery

Recovery reuses the compact authentication shell, typography and existing finite/reduced-motion entrance. A two-step indicator shows request → new password; it never implies confirmed delivery. Request confirmation uses generic mailbox wording, an expiry explanation and an explicit resend action. Reset uses labelled new-password/confirmation fields, a visibility toggle and the same password policy as registration. Expired links offer a fresh request. Success requires new login; uncertain writes remove the submit action and direct the user to try the new password or request a fresh link. Neither browser persistence nor automatic write retries retain recovery secrets.
