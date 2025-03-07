import { defineHook } from '@directus/extensions-sdk';
import type { ApiExtensionContext } from '@directus/extensions';

const fetchCacheFlushConfig = async (hookContext: ApiExtensionContext) => {

}


export default defineHook(({ action }, hookContext) => {
	["items.update", "items.delete"].forEach(event => {
		action(event, async (meta, eventContext) => {

			const config = await fetchCacheFlushConfig(hookContext);
			// check if current collection exists in flush settings
			// if not, return

			/* 
				1. Get flush endpoints
				2. Loop over endpoints, and for each:
					- find variable for unique identifier
					- sent post request to endpoint with unique identifier
				3. Log success/failure
				4. If failure, sent notification to registered user
			*/
			
		});
	});
});
