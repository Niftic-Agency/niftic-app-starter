import { expect, test } from '@playwright/test';

/**
 * The auth smoke for `client` mode.
 *
 * Signs in as the seeded admin rather than reaching into the database to flip a
 * verification flag — that keeps the test dialect-agnostic and exercises the
 * seed script at the same time. CI sets ADMIN_EMAIL/ADMIN_PASSWORD and runs
 * `pnpm db:seed` first.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ci-only-password-2f8a1c';

test('the authed area is closed to anonymous visitors', async ({ page }) => {
	await page.goto('/app');
	await expect(page).toHaveURL(/\/login/);
	// The original destination survives the bounce.
	expect(page.url()).toContain('redirectTo');
});

test('sign in, land on the dashboard, sign out', async ({ page }) => {
	await page.goto('/login');

	await page.getByLabel('Email').fill(ADMIN_EMAIL);
	await page.getByLabel('Password').fill(ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page).toHaveURL(/\/app/);
	await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();

	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login/);

	// The session is really gone, not just navigated away from.
	await page.goto('/app');
	await expect(page).toHaveURL(/\/login/);
});

test('sign-up asks for confirmation and does not sign you in', async ({ page }) => {
	const email = `smoke-${Date.now()}@example.com`;

	await page.goto('/signup');
	await page.getByLabel('Name').fill('Smoke Test');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('a-sufficiently-long-password');
	await page.getByRole('button', { name: 'Create account' }).click();

	await expect(page.getByText(/check your email/i)).toBeVisible();

	// Verification is required, so no session should exist yet.
	await page.goto('/app');
	await expect(page).toHaveURL(/\/login/);
});

test('a wrong password is rejected without revealing whether the account exists', async ({
	page
}) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill(ADMIN_EMAIL);
	await page.getByLabel('Password').fill('definitely-not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page.getByText('That email or password is not right.')).toBeVisible();
	await expect(page).toHaveURL(/\/login/);
});
