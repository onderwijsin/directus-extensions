/**
 * Parse the conservative `key="value"` attribute form used by MDC.
 * @param source MDC attribute source.
 * @returns Parsed scalar attributes.
 */
export function parseMdcAttributes(source: string | undefined): Record<string, string | boolean> {
	if (!source?.trim()) return {}
	const attributes: Record<string, string | boolean> = {}
	const pattern = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/gu
	for (const match of source.matchAll(pattern)) {
		const key = match[1]
		if (key) attributes[key] = match[2] ?? match[3] ?? match[4] ?? true
	}
	return attributes
}

/**
 * Serialize attributes without inventing a second component syntax.
 * @param attributes Attributes to serialize.
 * @returns MDC attribute source.
 */
export function serializeMdcAttributes(attributes: Record<string, unknown> | undefined): string {
	if (!attributes) return ''
	const entries = Object.entries(attributes).filter(
		([, value]) => value !== undefined && value !== null,
	)
	if (!entries.length) return ''
	return `{${entries.map(([key, value]) => `${key}="${String(value).replaceAll('"', '\\"')}"`).join(' ')}}`
}
