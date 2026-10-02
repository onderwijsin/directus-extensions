import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), ofetch: vi.fn() }))

vi.mock('@directus/extensions-sdk', () => ({ useApi: () => ({ get: mocks.get }) }))
vi.mock('ofetch', () => ({ ofetch: mocks.ofetch }))

import { useIconifyApi } from '../src/shared/useIconifyApi'

describe('Iconify collection API routing', () => {
	beforeEach(() => {
		mocks.get.mockReset()
		mocks.ofetch.mockReset()
	})

	it('uses the Directus proxy by default', async () => {
		const collections = { mdi: { name: 'Material Design Icons' } }
		mocks.get.mockResolvedValue({ data: collections })
		const api = useIconifyApi()

		expect(await api.getCollections(true)).toEqual(collections)
		expect(mocks.get).toHaveBeenCalledWith('/iconify/collections')
		expect(mocks.ofetch).not.toHaveBeenCalled()

		const collection = { title: 'Material Design Icons', uncategorized: ['home'] }
		mocks.get.mockResolvedValueOnce({ data: collection })
		expect(await api.getCollection('mdi', true)).toEqual(collection)
		expect(mocks.get).toHaveBeenCalledWith('/iconify/collection/mdi')
	})

	it('uses the public Iconify API when the proxy is disabled', async () => {
		const collections = { mdi: { name: 'Material Design Icons' } }
		const collection = { title: 'Material Design Icons', uncategorized: ['home'] }
		mocks.ofetch.mockResolvedValueOnce(collection).mockResolvedValueOnce(collections)
		const api = useIconifyApi()

		expect(await api.getCollection('mdi', false)).toEqual(collection)
		expect(mocks.ofetch).toHaveBeenCalledWith(
			'https://api.iconify.design/collection?prefix=mdi',
		)
		expect(mocks.get).not.toHaveBeenCalled()
		expect(await api.getCollections(false)).toEqual(collections)
		expect(mocks.ofetch).toHaveBeenCalledWith('https://api.iconify.design/collections')
	})
})
