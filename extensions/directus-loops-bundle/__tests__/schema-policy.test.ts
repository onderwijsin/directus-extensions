import { describe, expect, it } from 'vitest'

import recipients from '../schema/loops_campaign_recipients.json'
import campaigns from '../schema/loops_campaigns.json'
import directusUsers from '../schema/loops_directus_users.json'
import policies from '../schema/loops_policies.json'

describe('Loops schema and policies', () => {
	it('declares the campaign archive fields and recipient relation', () => {
		const fields = new Map(campaigns.fields.map((field) => [field.field, field]))

		expect(fields.get('subject')?.meta.width).toBe('full')
		expect(fields.get('from_name')?.meta.width).toBe('half')
		expect(fields.get('raw_loops_response')?.meta.hidden).toBe(true)
		expect(fields.get('raw_lmx')?.meta.readonly).toBe(true)
		expect(fields.get('loops_ast')?.meta.readonly).toBe(true)
		expect(fields.get('ingestion_status')?.schema?.default_value).toBe('processing')
		expect(fields.get('ingestion_error')?.meta.hidden).toBe(true)
		const userField = directusUsers.fields.find((field) => field.field === 'loops_sync_enabled')
		expect(userField).toEqual(
			expect.objectContaining({ collection: 'directus_users', type: 'boolean' }),
		)
		expect(userField?.schema?.default_value).toBe(false)
		expect(userField?.meta.note).toContain('does not subscribe')
		expect(recipients.relations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					field: 'campaign',
					related_collection: 'loops_campaigns',
					schema: { on_delete: 'CASCADE' },
				}),
				expect.objectContaining({
					field: 'directus_user',
					related_collection: 'directus_users',
					schema: { on_delete: 'SET NULL' },
				}),
			]),
		)
	})

	it('keeps campaign view permissions public-field-only and user-scoped for recipients', () => {
		const manage = policies.policies.find(
			(policy) => policy.name === 'Can manage email campaigns',
		)
		const view = policies.policies.find((policy) => policy.name === 'Can view email campaigns')

		expect(manage?.permissions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					collection: 'loops_campaigns',
					action: 'create',
					fields: ['*'],
				}),
				expect.objectContaining({
					collection: 'loops_campaigns',
					action: 'update',
					fields: ['*'],
				}),
				expect.objectContaining({
					collection: 'loops_campaigns',
					action: 'delete',
					fields: ['*'],
				}),
			]),
		)
		expect(view?.permissions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					collection: 'loops_campaigns',
					action: 'read',
					fields: expect.not.arrayContaining(['raw_lmx', 'raw_loops_response']),
				}),
				expect.objectContaining({
					collection: 'loops_campaign_recipients',
					permissions: { directus_user: { _eq: '$CURRENT_USER' } },
				}),
			]),
		)
	})
})
