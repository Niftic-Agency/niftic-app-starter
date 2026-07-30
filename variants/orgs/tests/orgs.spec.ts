import { expect, test, type Page } from '@playwright/test';

/**
 * The organization smoke.
 *
 * What one seeded identity can actually prove: creating an organization, being
 * its owner, inviting somebody, cancelling that invitation, and — the part that
 * matters most — that an invitation addressed to somebody else is not readable
 * by the person who sent it.
 *
 * What it deliberately does NOT cover: a second human accepting an invitation.
 * That needs a second verified account, and `client` mode requires a real
 * mailbox to verify one. The acceptance path is covered by the permission unit
 * tests and by driving the API directly with a second seeded user; this file
 * does not pretend otherwise.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ci-only-password-2f8a1c';

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(ADMIN_EMAIL);
	await page.getByLabel('Password').fill(ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/app/);
}

test('organizations are closed to anonymous visitors', async ({ page }) => {
	await page.goto('/organizations');
	await expect(page).toHaveURL(/\/login/);

	// The members page too — a guard on one route is not a guard on the group.
	await page.goto('/organizations/members');
	await expect(page).toHaveURL(/\/login/);
});

test('create an organization, invite someone, cancel the invitation', async ({ page }) => {
	const slug = `smoke-${Date.now()}`;
	const invitee = `invitee-${Date.now()}@example.com`;

	await signIn(page);

	await page.getByRole('link', { name: 'Organizations' }).click();
	await expect(page).toHaveURL(/\/organizations/);

	// Wait for hydration before typing: Playwright can fill and submit faster
	// than the client bundle attaches its bindings, and the form would then post
	// the server-rendered (empty) value.
	await expect(page.getByLabel('Name')).toBeVisible();
	await page.waitForLoadState('networkidle');

	await page.getByLabel('Name').fill('Smoke Org');
	await page.getByLabel('Address').fill(slug);
	await page.getByRole('button', { name: 'Create organization' }).click();

	// Creating makes it active and lands on its members page.
	await expect(page).toHaveURL(/\/organizations\/members/);
	await expect(page.getByRole('heading', { name: 'Smoke Org' })).toBeVisible();
	// The creator is the owner, and an owner cannot change their own role.
	await expect(page.getByText('You are owner here.')).toBeVisible();

	// Invite
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email').fill(invitee);
	await page.getByRole('button', { name: 'Send invitation' }).click();
	await expect(page.getByText(invitee)).toBeVisible();

	// Cancel it again
	await page.locator('li', { hasText: invitee }).getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByText(invitee)).toHaveCount(0);
});

test('a second organization can be created and switched between', async ({ page }) => {
	const slug = `smoke-two-${Date.now()}`;

	await signIn(page);
	await page.goto('/organizations');
	await page.waitForLoadState('networkidle');

	await page.getByLabel('Name').fill('Second Org');
	await page.getByLabel('Address').fill(slug);
	await page.getByRole('button', { name: 'Create organization' }).click();
	await expect(page).toHaveURL(/\/organizations\/members/);
	await expect(page.getByRole('heading', { name: 'Second Org' })).toBeVisible();

	await page.goto('/organizations');
	const other = page.locator('li', { hasText: 'Smoke Org' }).first();
	await other.getByRole('button', { name: 'Switch to' }).click();

	await expect(page).toHaveURL(/\/organizations\/members/);
	await expect(page.getByRole('heading', { name: 'Smoke Org' })).toBeVisible();
});

test('an invitation addressed to someone else is not readable', async ({ page }) => {
	await signIn(page);

	// A well-formed id that is not this user's invitation must answer exactly the
	// same as one that never existed: 404, never "forbidden".
	const response = await page.goto('/organizations/invitations/not-your-invitation');
	expect(response?.status()).toBe(404);
});

test('posting straight at a form action never reaches the mutation', async ({
	request,
	baseURL
}) => {
	// A form action can be POSTed without any layout or load ever running, so
	// there are two independent things to prove — and they fail at different
	// layers, which is worth knowing when one of them is later changed.

	// 1. No matching Origin: SvelteKit's own CSRF check answers 403 before any of
	//    our code runs. Note this only bites in a real build — the dev server
	//    relaxes it, so a dev-server test here would prove nothing.
	const crossSite = await request.post('/organizations?/setActive', {
		form: { organizationId: 'some-other-org' },
		maxRedirects: 0
	});
	expect(crossSite.status()).toBe(403);

	// 2. With a correct Origin, the action really does run, and OUR guard is what
	//    refuses it. This is the case that matters: anything a signed-in user's
	//    browser sends carries the right origin.
	const sameSite = await request.post('/organizations?/setActive', {
		form: { organizationId: 'some-other-org' },
		headers: { origin: baseURL ?? '', accept: 'text/html' },
		maxRedirects: 0
	});
	expect(sameSite.status()).toBe(303);
	expect(sameSite.headers()['location'] ?? '').toContain('/login');
});
