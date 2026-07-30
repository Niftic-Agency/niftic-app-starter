import type { NavItem } from '$lib/nav';

/** `role` hides the link for non-admins. The route guard is what enforces it. */
export const adminNav: NavItem = {
	label: 'Admin',
	href: '/admin',
	area: 'app',
	order: 90,
	role: 'admin'
};
