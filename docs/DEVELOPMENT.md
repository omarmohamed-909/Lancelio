# Development guide

[← Project overview](../README.md) · [العربية](README.ar.md)

## Local configuration

Use Node.js 22.20 or later within Node 22 and npm 10. Run `npm ci` from the repository root, then copy the tracked environment examples as shown in the [quick start](../README.md#run-locally).

| Variable              | Where      | Purpose                                                                                    |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `MONGODB_URI`         | API        | Required database connection with replica-set transactions.                                |
| `JWT_ACCESS_SECRET`   | API        | Required secret, at least 32 characters. Generate a random value locally.                  |
| `PORT`                | API        | Development default: `5000`.                                                               |
| `WEB_ORIGIN`          | API        | Development default: `http://localhost:3000`. Exact origin, without a path/trailing slash. |
| `NODE_ENV`            | API        | Development default: `development`.                                                        |
| `NEXT_PUBLIC_API_URL` | Web        | Development API prefix: `http://localhost:5000/api/v1`. This value is public.              |
| `API_UPSTREAM_ORIGIN` | Web server | Upstream API origin for the production same-origin rewrite. Configure before building.     |

The API loads its optional workspace `.env` file; process environment variables take precedence. Startup validates transaction support and creates collections/indexes before listening. Logs report safe guidance without printing database credentials or driver errors.

Only `NEXT_PUBLIC_API_URL` belongs in browser-visible configuration. Provider keys, database credentials, signing secrets and backup encryption keys stay server-side and outside Git.

### Assistant

Guided product help, basic personalized greetings and scoped queries work with `ASSISTANT_PROVIDER=guided`, without an external API key. Gemini/OpenAI add natural conversation, advice, text drafting and contextual product explanations. Classification receives the question, up to six previous questions and limited generated-reply excerpts; conversation generation also receives the authenticated first name and reply locale. Database records and balances are never sent. Real business facts still come from scoped read cards. Each conversational turn uses classification plus generation; a data turn needs classification only. No transcript is persisted by the application; provider requests use `store: false`.

```sh
npm run assistant:check
```

This validates configuration without calling a provider. With an external provider configured, send one synthetic connection-check question using:

```sh
npm run assistant:check -- --live
```

See [ASSISTANT.md](ASSISTANT.md) for server variables, supported questions, language behavior and limits.

### Recovery email

Delivery is disabled until a verified sender is configured. In the untracked API environment:

```dotenv
EMAIL_PROVIDER=resend
RESEND_API_KEY=your-server-side-key
EMAIL_FROM=your-verified-sender-mailbox
```

Restart the API after changes. `WEB_ORIGIN` determines the recovery-link destination and must be the canonical HTTPS frontend origin in production. Keep click tracking disabled for recovery messages. The local/persistent API process runs the durable MongoDB-backed delivery queue. The Vercel Function only enqueues jobs: deploy the separate recovery worker before enabling delivery there, then set `RECOVERY_WORKER_MODE=external` on the API project. See [Vercel deployment](RELEASE.md#recovery-worker-on-vercel).

After building, `npm run start:recovery-worker --workspace @lancelio/api` runs delivery independently without an HTTP listener. It requires the same database, JWT secret, verified Resend sender and production web origin as the API. The worker drains its current delivery on shutdown; interrupted jobs retain their existing Mongo lease/retry behavior.

Queued recipients/tokens are encrypted with a purpose-derived key from `JWT_ACCESS_SECRET`. Rotating that secret prevents delivery of previously queued encrypted payloads. See the [recovery contract](API.md) and [release activation gates](RELEASE.md#hosted-activation-gates). Automated tests use a fake mailer and do not prove inbox delivery.

## Verification

### Quality gate

```sh
npm run check
```

Runs formatting, lint, API architecture guards, localization, application/release-tool types, API tests and both production builds. `npm run format` applies formatting.

API integration tests start temporary MongoDB replica sets and verify real transactions/indexes. They never connect to the configured `MONGODB_URI`. Vitest is capped at two workers to bound the memory/CPU used by replica sets and Argon2 operations.

The harness uses `mongod` from PATH when present; otherwise it downloads MongoDB **8.0.16** into `.cache/mongodb-binaries`. Vitest global setup resolves the executable once before starting parallel test workers, so a cold cache cannot make two suites download/rename the same archive concurrently. Each integration suite still starts its own isolated replica set. Override with `MONGOMS_SYSTEM_BINARY` or `MONGOMS_VERSION`. Installation does not trigger a MongoDB postinstall download. First test downloads require network access; download failures stop global setup before suites run. Replica-set setup retains its 240-second hook timeout.

### Browser checks

Install engines once, then run:

```sh
npm exec --workspace @lancelio/web -- playwright install chromium firefox webkit
npm run test:e2e
npm run test:responsive
```

On Linux CI, add `--with-deps` to the Playwright install command. The suite starts an isolated API on **5100** and Next.js on **3100**; keep those ports free. Chromium runs general journeys; Firefox and WebKit run responsive audits. Artifacts use `.cache/playwright-results`, with screenshots in `.cache/ui`.

For a custom cache, set `PLAYWRIGHT_BROWSERS_PATH` to the same absolute directory during installation and execution. Browser checks use an isolated Next build directory; sequence production build/release commands deliberately. See [RESPONSIVE.md](RESPONSIVE.md) for coverage and physical-device limits.

### Production and recovery checks

```sh
npm run build
npm run test:api-startup
npm run test:release
```

The startup smoke requires the compiled API. The production browser journey uses local HTTPS and requires OpenSSL; it does not install a system-trusted certificate. Run build/browser/release commands sequentially as described in [RELEASE.md](RELEASE.md#local-checks). Keep localhost **3443** free for the HTTPS smoke.

For the isolated backup drill, install verified MongoDB Database Tools:

```sh
node tools/release/install-database-tools.mjs
```

Set `MONGODB_TOOLS_DIRECTORY` to the printed `bin` path, then run `npm run test:backup`.

Actual `db:backup` / `db:restore` operations require separate explicit credentials and the maintenance steps in the [backup runbook](RELEASE.md#encrypted-backup-and-restore-runbook). A documented policy is not an enabled schedule.

## Sessions and deployment

- Login, refresh and logout require an `Origin` header matching `WEB_ORIGIN`, including CLI requests.
- Access tokens stay in browser memory. Refresh tokens travel in an HttpOnly cookie, never JSON.
- Production pages and `/api/v1` share the canonical HTTPS browser-facing origin. Next rewrites forward to the Vercel Express API; persistent Node hosting is also supported.
- Web Locks and BroadcastChannel coordinate refresh rotation across tabs. Reusing a consumed refresh token revokes the session.
- Verify HTTPS cookies, trusted proxy handling, rate limits and real delivery on the actual host. Local success is not hosted activation.

## Common setup issues

| Symptom                                | Check                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| API refuses startup                    | Required variables, secret length, database permissions and transaction support. |
| Registration fails on local MongoDB    | Use a replica set; a standalone server cannot run the transaction.               |
| Authentication returns an Origin error | Match the frontend origin exactly, including scheme and port.                    |
| Browser calls the wrong API            | Set `NEXT_PUBLIC_API_URL` before starting/building the web app.                  |
| Playwright cannot find a browser       | Install engines and keep `PLAYWRIGHT_BROWSERS_PATH` consistent.                  |
| Assistant uses guided mode             | Check the selected provider's server variables and `assistant:check`.            |
| Recovery email is unavailable          | Configure a verified sender/provider; disabled is the default.                   |

## CI

[Quality checks](https://github.com/omarmohamed-909/Lancelio/actions/workflows/ci.yml) runs on pushes and pull requests. It includes the quality gate, compiled API startup, runtime dependency audit, backup drill, browser suite and production HTTPS smoke. Use its live result instead of treating an old local test count as the current CI status.
