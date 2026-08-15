const formatEnabled = process.env.DISABLE_PRE_COMMIT_FORMAT !== 'true'
const lintEnabled = process.env.DISABLE_PRE_COMMIT_LINT !== 'true'

/**
 * Quotes a staged path for use as a shell argument.
 * @param file - Staged file path.
 * @returns A shell-safe single-quoted path.
 */
const quotePath = (file) => `'${file.replaceAll("'", "'\\''")}'`

/**
 * Builds a lint-staged command with explicit file arguments.
 * @param command - Command to run.
 * @param files - Staged files matched by the glob.
 * @returns The complete command.
 */
const task = (command, files) => `${command} ${files.map(quotePath).join(' ')}`

export default {
	'.github/workflows/*.{yml,yaml}': (files) => [
		task('github-actionlint -config-file .github/actionlint.yaml', files),
	],
	'*.md': ['node scripts/validate-docs.mjs'],
	'*.{json,jsonc,md,mdc,yaml,yml}': (files) =>
		formatEnabled ? [task('oxfmt --no-error-on-unmatched-pattern --write', files)] : [],
	'*.{js,cjs,mjs,ts,cts,mts,jsx,tsx,vue}': (files) => {
		const tasks = []

		if (formatEnabled) tasks.push(task('oxfmt --no-error-on-unmatched-pattern --write', files))
		if (lintEnabled) tasks.push(task('oxlint --no-error-on-unmatched-pattern --fix', files))

		return tasks
	},
}
