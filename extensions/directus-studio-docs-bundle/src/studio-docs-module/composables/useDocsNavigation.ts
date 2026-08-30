import type { StudioDocsNavigationArticle } from '../types'

import { useApi } from '@directus/extensions-sdk'

import { COLLECTION_NAME } from '../../shared/constants'

const navigationFields = 'id,navigation_label,icon'

/**
 * Provides the published article navigation request.
 * @returns A method for loading published article navigation.
 */
export function useDocsNavigation() {
	const api = useApi()

	/**
	 * Loads only the fields needed to render the documentation navigation.
	 * @returns Published navigation articles.
	 */
	const listArticles = async (): Promise<StudioDocsNavigationArticle[]> => {
		const query = new URLSearchParams({
			fields: navigationFields,
			'filter[archived][_eq]': 'false',
			limit: '-1',
			sort: 'sort,navigation_label',
		})
		const response = await api.get<{ data: StudioDocsNavigationArticle[] }>(
			`/items/${COLLECTION_NAME}?${query.toString()}`,
		)
		return response.data.data
	}

	return { listArticles }
}
