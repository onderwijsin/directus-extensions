/**
 * Generates a Slack Block Kit payload for GitHub package releases.
 *
 * This action intentionally uses only Node.js built-ins so it can run directly from the
 * repository without a compiled bundle or installed action dependencies.
 */

import fs from 'node:fs'

/**
 * Reads a GitHub Actions input from the environment.
 *
 * @param {string} name - Input name in kebab-case.
 * @param {boolean} required - Whether an empty value should throw.
 * @returns {string} The input value.
 */
function getInput(name, required = false) {
	const normalizedName = `INPUT_${name.replaceAll('-', '_').toUpperCase()}`
	const githubName = `INPUT_${name.toUpperCase()}`
	const value =
		[process.env[normalizedName], process.env[githubName]]
			.map((input) => input?.trim())
			.find(Boolean) ?? ''
	if (required && !value) throw new Error(`Input "${name}" is required.`)
	return value
}

/**
 * Reports an informational message.
 *
 * @param {string} message - Message to report.
 * @returns {void}
 */
function info(message) {
	console.log(message)
}

/**
 * Reports an error through the GitHub Actions command protocol.
 *
 * @param {string} message - Message to report.
 * @returns {void}
 */
function reportError(message) {
	console.log(`::error::${message}`)
}

/**
 * Parses JSON, CSV, or newline-separated release input.
 *
 * @param {string} input - Raw release input.
 * @returns {unknown[]} Parsed release entries.
 */
function parseReleaseEntries(input) {
	try {
		const parsed = JSON.parse(input)
		if (Array.isArray(parsed)) return parsed
	} catch {
		// Legacy CSV and newline input is handled below.
	}

	return input
		.split(/[\n,]/u)
		.map((entry) => entry.trim())
		.filter(Boolean)
}

/**
 * Normalizes one release entry to a display tag and release URL.
 *
 * @param {unknown} entry - Release entry from the action input.
 * @param {string} repoUrl - GitHub repository URL.
 * @returns {{tag: string, githubURL: string} | null} Normalized release.
 */
function normalizeRelease(entry, repoUrl) {
	if (typeof entry === 'string' && entry.trim()) {
		const tag = entry.trim()
		return { tag, githubURL: `${repoUrl}/releases/tag/${encodeURIComponent(tag)}` }
	}

	if (!entry || typeof entry !== 'object') return null
	const release =
		/** @type {{tag?: unknown, githubURL?: unknown, name?: unknown, version?: unknown}} */ (
			entry
		)

	if (typeof release.tag === 'string' && release.tag.trim()) {
		const tag = release.tag.trim()
		const githubURL =
			typeof release.githubURL === 'string' && release.githubURL.trim()
				? release.githubURL
				: `${repoUrl}/releases/tag/${encodeURIComponent(tag)}`
		return { tag, githubURL }
	}

	// Changesets' publishedPackages output uses { name, version }.
	if (
		typeof release.name === 'string' &&
		release.name.trim() &&
		typeof release.version === 'string' &&
		release.version.trim()
	) {
		const tag = `${release.name.trim()}@${release.version.trim()}`
		return { tag, githubURL: `${repoUrl}/releases/tag/${encodeURIComponent(tag)}` }
	}

	return null
}

/**
 * Builds a Slack markdown link for a release.
 *
 * @param {{tag: string, githubURL: string}} release - Normalized release.
 * @param {string} repository - Repository in owner/name format.
 * @param {boolean} prefixRepo - Whether to prefix unscoped tags.
 * @returns {string} Slack markdown link.
 */
function formatReleaseLink(release, repository, prefixRepo) {
	const displayTag =
		prefixRepo && !release.tag.startsWith('@') ? `@${repository}/${release.tag}` : release.tag
	return `<${release.githubURL}|${displayTag}>`
}

/**
 * Builds the Slack Block Kit payload.
 *
 * @param {{tag: string, githubURL: string}[]} releases - Normalized releases.
 * @param {string} channelId - Slack channel ID.
 * @param {string} actor - GitHub actor.
 * @param {string} repository - Repository in owner/name format.
 * @param {string} runUrl - Workflow run URL.
 * @param {boolean} prefixRepo - Whether to prefix unscoped tags.
 * @returns {{channel: string, text: string, blocks: object[]}} Slack payload.
 */
function buildPayload(releases, channelId, actor, repository, runUrl, prefixRepo) {
	const packageLines = releases
		.map((release) => formatReleaseLink(release, repository, prefixRepo))
		.join('\n')
	return {
		channel: channelId,
		text: 'New release created',
		blocks: [
			{ type: 'header', text: { type: 'plain_text', text: '🚀 New release created' } },
			{ type: 'section', text: { type: 'mrkdwn', text: `*Packages:*\n${packageLines}` } },
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: `*Released by:*\n<https://github.com/${actor}|${actor}>`,
				},
			},
			{
				type: 'context',
				elements: [{ type: 'mrkdwn', text: `🔗 <${runUrl}|View workflow run>` }],
			},
		],
	}
}

/**
 * Runs the action.
 *
 * @returns {void}
 */
function main() {
	try {
		const releasesInput = getInput('releases', true)
		const channelId =
			getInput('channel-id') ||
			process.env.SLACK_CHANNEL_ID?.trim() ||
			getInput('channel-id', true)
		const payloadFilePath = getInput('payload-file-path', true)
		const repository = process.env.GITHUB_REPOSITORY
		const actor = process.env.GITHUB_ACTOR
		const runId = process.env.GITHUB_RUN_ID
		const serverUrl = process.env.GITHUB_SERVER_URL
		if (!repository || !actor || !runId || !serverUrl)
			throw new Error('Missing one or more required GitHub environment variables.')

		const entries = parseReleaseEntries(releasesInput)
		const normalized = entries
			.map((entry) => normalizeRelease(entry, `https://github.com/${repository}`))
			.filter(Boolean)
		const prefixRepo = ['true', '1', 'yes'].includes(getInput('prefix-repo').toLowerCase())
		if (normalized.length === 0) {
			info('No releases detected. Skipping Slack notification.')
			return
		}

		const runUrl = `${serverUrl}/${repository}/actions/runs/${runId}`
		fs.writeFileSync(
			payloadFilePath,
			`${JSON.stringify(buildPayload(normalized, channelId, actor, repository, runUrl, prefixRepo), null, 2)}\n`,
		)
		info(`Slack payload written to ${payloadFilePath}`)
		info(`Included ${normalized.length} release(s).`)
	} catch (cause) {
		reportError(
			`Failed to generate Slack payload: ${cause instanceof Error ? cause.message : 'Unknown error'}`,
		)
		process.exitCode = 1
	}
}

main()
