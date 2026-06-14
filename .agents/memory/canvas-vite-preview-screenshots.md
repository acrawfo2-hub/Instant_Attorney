---
name: Screenshotting mockup-sandbox Vite previews
description: Use app_preview (not external_url) to verify Vite SPA component previews
---

# Screenshotting mockup-sandbox component previews

**Rule:** To verify live previews served by the mockup-sandbox Vite dev server
(`/__mockup/preview/<group>/<Component>`), use
`screenshot(type="app_preview", artifact_dir_name="mockup-sandbox", path="/preview/<group>/<Component>")`,
not `type="external_url"`.

**Why:** `external_url` (Firecrawl) shots of these Vite SPA pages frequently come
back blank white even when the component renders fine, and a blank result seems
to get cached per-URL so retries stay blank — it mimics a real render bug but is
not one. `app_preview` routes through the local proxy, renders reliably, and
returns the browser console so you can confirm there were no runtime errors.

**How to apply:** A blank `external_url` preview is NOT evidence the component is
broken — re-verify with `app_preview` before debugging. Quick compile sanity
check: `curl` the Vite-transformed module
(`localhost:8081/__mockup/src/.../<Component>.tsx`); a few KB of JS = compiled,
a tiny payload = a real transform error.
