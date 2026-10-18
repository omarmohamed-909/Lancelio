# Responsive verification

Run from the repository root:

```sh
npm exec --workspace @lancelio/web -- playwright install chromium firefox webkit
npm run test:responsive
```

The suite starts an isolated MongoDB replica set and API on localhost:5100, plus Next.js on localhost:3100. It uses real accounts, clients, proposals, sharing and accepted projects. It never connects to the configured application database. Keep both ports free. A local `mongod` can be selected with `MONGOMS_SYSTEM_BINARY`; otherwise the test harness downloads its test binary.

## Coverage

Each viewport runs on Chromium, Firefox and WebKit. Widths and heights are CSS pixels:

| Group                             | Viewports                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Phones                            | 320×568, 360×640, 375×812, 390×844, 412×915, 430×932                                                   |
| Tablets and breakpoint boundaries | 600×900, 601×900, 760×900, 761×900, 768×1024, 820×1180, 960×800, 961×800, 1024×768, 1100×900, 1101×900 |
| Desktop                           | 1280×800, 1440×900, 1920×1080                                                                          |
| Landscape and short viewports     | 568×320, 844×390, 390×420, 640×450, 320×256                                                            |

That gives 75 complete viewport journeys, plus one live rotation/reflow journey per engine: **78 tests**. Each complete viewport journey inspects 21 screen states, giving **1,575 screen observations**:

- Registration and validation; login and workspace dashboard.
- Client list, creation dialog, validation, archive confirmation and empty search.
- Proposal list, new form, validation, populated editor, saved review and sharing controls.
- Accepted project agreement.
- Public proposal, decision confirmation, successful decision and unavailable link.
- Session-unavailable recovery screen.

Widths up to 1100px use touch emulation and double device pixel density, except the 961×800 case, which checks a narrow desktop window with a fine pointer. Chromium/WebKit phone widths also enable mobile viewport emulation. Firefox does not support Playwright's `isMobile` option; its phone cases use narrow viewports and touch emulation. The live reflow journey changes 390×844 → 844×390 → 390×420 → 844×390 → 320×256 while navigation/dialogs are in use.

## Checks

- No horizontal page overflow or visible content extending beyond the configured viewport. Mobile browsers' expanded layout viewport must not conceal an overflow failure.
- Long Arabic names, unbroken Latin company names/email/URLs, maximum-length proposal titles and large valid totals remain within their containers. Numeric input text is measured against its available width, including a 10000 quantity and a 9999999.99 unit price.
- Touch buttons have at least a 44×44 CSS pixel target; text inputs/selects have at least 44px height and 16px text. Checkbox/link behavior is exercised by the journeys; this geometric check does not certify every link's target size.
- Price tables may scroll horizontally inside their own region. When scrolling is needed, the region has a label, keyboard focus and a visible hint; arrow-key scrolling is verified.
- Sidebars remain scrollable in short viewports. Logout stays reachable, Escape restores trigger focus, and Tab/Shift+Tab stays inside the mobile drawer.
- Rotating to a desktop layout dismisses the drawer, releases body scrolling and clears background inertness. Client dialog input survives rotation; closing returns focus to its trigger.
- Validation, confirmation and recovery controls remain usable. Real writes verify sharing and acceptance rather than substituting static fixtures.

Responsive checks use reduced motion to measure settled layouts. Existing browser journeys separately exercise normal/reduced motion, keyboard interactions, auth/session recovery and business flows. `npm run test:e2e` runs those Chromium journeys together with the three-engine responsive suite. CI is configured to install all three engines and run this combined command after quality checks.

## WEB-004 baseline verification

Verified on Windows on 2026-10-08 against the WEB-004 screens and locked dependencies, before PRJ-001 expanded project management:

| Engine   | Complete viewport journeys | Screen observations | Live reflow |
| -------- | -------------------------- | ------------------- | ----------- |
| Chromium | 25                         | 525                 | Passed      |
| Firefox  | 25                         | 525                 | Passed      |
| WebKit   | 25                         | 525                 | Passed      |

