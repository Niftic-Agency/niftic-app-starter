/**
 * Prerender everything.
 *
 * This is what makes the static profile static: every page is built to HTML at
 * deploy time and served from the CDN, with no function invocation and nothing
 * to cold-start.
 *
 * It cascades to the whole route tree, endpoints included, which is why the two
 * routes that must run per-request — `/api/health` and `/api/contact` — each set
 * `prerender = false` for themselves. Adding a third server route means adding
 * that line to it; a prerendered POST handler fails the build rather than
 * failing quietly, so the mistake is a loud one.
 */
export const prerender = true;

// Nothing here is user-specific, so there is no reason to render on the server
// per request or to ship a data waterfall. Trailing-slash consistency matters
// for a CDN cache key.
export const trailingSlash = 'never';
