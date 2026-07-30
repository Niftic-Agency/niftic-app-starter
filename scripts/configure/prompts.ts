import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { styleText } from 'node:util';

/**
 * Interaction is deliberately tiny. `--yes` is the primary path — the skill and
 * the bootstrap workflow both use it — so the interactive path stays a thin
 * courtesy layer with no TTY complexity to drag into CI.
 *
 * `styleText` respects NO_COLOR and non-TTY output on its own, which is why
 * there's no colour library here.
 */

export const c = {
	bold: (s: string) => styleText('bold', s),
	dim: (s: string) => styleText('dim', s),
	red: (s: string) => styleText('red', s),
	green: (s: string) => styleText('green', s),
	yellow: (s: string) => styleText('yellow', s),
	cyan: (s: string) => styleText('cyan', s)
};

export async function confirm(question: string): Promise<boolean> {
	if (!stdin.isTTY) {
		throw new Error('configure needs a TTY to prompt. Re-run with --yes to skip confirmation.');
	}

	const rl = createInterface({ input: stdin, output: stdout });
	try {
		const answer = (await rl.question(`${question} ${c.dim('[y/N]')} `)).trim().toLowerCase();
		return answer === 'y' || answer === 'yes';
	} finally {
		rl.close();
	}
}