All **78 unique responsive cases** passed across the verification batches, with **zero recorded layout/touch/numeric-width issues in 1,575 observations**. All **38 existing Chromium journeys** also passed. The final `npm run check` passed formatting, lint, both architecture guards, app types, **259 API tests** and production builds for both apps. CI is configured; these results describe local execution.

The consolidated successful viewport records and summary are preserved locally in `.cache/responsive-report`, separately from Playwright's replaceable output directory. Physical iPhone/Android checks remain outside this verification.

## Artifacts and limits

Per-viewport JSON records are in `.cache/playwright-results/**/responsive.json`; Playwright replaces that directory on its next run. Screenshots for representative phone, tablet, desktop and landscape cases are in `.cache/ui/responsive`. These contain deliberately extreme test data, not production accounts.

Viewport/touch emulation and the Windows WebKit build are not physical iPhone/Android testing. Short viewport cases approximate the space available with an on-screen keyboard; they do not reproduce its native behavior. A 320px layout covers narrow reflow, but does not certify browser zoom, enlarged system text or every accessibility setting. Before release, manually check a real iPhone/Safari and Android/Chrome: native keyboard open/close, address-bar collapse, rotation, pinch/browser zoom, text scaling, table swipes, dialog footer reachability and drawer scrolling. Repeat these cases when new screens are added.

## Project screen coverage — PRJ-001

The new manual creation, project list and lifecycle controls have five focused journeys per engine: 320×568, 390×844, 768×1024, 844×390 and 1440×900. Each journey checks validation, active details, confirmation, filtered list and terminal details using the shared overflow/touch/input inspector. The 320px journey includes a long unbroken project title and a 900-character URL in the scope. Cancellation restores the trigger and a successful change focuses the current-state heading. The narrowest journey also verifies reduced motion.

These are 15 new viewport cases and 75 layout observations across Chromium, Firefox and WebKit. Project browser verification also covers unknown outcomes, version conflicts, frozen accepted agreements, paging/filter reset, cancelled stale responses and delayed navigation after creation. The WEB-004 matrix above remains a historical baseline; it has not been rerun in full for this story. Physical-device limits still apply.

PRJ-001 local verification completed on 2026-10-09: all 59 cases in the regression batch passed (38 existing journeys, 6 project recovery/paging journeys and 15 project viewport cases). A subsequent 7-case run passed after the final synchronous-guard change, including the 320px reduced-motion journey on all three engines. The final npm run check passed formatting, lint, both architecture guards, types, 301 API tests and both production builds. These runs use isolated temporary databases and describe local verification.

## Task screen coverage — TSK-001

Private task boards have five focused journeys per engine: 320×568, 390×844, 768×1024, 844×390 and 1440×900. Each checks a validation dialog, long-content board, move controls, saved order and a completed read-only project, using the shared overflow/touch/input inspector: 15 viewport cases and 75 layout observations. The narrowest case uses reduced motion, a 117-character unbroken title and a 1200-character URL; ordering is rechecked after a real page reload. Native confirmation cancellation restores its trigger on all three engines, including WebKit's pointer-focus behavior.

Task browser recovery cases cover lost create/delete responses, revision conflicts with retained form input, project closure while editing, access-token renewal and a late board response after changing projects. The final regression batch also includes the existing auth/client/proposal journeys and PRJ-001 management/recovery cases. Screenshots are saved as tasks-{engine}-{width}.png in .cache/ui; the retained machine-readable regression results are in .cache/task-report/browser-summary.json, alongside both raw batch reports.

The WEB-004 full matrix remains a historical baseline and is not represented as rerun for TSK-001. Viewport emulation and physical-device limits above still apply.

TSK-001 local verification completed on 2026-10-09: all 80 unique regression cases passed across the verification batches (38 existing journeys, 6 project recovery/paging journeys, 6 task recovery/session/navigation journeys and 30 project/task viewport cases). The first batch passed 79 cases; one existing PRJ-001 Firefox 320px journey exceeded its 40-second total budget while navigating to a committed project. That long viewport journey now uses the same 90-second budget as TSK-001, with unchanged behavioral/layout assertions; the subsequent 320px run passed on all three engines. All 15 task viewport cases and their 75 layout observations passed on Chromium, Firefox and WebKit in the main batch. The final npm run check passed formatting, lint, both architecture guards, types, 339 API tests and both production builds. These results describe local isolated-database execution.

