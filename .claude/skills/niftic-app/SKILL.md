---
name: niftic-app
description: Rules and workflows for building apps in a Niftic starter repository. Use this for ANY work in this repo: first-time setup and configuration, adding features, resources, pages, forms, tables, admin screens, roles, uploads, or emails, reviewing security, or preparing deploys and PRs — even when the user doesn't mention the skill or says something generic like "add a projects page".
---

`niftic.app.yml` decides which half of this skill applies. A `generated:` block
means the repo is a configured app; no block means it is still a template.

Configure prunes `references/` down to the branch this app actually runs, so
every file still present applies and a procedure whose reference is absent is a
procedure this app has no use for. Read the one a procedure names before
starting it, not after.

## Setup mode — no `generated:` block

The repo is a superset of every profile Niftic ships and nothing is decided yet.
Run the interview in [references/setup.md](references/setup.md), which ends with
`pnpm configure` rewriting the tree.

Configure is the only way to choose a profile. Hand-editing files out of
`variants/`, or installing a package to "get the same result", produces a tree
the engine never planned and cannot check.

## Feature mode — the app is configured

`src/lib/app-config.ts` names the profile and its capability flags. Read it
first; it is generated, so it cannot disagree with the app.

### Add a resource

Copy the `notes` **slice** end to end — table, validation, data access, routes,
permission checks, tests — renaming as you go. It is deliberately boring so that
cloning it is the right move. An app configured without the example has no copy
to start from; the layers are the same either way.

Read [references/data.md](references/data.md) first: what a table needs differs
by branch, and on the Supabase fork a missing policy is a silent leak rather than
a type error.

Every layer of the slice, in the order they depend on each other:

1. The table, and a migration for it.
2. Zod schema for the shape a form submits.
3. Data access, in whatever layer `references/data.md` names — never a query
   written inline in a route.
4. `+page.server.ts` load and form actions, with superforms.
5. A server-side permission check in every action.
6. Vitest for the pure parts — validation and permissions — and a Playwright
   smoke for the authorization path, where a second user is refused.

Done when a new row can be created, read, updated and deleted through the UI by
its owner, a second user is refused at every one of those four, and
`pnpm check && pnpm lint && pnpm test:unit` are green.

### Add an admin screen

Admin routes live under `src/routes/admin/` and are guarded by role, re-checked
in the load AND in every action. A screen that only hides its button is not
guarded. Give it a nav entry through the nav registry rather than editing a
layout.

### Add a role

Roles are checked server-side through the permission helpers in
`src/lib/server/`, never by reading a session field inline at a call site. Add
the role to the permission module, extend its unit tests to cover both the
allowed and the refused case, then use it. Read
[references/auth.md](references/auth.md), and
[references/orgs.md](references/orgs.md) if this app has organizations — with
organizations a role is scoped to a membership, not to a user.

### Add an email

Write the template, send it with `sendEmail()`. Never import the Resend SDK
outside `src/lib/server/email/` — ESLint fails the build if you do. Set
`EMAIL_DRY_RUN=true` locally and read the logged payload instead of sending.

### Add an upload

Go through the storage **port** in `src/lib/server/storage/`: the app asks for a
signed URL and the browser talks to the bucket directly. Validate the content
type and the size server-side before signing, because after signing there is
nothing left to refuse with. Never expose a bucket credential to the client, and
never proxy file bytes through a form action.

### Security review

Walk these in order, and read the code rather than trusting a helper's name:

- Every mutating action re-checks authorization server-side, on the row it is
  about to touch.
- Every scoped query filters by owner — or by membership where this app has
  organizations.
- No database, Resend, storage or service key import outside its adapter.
- No secret in a `PUBLIC_` variable or anywhere the client bundle can reach.
- Uploads validate type and size before a URL is signed.
- On the Supabase fork: every table has RLS enabled and explicit policies, and
  the service-role client appears only under `src/lib/server/admin/`.

### Prepare a deploy

Migrations committed; `.env.example` complete and every variable in it set on
the host; preview environments pointing at their own resources rather than
production's; `/api/health` green. `docs/` carries this app's host-specific
runbook where it has one.

### Prepare a PR

`pnpm check && pnpm lint && pnpm test:unit` green, migrations committed with the
code that needs them, and a description that says what was verified by running
it versus only by reading it.

## Rules that hold everywhere

- Mutations go through SvelteKit form actions with Zod validation. Authorization
  is re-checked server-side in every action — never trust a hidden field or a
  client-side guard.
- Never call a database, Resend, R2, or any service key from browser code.
- All email goes through `sendEmail()`. All uploads go through the storage port
  and signed URLs.
- Typed env comes from `$lib/server/env`. `process.env` is banned elsewhere.
- Migrations are always committed, and are never hand-edited after they have
  been applied anywhere.
- Never add a second auth library, ORM, validation library, or component
  library. The primitives in `src/lib/components/` are the component library.
- Never print or commit credentials.
- "Verified" means you ran it. If you checked the code but not the running app,
  say so.
