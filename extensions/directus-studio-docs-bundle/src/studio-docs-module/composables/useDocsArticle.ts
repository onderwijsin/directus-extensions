import type { StudioDocsArticle } from '../types'

import { useApi } from '@directus/extensions-sdk'

import { COLLECTION_NAME } from '../../shared/constants'

const articleFields = [
	'id',
	'navigation_label',
	'body',
	'sort',
	'archived',
	'icon',
	'user_created',
	'date_created',
	'date_updated',
].join(',')

/**
 * Provides the documentation article request.
 * @returns A method for loading one article by ID.
 */
export function useDocsArticle() {
	const api = useApi()

	/**
	 * Loads all fields needed to render and audit one article.
	 * @param id - Article ID.
	 * @returns The requested article.
	 */
	const getArticle = async (id: string): Promise<StudioDocsArticle> => {
		const query = new URLSearchParams({ fields: articleFields })
		const response = await api.get<{ data: StudioDocsArticle }>(
			`/items/${COLLECTION_NAME}/${encodeURIComponent(id)}?${query.toString()}`,
		)
		return response.data.data
	}

	return { getArticle }
}
