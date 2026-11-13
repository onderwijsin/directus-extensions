import type { SeedItem } from './seedItem'

/**
 * Seed data by collection.
 */
export type SeedData = Record<string, SeedItem[]>

/**
 * Collection data provider interface.
 */
export interface CollectionDataProvider {
	/**
	 * Get a collection name.
	 */
	readonly collectionName: string

	/**
	 * Get collection data.
	 */
	getData: () => SeedItem[]
}

/**
 * Create a collection data provider.
 *
 * @param collectionName Collection name
 * @param dataFn Function that returns collection data
 * @returns Collection data provider
 */
export function createCollectionDataProvider(
	collectionName: string,
	dataFn: () => SeedItem[],
): CollectionDataProvider {
	return {
		collectionName,
		getData: dataFn,
	}
}

/**
 * Seed data provider interface
 */
export interface SeedDataProvider {
	/**
	 * Get all collection data providers
	 */
	readonly collections: CollectionDataProvider[]

	/**
	 * Get seed data
	 */
	getSeedData: () => SeedData
}

/**
 * Create a seed data provider
 *
 * @param collections Collection data providers
 * @returns Seed data provider
 */
export function createSeedDataProvider(collections: CollectionDataProvider[]): SeedDataProvider {
	return {
		collections,
		/**
		 * Collects providers in order, concatenating repeated collection entries.
		 * @returns Seed rows grouped by collection.
		 */
		getSeedData(): SeedData {
			const result = new Map<string, SeedItem[]>()

			for (const collection of collections) {
				const collectionName = collection.collectionName
				const data = collection.getData()

				// If a collection already exists in the result, merge the arrays
				// This supports multi-pass imports (e.g., two-pass import for operations)
				const previous = result.get(collectionName)
				result.set(collectionName, previous ? [...previous, ...data] : data)
			}

			return Object.fromEntries(result)
		},
	}
}
