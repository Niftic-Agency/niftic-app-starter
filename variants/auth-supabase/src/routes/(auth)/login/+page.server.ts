import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { signInSchema } from '$lib/auth/schema';
import { modeCopy } from '$lib/server/auth/mode';
import { logger } from '$lib/server/logger';
import { supabase } from '$lib/server/supabase';
import type { Actions, PageServerLoad } from './$types';

/**
 * Sign in.
 *
 * Both auth modes share this route — `modeCopy` decides what is rendered, and
 * `internal` mode's real enforcement is the domain allowlist in the session
 * hook, not anything here.
 */

function safeRedirect(raw: string | null): string {
	return raw && /^\/(?!\/)/.test(raw) ? raw : '/app';
}

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(303, safeRedirect(event.url.searchParams.get('redirectTo')));

	return {
		copy: modeCopy,
		form: await superValidate(zod4(signInSchema)),
		// `link` means an email link was already used or has expired; `domain`
		// means the address is not on the allowlist.
		notice: event.url.searchParams.get('error')
	};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(signInSchema));
		if (!form.valid) return fail(400, { form });

		const { error } = await supabase(event).auth.signInWithPassword({
			email: form.data.email,
			password: form.data.password
		});

		if (error) {
			logger.warn('auth.sign_in_failed', { requestId: event.locals.requestId });
			// One message for a wrong password and for an address that has no
			// account: the difference is an account-enumeration oracle.
			return fail(400, { form, error: 'That email or password is not right.' });
		}

		redirect(303, safeRedirect(new URL(event.request.url).searchParams.get('redirectTo')));
	}
};
