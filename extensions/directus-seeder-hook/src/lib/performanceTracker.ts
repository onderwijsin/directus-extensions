import type { ServiceAdapterContext } from '../services/ServiceAdapter'

import { performance } from 'node:perf_hooks'

/**
 * Performance tracking data
 */
export interface PerformanceData {
	/**
	 * Operation name
	 */
	operation: string

	/**
	 * Start time in milliseconds
	 */
	startTime: number

	/**
	 * End time in milliseconds
	 */
	endTime?: number

	/**
	 * Duration in milliseconds
	 */
	duration?: number

	/**
	 * Child operations
	 */
	children: PerformanceData[]
}

/**
 * Performance tracker state
 */
interface PerformanceTrackerState {
	/**
	 * All operations
	 */
	operations: PerformanceData[]

	/**
	 * Current operation
	 */
	currentOperation: PerformanceData | null

	/**
	 * Operation stack
	 */
	operationStack: PerformanceData[]
}

/**
 * Performance tracker for measuring operation durations
 */
export interface PerformanceTracker {
	/**
	 * Start tracking an operation.
	 *
	 * @param operation Operation name
	 * @returns The current operation
	 */
	startOperation: (operation: string) => PerformanceData

	/**
	 * End the current operation.
	 *
	 * @returns The completed operation
	 */
	endOperation: () => PerformanceData

	/**
	 * Get all completed operations.
	 *
	 * @returns All operations
	 */
	getOperations: () => PerformanceData[]

	/**
	 * Get the current operation.
	 *
	 * @returns The current operation
	 */
	getCurrentOperation: () => PerformanceData | null

	/**
	 * Track an operation and return its result.
	 *
	 * @param operation Operation name
	 * @param fn Function to track
	 * @returns Result of the function
	 */
	track: <T>(operation: string, fn: () => Promise<T>) => Promise<T>

	/**
	 * Track an operation synchronously and return its result.
	 *
	 * @param operation Operation name
	 * @param fn Function to track
	 * @returns Result of the function
	 */
	trackSync: <T>(operation: string, fn: () => T) => T

	/**
	 * Format the performance data as a string.
	 *
	 * @param indent Indentation level
	 * @returns Formatted performance data
	 */
	formatPerformanceData: (indent?: number) => string

	/**
	 * Formats and outputs performance-related data using the provided logging service.
	 *
	 * @param {ServiceAdapterContext['logger']} logger - The logging service instance used to log
	 * the formatted performance data.
	 * @returns {void} This method does not return any value.
	 */
	outputFormatPerformanceData: (logger: ServiceAdapterContext['logger']) => void
}

/**
 * Format an operation as a string.
 *
 * @param operation Operation to format
 * @param indent Indentation level
 * @returns Formatted operation
 */
function formatOperation(operation: PerformanceData, indent = 0): string {
	const indentation = indent > 0 ? '  '.repeat(indent) : ''
	const duration =
		operation.duration !== undefined ? `${operation.duration.toFixed(2)} ms` : 'in progress'
	const line = `${indentation}${operation.operation}: ${duration}`

	const childLines = operation.children.map((child) => formatOperation(child, indent + 1))

	return [line, ...childLines].join('\n')
}

/**
 * Create a new performance tracker.
 *
 * @returns Performance tracker
 */
export function createPerformanceTracker(): PerformanceTracker {
	const state: PerformanceTrackerState = {
		operations: [],
		currentOperation: null,
		operationStack: [],
	}

	return {
		/**
		 * Start tracking an operation.
		 *
		 * @param operation Operation name
		 * @returns The current operation
		 */
		startOperation(operation: string): PerformanceData {
			const startTime = performance.now()
			const newOperation: PerformanceData = {
				operation,
				startTime,
				children: [],
			}

			if (state.currentOperation) {
				state.operationStack.push(state.currentOperation)
				state.currentOperation.children.push(newOperation)
			} else {
				state.operations.push(newOperation)
			}

			state.currentOperation = newOperation
			return newOperation
		},

		/**
		 * End the current operation.
		 *
		 * @returns The completed operation
		 */
		endOperation(): PerformanceData {
			if (!state.currentOperation) {
				throw new Error('No operation to end')
			}

			const endTime = performance.now()
			state.currentOperation.endTime = endTime
			state.currentOperation.duration = endTime - state.currentOperation.startTime

			const completedOperation = state.currentOperation

			state.currentOperation =
				state.operationStack.length > 0 ? (state.operationStack.pop() ?? null) : null

			return completedOperation
		},

		/**
		 * Get all completed operations.
		 *
		 * @returns All operations
		 */
		getOperations(): PerformanceData[] {
			return state.operations
		},

		/**
		 * Get the current operation.
		 *
		 * @returns The current operation
		 */
		getCurrentOperation(): PerformanceData | null {
			return state.currentOperation
		},

		/**
		 * Track an operation and return its result.
		 *
		 * @param operation Operation name
		 * @param fn Function to track
		 * @returns Result of the function
		 */
		async track<T>(operation: string, fn: () => Promise<T>): Promise<T> {
			this.startOperation(operation)

			try {
				return await fn()
			} finally {
				this.endOperation()
			}
		},

		/**
		 * Track an operation synchronously and return its result.
		 *
		 * @param operation Operation name
		 * @param fn Function to track
		 * @returns Result of the function
		 */
		trackSync<T>(operation: string, fn: () => T): T {
			this.startOperation(operation)

			try {
				return fn()
			} finally {
				this.endOperation()
			}
		},

		/**
		 * Format the performance data as a string.
		 *
		 * @param indent Indentation level
		 * @returns Formatted performance data
		 */
		formatPerformanceData(indent = 0) {
			const lines: string[] = []

			for (const operation of state.operations) {
				lines.push(formatOperation(operation, indent))
			}

			return lines.join('\n')
		},

		/**
		 * Formats and outputs performance-related data using the provided logging service.
		 *
		 * @param {ServiceAdapterContext['logger']} logger - The logging service instance used to
		 * log the formatted performance data.
		 * @returns {void} This method does not return any value.
		 */
		outputFormatPerformanceData(logger: ServiceAdapterContext['logger']) {
			if (!logger) return
			logger.info('🚀 Performance data 🚀')
			const performanceData = this.formatPerformanceData().split('\n')

			for (const [index, performanceLine] of performanceData.entries()) {
				if (index === 0) {
					logger.info(performanceLine)
				} else {
					logger.debug(performanceLine)
				}
			}
		},
	}
}
