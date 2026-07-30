import type { NavItem } from '$lib/nav';

/** Contributed to the nav registry, so no variant has to own the layout. */
export const authNav: NavItem = {
	label: 'Dashboard',
	href: '/app',
	area: 'app',
	order: 10
};
