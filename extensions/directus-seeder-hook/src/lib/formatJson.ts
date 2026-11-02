type OxfmtFormat = (typeof import('oxfmt'))['format']

/** Formats serialized seed JSON for its destination filename. */
export type JsonFormatter = (fileName: string, jsonString: string) => Promise<string>

const FORMAT_OPTIONS: Parameters<OxfmtFormat>[2] = {
	semi: false,
	singleQuote: true,
	printWidth: 100,
	tabWidth: 4,
	useTabs: true,
}

/**
 * Formats one seed file and reports the failed filename.
 * @param format - Loaded Oxfmt formatter.
 * @param fileName - Destination filename.
 * @param jsonString - Serialized seed data.
 * @returns Formatted JSON.
 */
const formatJson = async (
	format: OxfmtFormat,
	fileName: string,
	jsonString: string,
): Promise<string> => {
	try {
		const result = await format(fileName, jsonString, FORMAT_OPTIONS)
		return result.code
	} catch (cause) {
		throw new Error(`Failed to format extracted seed file "${fileName}" with Oxfmt`, {
			cause,
		})
	}
}

/**
 * Loads Oxfmt and exercises its native binding before extraction can modify seed files.
 * @returns A ready-to-use JSON formatter.
 */
export const createJsonFormatter = async (): Promise<JsonFormatter> => {
	try {
		const { format } = await import('oxfmt')

		// Oxfmt loads its platform-specific native binding on the first format call.
		await formatJson(format, 'directus-seeder-preflight.json', '[]')

		return async (fileName, jsonString) => formatJson(format, fileName, jsonString)
	} catch (cause) {
		throw new Error(
			'Seed extraction requires Oxfmt, but the formatter is unavailable in this runtime',
			{ cause },
		)
	}
}
