import { ClientSecretCredential, type GetTokenOptions } from "@azure/identity";
import { EndpointExtensionContext } from "@directus/extensions";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider, TokenCredentialAuthenticationProviderOptions } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

import { InvalidProviderOptions } from "../../errors";

export default (env: EndpointExtensionContext["env"]) => {
    const clientId = env.AZURE_CLIENT_ID;
    const clientSecret = env.AZURE_CLIENT_SECRET;
    const tenantId = env.AZURE_TENANT_ID;

    if (!clientId || !clientSecret || !tenantId) {
        throw new InvalidProviderOptions()
    }

    // Create an instance of the TokenCredential class that is imported
    // https://github.com/microsoftgraph/msgraph-sdk-javascript/blob/f4bfaf0a13f7a923fd5228b621c4ecb4e9d3cd78/docs/TokenCredentialAuthenticationProvider.md
    const tokenCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const getTokenOptions: GetTokenOptions = {
        // see https://github.com/Azure/azure-sdk-for-js/blob/535cfb03e33f603fd71bb4f443e22ea9f38ac245/sdk/core/core-auth/src/tokenCredential.ts#L28
    }

    const authOptions: TokenCredentialAuthenticationProviderOptions = { 
        scopes: ['https://graph.microsoft.com/.default'], 
        getTokenOptions
    }
    const authProvider = new TokenCredentialAuthenticationProvider(tokenCredential, authOptions);
    const client = Client.initWithMiddleware({
        debugLogging: false,
        authProvider: authProvider,
    });
    return client;
}
