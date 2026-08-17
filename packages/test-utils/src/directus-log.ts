import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const defaultTimeoutMs = 60_000

export interface DirectusLogOptions {
	composeFiles: string[]
	composeProject: string
	pattern: RegExp
	timeoutMs?: number
}

/**
 * Polls the Directus container logs until a pattern appears.
 * @param options - Compose and matching options.
 * @returns The complete log output containing the match.
 */
export async function waitForDirectusLog(options: DirectusLogOptions): Promise<string> {
	const { composeFiles, composeProject, pattern, timeoutMs = defaultTimeoutMs } = options
	const deadline = Date.now() + timeoutMs
	let output = ''

	while (Date.now() < deadline) {
		const result = await execFileAsync(
			'docker',
			[
				'compose',
				...composeFiles.flatMap((file) => ['-f', file]),
				'-p',
				composeProject,
				'logs',
				'--no-color',
				'directus',
			],
			{ timeout: defaultTimeoutMs },
		)
		output = result.stdout
		pattern.lastIndex = 0
		if (pattern.test(output)) return output
		await new Promise((resolve) => setTimeout(resolve, 250))
	}

	throw new Error(`Timed out waiting for Directus log ${pattern}:\n${output}`)
}
