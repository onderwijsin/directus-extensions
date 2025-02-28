import { getAccessToken } from './auth';
type RequestOptions = {
    email: string
    users?: string[]
    type?: 'sent' | 'received'
    limit?: number
    offset?: number
}

export async function fetchEmails(
    clientId: string,
    clientSecret: string,
    tenantId: string,
    redirectUri: string,
    options: RequestOptions
): Promise<{ value?: Email[], error?: { code: string, message: string } }> {
    const accessToken = await getAccessToken(clientId, clientSecret, tenantId, redirectUri);
    const { email, users, type, limit, offset } = options;

    let filterQueryParts: string[] = [];

    if (users?.length) {
        const userFilters = users.map(user => `(from/emailAddress/address eq '${user}' or toRecipients/any(t:t/emailAddress/address eq '${user}'))`);
        filterQueryParts.push(`(${userFilters.join(' or ')})`);
    }

    if (type === 'sent') {
        filterQueryParts.push(`from/emailAddress/address eq '${email}'`);
    } else if (type === 'received') {
        filterQueryParts.push(`toRecipients/any(t:t/emailAddress/address eq '${email}')`);
    }

    // Add filter to exclude drafts
    filterQueryParts.push(`isDraft eq false`);

    const filterQuery = filterQueryParts.join(' and ');

    let url = `https://graph.microsoft.com/v1.0/users/${email}/messages?$select=id,createdDateTime,categories,sentDateTime,hasAttachments,internetMessageId,subject,bodyPreview,isRead,webLink,sender,from,toRecipients,ccRecipients,bccRecipients`;

    if (filterQuery) {
        url += `&$filter=${filterQuery}`;
    }

    if (limit) {
        url += `&$top=${limit}`;
    }

    if (offset) {
        url += `&$skip=${offset}`;
    }

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    const data = await response.json();

    return data;
}