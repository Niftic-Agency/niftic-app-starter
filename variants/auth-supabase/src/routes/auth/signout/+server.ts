import { redirect } from '@sveltejs/kit';
import { supabase } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * POST only. A GET sign-out can be triggered by any image tag on any page, and
 * being signed out by a link you never clicked is a bad afternoon.
 */
export const POST: RequestHandler = async (event) => {
	await supabase(event).auth.signOut();
	redirect(303, '/login');
};