## Progress and visibility coverage — TSK-002

Five viewport journeys per engine cover 320×568, 390×844, 768×1024, 844×390 and 1440×900. Each inspects empty progress, visibility confirmation, long client-preview content, saved progress/visibility and closed-project progress: 15 cases and 75 observations. The 320px journey uses reduced motion, an unbroken 119-character task title and a 1200-character URL. Tests assert private progress versus visible-only progress, empty null state, reopening completed tasks, persistence after reload, hidden content exclusion and project status remaining independent.

Recovery cases cover a lost visibility response with repeated-submit prevention and stale confirmation requiring explicit review. The regression batch also exercises TSK-001 task flows, PRJ-001 project flows and acceptance into a frozen-agreement project. Prior WEB-004 and TSK-001 records above remain historical baselines; their full matrices are not represented as rerun here. Physical-device limits remain applicable.

TSK-002 local verification completed on 2026-10-09: all 60 affected browser regression cases passed (21 PRJ-001 cases, 21 TSK-001 cases, 17 TSK-002 cases and one proposal-acceptance/project journey). The TSK-002 cases include 15 viewport journeys and 75 inspected layouts across Chromium, Firefox and WebKit. The final npm run check passed formatting, lint, both architecture guards, types, 360 API tests and both production builds. Raw browser results and quality output are preserved locally in .cache/task-progress-report. These runs use isolated temporary databases and do not represent a new full WEB-004 matrix or physical-device verification.

## Invoice screen coverage — INV-001

Five focused journeys per engine cover 320×568, 390×844, 768×1024, 844×390 and 1440×900. Each inspects the empty ledger, new form, long-content priced form, numbered saved document and populated ledger: 15 viewport cases and 75 observations across Chromium, Firefox and WebKit. The narrowest journey uses reduced motion, an unbroken 120-character title, a 1200-character URL and the maximum supported invoice amount. It verifies the table remains locally scrollable with a named keyboard-focusable region.

Invoice browser cases also cover exact saved totals, optional project links, frozen contact snapshots, invalid precision, lost responses, delayed navigation, client-change project reset, token renewal, list page recovery and project picker pagination/cancelled stale responses. The affected regression batch includes the existing account/client/proposal journeys, since pricing inputs and document rendering are now shared. Earlier full WEB-004/task/project matrix results remain historical baselines; physical-device limits above still apply.

INV-001 local verification completed on 2026-10-09: all 61 affected browser cases passed (38 existing account/client/proposal journeys and 23 invoice cases). The invoice cases include 15 viewport journeys and 75 inspected layouts across Chromium, Firefox and WebKit. The project-picker cancellation case also passed a focused rerun after adding an explicit wait for late route completion. The final npm run check passed formatting, lint, both architecture guards, types, 424 API tests and both production builds. An earlier quality run encountered a temporary MongoDB monitor timeout in two existing proposal-sharing tests; both unchanged tests passed independently, then the entire quality command passed on fresh isolated databases. Reports, final quality output and the interrupted log are retained in .cache/invoice-report; 15 review screenshots are retained in .cache/ui/invoices. These results do not represent physical-device testing or a new full WEB-004 matrix.

## Issued invoice and public-link coverage — INV-002

Five focused viewport journeys per engine cover 320×568, 390×844, 768×1024, 844×390 and 1440×900. Each inspects draft review, long-content draft editing, private issued review, a generated link, public invoice, revoked public access and the still-issued private invoice: 15 cases and 105 layout observations across Chromium, Firefox and WebKit. The narrowest case uses reduced motion, a 120-character unbroken title, a 1200-character URL and the maximum supported amount. The paper remains within the viewport while the labelled pricing table can scroll locally.

