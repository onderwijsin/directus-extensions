import { describe, expect, it } from 'vitest'

import { filterPoliciesByIp } from '../src/filter-policies-by-ip'

const row = (id: string, ip_access: string[] | null) => ({
	role: null,
	policy: {
		id,
		name: id,
		icon: 'policy',
		description: null,
		enforce_tfa: false,
		admin_access: false,
		app_access: true,
		ip_access,
	},
})

describe('filterPoliciesByIp', () => {
	it('keeps unrestricted policies and rejects restricted policies without an IP', () => {
		expect(
			filterPoliciesByIp([row('open', null), row('restricted', ['127.0.0.1'])], null),
		).toEqual([row('open', null)])
	})

	it('keeps policies whose CIDR allow list contains the client IP', () => {
		expect(
			filterPoliciesByIp(
				[row('network', ['192.168.1.0/22']), row('localhost', ['127.0.0.1'])],
				'192.168.1.25',
			),
		).toEqual([row('network', ['192.168.1.0/22'])])
	})
})
