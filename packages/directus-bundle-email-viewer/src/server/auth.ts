import { ConfidentialClientApplication } from '@azure/msal-node';
import { createError } from '@directus/errors'


const FailedToAcquireAccessTokenError = createError(
    'INTERNA:_SERVER_ERROR',
    'Failed to acquire access token',
    500
);

const config = (clientId: string, clientSecret: string, tenantId: string, redirectUri: string) => ({
    auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        clientSecret,
        redirectUri,
    },
});

function createCCA(clientId: string, clientSecret: string, tenantId: string, redirectUri: string) {
    return new ConfidentialClientApplication(config(clientId, clientSecret, tenantId, redirectUri));
}

async function getAccessToken(clientId: string, clientSecret: string, tenantId: string, redirectUri: string): Promise<string> {
    const cca = createCCA(clientId, clientSecret, tenantId, redirectUri);
    const authResponse = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });

    if (!authResponse || !authResponse.accessToken) {
        throw new FailedToAcquireAccessTokenError()
    }

    return authResponse.accessToken;
}

async function getAccessTokenFromCode(clientId: string, clientSecret: string, tenantId: string, redirectUri: string, code: string): Promise<string> {
    const cca = createCCA(clientId, clientSecret, tenantId, redirectUri);
    const authResponse = await cca.acquireTokenByCode({
        code,
        scopes: ['https://graph.microsoft.com/.default'],
        redirectUri,
    });

    if (!authResponse || !authResponse.accessToken) {
        throw new FailedToAcquireAccessTokenError()
    }
    
    return authResponse.accessToken;
}

export { getAccessToken, getAccessTokenFromCode };