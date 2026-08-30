/** Article shape returned by the Studio Docs collection. */
export interface StudioDocsArticle {
	id: string
	navigation_label: string
	body: string
	sort: number
	archived: boolean
	icon: string | null
	user_created: string | null
	date_created: string | null
	date_updated: string | null
}
