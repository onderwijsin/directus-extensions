import { ApiExtensionContext } from "@directus/extensions";

/**
 * Parses the domain from an email address.
 *
 * @param email - The email address to parse.
 * @returns The domain part of the email address, or an empty string if the domain is not present.
 */
export const parseEmailDomain = (email: string): string => {
    const parts = email.split('@');
    return !!parts[1] ? parts[1] : '';
}




/**
 * Checks if schema changes are disabled for a given extension.
 *
 * This function checks the environment variables to determine if schema changes
 * are disabled for a specific extension or globally.
 *
 * @param extension_key - The extension specific env variable key to check
 * @param env - The environment variables from the Directus API context.
 * @returns `true` if schema changes are disabled for the specified extension or globally, `false` otherwise.
 */
export const disableSchemaChange = (extension_key: string, env: ApiExtensionContext["env"]) => {
    const { DISABLE_EXTENSION_SCHEMA_CHANGE } = env;
    return (!!env[extension_key] && (env[extension_key] === 'true' || env[extension_key] === true)) || (!!DISABLE_EXTENSION_SCHEMA_CHANGE && (DISABLE_EXTENSION_SCHEMA_CHANGE === 'true' || DISABLE_EXTENSION_SCHEMA_CHANGE === true))
};




/**
 * Prunes an object by retaining only the specified keys.
 *
 * @param obj - The object to prune.
 * @param keys - The array of keys to retain in the object.
 * @returns A new object containing only the specified keys from the original object.
 */
export const pruneObjByFieldKeys = <T extends Record<string, any>, K extends keyof T>(
    obj: T, 
    keys: K[]
): Partial<Pick<T, K>> => {
    return Object.keys(obj).reduce((acc, key) => {
        if (keys.includes(key as K)) {
            acc[key as K] = obj[key];
        }
        return acc;
    }, {} as Partial<Pick<T, K>>);
}