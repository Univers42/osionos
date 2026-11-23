/**
 * The closed list of tools auto mode may apply without a human (AM17). A new
 * write tool is absent until someone adds it here on purpose.
 */
export const AUTO_ELIGIBLE = ['add_blocks', 'rename_page', 'create_page'] as const;

/** Capabilities no grant, mode or list may ever cover (G6); matched as name stems. */
export const NEVER_GRANTABLE = [
	'share',
	'permissions',
	'delete_forever',
	'account',
	'billing',
	'tokens',
	'membership',
] as const;

export function isAutoEligible(tool: string): boolean {
	return (AUTO_ELIGIBLE as readonly string[]).includes(tool);
}
