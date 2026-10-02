import { useApi } from '@directus/extensions-sdk'
import { ofetch } from 'ofetch'

export interface CollectionInfo {
	name?: string
}

export interface CollectionResponse {
	title?: string
	uncategorized?: string[]
	categories?: Record<string, string[]>
	aliases?: Record<string, string>
}

const upstream = 'https://api.iconify.design'

/**
 * Returns collection requests for the selected Iconify API route.
 * @returns Collection request functions.
 */
export function useIconifyApi() {
	const api = useApi()

	/**
	 * Loads metadata for all available icon collections.
	 * @param useProxy Whether to request through Directus.
	 * @returns Collection metadata keyed by prefix.
	 */
	async function getCollections(useProxy: boolean) {
		if (useProxy) {
			return (await api.get<Record<string, CollectionInfo>>('/iconify/collections')).data
		}
		return ofetch<Record<string, CollectionInfo>>(`${upstream}/collections`)
	}

	/**
	 * Loads icon names and aliases for one collection.
	 * @param prefix The collection prefix.
	 * @param useProxy Whether to request through Directus.
	 * @returns Names and aliases for the collection.
	 */
	async function getCollection(prefix: string, useProxy: boolean) {
		const encodedPrefix = encodeURIComponent(prefix)
		if (useProxy) {
			return (await api.get<CollectionResponse>(`/iconify/collection/${encodedPrefix}`)).data
		}
		return ofetch<CollectionResponse>(`${upstream}/collection?prefix=${encodedPrefix}`)
	}

	return { getCollections, getCollection }
}
