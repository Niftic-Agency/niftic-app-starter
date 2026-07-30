# Static — a prerendered site

Every page is rendered at build time. There is no database, no auth, no
storage, and no session: the only thing that reaches a server at runtime is
`POST /api/contact`.

That shape is the profile, not a stage it grows out of. A request to "add
login", "store submissions" or "make a dashboard" is a request to change
profile, which is a manual migration to another preset — say so rather than
installing a database into a site that has none.

## Adding a page

Pages live under `src/routes/(site)/`. Add the route, then add its nav entry
through `src/lib/nav/site.ts` rather than editing a layout. Anything a page
needs must be available at build time — imported content, a static asset, a
build-time fetch. A `+page.server.ts` that loads per request will fail the
build, and that failure is the profile working as designed.

## The contact endpoint

`src/routes/api/contact/+server.ts` is an endpoint rather than a form action,
because a page with actions cannot be prerendered. It is the one place this
profile departs from the repo-wide "mutations go through form actions" rule, and
it departs from the mechanism, not the substance: the payload is still
Zod-validated server-side against `src/lib/contact/schema.ts`, and the
client-side copy of that schema is a courtesy for inline errors.

Keep both callers working when changing it — the enhanced form expects JSON, a
plain form post expects a redirect. `tests/contact.spec.ts` covers both, plus
the honeypot.

Spam handling is the honeypot field and nothing else. Rate limiting is
deliberately out of scope; if a site needs more, put it in front of the app at
the CDN rather than inventing it here.

Set `EMAIL_DRY_RUN=true` locally: submissions are logged rather than sent, and
`CONTACT_TO` is where they go in production.
