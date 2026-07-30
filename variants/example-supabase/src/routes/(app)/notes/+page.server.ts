import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { requireUser } from '$lib/server/auth/permissions';
import { logger } from '$lib/server/logger';
import { supabase } from '$lib/server/supabase';
import { noteSchema } from '$lib/notes/schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The reference resource. Copy this shape for every new one.
 *
 * Two guards, not one. `requireUser` is called in the load AND in the action,
 * because a form action can be POSTed directly without any layout ever running.
 *
 * And underneath both, a third: every query here goes through the USER-scoped
 * client, so the `notes: owners …` policies apply even though this is server
 * code. That is the difference between this branch and the Drizzle ones — there,
 * forgetting `where user_id = ?` leaks the table; here, the database refuses.
 * The policy tests in `tests/policies.spec.ts` are what keep that true.
 */

export const load: PageServerLoad = async (event) => {
	requireUser(event);

	const { data, error } = await supabase(event)
		.from('notes')
		.select('id, title, body, attachment_key, updated_at')
		.order('updated_at', { ascending: false });

	if (error) {
		logger.error('notes.list_failed', { requestId: event.locals.requestId });
		return { notes: [], form: await superValidate(zod4(noteSchema)) };
	}

	// No `.eq('user_id', …)` — the policy already did it. Adding one would be
	// harmless but misleading: it would suggest the filter is what protects the
	// data, and a reader would then trust it somewhere it is missing.
	return { notes: data, form: await superValidate(zod4(noteSchema)) };
};

export const actions: Actions = {
	create: async (event) => {
		const user = requireUser(event);

		const form = await superValidate(event.request, zod4(noteSchema));
		if (!form.valid) return fail(400, { form });

		// The owner comes from the session, never from the payload. The insert
		// policy's `with check` would refuse anything else anyway — belt and
		// braces, and the braces are in the database.
		const { error } = await supabase(event).from('notes').insert({
			user_id: user.id,
			title: form.data.title,
			body: form.data.body
		});

		if (error) {
			logger.error('notes.create_failed', { requestId: event.locals.requestId });
			return fail(500, { form, error: 'That note could not be saved.' });
		}

		return { form };
	},

	delete: async (event) => {
		requireUser(event);

		const id = String((await event.request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Invalid request.' });

		// Scoped by the delete policy rather than by a where clause. Deleting
		// somebody else's note removes zero rows and reports success — which is
		// the correct answer, because it is indistinguishable from an id that
		// never existed.
		const { error } = await supabase(event).from('notes').delete().eq('id', id);

		if (error) {
			logger.error('notes.delete_failed', { requestId: event.locals.requestId });
			return fail(500, { error: 'That note could not be deleted.' });
		}

		return { success: true };
	}
};
