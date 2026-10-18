# SET-003 — workspace settings

The workspace section on `/settings/workspace` shares the Settings sidebar entry and internal settings navigation with profile and account security. Only the selected section is rendered. The owner can rename the current workspace. Admins and members see its name and their current role without editing controls. Email verification and avatar uploads remain separate stories.

## Contract and ownership

`GET /api/v1/settings/workspace` returns only `{ id, name, slug, version, role, canEdit }`. `PUT` accepts exactly `{ name, version }`. Both use a live bearer session and `Cache-Control: no-store`; PUT also requires the configured frontend Origin. The current user and workspace come from the verified session. Alternative workspace IDs, owner, plan, slug and extra body fields are rejected.

Workspace names follow registration rules: trim outer whitespace, then require 2–100 Unicode code points. Versions must be safe, nonnegative integers below the maximum safe integer. Invalid input returns `422 VALIDATION_ERROR`; a stale version returns `409 WORKSPACE_CONFLICT`; missing owner permission returns `403 WORKSPACE_ACCESS_DENIED`. An inactive account or revoked session fails authentication. All roles can read their own workspace settings; only a current owner membership matching the workspace's actual owner can write.

The existing auth identity aggregate owns workspace and membership records, so this feature uses an application port and an infrastructure adapter in that module, composed by `main`. Domain/application code does not import Mongo, HTTP or another feature module.

## Atomicity and retained identity

The Mongo transaction rechecks active account status and owner membership through conditional writes, then updates only the workspace name and `settingsVersion` with CAS. Internal `User.authFence` and hidden `WorkspaceMember.settingsFence` counters serialize changes against status/membership revocation. They do not change account or membership timestamps, credentials, membership IDs or roles. Failed permission checks, stale versions and write errors roll the counters back with the transaction. Mongo may retry a conflicting transaction internally, rechecking the live policy and revision; the browser never retries an uncertain write automatically.

Existing workspaces without `settingsVersion` start at zero; the first real rename increments it without a separate migration. A trimmed no-op keeps the workspace revision. Workspace ID, owner, plan, slug, membership identities and public grants stay intact. Issued invoice/proposal snapshots and accepted project agreements are not rewritten. Later issuance uses the live workspace identity through the existing document routes.

## UI and recovery

Successful saves update the workspace name and Unicode initial immediately. Other tabs reload their own identity through the existing BroadcastChannel. Reload/login and visibility refresh read the current name. Earlier identity reads, delayed settings responses and pending session refresh snapshots cannot overwrite a newer identity update. Publication is scoped to the same account and workspace, and the workspace editor remounts when that scope changes. Access tokens and identity remain in memory.

The form keeps its draft after a conflict, failed response or server error and blocks saving until an explicit current-state read. The user can adopt the saved name or keep their draft for review; neither action writes automatically. A failed read retains the draft. If owner permission has disappeared, the explicit read changes the section to read-only. A lock prevents double submits, pending controls are disabled, stale unmounted responses are ignored, and validation returns keyboard focus after controls re-enable.

Profile, workspace and password forms use one departure guard. Switching sections asks for confirmation if the current form has unsaved changes; cancelling keeps the route and draft. Existing Arabic RTL typography, focus styles, status/alert announcements and reduced-motion behavior remain in use. Long names wrap in read-only/recovery content and use an accessible title on the sidebar's truncated name. Short screens scroll naturally so the actions remain reachable.

## Local verification

Verified locally on 2026-10-10: `npm run check` passed formatting, lint, both architecture guards, API/web/release types, **780 API tests in 30 files**, and both production builds. The 29 new real-Mongo cases cover live role/owner policy, removal/downgrade/suspension after earlier authentication, multiple-workspace isolation, strict fields/Origin/session requirements, Unicode limits, legacy revisions, concurrent CAS, no-op versions and transaction rollback without exposing database errors. The compiled production entry-point smoke also passed, exercising the actual workspace GET/PUT wiring before password change and verifying readiness after Mongo loss.

All **36 unique affected browser cases passed across verification batches**: 31 workspace cases and five profile/security regressions. The cases exercise real issued invoice/proposal snapshots and an accepted agreement, unchanged public readers, identity across tabs/reload, read-only roles, live owner downgrade, committed/uncommitted response loss, failed reads, explicit revision review, a shared navigation guard on both cancelled and accepted departure, double submit, validation focus, delayed identity/refresh/write responses and anonymous access.

The 15 form viewport journeys on Chromium, Firefox and WebKit cover 320×256, 390×844, 768×1024, 844×390 and 1440×900, inspecting 60 draft/saved/review/read-only layouts. Three additional mobile-sidebar journeys inspect six open-drawer layouts at 320×256 and 390×844 with an unbroken 100-character name and Unicode initial. All **44 included Axe scans passed** without violations or disabled rules (39 workspace, three profile, two security). Desktop/mobile forms and the short open drawer were visually reviewed; screenshots are retained in `.cache/ui/workspace-settings`.

The first affected browser batch passed 31 of 32 cases; its one-shot failed-read fixture recovered prematurely under development Strict Mode. The fixture now keeps reads unavailable until explicit retry, and the final 18 functional/regression cases passed. The extra sidebar batch passed all three cases. The first full API run overlapped browser verification and timed out one existing password-change case at its unchanged five-second limit; the subsequent full quality run without concurrent browser work passed all 780 cases in about 178 seconds of API testing. Neither assertions nor timeouts were relaxed.

Reports: `.cache/workspace-api.log`, `.cache/workspace-quality-parallel.log`, `.cache/workspace-quality.log`, `.cache/workspace-browser.json`, `.cache/workspace-browser-final.json`, `.cache/workspace-sidebar-browser.json`, the derived `.cache/workspace-verification-summary.json`, and `.cache/workspace-production-startup.log`. These are isolated local checks, not a new full historical browser run, physical-device certification, remote CI or hosted activation.
