---
name: code-app-url-parameters
description: "Use when adding share links or URL parameters to a Power Apps Code App running inside the Power Apps host iframe."
---

# Code App URL Parameters

Code Apps run in a cross-origin iframe. `window.location` normally points to the iframe runtime, not the outer `apps.powerapps.com/play/...` URL.

## Create A Share Link

1. Find the canonical Power Apps play URL at runtime. Try `window.top.location.href` inside `try/catch`, then `document.referrer`, `window.location.ancestorOrigins`, and finally `window.location.href`.
2. Accept either an existing `/play/e/{environment}/app/{app}` URL or reconstruct it from the Code App `/powerapps/appruntime/{appId}` URL.
3. Add parameters with the `URL` API so values are encoded correctly.

```javascript
const shareUrl = new URL(getPlayBaseUrl());
shareUrl.searchParams.set('course', String(courseId));
shareUrl.searchParams.set('module', moduleName);
```

Do not hardcode environment or app IDs. Do not share the iframe runtime URL because it can fail with "Power Apps host was not detected."

## Read Launch Parameters

Import `getContext` from `power-apps-data.js` and prefer its launch context. The host query string may not appear in the iframe URL or referrer.

```javascript
import { getContext } from './power-apps-data.js';

const context = await getContext();
```

Read only an allowlist of expected keys from the context, such as `course` and `module`. As a fallback, merge parameters from `window.location.search`, `window.location.hash`, and the available host URL candidates with `URLSearchParams`.

## Apply Safely

- Wait until required app data has loaded before applying the deep link.
- Validate IDs and names against loaded records; never trust URL values directly.
- Ignore missing or unknown parameters and keep normal navigation working.
- Wrap cross-origin access and `getContext()` in `try/catch`.
- Encode with `URL.searchParams`; do not concatenate raw query strings.

For this app, follow the existing helpers in `dist/index.js`: `getHostUrlCandidates`, `getPlayBaseUrl`, `buildShareUrl`, `readDeepLinkParamsFromContext`, and `applyDeepLinkFromUrl`.