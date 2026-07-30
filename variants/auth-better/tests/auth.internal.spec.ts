import { expect, test } from '@playwright/test';

/**
 * The auth smoke for `internal` mode.
 *
 * Google's consent screen can't be driven from CI, so this asserts everything
 * up to the redirect: the area is closed, the only way in is Google, and none of
 * the password surface exists. What it deliberately does NOT do is stub the
 * OAuth provider — a smoke that passes against a fake identity provider proves
 * very little.
 */

test('the authed area is closed to anonymous visitors', async ({ page }) => {
	await page.goto('/app');
	await expect(page).toHaveURL(/\/login/);
});

test('sign-in offers Google and nothing else', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();

	// No password surface in internal mode — that is the point of the mode.
	await expect(page.getByLabel('Password')).toHaveCount(0);
});

test('the password routes do not exist at all', async ({ request }) => {
	// These files are never copied in internal mode, so they should 404 rather
	// than render an unusable form.
	for (const path of ['/signup', '/forgot-password', '/reset-password']) {
		const response = await request.get(path, { maxRedirects: 0 });
		expect(response.status(), `${path} should not exist`).toBe(404);
	}
});
