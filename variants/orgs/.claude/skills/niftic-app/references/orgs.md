# Organizations — the second authorization axis

Data belongs to an organization, and a user reaches it through a **membership**.
Two questions now have to be answered for every scoped request, in this order:

1. Is this user a member of that organization?
2. Does their role in it allow this?

Answering only the second is the classic hole: a valid `admin` of organization A
sending organization B's id.

## The helpers

`src/lib/server/orgs/permissions.ts`:

- `activeOrganizationId(event)` — the organization the session is currently
  acting in, taken from the session rather than from the request body.
- `requireOrgRole(event, orgId, role)` — membership **and** role, together.
- `requireActiveOrgRole(event, role)` — the same for the active organization.

`src/lib/orgs/roles.ts` holds the role model — `owner | admin | member` — plus
the rules about who may change whose role (`canSetRole`, `canManageRole`,
`canRemoveMember`). Those are pure functions with unit tests, which is where a
new rule about the hierarchy belongs.

## Writing a scoped feature

The organization id is a **required argument** to every repository function, the
same way the user id is on a single-tenant app:

```ts
listProjects(organizationId: string)
getProject(id: string, organizationId: string)
```

Never take the organization id from a form field or a query parameter and use it
to scope a query. Derive it from the session, or pass the one the caller asked
for through `requireOrgRole` first — that call is what turns an id from the
request into an authorized scope.

Personal-scope helpers taking `userId` are the wrong shape here. If a repository
function on this app scopes by user alone, ask whether the row really is
personal; usually it is not.

## Testing

`roles.ts` and the invitation schema are unit-tested. The authorization path is
proved in `tests/orgs.spec.ts`, where a member of one organization is refused
another's data — the cross-tenant case, which no unit test can stand in for.
