/**
 * Orders strings by UTF-16 code unit: the order of a bare `sort()`, stated. Not
 * `localeCompare`, whose order follows the host's ICU locale: a canonical form (a
 * schema hash, a sorted error list) must come out the same on every host.
 */
export function compareCodeUnits(a: string, b: string): number {
	if (a < b) return -1;
	return a > b ? 1 : 0;
}
