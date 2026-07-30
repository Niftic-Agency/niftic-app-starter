import { describe, expect, it } from 'vitest';
import { contactSchema, HONEYPOT_FIELD } from './schema';

const valid = {
	name: 'Ada',
	email: 'ada@example.com',
	message: 'Hello.'
};

describe('contactSchema', () => {
	it('accepts an ordinary submission', () => {
		expect(contactSchema.safeParse(valid).success).toBe(true);
	});

	it('normalises the address, since it is what a reply goes to', () => {
		const result = contactSchema.safeParse({ ...valid, email: '  Ada@Example.COM ' });
		expect(result.success && result.data.email).toBe('ada@example.com');
	});

	it('rejects whitespace-only text — a space is not a name or a message', () => {
		expect(contactSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
		expect(contactSchema.safeParse({ ...valid, message: '  \n ' }).success).toBe(false);
	});

	it('bounds every field', () => {
		expect(contactSchema.safeParse({ ...valid, name: 'a'.repeat(121) }).success).toBe(false);
		expect(contactSchema.safeParse({ ...valid, subject: 'a'.repeat(161) }).success).toBe(false);
		expect(contactSchema.safeParse({ ...valid, message: 'a'.repeat(5001) }).success).toBe(false);
	});

	it('subject is optional', () => {
		const result = contactSchema.safeParse(valid);
		expect(result.success && result.data.subject).toBeUndefined();
	});
});

describe('the honeypot', () => {
	it('passes when absent, which is what a human sends', () => {
		expect(contactSchema.safeParse(valid).success).toBe(true);
	});

	it('passes when present and empty, which is what a browser sends', () => {
		expect(contactSchema.safeParse({ ...valid, [HONEYPOT_FIELD]: '' }).success).toBe(true);
	});

	it('rejects any value at all', () => {
		expect(contactSchema.safeParse({ ...valid, [HONEYPOT_FIELD]: 'x' }).success).toBe(false);
		expect(
			contactSchema.safeParse({ ...valid, [HONEYPOT_FIELD]: 'https://spam.example' }).success
		).toBe(false);
	});

	it('never reaches the caller, so it cannot end up in an email', () => {
		const result = contactSchema.safeParse({ ...valid, [HONEYPOT_FIELD]: '' });
		expect(result.success && result.data[HONEYPOT_FIELD]).toBeUndefined();
	});
});
