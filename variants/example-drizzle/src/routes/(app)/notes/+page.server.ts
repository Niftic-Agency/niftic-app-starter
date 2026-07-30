import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { requireUser } from '$lib/server/auth/permissions';
import { createNote, listNotes } from '$lib/server/db/repos/notes';
import { noteSchema } from '$lib/notes/schema';
import { acceptAttachment } from '$lib/notes/attachment';
import type { Actions, PageServerLoad } from './$types';

/**
 * The reference resource. Copy this shape for every new one.
 *
 * `requireUser` is called in the load AND in the action. The layout guard is not
 * enough: a form action can be POSTed directly without any layout ever running,
 * so the action is where authorization actually happens.
 */
export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);

	return {
		notes: await listNotes(user.id),
		form: await superValidate(zod4(noteSchema))
	};
};

export const actions: Actions = {
	create: async (event) => {
		const user = requireUser(event);

		const form = await superValidate(event.request, zod4(noteSchema));
		if (!form.valid) return fail(400, { form });

		// The owner comes from the session, never from the payload — and the
		// attachment key is re-checked against that owner rather than trusted,
		// since it arrives in a form field the user controls.
		await createNote(user.id, {
			...form.data,
			attachmentKey: acceptAttachment(form.data.attachmentKey, user.id) ?? undefined
		});

		// No redirect: staying put re-runs the load and the list updates in place.
		return { form };
	}
};
