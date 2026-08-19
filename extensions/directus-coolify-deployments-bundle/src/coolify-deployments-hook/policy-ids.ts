/** A bundled policy identifier and its resolved configuration value. */
export interface CoolifyPolicyIdOverride {
	default: string
	resolved: string
}

/**
 * Resolves a policy identifier by its bundled default identifier.
 * @param defaultPolicyId - The identifier declared by the bundled policy data.
 * @param overrides - Configured policy identifier overrides.
 * @returns The configured identifier or the bundled default identifier.
 */
export function resolveCoolifyPolicyId(
	defaultPolicyId: string,
	overrides: readonly CoolifyPolicyIdOverride[],
): string {
	return (
		overrides.find(({ default: bundledDefault }) => bundledDefault === defaultPolicyId)
			?.resolved ?? defaultPolicyId
	)
}
