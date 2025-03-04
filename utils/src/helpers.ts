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