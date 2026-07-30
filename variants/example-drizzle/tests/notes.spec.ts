import { expect, test } from '@playwright/test';

/**
 * Completes the spec's canonical smoke path: sign in, create a note, sign out.
 *
 * Lives in this variant rather than in auth-better so each variant tests what it
 * ships — an app configured with `example: false` should not carry a spec for a
 * feature it does not have.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ci-only-password-2f8a1c';

async function signIn(page: import('@playwright/test').Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(ADMIN_EMAIL);
	await page.getByLabel('Password').fill(ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/app/);
}

test('the notes list is closed to anonymous visitors', async ({ page }) => {
	await page.goto('/notes');
	await expect(page).toHaveURL(/\/login/);
});

test('sign in, create a note, edit it, delete it, sign out', async ({ page }) => {
	const title = `Smoke note ${Date.now()}`;

	await signIn(page);

	await page.getByRole('link', { name: 'Notes' }).click();
	await expect(page).toHaveURL(/\/notes/);

	// Create
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Body').fill('Written by the smoke test.');
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByRole('heading', { name: title })).toBeVisible();

	// Edit
	await page.locator('li', { hasText: title }).getByRole('link', { name: 'Edit' }).click();

	// Wait for hydration before typing. Playwright can fill and submit within
	// ~30ms of navigation, which is faster than the client bundle attaches its
	// bindings — the form then posts the server-rendered value and the edit
	// silently no-ops.
	await expect(page.getByLabel('Title')).toHaveValue(title);
	await page.waitForLoadState('networkidle');

	await page.getByLabel('Title').fill(`${title} (edited)`);

	// Wait for the action to answer before navigating. `use:enhance` submits via
	// fetch, so a goto() straight after the click aborts the request in flight —
	// the update lands on the server sometimes and not others.
	const saved = page.waitForResponse((r) => r.url().includes('?/update'));
	await page.getByRole('button', { name: 'Save' }).click();
	await saved;

	await page.goto('/notes');
	await expect(page.getByRole('heading', { name: `${title} (edited)` })).toBeVisible();

	// Delete, via the confirmation dialog
	await page.locator('li', { hasText: title }).getByRole('link', { name: 'Edit' }).click();
	await page.getByRole('button', { name: 'Delete' }).first().click();
	await page.getByRole('button', { name: 'Delete' }).last().click();

	await expect(page).toHaveURL(/\/notes$/);
	await expect(page.getByRole('heading', { name: `${title} (edited)` })).toHaveCount(0);

	// Sign out
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login/);
});
