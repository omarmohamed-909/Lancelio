# Installing Lancelio

Open `/install` for localized instructions and the browser install button when available. It is linked from the landing footer and Settings → Appearance. The manifest starts the installed app at `/dashboard`; existing authentication rules still apply.

- Chromium browsers: use the install button when offered, or the browser's installation menu.
- iPhone/iPad: Safari → Share or Page Menu → Add to Home Screen. Enable Open as Web App when offered.
- macOS Safari: File → Add to Dock when available.

The browser controls install eligibility. An accepted prompt is not shown as a completed installation until the browser reports installation. No notification permission is requested.

## Offline behavior and data

The service worker runs in production on HTTPS or a secure localhost origin. A first successful online visit is needed. Cache Storage contains only `/offline` and the three public install icons in `/pwa/`.

Navigation uses the network first. If the network request fails, the app displays a standalone Arabic/English offline screen using the device's saved language and appearance. It does not cache workspace HTML, API responses, Next RSC responses, passwords, tokens or client documents. Network failures do not queue or replay writes. Work data and editing require an internet connection.

The retry button reloads the requested address only when clicked. Reconnecting does not automatically replace the open document.

## Updates

`/sw.js` has a stable URL and disables HTTP caching. Each Vercel Git revision creates a separate public offline cache; local production builds derive a revision from the worker and offline document. Old Lancelio offline caches are removed only after activation; unrelated caches are preserved.

There is no automatic `skipWaiting` or page reload. A new worker waits until the previous windows close. `/install` offers a manual update check and explains when an update is waiting. Save work before closing all Lancelio windows and reopening the app.

Development (`next dev`) does not register a worker. This avoids a production worker intercepting local development. Use a separate browser profile if testing a production build on a development origin.

## Assets and verification

The existing favicon artwork remains unchanged. Generate opaque 192/512 PNGs, a maskable 512 PNG and the Apple touch icon with:

```sh
node tools/generate-pwa-icons.mjs
npm run test:pwa
```

The test command builds production into `.cache/next-pwa` and starts an isolated server at `http://localhost:3200`. It covers the real service worker in Chromium and WebKit, manifest eligibility, icon sizes, user-initiated prompts, offline recovery, cache restrictions, updates, translations and responsive accessibility. It does not simulate completing an OS-level home-screen installation.

Platform references: [MDN installation guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Apple iPhone guide](https://support.apple.com/en-ca/guide/iphone/iphea86e5236/27/ios/27), [Apple Mac guide](https://support.apple.com/en-au/104996).
