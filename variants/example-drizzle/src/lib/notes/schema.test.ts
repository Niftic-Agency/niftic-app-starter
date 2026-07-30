import { describe, expect, it } from 'vitest';
import { noteSchema } from './schema';

describe('noteSchema', () => {
	it('accepts a normal note', () => {
		const result = noteSchema.safeParse({ title: 'Standup', body: 'Shipped the thing.' });
		expect(result.success).toBe(true);
	});

	it('trims before checking, so whitespace is not a title', () => {
		expect(noteSchema.safeParse({ title: '   ', body: '' }).success).toBe(false);
		const ok = noteSchema.safeParse({ title: '  Standup  ', body: '' });
		expect(ok.success && ok.data.title).toBe('Standup');
	});

	it('defaults the body so the column is never null', () => {
		const result = noteSchema.safeParse({ title: 'Just a title' });
		expect(result.success && result.data.body).toBe('');
	});

	it('bounds both fields', () => {
		expect(noteSchema.safeParse({ title: 'a'.repeat(201), body: '' }).success).toBe(false);
		expect(noteSchema.safeParse({ title: 'ok', body: 'a'.repeat(10_001) }).success).toBe(false);
	});
});
