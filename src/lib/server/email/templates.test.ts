import { describe, expect, it } from 'vitest';
import { templates } from './templates';

describe('email templates', () => {
	const all = Object.keys(templates) as (keyof typeof templates)[];

	const sample = {
		verifyEmail: { url: 'https://example.com/verify?token=abc', name: 'Ada' },
		resetPassword: { url: 'https://example.com/reset?token=abc', name: 'Ada' },
		invite: { url: 'https://example.com/invite?token=abc', invitedBy: 'Ada', organization: 'Acme' },
		contactNotification: { name: 'Ada', email: 'ada@example.com', message: 'Hello there' }
	} as const;

	it('every template renders a subject, html and text part', () => {
		for (const name of all) {
			const rendered = templates[name](sample[name] as never);
			expect(rendered.subject, name).toBeTruthy();
			expect(rendered.html, name).toContain('<html');
			// A missing text part hurts deliverability, so it is not optional.
			expect(rendered.text.trim(), name).toBeTruthy();
		}
	});

	it('includes the action URL in both parts, so neither is a dead end', () => {
		for (const name of ['verifyEmail', 'resetPassword', 'invite'] as const) {
			const rendered = templates[name](sample[name] as never);
			expect(rendered.html, name).toContain('token=abc');
			expect(rendered.text, name).toContain('token=abc');
		}
	});

	it('escapes user-supplied values rather than interpolating them raw', () => {
		const rendered = templates.contactNotification({
			name: '<script>alert(1)</script>',
			email: 'a@b.com',
			message: 'x " y & z'
		});
		expect(rendered.html).not.toContain('<script>alert(1)</script>');
		expect(rendered.html).toContain('&lt;script&gt;');
		expect(rendered.html).toContain('&amp;');
	});

	it('escapes a URL too — it reaches an href attribute', () => {
		const rendered = templates.verifyEmail({ url: 'https://e.com/?a=1"onmouseover="x' });
		expect(rendered.html).not.toContain('"onmouseover="');
		expect(rendered.html).toContain('&quot;');
	});
});
