import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

/** Options for a JSON-lines child-process worker. */
export interface ProcessWorkerOptions {
	/** Node script used as the worker entry point. */
	script: string
	/** Arguments passed after the worker script. */
	args?: string[]
	/** Environment additions for the worker. */
	env?: NodeJS.ProcessEnv
	/** Maximum time to wait for one worker message. */
	timeoutMs?: number
}

/** A child process that accepts JSON commands and returns JSON messages. */
export interface ProcessWorker<Message = unknown> {
	/** Sends one JSON command to the worker. */
	send(command: unknown): void
	/** Waits for the next JSON message from the worker. */
	next(): Promise<Message>
	/** Terminates the worker and waits for its exit. */
	terminate(): Promise<void>
}

/**
 * Starts a JSON-lines child-process worker.
 * @param options - Worker script, environment, and timeout configuration.
 * @returns A command and message interface for the worker.
 */
export function createProcessWorker<Message = unknown>(
	options: ProcessWorkerOptions,
): ProcessWorker<Message> {
	const child = spawn(process.execPath, [options.script, ...(options.args ?? [])], {
		env: { ...process.env, ...options.env },
		stdio: ['pipe', 'pipe', 'pipe'],
	})
	const output = createInterface({ input: child.stdout })
	const messages: Message[] = []
	const waiters: {
		resolve: (message: Message) => void
		reject: (error: Error) => void
	}[] = []
	let failure: Error | undefined
	let errorOutput = ''

	/**
	 * Fails all pending message waiters and records the worker failure.
	 * @param error - Failure that ended communication with the worker.
	 * @returns Nothing.
	 */
	const rejectAll = (error: Error): void => {
		failure = error
		for (const waiter of waiters.splice(0)) waiter.reject(error)
	}

	output.on('line', (line) => {
		try {
			const message = JSON.parse(line) as Message
			const waiter = waiters.shift()
			if (waiter) waiter.resolve(message)
			else messages.push(message)
		} catch (error) {
			rejectAll(error instanceof Error ? error : new Error('Invalid worker message'))
		}
	})
	child.on('error', (error) => rejectAll(error))
	child.stderr.on('data', (chunk: Buffer | string) => {
		errorOutput += chunk.toString()
	})
	child.on('close', (code, signal) => {
		if (code !== 0 || signal !== null) {
			rejectAll(
				new Error(
					`Worker exited with ${signal ?? `code ${code}`}${errorOutput ? `: ${errorOutput.trim()}` : ''}`,
				),
			)
		} else if (waiters.length > 0) {
			rejectAll(new Error('Worker exited before sending the expected message'))
		}
		output.close()
	})

	return {
		/**
		 * Sends one JSON command to the worker process.
		 * @param command - JSON-serializable command payload.
		 * @returns Nothing.
		 */
		send(command) {
			if (failure) throw failure
			child.stdin.write(`${JSON.stringify(command)}\n`)
		},
		/**
		 * Waits for the next JSON message or rejects when the worker fails.
		 * @returns The next worker message.
		 */
		next() {
			if (messages.length > 0) return Promise.resolve(messages.shift() as Message)
			if (failure) return Promise.reject(failure)
			return new Promise<Message>((resolve, reject) => {
				let waiterEntry: {
					resolve: (message: Message) => void
					reject: (error: Error) => void
				}
				const timeout = setTimeout(() => {
					const index = waiters.indexOf(waiterEntry)
					if (index >= 0) waiters.splice(index, 1)
					reject(
						new Error(`Worker message timeout after ${options.timeoutMs ?? 10_000}ms`),
					)
				}, options.timeoutMs ?? 10_000)
				waiterEntry = {
					/**
					 * Resolves this waiter and clears its timeout.
					 * @param message - Worker message.
					 * @returns Nothing.
					 */
					resolve: (message) => {
						clearTimeout(timeout)
						resolve(message)
					},
					/**
					 * Rejects this waiter and clears its timeout.
					 * @param error - Worker failure.
					 * @returns Nothing.
					 */
					reject: (error) => {
						clearTimeout(timeout)
						reject(error)
					},
				}
				waiters.push(waiterEntry)
			})
		},
		/**
		 * Terminates the worker process and waits for its close event.
		 * @returns A promise that resolves after the worker exits.
		 */
		terminate() {
			if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
			return new Promise<void>((resolve) => {
				child.once('close', () => resolve())
				child.kill('SIGTERM')
			})
		},
	}
}
