import type { Scope } from '@sentry/node'

import * as Sentry from '@sentry/node'

/**
 * Additional structured tags for Sentry events.
 *
 * Predefined tags for common categorization patterns, with fallback
 * to flexible index signature for custom tags.
 */
interface Tags {
	/**
	 * Extension or feature domain (e.g., 'review', 'openapi', 'algolia', 'seeder')
	 */
	domain: string
	/**
	 * Specific operation within the domain (e.g., 'notification', 'transform', 'sync', 'import')
	 */
	operation: string
	/**
	 * Error severity level based on business impact
	 */
	severity?: 'low' | 'medium' | 'high' | 'critical'
	/**
	 * System component type
	 */
	component: 'hook' | 'operation' | 'interface' | 'module' | 'endpoint'
	/**
	 * Execution context
	 */
	context: 'runtime' | 'build' | 'migration' | 'seeding'
	/**
	 * Allow additional custom tags
	 */
	[key: string]: string | undefined
}

/**
 * Sentry severity levels for messages
 */
export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'

/**
 * Minimal browser Sentry API exposed by the embedded Sentry loader.
 *
 * This type is intentionally limited to browser methods that extensions can
 * rely on without bundling the browser SDK.
 */
export interface SentryBrowser {
	/** Captures an exception in the active browser Sentry client. */
	captureException(error: unknown): string | undefined
}

/**
 * Breadcrumb categories for tracking user actions and system events
 */
export type BreadcrumbCategory =
	| 'auth'
	| 'navigation'
	| 'http'
	| 'db'
	| 'cache'
	| 'validation'
	| 'processing'
	| (string & {}) // Allow custom categories while preserving autocomplete

/**
 * Captures an exception and sends it to the Sentry logging platform for tracking and analysis.
 * This method initializes the Sentry scope and attaches contextual data such as tags and extra
 * information.
 *
 * @param error - The exception or error object to be captured.
 * @param context - An object containing additional metadata for the error.
 * @param context.tags - Key-value pairs used to provide contextual information, such as
 * severity. Defaults to 'medium' if not provided.
 * @param context.extra - A record object containing extra data to be logged with the exception.
 *
 * @returns void
 *
 * @example
 * ```typescript
 * try {
 *   await dangerousOperation()
 * } catch (err) {
 *   captureException(err, {
 *     tags: {
 *       domain: 'media-publishing',
 *       operation: 'reindexCollection',
 *       severity: 'high',
 *       component: 'operation',
 *       context: 'runtime',
 *     },
 *     extra: {
 *       collection: 'articles',
 *       itemCount: 42,
 *     },
 *   })
 * }
 * ```
 */
export function captureException(
	error: unknown,
	context: { tags: Tags; extra?: Record<string, unknown> },
): void {
	if (!Sentry) {
		return // Sentry is not initialized
	}

	const { tags } = context
	tags.severity ??= 'medium' // Default severity if not provided

	Sentry.withScope((scope: Scope) => {
		if (context?.tags) scope.setTags(context.tags)
		if (context?.extra) {
			for (const [k, v] of Object.entries(context.extra)) scope.setExtra(k, v)
		}
		Sentry.captureException(error)
	})
}

/**
 * Captures a message and sends it to Sentry for tracking.
 * Useful for logging important events that aren't errors (e.g., warnings, info messages).
 *
 * @param message - The message to capture
 * @param level - Severity level (default: 'info')
 * @param context - Optional tags and extra data
 *
 * @returns void
 *
 * @example
 * ```typescript
 * captureMessage('Large batch processing completed', 'info', {
 *   tags: {
 *     domain: 'batch-processor',
 *     operation: 'processItems',
 *     component: 'operation',
 *     context: 'runtime',
 *   },
 *   extra: {
 *     itemCount: 1000,
 *     duration: 45000,
 *   },
 * })
 * ```
 */
export function captureMessage(
	message: string,
	level: SeverityLevel = 'info',
	context?: { tags?: Tags; extra?: Record<string, unknown> },
): void {
	if (!Sentry) {
		return // Sentry is not initialized
	}

	Sentry.withScope((scope: Scope) => {
		if (context?.tags) {
			const tags = context.tags
			tags.severity ??= 'medium'
			scope.setTags(tags)
		}
		if (context?.extra) {
			for (const [k, v] of Object.entries(context.extra)) scope.setExtra(k, v)
		}
		Sentry.captureMessage(message, level)
	})
}

/**
 * Adds a breadcrumb to the current scope. Breadcrumbs are a trail of events that
 * happened before an error occurred, helping with debugging.
 *
 * @param message - Description of what happened
 * @param category - Category of the breadcrumb (e.g., 'http', 'db', 'navigation')
 * @param level - Severity level (default: 'info')
 * @param data - Additional data to attach to the breadcrumb
 *
 * @returns void
 *
 * @example
 * ```typescript
 * // Before making an API call
 * addBreadcrumb('Fetching user data', 'http', 'info', {
 *   url: '/api/users/123',
 *   method: 'GET',
 * })
 *
 * // Before a database query
 * addBreadcrumb('Querying articles collection', 'db', 'info', {
 *   collection: 'articles',
 *   filter: { status: 'published' },
 * })
 *
 * // If an error occurs later, these breadcrumbs will show up in Sentry
 * ```
 */
export function addBreadcrumb(
	message: string,
	category: BreadcrumbCategory = 'processing',
	level: SeverityLevel = 'info',
	data?: Record<string, unknown>,
): void {
	if (!Sentry) {
		return // Sentry is not initialized
	}

	Sentry.addBreadcrumb({
		message,
		category,
		level,
		data,
		timestamp: Date.now() / 1000, // Sentry expects seconds
	})
}

/**
 * Sets user context for all subsequent Sentry events.
 * Useful for associating errors with specific users.
 *
 * @param user - User information to attach to events
 * @param user.id - User ID (required)
 * @param user.email - User email (optional)
 * @param user.username - Username (optional)
 *
 * @returns void
 *
 * @example
 * ```typescript
 * // In a Directus hook with accountability
 * setUser({
 *   id: accountability.user,
 *   email: accountability.email,
 *   role: accountability.role,
 * })
 * ```
 */
export function setUser(user: {
	id: string
	email?: string
	username?: string
	[key: string]: unknown
}): void {
	if (!Sentry) {
		return // Sentry is not initialized
	}

	Sentry.setUser(user)
}
