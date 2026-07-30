import type { NavItem } from '$lib/nav';

/** Contributed to the nav registry, so no variant has to own the layout. */
export const notesNav: NavItem = {
	label: 'Notes',
	href: '/notes',
	area: 'app',
	order: 20
};