Additional browser journeys exercise frozen issuance snapshots, original numbering after editing, project-only unsaved changes, stale and lost edits/issuance/link changes, superseded links, server-relative expiry, late-response cancellation after hash changes and explicit recovery after a restored page cannot reach the server. The affected regression batch also includes account/client/proposal journeys and INV-001, because pricing, document rendering and public-loading hooks are shared. Prior WEB-004, project and task matrices remain historical coverage; the physical-device limitations above still apply.

INV-002 local verification completed on 2026-10-09: all 83 affected browser cases passed in the final regression batch (38 existing account/client/proposal journeys, 23 INV-001 cases and 22 INV-002 cases). The INV-002 cases include 15 viewport journeys and 105 layout observations; rerun INV-001 viewport journeys add 75 observations, for 180 invoice layouts in this batch. The final npm run check passed formatting, lint, both architecture guards, types, 455 API tests and both production builds. Reports and quality output are retained in .cache/invoice-sharing-report, with 15 public-invoice review screenshots in .cache/ui/invoice-sharing. These are isolated local runs, without a new full WEB-004 matrix, physical-device testing, remote CI or deployment.

## Payment ledger coverage — PAY-001

Five focused journeys per engine cover 320×568, 390×844, 768×1024, 844×390 and 1440×900. Each inspects an issued empty ledger, validation dialog, long payment editor, partial balance/history, complete settlement, long correction reason and corrected history: 15 cases and 105 layout observations across Chromium, Firefox and WebKit. The tests use the one-billion-major-unit invoice cap, a near-cap payment, a 99-character unbroken reference, a 500-character note and a 270-character correction reason. The narrowest case uses reduced motion. Dialogue controls remain reachable in a short landscape viewport, and the existing pricing table scrolls locally.

The affected regression batch includes INV-001 and INV-002, plus the payment recovery/session journeys. It covers postcommit and precommit response loss, explicit same-attempt confirmation, stale remaining balances, correction response loss, exact decimal validation and zero-total invoices. Earlier account/client/proposal, project/task and WEB-004 matrices remain historical coverage; this focused batch does not claim their full rerun or physical-device verification.

PAY-001 local verification completed on 2026-10-09: all 67 unique affected browser cases passed across the verification batches (23 INV-001, 22 INV-002 and 22 PAY-001). All 15 payment viewport journeys and their 105 layout observations passed; the repeated invoice viewport journeys add 180 observations, for 285 invoice/payment layouts across the three engines. The main batch passed 66 cases. One existing INV-002 restoration case assumed only one public read during development effect restarts; its outage fixture now stays unavailable until explicit retry, retains stale-content/no-auto-loop assertions, and passed the focused rerun. Both raw reports and the merged case summary are retained in .cache/payments-report. Fifteen review screenshots are retained in .cache/ui/payments. The final npm run check passed formatting, lint, both architecture guards, types, 516 API tests and both production builds. These are isolated local runs, without a full WEB-004 matrix rerun, physical-device testing, remote CI or deployment.

## Workspace overview coverage — DSH-001

Five focused viewport journeys per engine cover 320×568, 390×844, 768×1024, 844×390 and 1440×900. Each inspects an empty workspace summary, a populated view with all four currencies and an unbroken proposal title, and a failed explicit read: 15 cases and 45 layout observations across Chromium, Firefox and WebKit. Maximum invoice amounts stress currency rows, and the narrowest view uses reduced motion. Screenshots are saved with the browser results.

Functional cases check true payment/correction balances and reload, initial/read-refresh failure with explicit recovery and no polling, and session renewal/expiry. Affected account identity, concurrent tabs, mobile navigation and motion journeys are rerun because the dashboard is their landing page. Earlier full WEB-004 and invoice/payment matrices remain historical coverage; this story adds no claim of physical-device testing, remote CI or deployment.

