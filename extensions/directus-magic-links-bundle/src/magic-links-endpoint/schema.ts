import { z } from 'zod'

/** Validates a request for a magic-link email. */
export const requestSchema = z.object({
	email: z.email().trim(),
	redirectUrl: z.url().trim(),
})

export type RequestPayload = z.output<typeof requestSchema>

/** Validates a magic-link redemption request. */
export const redeemSchema = z.object({
	token: z.string().trim().min(1),
	otp: z.string().trim().min(1).optional(),
	mode: z.enum(['json', 'cookie', 'session']).default('json'),
})

export type RedeemPayload = z.output<typeof redeemSchema>
