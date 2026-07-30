import type { NavItem } from '$lib/nav';

/**
 * Contributed to the nav registry, so no variant has to own the layout.
 *
 * The static profile selects no feature variants at all, so this is the only
 * contribution its nav ever gets — which is the point: the shell trims itself to
 * whatever the profile actually has.
 */
export const contactNav: NavItem = {
	label: 'Contact',
	href: '/contact',
	area: 'site',
	order: 10
};
