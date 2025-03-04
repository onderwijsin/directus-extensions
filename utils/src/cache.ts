import NodeCache from 'node-cache';
/**
 * A helper function to cache the results of a callback function.
 * @param callback - The function to be cached.
 * @param ttl - Time-to-live for the cache in seconds.
 * @param cacheKey - Optional key to use for the cache. Otherwise, the arguments are stringified.
 * @returns A function that returns cached data if available, otherwise calls the callback and caches the result.
 */
const cache = new NodeCache();
export const cacheProvider = <T>(callback: (...args: any[]) => Promise<T>, ttl: number, cacheKey?: string): (...args: any[]) => Promise<T> => {
    return async (...args: any[]): Promise<T> => {
        const key = cacheKey || JSON.stringify(args);
        const cachedData = cache.get<T>(key);
        if (cachedData) {
            return cachedData;
        }
        const data = await callback(...args);
        if (data) {
            cache.set(key, data, ttl);
        }
        return data;
    };
}