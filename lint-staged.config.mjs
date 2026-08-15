const formatEnabled = process.env.DISABLE_PRE_COMMIT_FORMAT !== 'true'
const lintEnabled = process.env.DISABLE_PRE_COMMIT_LINT !== 'true'

/**
 * Quotes a staged path for use as a shell argument.
 * @param {string} file - Staged file path.
 * @returns {string} A shell-safe single-quoted path.
 */
const quotePath = (file) => `'${file.replaceAll("'", "'\\''")}'`

/**
 * Builds a lint-staged command with explicit file arguments.
 * @param {string} command - Command to run.
 * @param {string[]} files - Staged files matched by the glob.
 * @returns {string} The complete command.
 */
const task = (command, files) => `${command} ${files.map(quotePath).join(' ')}`

/**
 * @param {string[]} files - Staged files.
 * @returns {string[]} Tasks.
 */
const actionlintTasks = (files) => [
	task('github-actionlint -config-file .github/actionlint.yaml', files),
]

/**
 * @param {string[]} files - Staged files.
 * @returns {string[]} Tasks.
 */
const formatTasks = (files) =>
	formatEnabled ? [task('oxfmt --no-error-on-unmatched-pattern --write', files)] : []

/**
 * @param {string[]} files - Staged files.
 * @returns {string[]} Tasks.
 */
const scriptTasks = (files) => {
	const tasks = []

	if (formatEnabled) tasks.push(task('oxfmt --no-error-on-unmatched-pattern --write', files))
	if (lintEnabled) tasks.push(task('oxlint --no-error-on-unmatched-pattern --fix', files))

	return tasks
}

export default {
	'.github/workflows/*.{yml,yaml}': actionlintTasks,
	'*.md': ['node scripts/validate-docs.mjs'],
	'*.{json,jsonc,md,mdc,yaml,yml}': formatTasks,
	'*.{js,cjs,mjs,ts,cts,mts,jsx,tsx,vue}': scriptTasks,
}
