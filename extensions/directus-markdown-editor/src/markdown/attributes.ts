/**
 * Editor callback.
 * @param source Parameter value.
 * @returns Callback result.
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
 * Editor callback.
 * @param attributes Parameter value.
 * @returns Callback result.
 */
export function serializeMdcAttributes(attributes: Record<string, unknown> | undefined): string {
	if (!attributes) return ''
	const entries = Object.entries(attributes).filter(
		/**
		 * Editor callback.
		 * @param entry Parameter value.
		 * @returns Callback result.
		 */
		(entry) => {
			const [, value] = entry
			return value !== undefined && value !== null
		},
	)
	if (!entries.length) return ''
	return `{${entries
		.map(
			/**
			 * Editor callback.
			 * @param entry Parameter value.
			 * @returns Callback result.
			 */
			(entry) => {
				const [key, value] = entry
				return `${key}="${String(value).replaceAll('"', '\\"')}"`
			},
		)
		.join(' ')}}`
}