DSH-001 local verification completed on 2026-10-09: all 27 affected browser cases passed in the final batch (6 account/navigation/motion journeys and 21 dashboard cases). All 15 focused viewport journeys and 45 inspected layouts passed across Chromium, Firefox and WebKit. Six dashboard functional cases additionally cover payment correction/reload, explicit failure recovery, session renewal/expiry, large-value formatting, simultaneous refresh/malformed responses, and cancellation of an old workspace read after switching accounts. Two preliminary batches encountered an invalid overlength proposal title in the seed; the final fixture explicitly limits it to 120 characters, retaining the unbroken-title layout assertions. Raw preliminary and final reports are retained in .cache/dashboard-report; 15 review screenshots are preserved in .cache/ui/dashboard. The complete npm run check passed formatting, lint, both architecture guards, types, 553 API tests and both production builds. This is isolated local verification, without physical-device testing, a full historical matrix rerun, remote CI or deployment.

## Client portal coverage — PRT-001

Five focused journeys per engine cover 320×568, 390×844, 768×1024, 844×390 and 1440×900. Each inspects owner preview, the client-list entry, a created grant/link, a public long-content notebook, the owner's revoked state and revoked public access: 15 cases and 90 layout observations across Chromium, Firefox and WebKit. Stress data includes a long client name, a 120-character unbroken project title, 1,020-character project URL, long visible task title/description and the one-billion-major invoice cap with a one-cent remaining balance. The narrowest journey uses reduced motion. Public screenshots are retained with the browser output.

Functional journeys cover exact real balances/visibility, private-field exclusion, independent paging, grant renewal/revocation, lost issuance and explicit recovery, stale revisions, client archive, server-relative expiry, restored-page failure, late hash-response cancellation and owner session renewal. Existing account/navigation/motion and client CRUD/conflict/mobile/recovery journeys are rerun because the client-row entry changes. Historical invoice/payment/project/task and full WEB-004 matrices remain earlier coverage; no physical-device, remote-CI or deployment result is inferred.

PRT-001 local verification completed on 2026-10-09: all 33 unique affected browser cases passed across three verification batches (10 existing account/client journeys, 8 portal functional journeys and 15 portal viewport journeys). All 90 portal layout observations passed on Chromium, Firefox and WebKit. The first batch completed the 10 existing cases before encountering an invalid phone seed; the next batch passed five portal cases before a same-URL navigation fixture retained the expired reader. The seed now uses a valid phone, and restoration uses an actual reload while retaining expiry, failed-read, explicit-retry and stale-content assertions. The remaining 18 cases then passed. All raw reports and the merged case summary are retained in .cache/portal-report; 15 screenshots are preserved in .cache/ui/portal. The final npm run check passed formatting, lint, both architecture guards, types, 605 API tests and both production builds. This is isolated local verification, without physical-device testing, a historical full-matrix rerun, remote CI or deployment.

## Authentication desktop height

The first login-only spacing adjustment was checked at six desktop sizes, but missed a wide, short viewport. On 2026-10-09 a follow-up reproduced 27px of overflow at 1536×742. Both login and registration now use height-aware story typography and compact shared spacing. Registration groups the user's name and optional workspace name in one desktop row, leaving email/password full-width. At narrow widths that row stacks naturally. The page still grows when content requires it; document scrolling is not disabled.

The final local in-app browser check requested 12 desktop sizes for each page: 1920×1080, 1918×927, 1920×720, 1536×864, 1536×768, 1536×742, 1536×741, 1536×740, 1366×768, 1280×720, 1024×768 and 1280×600. All 24 observations had no document overflow; the 741px request rounded to 742 CSS pixels in this browser. Registration validation messages also fit at 1536×742 and 1280×600. Login keyboard focus and visible outlines were checked during the first pass. Formatting, scoped lint and web type checking passed after the final source edits. Measurements and screenshots are preserved in .cache/ui/auth-height. This is focused local browser verification, not a new full multi-engine or physical-device audit.

## Overview clarity follow-up

