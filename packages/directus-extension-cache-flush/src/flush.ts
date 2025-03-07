import { ofetch } from 'ofetch';
import { EventContext, PrimaryKey } from '@directus/types';
import { ApiExtensionContext } from '@directus/extensions';
import type { Meta, FlushConfig } from './types';
export const sendFlushRequest = async (
    meta: Meta,
    config: FlushConfig, 
    eventContext: EventContext, 
    hookContext: ApiExtensionContext,
) => {

    /*
        0. Notify user if invalid schema 
        1. Loop over endpoints, and for each:
            - find variable for unique identifier
            - sent post request to endpoint with unique identifier
        2. Log success/failure
        3. If failure, sent notification to registered user
    */
    // const { logger } = hookContext;
    // const { url, auth_header, api_key, id, status } = config;

}