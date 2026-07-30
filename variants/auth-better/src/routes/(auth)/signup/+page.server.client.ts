import { APIError } from 'better-auth/api';
import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import { logger } from '$lib/server/logger';
import type { Actions, PageServerLoad } from './$types';

const signupSchema = z.object({
	name: z.string().trim().min(1, 'Enter your name').max(80),
	email: z.email('Enter a valid email address'),
	// Length beats composition rules; 12 matches the server-side minimum.
	password: z.string().min(12, 'Use at least 12 characters')
});

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(303, '/app');
	return { form: await superValidate(zod4(signupSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(signupSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth().api.signUpEmail({
				body: {
					name: form.data.name,
					email: form.data.email.trim().toLowerCase(),
					password: form.data.password
				},
				headers: event.request.headers
			});
		} catch (error) {
			if (error instanceof APIError) {
				logger.info('auth.signup_rejected', {
					requestId: event.locals.requestId,
					status: error.status
				});
				// Same response whether or not the address is already registered —
				// otherwise this form tells an attacker who has an account here.
				return message(form, 'Check your email to confirm your address.');
			}
			throw error;
		}

		// Verification is required, so there is no session yet. Say so rather than
		// bouncing to a sign-in page that would just reject them.
		return message(form, 'Check your email to confirm your address.');
	}
};
