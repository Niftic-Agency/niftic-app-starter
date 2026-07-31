# Auth — Better Auth

`src/lib/server/auth/` owns it. `app-config.ts` names the mode:

- **internal** — Google only, restricted to the domains in
  `AUTH_ALLOWED_DOMAINS`. `domains.ts` is the check and `domains.test.ts` is
  where a new rule about who may sign in belongs.
- **client** — email and password, with reset and verification flows.

Both modes share one session, one hook and one set of permission helpers, so
feature code rarely needs to know which is running.

## Guards

`src/lib/server/auth/permissions.ts` is the only place that decides:

- `requireUser(event)` — redirects to sign-in, and preserves where the user was
  going.
- `requireRole(event, 'admin')` — 404s rather than 403s, because telling an
  unauthorized user that a page exists is information they did not have.
- `hasRole(user, role)` — for rendering decisions only.

Call a guard in the load **and** in every action. A guard in
`+layout.server.ts` protects what the user is shown; it does not protect the
endpoint, because a form action can be POSTed directly. That second call is the
check that actually matters — the layout guard is a courtesy to the user, not a
control.

## Adding a role

Roles live in the `Role` union in `permissions.ts`. Add it there, extend
`domains.test.ts`-style unit tests to cover both the allowed and the refused
case, then use the helper. Never read `user.role` at a call site: an inline
comparison is invisible to a search for authorization logic, which is the search
someone will run during a security review.

Where this app has organizations, role means something different — see
`references/orgs.md`.

## Sessions and the client

`src/lib/auth-client.ts` is the browser half. It handles sign-in, sign-out and
the reset flows; it never carries a secret. `BETTER_AUTH_SECRET` and the OAuth
client secret are server-only, and ESLint will not let them cross.

## Seeding an admin

```bash
pnpm db:seed   # ADMIN_EMAIL + ADMIN_PASSWORD from the environment
```

It creates the user and its credential account. Run it once against a fresh
database; it is not part of the boot path, because an app that reseeds on every
deploy is a different kind of bug.
