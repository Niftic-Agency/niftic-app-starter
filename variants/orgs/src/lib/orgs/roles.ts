/**
 * Organization roles.
 *
 * Framework-neutral and free of server imports on purpose: the server guards
 * (`$lib/server/orgs/permissions`) and the pages both need it, and keeping it
 * pure is what makes the ordering testable without SvelteKit's env.
 *
 * The client copy is a courtesy — it decides which buttons to draw. The server
 * copy is the rule.
 */

export type OrgRole = 'owner' | 'admin' | 'member';

/** Ordered, so an owner satisfies an `admin` requirement without enumeration. */
const RANK: Record<OrgRole, number> = { member: 0, admin: 1, owner: 2 };

/** Offered on the invite form. Ownership is never handed out by invitation. */
export const ASSIGNABLE_ROLES = ['admin', 'member'] as const satisfies readonly OrgRole[];

/** Offered on the role-change form. What the actor may actually pick is `canSetRole`. */
export const MANAGEABLE_ROLES = ['owner', 'admin', 'member'] as const satisfies readonly OrgRole[];

/**
 * Anything Better Auth doesn't recognise is treated as the weakest role, never
 * the strongest — an unknown value in this column must not grant anything.
 */
export function orgRoleOf(role: string | null | undefined): OrgRole {
	// The plugin stores multiple roles comma-separated; the strongest one wins.
	let best: OrgRole = 'member';
	for (const part of (role ?? '').split(',')) {
		const trimmed = part.trim();
		if (trimmed in RANK && RANK[trimmed as OrgRole] > RANK[best]) best = trimmed as OrgRole;
	}
	return best;
}

export function hasOrgRole(role: string | null | undefined, required: OrgRole): boolean {
	return RANK[orgRoleOf(role)] >= RANK[required];
}

/**
 * May `actor` move a member who is currently `current` to `next`?
 *
 * The rule that matters is the second clause: `hasOrgRole(actor, 'admin')` alone
 * would let an admin demote the owner, which is a privilege escalation dressed
 * as a role change. Ownership is only ever granted or removed by an owner.
 */
export function canSetRole(actor: OrgRole, current: OrgRole, next: OrgRole): boolean {
	if (next === 'owner' || current === 'owner') return actor === 'owner';
	return hasOrgRole(actor, 'admin');
}

/** Whether `actor` may change this member's role to anything at all. */
export function canManageRole(actor: OrgRole, current: OrgRole): boolean {
	return MANAGEABLE_ROLES.some((next) => next !== current && canSetRole(actor, current, next));
}

/**
 * Owners are never removed by anyone, including another owner — they leave, or
 * they are demoted first. Removal is one click and cannot be undone by the
 * person it happened to.
 */
export function canRemoveMember(actor: OrgRole, current: OrgRole): boolean {
	if (current === 'owner') return false;
	return hasOrgRole(actor, 'admin');
}
