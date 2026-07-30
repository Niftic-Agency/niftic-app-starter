import { expect, test } from '@playwright/test';

/**
 * The health smoke. Deliberately the dullest test in the repo: if this fails,
 * nothing else is worth reading.
 */
test('health endpoint reports every capability as healthy', async ({ request }) => {
	const response = await request.get('/api/health');
	expect(response.status()).toBe(200);

	const body = await response.json();
	expect(body.status).toBe('healthy');
	expect(body.profile).toBeTruthy();
	expect(body.profile).not.toBe('unconfigured');

	// Each registered check must pass on its own, not just in aggregate —
	// an overall 200 with a failing sub-check would be a bug in the endpoint.
	for (const [name, check] of Object.entries(body.checks as Record<string, { ok: boolean }>)) {
		expect(check.ok, `check "${name}" should be ok`).toBe(true);
	}
});

test('the landing page renders', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});
