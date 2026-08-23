import { describe, expect, it } from 'vitest'

import {
	generateEnvironmentSecrets,
	handleInterrupt,
	isVerbose,
	responseIsReady,
	runCommand,
	shouldStagePlayground,
	cleanupComposeArguments,
	cleanupThenDiagnostics,
} from './e2e.mjs'

describe('E2E runner helpers', () => {
	it('recognizes successful readiness responses', () => {
		expect(responseIsReady(new Response(null, { status: 200 }))).toBe(true)
		expect(responseIsReady(new Response(null, { status: 503 }))).toBe(false)
	})

	it('generates distinct secrets and disables Sentry', () => {
		const secrets = generateEnvironmentSecrets()

		expect(secrets.SENTRY_ENABLED).toBe('false')
		expect(secrets.DEFAULT_PASSWORD).toMatch(/^[a-f0-9]{64}$/u)
		expect(secrets.DIRECTUS_SECRET).toMatch(/^[a-f0-9]{64}$/u)
		expect(secrets.DEFAULT_PASSWORD).not.toBe(secrets.DIRECTUS_SECRET)
	})

	it('does not stage source when a packed playground build is available', () => {
		expect(shouldStagePlayground(true)).toBe(false)
		expect(shouldStagePlayground(false)).toBe(true)
	})

	it('only enables Compose diagnostics when --verbose is passed', () => {
		expect(isVerbose([])).toBe(false)
		expect(isVerbose(['--verbose'])).toBe(true)
		expect(isVerbose(['--runInBand'])).toBe(false)
	})

	it('escalates a timed-out child and settles when SIGTERM is ignored', async () => {
		const started = Date.now()
		await expect(
			runCommand(
				'node',
				['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
				{ streamOutput: false, timeoutMs: 20, killGraceMs: 20, forceKillSettleMs: 20 },
			),
		).rejects.toThrow(/timed out/u)
		expect(Date.now() - started).toBeLessThan(1_000)
	})

	it('interrupts an active child and settles the command promise', async () => {
		const command = runCommand('node', ['-e', 'setInterval(() => {}, 1000)'], {
			streamOutput: false,
			killGraceMs: 20,
			forceKillSettleMs: 20,
		})
		await new Promise((resolve) => setTimeout(resolve, 20))
		handleInterrupt('SIGINT', false)
		await expect(command).rejects.toThrow(/exited|timed out/u)
	})

	it('keeps cleanup project-scoped', () => {
		expect(cleanupComposeArguments()).toEqual(['down', '--volumes', '--remove-orphans'])
		expect(cleanupComposeArguments()).not.toContain('system')
		expect(cleanupComposeArguments()).not.toContain('prune')
	})

	it('does not request broad Docker deletion', () => {
		const cleanup = cleanupComposeArguments().join(' ')
		expect(cleanup).not.toMatch(/prune/u)
		expect(cleanup).not.toMatch(/docker\s+rm/u)
	})

	it('runs cleanup before diagnostics even when diagnostics fail', async () => {
		const events: string[] = []
		const result = await cleanupThenDiagnostics({
			cleanupTask: () => {
				events.push('cleanup')
				return Promise.resolve()
			},
			diagnosticsTask: () => {
				events.push('diagnostics')
				return Promise.reject(new Error('diagnostics failed'))
			},
			collectDiagnostics: true,
		})
		expect(events).toEqual(['cleanup', 'diagnostics'])
		expect(result.cleanupError).toBeUndefined()
		expect(result.diagnosticsError).toEqual(new Error('diagnostics failed'))
	})

	it('preserves cleanup failures separately from the original lifecycle failure', async () => {
		const result = await cleanupThenDiagnostics({
			cleanupTask: () => {
				return Promise.reject(new Error('cleanup failed'))
			},
			collectDiagnostics: false,
		})
		expect(result.cleanupError).toEqual(new Error('cleanup failed'))
		expect(result.diagnosticsError).toBeUndefined()
	})
})
