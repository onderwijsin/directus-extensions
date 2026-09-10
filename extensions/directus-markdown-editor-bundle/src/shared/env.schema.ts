import { z } from 'zod'

/** Environment configuration shared by every Markdown Editor API entrypoint. */
export const markdownEditorEnvSchema = z.object({
	MARKDOWN_EDITOR_ENABLED: z.boolean().default(true),
})
