import type { NavItem } from '$lib/nav';

/** Contributed to the nav registry, so no variant has to own the layout. */
export const orgsNav: NavItem = {
	label: 'Organizations',
	href: '/organizations',
	area: 'app',
	order: 40
};
