import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFileLockProvider } from '../src/server/lock.js'

describe('createFileLockProvider', () => {
	let directory: string

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), 'extension-utils-lock-'))
	})

	afterEach(async () => {
		await rm(directory, { force: true, recursive: true })
	})

	it('coordinates contenders and reclaims released markers', async () => {
		const first = createFileLockProvider({ directory, tokenFactory: () => 'first' })
		const second = createFileLockProvider({ directory, tokenFactory: () => 'second' })

		const lease = await first.tryAcquire('shared/item', { leaseMs: 1000 })
		expect(lease?.token).toBe('first')
		expect(await second.tryAcquire('shared/item')).toBeNull()
		expect(await lease?.release()).toBe(true)
		expect(await lease?.release()).toBe(false)

		const replacement = await second.tryAcquire('shared/item')
		expect(replacement?.token).toBe('second')
		expect(await replacement?.release()).toBe(true)
	})

	it('renews an active lease and rejects an expired owner', async () => {
		let now = 1000
		const first = createFileLockProvider({
			directory,
			now: () => now,
			tokenFactory: () => 'first',
		})
		const second = createFileLockProvider({
			directory,
			now: () => now,
			tokenFactory: () => 'second',
		})

		const lease = await first.tryAcquire('expiring', { leaseMs: 10 })
		now = 1009
		expect(await lease?.renew()).toBe(true)
		now = 1018
		expect(await second.tryAcquire('expiring', { leaseMs: 10 })).toBeNull()
		now = 1019
		expect(await lease?.renew()).toBe(false)
		expect(await lease?.release()).toBe(false)

		const replacement = await second.tryAcquire('expiring', { leaseMs: 10 })
		expect(replacement?.token).toBe('second')
		expect(await replacement?.renew()).toBe(true)
	})

	it('uses safe namespacing for names containing path separators', async () => {
		const provider = createFileLockProvider({ directory, tokenFactory: () => 'token' })
		const lease = await provider.tryAcquire('a/b?c')

		expect(lease?.name).toBe('a/b?c')
		expect(await lease?.release()).toBe(true)
	})

	it('reclaims an orphaned claim after an owner disappears', async () => {
		await writeFile(join(directory, 'orphan.lock'), 'missing-owner')
		const provider = createFileLockProvider({ directory, tokenFactory: () => 'replacement' })

		const lease = await provider.tryAcquire('orphan')
		expect(lease?.token).toBe('replacement')
		expect(await lease?.release()).toBe(true)
	})

	it('does not release or renew a replaced filesystem generation', async () => {
		const provider = createFileLockProvider({ directory, tokenFactory: () => 'first' })
		const lease = await provider.tryAcquire('replaced')
		await writeFile(join(directory, 'replaced.lock'), 'replacement')

		expect(await lease?.renew()).toBe(false)
		expect(await lease?.release()).toBe(false)
	})

	it('rejects invalid names, leases, and directories', async () => {
		expect(() => createFileLockProvider({ directory: '  ' })).toThrow(
			'Lock directory must not be empty',
		)
		const provider = createFileLockProvider({ directory })
		await expect(provider.tryAcquire('  ')).rejects.toThrow('Lock name must not be empty')
		await expect(provider.tryAcquire('name', { leaseMs: 0 })).rejects.toThrow(
			'Lock leaseMs must be a finite positive number',
		)
		await expect(provider.tryAcquire('name', { leaseMs: Number.NaN })).rejects.toThrow(
			'Lock leaseMs must be a finite positive number',
		)
	})

	it('surfaces malformed owner records instead of stealing an undecidable lock', async () => {
		await mkdir(join(directory, 'broken.' + 'token' + '.owner'))
		await writeFile(join(directory, 'broken.lock'), 'token')
		await writeFile(join(directory, 'broken.token.owner', 'owner.json'), '{broken')

		const provider = createFileLockProvider({ directory })
		await expect(provider.tryAcquire('broken')).rejects.toThrow()
	})

	it('surfaces filesystem failures', async () => {
		const filePath = join(directory, 'not-a-directory')
		await writeFile(filePath, 'file')
		const provider = createFileLockProvider({ directory: filePath })

		await expect(provider.tryAcquire('name')).rejects.toThrow()
	})

	it('surfaces token, clock, and owner-path failures', async () => {
		const tokenFailure = new Error('token unavailable')
		const tokenProvider = createFileLockProvider({
			directory,
			tokenFactory: () => {
				throw tokenFailure
			},
		})
		await expect(tokenProvider.tryAcquire('name')).rejects.toBe(tokenFailure)

		const clockFailure = new Error('clock unavailable')
		const clockProvider = createFileLockProvider({
			directory,
			now: () => {
				throw clockFailure
			},
		})
		await expect(clockProvider.tryAcquire('name')).rejects.toBe(clockFailure)

		await mkdir(join(directory, 'conflict.token.owner'))
		const conflictProvider = createFileLockProvider({
			directory,
			tokenFactory: () => 'token',
		})
		await expect(conflictProvider.tryAcquire('conflict')).rejects.toThrow()
	})
})
