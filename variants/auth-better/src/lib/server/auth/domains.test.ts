import { describe, expect, it } from 'vitest';
import { matchesDomain, parseDomains } from './domains';

describe('parseDomains', () => {
	it('splits, trims, lowercases and tolerates a leading @', () => {
		expect(parseDomains(' Niftic.Agency , @example.com ')).toEqual([
			'niftic.agency',
			'example.com'
		]);
	});

	it('treats unset and empty as an empty list', () => {
		expect(parseDomains(undefined)).toEqual([]);
		expect(parseDomains('')).toEqual([]);
		expect(parseDomains(' , , ')).toEqual([]);
	});
});

describe('matchesDomain', () => {
	const allowed = ['niftic.agency', 'example.com'];

	it('accepts an exact domain match, case-insensitively', () => {
		expect(matchesDomain('chris@niftic.agency', allowed)).toBe(true);
		expect(matchesDomain('Chris@Niftic.Agency', allowed)).toBe(true);
	});

	it('fails closed when the allowlist is empty', () => {
		// A missing AUTH_ALLOWED_DOMAINS must not read as "allow everyone".
		expect(matchesDomain('chris@niftic.agency', [])).toBe(false);
	});

	it('rejects a lookalike domain that merely ends with an allowed one', () => {
		// The reason this is an exact match and not endsWith().
		expect(matchesDomain('attacker@evil-niftic.agency', allowed)).toBe(false);
		expect(matchesDomain('attacker@notniftic.agency', allowed)).toBe(false);
	});

	it('rejects an allowed domain used as a subdomain or prefix', () => {
		expect(matchesDomain('attacker@niftic.agency.evil.com', allowed)).toBe(false);
		expect(matchesDomain('attacker@mail.niftic.agency', allowed)).toBe(false);
	});

	it('uses the part after the LAST @', () => {
		expect(matchesDomain('weird@name@niftic.agency', allowed)).toBe(true);
		expect(matchesDomain('chris@niftic.agency@evil.com', allowed)).toBe(false);
	});

	it('rejects malformed and empty input', () => {
		expect(matchesDomain(null, allowed)).toBe(false);
		expect(matchesDomain(undefined, allowed)).toBe(false);
		expect(matchesDomain('', allowed)).toBe(false);
		expect(matchesDomain('no-at-sign', allowed)).toBe(false);
		expect(matchesDomain('trailing@', allowed)).toBe(false);
	});
});
