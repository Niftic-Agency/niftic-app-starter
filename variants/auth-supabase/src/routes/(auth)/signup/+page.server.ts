import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { signUpSchema } from '$lib/auth/schema';
import { logger } from '$lib/server/logger';
import { supabase } from '$lib/server/supabase';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	form: await superValidate(zod4(signUpSchema))
});

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(signUpSchema));
		if (!form.valid) return fail(400, { form });

		const { error } = await supabase(event).auth.signUp({
			email: form.data.email,
			password: form.data.password,
			options: {
				// Read by the `handle_new_user` trigger to populate the profile.
				data: { display_name: form.data.displayName },
				emailRedirectTo: `${event.url.origin}/auth/confirm?next=%2Fapp`
			}
		});

		if (error) {
			logger.warn('auth.sign_up_failed', { requestId: event.locals.requestId });
			return fail(400, { form, error: "That didn't work. Try a different address." });
		}

		// Deliberately the same answer whether the address was new or already had
		// an account — otherwise this form tells a stranger who has one. Supabase
		// sends the confirmation either way, and with confirmations on there is no
		// session yet regardless.
		return { form, sent: true };
	}
};
