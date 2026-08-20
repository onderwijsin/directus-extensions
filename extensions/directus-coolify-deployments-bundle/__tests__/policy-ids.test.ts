import { describe, expect, it } from 'vitest'

import {
	resolveCoolifyPolicyId,
	type CoolifyPolicyIdOverride,
} from '../src/coolify-deployments-hook/policy-ids'
import {
	DEFAULT_MANAGE_APPLICATIONS_POLICY_ID,
	DEFAULT_READ_DEPLOYMENTS_POLICY_ID,
	DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID,
} from '../src/shared/constants'

describe('resolveCoolifyPolicyId', () => {
	it('resolves configured identifiers by bundled default identifier', () => {
		const overrides: CoolifyPolicyIdOverride[] = [
			{ default: DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID, resolved: 'custom-trigger' },
			{ default: DEFAULT_MANAGE_APPLICATIONS_POLICY_ID, resolved: 'custom-manage' },
			{ default: DEFAULT_READ_DEPLOYMENTS_POLICY_ID, resolved: 'custom-read' },
		]

		expect(resolveCoolifyPolicyId(DEFAULT_MANAGE_APPLICATIONS_POLICY_ID, overrides)).toBe(
			'custom-manage',
		)
		expect(resolveCoolifyPolicyId(DEFAULT_READ_DEPLOYMENTS_POLICY_ID, overrides)).toBe(
			'custom-read',
		)
		expect(resolveCoolifyPolicyId(DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID, overrides)).toBe(
			'custom-trigger',
		)
	})

	it('preserves an unknown bundled identifier', () => {
		expect(resolveCoolifyPolicyId('unknown-policy', [])).toBe('unknown-policy')
	})
})
