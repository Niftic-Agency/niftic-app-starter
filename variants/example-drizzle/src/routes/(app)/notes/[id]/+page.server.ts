import { error, fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { requireUser } from '$lib/server/auth/permissions';
import { deleteNote, getNote, updateNote } from '$lib/server/db/repos/notes';
import { noteSchema } from '$lib/notes/schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Every repository call takes the owner, so "not yours" and "does not exist"
 * produce the same 404. That is deliberate: a 403 would confirm the id is real.
 */
export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);

	const note = await getNote(event.params.id, user.id);
	if (!note) error(404, 'Not found');

	return {
		note,
		form: await superValidate({ title: note.title, body: note.body }, zod4(noteSchema))
	};
};

export const actions: Actions = {
	update: async (event) => {
		const user = requireUser(event);

		const form = await superValidate(event.request, zod4(noteSchema));
		if (!form.valid) return fail(400, { form });

		// Re-checked here, not just in the load — the load never ran for a direct
		// POST. The owner scoping in the repo is what makes this safe.
		const updated = await updateNote(event.params.id, user.id, form.data);
		if (!updated) error(404, 'Not found');

		return { form };
	},

	delete: async (event) => {
		const user = requireUser(event);

		const removed = await deleteNote(event.params.id, user.id);
		if (!removed) error(404, 'Not found');

		redirect(303, '/notes');
	}
};
