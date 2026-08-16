import { describe, expect, it } from 'vitest'

import { isCiEnvironment, isInteractive, shouldSkipConfirmation } from '../src/index.js'

describe('environment utilities', () => {
	it('evaluates interactivity from explicit terminal state', () => {
		expect(isInteractive({ stdinIsTTY: true, stdoutIsTTY: true })).toBe(true)
		expect(isInteractive({ stdinIsTTY: true, stdoutIsTTY: false })).toBe(false)
		expect(isInteractive({ stdinIsTTY: false, stdoutIsTTY: true })).toBe(false)
		expect(isInteractive({ stdinIsTTY: false, stdoutIsTTY: false })).toBe(false)
	})

	it('detects conventional CI markers from supplied environment values', () => {
		expect(isCiEnvironment({ CI: 'true' })).toBe(true)
		expect(isCiEnvironment({ GITHUB_ACTIONS: 'true' })).toBe(true)
		expect(isCiEnvironment({ CI: undefined, GITHUB_ACTIONS: undefined })).toBe(false)
		expect(isCiEnvironment({ CI: '' })).toBe(false)
		expect(isCiEnvironment({ CI: '   ' })).toBe(false)
		expect(isCiEnvironment({ BUILD_NUMBER: '0' })).toBe(true)
	})

	it('skips confirmation when forced, non-interactive, or running in CI', () => {
		expect(shouldSkipConfirmation({ force: true, interactive: true, ci: false })).toBe(true)
		expect(shouldSkipConfirmation({ interactive: false, ci: false })).toBe(true)
		expect(shouldSkipConfirmation({ interactive: true, ci: true })).toBe(true)
		expect(shouldSkipConfirmation({ interactive: true, ci: false })).toBe(false)
	})
})
