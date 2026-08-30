/** Article shape used to render the documentation navigation. */
export interface StudioDocsNavigationArticle {
	id: string
	navigation_label: string
	icon: string | null
}

/** Full article shape returned by the Studio Docs collection. */
export interface StudioDocsArticle {
	id: string
	navigation_label: string
	body: string
	icon: string | null
	date_created: string | null
	date_updated: string | null
}
