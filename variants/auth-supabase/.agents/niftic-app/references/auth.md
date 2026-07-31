# Auth — Supabase Auth

`src/lib/server/auth/` owns the app's half; Supabase owns the users.
`app-config.ts` names the mode:

- **internal** — Google only, restricted to the domains in
  `AUTH_ALLOWED_DOMAINS`. `domains.ts` is the check and `domains.test.ts` is
  where a new rule about who may sign in belongs.
- **client** — email and password, with reset and verification flows.

## The session is verified, not decoded

The hook calls `getClaims()`, which verifies the JWT against the project's JWKS
— locally via WebCrypto on asymmetric signing keys, and falling back to a server
call on symmetric ones. Never reach for `getSession()`: it decodes a cookie
without verifying it, so trusting it is trusting whatever the browser sent.

`locals.user` is what the hook produces. Read that.

## Guards

`src/lib/server/auth/permissions.ts`:

- `requireUser(event)` — redirects to sign-in, preserving where the user was
  going.
- `requireRole(event, 'admin')` — **async**, because the role lives in the
  `profiles` table rather than in the token. 404s rather than 403s.
- `hasRole(role, required)` — for rendering decisions only.

Call a guard in the load **and** in every action. A guard in
`+layout.server.ts` protects what the user is shown; it does not protect the
endpoint, because a form action can be POSTed directly.

A role check in code is a second layer here, not the only one. The row itself is
still protected by its policy — see `references/data.md`.

## Adding a role

Roles live in the `profiles` table and in the `Role` union in `permissions.ts`.
Adding one means a migration (the column's check constraint), the union, and
unit tests covering both the allowed and the refused case. If the new role also
decides who may read a row, it needs a policy — a role that exists only in
application code is invisible to the database.

## The auth routes

`src/routes/auth/` carries the endpoints Supabase redirects back into: `callback`
and `confirm` (token-hash) for email flows, `oauth` for the provider handshake,
`signout`. They are thin by design. When a flow misbehaves, read these four
before touching anything under `(auth)/`.

Cookies are set through the `@supabase/ssr` helpers with their second argument
intact — it carries `Cache-Control: private, no-store`. A response that sets an
auth cookie without those headers can be cached by a CDN and served, session and
all, to somebody else.
