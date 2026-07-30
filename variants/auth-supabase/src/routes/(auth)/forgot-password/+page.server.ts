import { fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { forgotPasswordSchema } from '$lib/auth/schema';
import { supabase } from '$lib/server/supabase';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	form: await superValidate(zod4(forgotPasswordSchema))
});

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(forgotPasswordSchema));
		if (!form.valid) return fail(400, { form });

		await supabase(event).auth.resetPasswordForEmail(form.data.email, {
			redirectTo: `${event.url.origin}/auth/confirm?next=%2Freset-password`
		});

		// The result is not inspected and the answer never varies: "if that
		// address has an account, a link is on its way". Anything else is an
		// account-enumeration oracle on an unauthenticated form.
		return { form, sent: true };
	}
};
