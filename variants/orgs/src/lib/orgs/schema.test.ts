import { describe, expect, it } from 'vitest';
import { inviteSchema, organizationSchema } from './schema';

describe('organizationSchema', () => {
	it('accepts an ordinary organization', () => {
		const result = organizationSchema.safeParse({ name: 'Niftic', slug: 'niftic' });
		expect(result.success).toBe(true);
	});

	it('trims and lowercases the slug before checking it', () => {
		const result = organizationSchema.safeParse({ name: '  Niftic  ', slug: '  Niftic-Labs ' });
		expect(result.success && result.data).toEqual({ name: 'Niftic', slug: 'niftic-labs' });
	});

	it('rejects a slug that would not survive a URL', () => {
		for (const slug of ['-leading', 'trailing-', 'has space', 'under_score', 'ünïcode', '']) {
			expect(organizationSchema.safeParse({ name: 'X', slug }).success, slug).toBe(false);
		}
	});

	it('bounds the name, and whitespace is not a name', () => {
		expect(organizationSchema.safeParse({ name: '   ', slug: 'ok' }).success).toBe(false);
		expect(organizationSchema.safeParse({ name: 'a'.repeat(81), slug: 'ok' }).success).toBe(false);
	});
});

describe('inviteSchema', () => {
	it('normalises the address, since it is matched against a session email', () => {
		const result = inviteSchema.safeParse({ email: '  Person@Example.COM ', role: 'admin' });
		expect(result.success && result.data.email).toBe('person@example.com');
	});

	it('defaults to the least privileged role', () => {
		const result = inviteSchema.safeParse({ email: 'person@example.com' });
		expect(result.success && result.data.role).toBe('member');
	});

	it('refuses to hand out ownership through an invite form', () => {
		expect(inviteSchema.safeParse({ email: 'p@example.com', role: 'owner' }).success).toBe(false);
		expect(inviteSchema.safeParse({ email: 'p@example.com', role: 'anything' }).success).toBe(
			false
		);
	});

	it('rejects a non-address', () => {
		expect(inviteSchema.safeParse({ email: 'not-an-email', role: 'member' }).success).toBe(false);
	});
});
