import type { DirectusCampaign } from '../services'

import { InvalidPayloadError } from '@directus/errors'
import { loopsLmxAstSchema, type LoopsLmxAst } from '@onderwijsin/loops-core'

import { type CampaignIngestionStatus } from './types'

/**
 * Validates the parser output before it becomes durable archive data.
 * @param ast - Parser output.
 * @returns Validated LMX AST.
 */
export const validateLmxAst = (ast: unknown): LoopsLmxAst => {
	const result = loopsLmxAstSchema.safeParse(ast)
	if (!result.success)
		throw new InvalidPayloadError({ reason: 'Loops LMX parser returned an invalid AST' })
	return result.data
}

/**
 * Checks whether a processing claim is still inside its lease.
 * @param record - Existing campaign record.
 * @param now - Current time.
 * @param processingLeaseMs - Lease duration.
 * @returns Whether the claim remains fresh.
 */
export const isFreshProcessingClaim = (
	record: Partial<DirectusCampaign>,
	now: Date,
	processingLeaseMs: number,
): boolean => {
	if (record.ingestion_status !== 'processing' || !record.processing_started_at) return false
	const startedAt = Date.parse(record.processing_started_at)
	return Number.isFinite(startedAt) && now.getTime() - startedAt < processingLeaseMs
}

/**
 * Converts an unknown failure into a bounded persisted message.
 * @param error - Failure value.
 * @returns Bounded error message.
 */
export const failureMessage = (error: unknown): string => {
	const message = error instanceof Error ? error.message : 'Unknown ingestion failure'
	return message.slice(0, 2_000)
}

/**
 * Normalizes a persisted status to the ingestion result contract.
 * @param value - Persisted status.
 * @returns Normalized ingestion status.
 */
export const materializedStatus = (value: string | null | undefined): CampaignIngestionStatus => {
	if (value === 'success' || value === 'partial' || value === 'failed') return value
	return 'processing'
}
