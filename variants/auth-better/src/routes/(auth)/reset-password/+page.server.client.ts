import { APIError } from 'better-auth/api';
import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

const schema = z.object({
	token: z.string().min(1),
	password: z.string().min(12, 'Use at least 12 characters')
});

export const load: PageServerLoad = async (event) => {
	// Better Auth appends the token to the redirect target.
	const token = event.url.searchParams.get('token') ?? '';
	const form = await superValidate(zod4(schema));
	form.data.token = token;
	return { form, hasToken: token.length > 0 };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(schema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth().api.resetPassword({
				body: { newPassword: form.data.password, token: form.data.token },
				headers: event.request.headers
			});
		} catch (error) {
			if (error instanceof APIError) {
				// message(), not setError(form, ''), because the page renders $message.
				return message(form, 'That reset link is invalid or has expired. Request a new one.', {
					status: 400
				});
			}
			throw error;
		}

		redirect(303, '/login');
	}
};
