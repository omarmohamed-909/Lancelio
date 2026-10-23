# Google sign-in

Lancelio uses the Google Identity Services button and verifies RS256 ID tokens on the API with Google's public keys. Successful sign-in uses the same access tokens, HttpOnly refresh cookies, refresh rotation and logout as password sign-in. There is no Firebase project, Google access token, Gmail permission or client secret involved in this callback-based flow.

## Activate

1. In [Google Auth Platform](https://console.cloud.google.com/auth/clients), select/create a project. Configure Branding (Lancelio, support email, homepage, privacy and terms links), Audience, and any required verification/publication shown by Google. While the app is in testing, configure test users as Google requires.
2. Create a **Web application** OAuth client. Add these **Authorized JavaScript origins**, with no paths or trailing slash:
   - `https://www.lancelio.tech`
   - `http://localhost`
   - `http://localhost:3000`
3. Copy the `…apps.googleusercontent.com` Client ID into **GOOGLE_CLIENT_ID** on the API Vercel project, for the environments you intend to enable. Redeploy the API. For local development add it to `apps/api/.env` and restart the API. The Client ID is public; never paste a Client Secret or Gemini API key into this field.
   - Production API `WEB_ORIGIN` must be `https://www.lancelio.tech`, without `/login` or a trailing slash. The apex domain redirects to `www`.
   - For Google Branding, use authorized domain `lancelio.tech`, homepage `https://www.lancelio.tech`, privacy `https://www.lancelio.tech/privacy`, and terms `https://www.lancelio.tech/terms`. Complete any domain verification Google requests.
4. No frontend environment variable or redirect URI is needed for this JavaScript popup callback flow. The frontend reads the public client ID from `/api/v1/auth/google/config` and loads the official Google library only when enabled. No One Tap or automatic sign-in is enabled.
5. For a preview/custom domain, explicitly authorize that frontend origin in Google and use the matching API `WEB_ORIGIN`. Do not wildcard origins or treat arbitrary preview deployments as trusted.
6. Test real Google accounts on the production domain and real mobile/PWA browsers. A popup, Google policy, organizational restrictions or browser configuration may affect the chooser; password sign-in remains available.

Missing/empty `GOOGLE_CLIENT_ID` disables the button and Google exchange endpoints without preventing the API or existing password accounts from starting. A malformed nonempty ID fails configuration validation.

## Account behavior

- A new Google identity first completes name and workspace name. There is no account until explicit submission. Google-only accounts have no local password.
- A returning identity is identified by Google's immutable `sub`, not by a caller-provided email or user ID. A Google email/profile change does not overwrite local profile/workspace records.
- A matching email links immediately when Google is authoritative: verified Gmail or verified Google Workspace with a signed `hd` claim. No existing-password prompt appears. Third-party email without Google authority returns `GOOGLE_EMAIL_NOT_AUTHORITATIVE`; use the original sign-in method. A different already-linked Google subject is never replaced.
- Linking preserves the local name, workspace, membership and password hash, and atomically revokes previous sessions and bound recovery grants. If the old local email was unverified, its password is quarantined (`PASSWORD_SIGN_IN_CONFIRMATION_REQUIRED`) and earlier unbound recovery jobs cannot be issued. Google sign-in works immediately; setting a new password in security settings or through email recovery restores password sign-in. Already verified local accounts keep password sign-in. The session-creation fence also rejects password logins started before the link.
- Google-only users can set their first password using email recovery **when the existing email delivery service is configured**. Reset revokes existing sessions; Google sign-in remains linked. Existing password change still requires the current password.
- Password and Google flows reject suspended accounts. Database unique indexes prevent duplicate emails and Google identities.

## Request protection and data

The API issues a short-lived random nonce in an HttpOnly, SameSite=Strict cookie and returns it to initialize Google. The ID token must include that nonce. Requests require the exact trusted Origin, bounded JSON input and rate limits. Nonce digests expire in MongoDB and are consumed transactionally with account creation/linking; completed exchanges cannot be replayed. Production uses Secure `__Host-` cookies. Tokens and passwords stay out of URLs, storage, logs and the PWA cache. The frontend retains a pending ID token only in component memory during onboarding.

The frontend allows Google popup communication using `Cross-Origin-Opener-Policy: same-origin-allow-popups`. Its general referrer policy is `strict-origin-when-cross-origin`; shared document routes retain `no-referrer`.

## Verification

```sh
npm run test --workspace @lancelio/api -- tests/google-token.test.ts tests/google-auth.integration.test.ts
npm run test:e2e -- tests/google-auth.spec.ts
```

Backend tests sign fixture tokens with a local RSA key, with local JWKS verification, and use an isolated replica set. Browser tests replace only Google's external chooser/library with a fixture and exercise the real application API, database, sessions, onboarding and linking. They do not prove a real Google Cloud client is authorized; that check requires activation and a real Google account.

References: [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [server verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference).
