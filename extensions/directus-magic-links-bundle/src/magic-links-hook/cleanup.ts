import type { ApiExtensionContext } from '@directus/types'

import { parseDuration } from '../magic-links-endpoint/helpers'

type Database = ApiExtensionContext['database']
type Logger = ApiExtensionContext['logger']
type Schedule = (cron: string, handler: () => Promise<void>) => void

interface CleanupInput {
	database: Database
	collection: string
	retentionWindow: string
	now?: Date
}

interface CleanupScheduleInput extends Omit<CleanupInput, 'now'> {
	cron: string
	enabled: boolean
	logger: Logger
}

/**
 * Deletes magic links retained beyond their expiry or redemption grace period.
 *
 * @param input - Cleanup database and retention configuration.
 * @returns The number of deleted records.
 */
export const cleanupMagicLinks = async (input: CleanupInput): Promise<number> => {
	const cutoff = new Date(
		(input.now ?? new Date()).getTime() - parseDuration(input.retentionWindow),
	)

	return input.database.transaction(async (transaction): Promise<number> => {
		const deleted = await transaction(input.collection)
			.where('expires_at', '<', cutoff)
			.orWhere('redeemed_at', '<', cutoff)
			.delete()
		return deleted
	})
}

/**
 * Registers the opt-in scheduled cleanup job and contains job failures in the scheduler callback.
 *
 * @param schedule - Directus schedule registration function.
 * @param input - Cleanup configuration and logger.
 * @returns Nothing.
 */
export const registerMagicLinkCleanup = (schedule: Schedule, input: CleanupScheduleInput): void => {
	if (!input.enabled) return

	schedule(input.cron, async () => {
		try {
			const deleted = await cleanupMagicLinks(input)
			input.logger.info({ msg: 'Magic-link cleanup completed', deleted })
		} catch (error) {
			input.logger.error({ msg: 'Magic-link cleanup failed', cause: error })
		}
	})
}
