import type { NavItem } from '$lib/nav';

/** Only rendered for admins — the layout filters on `role`. */
export const adminNav: NavItem = {
	label: 'Admin',
	href: '/admin',
	area: 'app',
	order: 90,
	role: 'admin'
};
