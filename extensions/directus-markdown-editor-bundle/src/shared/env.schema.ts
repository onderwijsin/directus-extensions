/**
 * Build environment fields shared by every Markdown Editor API entrypoint.
 * @param z Package-owned Zod runtime supplied by extension-utils.
 * @returns Shared Markdown Editor environment fields.
 */
export function defineMarkdownEditorOptions(z: typeof import('zod').z) {
	return {
		MARKDOWN_EDITOR_ENABLED: z.boolean().default(true),
	}
}
