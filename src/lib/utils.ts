import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes so a caller's `class` prop actually wins.
 *
 * Without `twMerge`, `<Button class="px-8" />` loses to the component's own
 * `px-4` depending on stylesheet order. With it, the later class wins as you'd
 * expect. Every primitive takes `class` last for this reason.
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
