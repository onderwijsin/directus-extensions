import { isDirectusError } from '@directus/errors'
import { describe, expect, it } from 'vitest'

import {
	SluggernautConfigurationError,
	SluggernautIntegrityError,
	SluggernautInternalError,
	SluggernautRedirectProcessingError,
	SluggernautValidationError,
	sluggernautValidationError,
	toSluggernautError,
} from '../src/shared/errors'

describe('Sluggernaut errors', () => {
	it.each([
		[SluggernautValidationError, 'SLUGGERNAUT_VALIDATION', 400],
		[SluggernautIntegrityError, 'SLUGGERNAUT_INTEGRITY', 409],
		[SluggernautConfigurationError, 'SLUGGERNAUT_CONFIGURATION', 500],
		[SluggernautInternalError, 'SLUGGERNAUT_INTERNAL', 500],
		[SluggernautRedirectProcessingError, 'SLUGGERNAUT_REDIRECT_PROCESSING', 500],
	] as const)('creates a Directus error for %s', (ErrorConstructor, code, status) => {
		const error = new ErrorConstructor({ reason: 'test reason' })
		expect(isDirectusError(error)).toBe(true)
		expect(error).toMatchObject({ code, status, message: 'test reason' })
	})

	it('creates validation errors with the shared helper', () => {
		const error = sluggernautValidationError('invalid redirect')
		expect(isDirectusError(error, 'SLUGGERNAUT_VALIDATION')).toBe(true)
		expect(error.message).toBe('invalid redirect')
	})

	it('preserves existing Directus errors and wraps unknown failures', () => {
		const directusError = new SluggernautValidationError({ reason: 'already directus' })
		expect(toSluggernautError(directusError)).toBe(directusError)

		const wrapped = toSluggernautError(
			new Error('private failure'),
			SluggernautInternalError,
			'safe failure',
		)
		expect(isDirectusError(wrapped, 'SLUGGERNAUT_INTERNAL')).toBe(true)
		expect(wrapped.message).toBe('safe failure')
	})
})
