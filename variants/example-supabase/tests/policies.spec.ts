import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Policy tests. The point of the Supabase branch, asserted rather than asserted
 * about.
 *
 * These bypass the app entirely and talk to PostgREST with the publishable key —
 * exactly what a browser holds, and exactly what an attacker would hold. Nothing
 * here can be satisfied by an `if` in a route: every refusal below has to come
 * from the database.
 *
 * They need the local stack (`pnpm db:start && pnpm db:reset`), which is why
 * they live behind the same CI job that starts it.
 */

const URL = process.env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const SECRET = process.env.SUPABASE_SECRET_KEY ?? '';

const PASSWORD = 'policy-test-password-2f8a1c';

/** A client holding only the publishable key — an anonymous visitor. */
function anonClient(): SupabaseClient {
	return createClient(URL, KEY, { auth: { persistSession: false } });
}

/**
 * Create a confirmed user with the service role, then sign in as them.
 *
 * Confirmed via the admin API rather than by clicking a link, because these
 * tests are about policies and not about the mail flow.
 */
async function signedInAs(email: string): Promise<SupabaseClient> {
	const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

	const { error: createError } = await admin.auth.admin.createUser({
		email,
		password: PASSWORD,
		email_confirm: true
	});
	// A re-run against a stack that was not reset is fine; the sign-in below is
	// what matters.
	if (createError && !/already/i.test(createError.message)) throw createError;

	const client = createClient(URL, KEY, { auth: { persistSession: false } });
	const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
	if (error) throw error;

	return client;
}

test('a note is invisible to anon and to another user, and editable only by its owner', async () => {
	test.skip(!KEY || !SECRET, 'needs the local Supabase stack');

	const stamp = Date.now();
	const alice = await signedInAs(`alice-${stamp}@example.com`);
	const bob = await signedInAs(`bob-${stamp}@example.com`);
	const anon = anonClient();

	const {
		data: { user: aliceUser }
	} = await alice.auth.getUser();
	expect(aliceUser).not.toBeNull();

	// ── A creates a note ─────────────────────────────────────────────────────
	const { data: note, error: createError } = await alice
		.from('notes')
		.insert({ user_id: aliceUser!.id, title: `Alice's note ${stamp}` })
		.select()
		.single();

	expect(createError).toBeNull();
	expect(note).not.toBeNull();

	// ── A can read it ────────────────────────────────────────────────────────
	const mine = await alice.from('notes').select('id').eq('id', note!.id);
	expect(mine.data).toHaveLength(1);

	// ── anon cannot ──────────────────────────────────────────────────────────
	// Note the shape of the refusal: not an error, an EMPTY RESULT. RLS filters
	// rather than rejects, which is why "it returned 200" proves nothing on its
	// own and why this asserts on the rows.
	const asAnon = await anon.from('notes').select('id').eq('id', note!.id);
	expect(asAnon.data ?? []).toHaveLength(0);

	// ── B cannot read it ─────────────────────────────────────────────────────
	const asBob = await bob.from('notes').select('id').eq('id', note!.id);
	expect(asBob.data ?? []).toHaveLength(0);

	// ── B cannot update it ───────────────────────────────────────────────────
	const bobUpdate = await bob
		.from('notes')
		.update({ title: 'taken over' })
		.eq('id', note!.id)
		.select();
	expect(bobUpdate.data ?? []).toHaveLength(0);

	// ── B cannot delete it ───────────────────────────────────────────────────
	const bobDelete = await bob.from('notes').delete().eq('id', note!.id).select();
	expect(bobDelete.data ?? []).toHaveLength(0);

	// ── ...and it is still there and unchanged ───────────────────────────────
	const after = await alice.from('notes').select('title').eq('id', note!.id).single();
	expect(after.data?.title).toBe(`Alice's note ${stamp}`);

	// ── B cannot create a note owned by A ────────────────────────────────────
	// The insert policy's `with check` is what refuses this. Without it, anyone
	// could plant rows in anyone's account.
	const forged = await bob
		.from('notes')
		.insert({ user_id: aliceUser!.id, title: 'forged' })
		.select();
	expect(forged.error).not.toBeNull();

	// ── A cannot give their note away ────────────────────────────────────────
	// The UPDATE policy's `with check` clause. `using` alone would allow this,
	// which is the subtle half of the standard policy set.
	const {
		data: { user: bobUser }
	} = await bob.auth.getUser();
	const handover = await alice
		.from('notes')
		.update({ user_id: bobUser!.id })
		.eq('id', note!.id)
		.select();
	expect(handover.data ?? []).toHaveLength(0);
});

test('a role cannot be granted to yourself', async () => {
	test.skip(!KEY || !SECRET, 'needs the local Supabase stack');

	const stamp = Date.now();
	const mallory = await signedInAs(`mallory-${stamp}@example.com`);
	const {
		data: { user }
	} = await mallory.auth.getUser();

	// The profile row exists — the trigger on auth.users made it — and is
	// readable by its owner.
	const before = await mallory.from('profiles').select('role').eq('user_id', user!.id).single();
	expect(before.data?.role).toBe('member');

	// The update policy allows a display-name change but pins `role` to its
	// current value, so this changes nothing.
	const escalate = await mallory
		.from('profiles')
		.update({ role: 'admin' })
		.eq('user_id', user!.id)
		.select();
	expect(escalate.data ?? []).toHaveLength(0);

	const after = await mallory.from('profiles').select('role').eq('user_id', user!.id).single();
	expect(after.data?.role).toBe('member');

	// There is no insert policy at all, so a second profile cannot be planted.
	const planted = await mallory
		.from('profiles')
		.insert({ user_id: crypto.randomUUID(), email: 'x@example.com', role: 'admin' })
		.select();
	expect(planted.error).not.toBeNull();
});

test('anon cannot read profiles at all', async () => {
	test.skip(!KEY, 'needs the local Supabase stack');

	const { data } = await anonClient().from('profiles').select('user_id');
	expect(data ?? []).toHaveLength(0);
});