Local verification on 2026-10-09 completed with 28 unique affected browser cases across two batches: six account/navigation/motion journeys and 22 DSH-001 journeys. Fifteen viewport cases cover 320×568, 390×844, 768×1024, 844×390 and 1440×900 across Chromium, Firefox and WebKit. Each now inspects empty data, an open interactive guide, populated counts/three task states/four currencies/a long real expiry title, and a failed read: 60 layout observations. A new keyboard journey checks guide selection, financial explanations, unchanged exact balances, no additional reads, reduced motion and navigation to invoices.

The first batch passed five account cases before the motion-settling journey revealed a guide-child animation being applied inside closed native details. The selector now requires the guide to be open; the unchanged motion journey and all remaining 22 dashboard cases passed in the next batch. Both raw reports and their merged summary are retained in .cache/dashboard-clarity-report, with 15 screenshots in .cache/ui/dashboard-clarity. This is focused isolated-database browser verification; earlier full matrices and API test results remain historical, and no physical-device, remote-CI or deployment result is inferred.

## NTF-001 notification verification

On 2026-10-10 the focused inbox suite passed 27 distinct browser cases across two focused batches: 12 functional/motion journeys in Chromium and 15 responsive cases (five viewport sizes across Chromium, Firefox and WebKit). The sizes are 320×568, 390×844, 768×1024, 1440×900 and short landscape 640×450. Each responsive case inspected five states: empty, long unbroken titles with 25 unread rows, older page, unread filtering and read failure. All 75 main-content observations reported no horizontal overflow, offscreen/clipped content or undersized controls. This matrix did not inspect vertical overflow inside the sidebar; the follow-up below adds that coverage. A separate 100-event mobile test verifies the visual 99+ badge and exact accessible count.

The suite covers persistent read/unread state, keyboard focus after filtered removal, document navigation without automatic reading, both proposal outcomes and replay deduplication, invoice/payment/correction history, pagination/global count, lost committed-write replies, stale revisions, initial/refresh/summary failures, explicit recovery without polling, expired-access renewal, rapid-click suppression and finite/reduced motion. A further 28 existing account/dashboard cases passed, including 15 dashboard responsive cases across the three engines. The batches executed 58 cases covering 55 distinct tests (three deliberate focused repeats). Fifteen full-page screenshots and a desktop viewport preview are retained in .cache/ui/notifications, and the completed report/audit attachments in .cache/notifications-report. These are simulated browser viewports on an isolated database, not physical-device or remote-CI claims.

## Sidebar overflow follow-up

On 2026-10-10 a user screenshot exposed clipped workspace text and unnecessary scrolling inside the full sidebar after the notification entry was added. The prior inbox matrix inspected main content rather than the sidebar's vertical layout. A focused baseline test reproduced 14px of outer sidebar overflow before the fix.

Notifications now have one entry: the header bell. The sidebar retains five work links. Its brand/workspace and account/logout rows cannot shrink; only a flexible middle navigation region scrolls when required. Height rules reduce spacing and remove decorative copy before essential controls are affected. The normal desktop/tablet/phone heights in the audit require neither outer nor navigation scroll; very short viewports retain locally scrollable links and visible account/closing controls. Page-content scrolling remains independent.

Nineteen affected browser cases passed. Twelve of them inspect 51 sidebar layouts across Chromium, Firefox and WebKit: desktop 1440×900/868, 1366×768, 1536×694, 1280×600, 1024×480; boundary 761×420, 1100×768, 1366×600; drawers 390×844/568/420, 640×360 and 320×256; and long user/workspace names at 1440×694, 1024×600 and 390×568. Assertions check outer overflow, nonoverlapping footer/navigation, unclipped workspace text, 44px links, last-link focus/reachability, logout availability and drawer dismissal/focus restoration. A separate case verifies the single bell and desktop focus fallback on the notification page.

The shared responsive inspector now checks visible sidebar overflow, footer placement and vertically clipped workspace titles on every future screen audit. Six focused desktop/drawer cases repeated successfully with this new inspector, covering 33 layouts. Reports and metrics are retained in .cache/sidebar-report; 51 viewport screenshots are in .cache/ui/sidebar. This follow-up passed formatting, lint, architecture boundaries, web type checks and the production web build. Its verification concerns the UI; the earlier 653-test API result is historical, and no API change or physical-device result is inferred.

