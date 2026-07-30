import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { resetPasswordSchema } from '$lib/auth/schema';
import { logger } from '$lib/server/logger';
import { supabase } from '$lib/server/supabase';
import type { Actions, PageServerLoad } from './$types';

/**
 * Reached only through the link in the reset email, which `/auth/confirm` has
 * already exchanged for a session. So the guard is simply "are you signed in" —
 * and it is a real guard: without it this page would let anyone set anyone's
 * password.
 */
export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(303, '/login?error=link');
	return { form: await superValidate(zod4(resetPasswordSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.locals.user) redirect(303, '/login?error=link');

		const form = await superValidate(event.request, zod4(resetPasswordSchema));
		if (!form.valid) return fail(400, { form });

		const { error } = await supabase(event).auth.updateUser({ password: form.data.password });

		if (error) {
			logger.warn('auth.password_update_failed', { requestId: event.locals.requestId });
			return fail(400, { form, error: "That password wasn't accepted. Try another." });
		}

		redirect(303, '/app');
	}
};
