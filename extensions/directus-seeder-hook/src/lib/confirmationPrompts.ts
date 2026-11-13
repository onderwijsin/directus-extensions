import type { HookExtensionContext } from '@directus/types'

import process from 'node:process'
import * as readline from 'node:readline'

/**
 * Utility functions for interactive confirmation prompts.
 */

/**
 * Check if the current process is running in a TTY (terminal).
 *
 * @returns True if running in a TTY, false otherwise
 */
export function isTTY(): boolean {
	return process.stdin.isTTY && process.stdout.isTTY
}

/**
 * Check if the process is running in a CI environment.
 *
 * @returns True if running in a CI environment, false otherwise
 */
export function isCI(): boolean {
	return (
		Boolean(process.env.CI) ||
		Boolean(process.env.CONTINUOUS_INTEGRATION) ||
		Boolean(process.env.BUILD_NUMBER) ||
		Boolean(process.env.GITHUB_ACTIONS)
	)
}

/**
 * Create a readline interface for user input.
 *
 * @returns Readline interface
 */
function createInterface(): readline.Interface {
	return readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})
}

/**
 * Ask a yes/no question and wait for user confirmation.
 *
 * @param question The question to ask
 * @param defaultAnswer The default answer if the user just presses Enter
 * @param logger Directus Logger Instance
 * @returns Promise that resolves to true if confirmed, false otherwise
 */
export async function confirmYesNo(
	question: string,
	defaultAnswer = false,
	logger?: HookExtensionContext['logger'],
): Promise<boolean> {
	const rl = createInterface()

	return new Promise((resolve) => {
		const defaultPrompt = defaultAnswer ? '(Y/n)' : '(y/N)'

		rl.question(`${question} ${defaultPrompt}: `, (answer) => {
			rl.close()

			if (answer.trim() === '') {
				return resolve(defaultAnswer)
			}

			const normalizedAnswer = answer.toLowerCase().trim()
			return resolve(normalizedAnswer === 'y' || normalizedAnswer === 'yes')
		})

		// Handle Ctrl+C gracefully
		rl.once('SIGINT', () => {
			process.stdout.write('\n')

			if (logger) {
				logger.info('Operation cancelled by user')
			} else {
				process.stdout.write('Operation cancelled by user\n')
			}

			rl.close()
			process.exit(0)
		})
	})
}

/**
 * Ask for explicit confirmation by typing a specific word.
 *
 * @param question The question to ask
 * @param confirmationWord The word that must be typed to confirm
 * @param logger Directus Logger Instance
 * @returns Promise that resolves to true if confirmed, false otherwise
 */
export async function confirmExplicit(
	question: string,
	confirmationWord: string,
	logger?: HookExtensionContext['logger'],
): Promise<boolean> {
	const rl = createInterface()

	return new Promise((resolve) => {
		rl.question(`${question} `, (answer) => {
			rl.close()
			return resolve(answer.trim() === confirmationWord)
		})

		// Handle Ctrl+C gracefully
		rl.once('SIGINT', () => {
			process.stdout.write('\n')

			if (logger) {
				logger.info('Operation cancelled by user')
			} else {
				process.stdout.write('Operation cancelled by user\n')
			}

			rl.close()
			process.exit(0)
		})
	})
}

/**
 * Check if confirmation should be skipped based on force flag and environment.
 *
 * @param force Whether the force flag was provided
 * @returns True if confirmation should be skipped, false otherwise
 */
export function shouldSkipConfirmation(force: boolean): boolean {
	return force || isCI() || !isTTY()
}