## AUTH-004 recovery follow-up

Password recovery adds /forgot-password and /reset-password to the compact auth shell. The recovery audit uses Chromium, Firefox and WebKit at 320×256, 390×844, 760×900, 761×900, 1280×720 and 1920×1080: 36 request/reset layouts. It checks horizontal/internal overflow, narrow-layout input typography and control sizes, usable return links, and no document scroll in the tested ordinary desktop sizes. Very short screens keep natural vertical scrolling. Screenshots are stored in .cache/ui/recovery; the final report is .cache/recovery-verified-browser.json. These are browser-emulated sizes, not physical-device certification.

The functional cases cover login entry, generic missing-mailbox confirmation, actual isolated reset and new login, revocation, consumed/expired/missing links, secret removal/reload behavior, validation/visibility, double submit, opening a newer email fragment in the same tab and an intentionally lost committed-write response. Existing account/session/mobile/motion scenarios were also exercised in .cache/recovery-final-browser.json. No real mailbox or production database is part of browser verification.

Final verification: npm run check passed with 689 API tests across 26 files and both production builds. Eleven recovery browser cases passed (nine Chromium functional/audit cases plus the recovery audit on Firefox and WebKit), covering 36 request/reset layouts. Six existing registration/session/mobile/motion scenarios also passed in the preceding regression run. A first unrestricted API run hit one hook timeout and a resulting duplicate-account failure; limiting real-Mongo/Argon2 test workers to two produced the passing full run without increasing hook timeouts or changing assertions. The two latest frontend files also passed scoped ESLint and Prettier checks.

## REL-001 complete regression and accessibility

SET-003 verification is documented in [WORKSPACE-SETTINGS.md](WORKSPACE-SETTINGS.md): 36 unique affected browser cases passed across batches, including 15 form viewport journeys and three mobile-sidebar journeys on Chromium, Firefox and WebKit. The form journeys inspect 60 draft/saved/conflict-review/read-only layouts at five sizes, including 320×256 and short landscape. Open drawers add six layouts at 320×256 and 390×844 with an unbroken 100-character workspace name and a Unicode initial. All 44 included Axe scans passed. Screenshots in `.cache/ui/workspace-settings` were visually reviewed on desktop/mobile and the short drawer; the full quality run passed with 780 API cases and both builds. This is local emulation, without a new complete historical matrix or physical-device certification.

SET-002 verification is documented in [ACCOUNT-SECURITY.md](ACCOUNT-SECURITY.md): 15 security viewport cases and 15 profile regressions across Chromium, Firefox and WebKit, inspecting 90 layouts including 320×256 and short landscape with reduced motion. The 51 unique affected browser cases passed across batches, and all 70 included Axe scans passed. The security form was visually reviewed on desktop/mobile; these checks do not replace physical-device or assistive-technology verification.

SET-001 verification is documented in [PROFILE.md](PROFILE.md): 15 new profile viewport cases across the three engines, covering 45 draft/save/recovery layouts and 18 settings Axe scans including the functional states. Existing sidebar audits were rerun after adding the settings link; there remains one header notification bell. The profile-specific runs accompany 41 unique affected browser cases verified across batches, without claiming a new full-suite or physical-device run.

On 2026-10-10, the complete regular browser suite passed in one run: 340 cases, comprising 188 Chromium journeys and 76 responsive cases each on Firefox and WebKit. This reruns the current base matrix and all included project, task, invoice, payment, dashboard, portal, notification, sidebar and recovery audits. The retained report is `.cache/release-full-browser.log`; no case failed or was skipped.

Six additional cases exercised the real production Next build through a local HTTPS proxy on all three engines. They scan authentication/recovery states and the complete account-to-payment-and-client-portal journey: 63 Axe scans with no violations and no disabled rules. The checks identified low-contrast muted/accent text; corrected colors preserve the existing layout and motion. Automated accessibility and emulated viewports still require the physical-device and assistive-technology checks in [RELEASE.md](RELEASE.md).
