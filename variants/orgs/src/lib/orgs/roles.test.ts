import { describe, expect, it } from 'vitest';
import { canManageRole, canRemoveMember, canSetRole, hasOrgRole, orgRoleOf } from './roles';

describe('orgRoleOf', () => {
	it('recognises the three roles the plugin ships with', () => {
		expect(orgRoleOf('owner')).toBe('owner');
		expect(orgRoleOf('admin')).toBe('admin');
		expect(orgRoleOf('member')).toBe('member');
	});

	it('takes the strongest of a comma-separated list, which is how the plugin stores them', () => {
		expect(orgRoleOf('member,admin')).toBe('admin');
		expect(orgRoleOf(' admin , owner ')).toBe('owner');
	});

	it('falls back to the weakest role, never the strongest', () => {
		// An unrecognised value in this column must not grant anything: a custom
		// role, a typo and a truncated write all land here.
		expect(orgRoleOf('superuser')).toBe('member');
		expect(orgRoleOf('')).toBe('member');
		expect(orgRoleOf(null)).toBe('member');
		expect(orgRoleOf(undefined)).toBe('member');
		expect(orgRoleOf('owner_')).toBe('member');
		expect(orgRoleOf('sales,marketing')).toBe('member');
	});
});

describe('hasOrgRole', () => {
	it('is ordered — an owner passes every check', () => {
		expect(hasOrgRole('owner', 'owner')).toBe(true);
		expect(hasOrgRole('owner', 'admin')).toBe(true);
		expect(hasOrgRole('owner', 'member')).toBe(true);
	});

	it('does not promote', () => {
		expect(hasOrgRole('admin', 'owner')).toBe(false);
		expect(hasOrgRole('member', 'admin')).toBe(false);
		expect(hasOrgRole('member', 'owner')).toBe(false);
	});

	it('grants nothing to a missing membership', () => {
		expect(hasOrgRole(null, 'admin')).toBe(false);
		expect(hasOrgRole(undefined, 'owner')).toBe(false);
		// ...but "member" is the floor, so a present-but-unknown role is still a
		// member. Membership itself is proved by the row existing, not by this.
		expect(hasOrgRole('anything', 'member')).toBe(true);
	});
});

describe('canSetRole', () => {
	it('lets an admin move people between admin and member', () => {
		expect(canSetRole('admin', 'member', 'admin')).toBe(true);
		expect(canSetRole('admin', 'admin', 'member')).toBe(true);
	});

	it('never lets an admin demote an owner — that is escalation, not a role change', () => {
		expect(canSetRole('admin', 'owner', 'member')).toBe(false);
		expect(canSetRole('admin', 'owner', 'admin')).toBe(false);
	});

	it('never lets an admin mint an owner', () => {
		expect(canSetRole('admin', 'member', 'owner')).toBe(false);
	});

	it('lets an owner do both', () => {
		expect(canSetRole('owner', 'member', 'owner')).toBe(true);
		expect(canSetRole('owner', 'owner', 'admin')).toBe(true);
	});

	it('lets a plain member do nothing', () => {
		for (const current of ['owner', 'admin', 'member'] as const) {
			for (const next of ['owner', 'admin', 'member'] as const) {
				expect(canSetRole('member', current, next), `${current} → ${next}`).toBe(false);
			}
		}
	});
});

describe('canManageRole', () => {
	it('is what the members table draws its role control from', () => {
		expect(canManageRole('admin', 'member')).toBe(true);
		expect(canManageRole('admin', 'admin')).toBe(true);
		expect(canManageRole('owner', 'owner')).toBe(true);
		// An admin cannot touch an owner, so no control is drawn for that row.
		expect(canManageRole('admin', 'owner')).toBe(false);
		expect(canManageRole('member', 'member')).toBe(false);
	});
});

describe('canRemoveMember', () => {
	it('lets admins and owners remove admins and members', () => {
		expect(canRemoveMember('admin', 'member')).toBe(true);
		expect(canRemoveMember('admin', 'admin')).toBe(true);
		expect(canRemoveMember('owner', 'admin')).toBe(true);
	});

	it('never removes an owner, not even for another owner', () => {
		expect(canRemoveMember('owner', 'owner')).toBe(false);
		expect(canRemoveMember('admin', 'owner')).toBe(false);
	});

	it('lets a plain member remove nobody', () => {
		expect(canRemoveMember('member', 'member')).toBe(false);
		expect(canRemoveMember('member', 'admin')).toBe(false);
	});
});
