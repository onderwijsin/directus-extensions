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
 * Provides the authenticated API request used by the Docs module.
 * @returns A method for loading visible documentation articles.
 */
export function useStudioDocsApi() {
	const api = useApi()

	/**
	 * Loads unarchived articles in their deterministic navigation order.
	 * @returns Visible Studio Docs articles.
	 */
	const listArticles = async (): Promise<StudioDocsArticle[]> => {
		const query = new URLSearchParams({
			fields: articleFields,
			'filter[archived][_eq]': 'false',
			limit: '-1',
			sort: 'sort,navigation_label',
		})
		const response = await api.get<{ data: StudioDocsArticle[] }>(
			`/items/${COLLECTION_NAME}?${query.toString()}`,
		)
		return response.data.data
	}

	return { listArticles }
}
