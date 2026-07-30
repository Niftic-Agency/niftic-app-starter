import { expect, test } from '@playwright/test';

/**
 * The static profile's smoke: the site prerenders, and the one piece of server
 * code it keeps works — including the two ways it is allowed to say no.
 *
 * CI runs this with EMAIL_DRY_RUN=true, so a successful send logs the payload
 * instead of mailing anyone.
 */

test('the marketing shell renders and links to the form', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Contact' }).click();
	await expect(page).toHaveURL(/\/contact$/);
	await expect(page.getByRole('heading', { name: 'Get in touch' })).toBeVisible();
});

test('a filled-in form sends and confirms inline', async ({ page }) => {
	await page.goto('/contact');
	// Wait for hydration: without it the form does a plain POST and navigates,
	// which is the no-JS path rather than the one this test is about.
	await page.waitForLoadState('networkidle');

	await page.getByLabel('Name').fill('Ada Lovelace');
	await page.getByLabel('Email').fill('ada@example.com');
	await page.getByLabel('Message').fill('I would like to talk about the Analytical Engine.');
	await page.getByRole('button', { name: 'Send message' }).click();

	await expect(page.getByText('Message sent')).toBeVisible();
	// The enhanced path never navigates.
	await expect(page).toHaveURL(/\/contact$/);
});

test('the honeypot is off-screen, out of the tab order, and fatal when filled', async ({
	page,
	request,
	baseURL
}) => {
	await page.goto('/contact');

	const honeypot = page.locator('input[name="company_website"]');

	// NOT toBeHidden(): the field is deliberately a real, rendered text input —
	// `display:none` and `type=hidden` are exactly what a bot skips. Playwright
	// counts an off-screen element as visible, so assert the thing that actually
	// keeps it away from people: it is painted far outside the viewport.
	const box = await honeypot.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.x).toBeLessThan(-1000);

	await expect(honeypot).toHaveAttribute('tabindex', '-1');
	await expect(page.locator('[aria-hidden="true"] input[name="company_website"]')).toHaveCount(1);

	// A bot fills every input. The endpoint must refuse it — and refuse it the
	// same way it refuses a mistyped address, so there is nothing to learn from
	// the difference.
	const response = await request.post('/api/contact', {
		form: {
			name: 'Bot',
			email: 'bot@example.com',
			message: 'buy things',
			company_website: 'https://spam.example'
		},
		headers: { accept: 'application/json', origin: baseURL ?? '' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(400);
});

test('a bad payload is rejected server-side, not just in the browser', async ({
	request,
	baseURL
}) => {
	const response = await request.post('/api/contact', {
		form: { name: '', email: 'not-an-email', message: '' },
		// A real browser always sends this; without it SvelteKit's CSRF check
		// answers 403 before the endpoint runs, which would test the wrong thing.
		headers: { accept: 'application/json', origin: baseURL ?? '' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(400);

	const body = await response.json();
	expect(body.ok).toBe(false);
	expect(Object.keys(body.errors)).toEqual(expect.arrayContaining(['name', 'email', 'message']));
});

test('a cross-origin post is refused before the endpoint runs', async ({ request }) => {
	// The contact form is public, but that is no reason to accept a submission
	// posted from somebody else's page.
	const response = await request.post('/api/contact', {
		form: { name: 'Ada', email: 'ada@example.com', message: 'Hello.' },
		headers: { accept: 'application/json', origin: 'https://evil.example' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(403);
});

test('without JavaScript the form still works, via redirects', async ({ request, baseURL }) => {
	// A plain browser post asks for HTML and gets a 303 to a prerendered page,
	// because a static site cannot render an outcome into the page you came from.
	const ok = await request.post('/api/contact', {
		form: { name: 'Ada', email: 'ada@example.com', message: 'Hello.' },
		headers: { accept: 'text/html', origin: baseURL ?? '' },
		maxRedirects: 0
	});
	expect(ok.status()).toBe(303);
	expect(ok.headers()['location']).toContain('/contact/thanks');

	const bad = await request.post('/api/contact', {
		form: { name: '', email: 'nope', message: '' },
		headers: { accept: 'text/html', origin: baseURL ?? '' },
		maxRedirects: 0
	});
	expect(bad.status()).toBe(303);
	expect(bad.headers()['location']).toContain('/contact/problem');

	// Both destinations are prerendered, so they are there without a function.
	for (const path of ['/contact/thanks', '/contact/problem']) {
		expect((await request.get(path)).status(), path).toBe(200);
	}
});

test('health is reduced to what this profile actually has', async ({ request }) => {
	const response = await request.get('/api/health');
	expect(response.status()).toBe(200);

	const body = await response.json();
	expect(body.status).toBe('healthy');
	expect(body.profile).toBe('static');
	// No database, no storage — the registry only ever had email to contribute.
	expect(Object.keys(body.checks)).toEqual(['email']);
});
