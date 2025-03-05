import { defineHook } from '@directus/extensions-sdk';
import { SYNC_CONFIG } from './config';
import { syncData } from './sync';
import { Meta } from './types';

export default defineHook(({ action }, hookContext) => {
	const config = SYNC_CONFIG(hookContext.env);
	["items.create", "items.update", "items.delete"].forEach(event => {
		action(event, async (meta, eventContext) => {
			if (!config.collections.find(c => c.name === meta.collection)) return; // Skip if not a synced collection
		
			const requestUserId = eventContext.accountability?.user; // Retrieve the user ID of the requestor
			
			// TODO - an alternative approach would be to use a custom role for SYNC API keys. 
			// But that would mean configuring an entire role with policies
			// Check if the event was triggered by a remote API key
			const isRemoteSync = config.remotes.some(remote => remote.userId === requestUserId);

			// If event was triggered by a remote API key, skip the sync (since that would create an infinite loop)
			if (isRemoteSync) {
				return;
			}
		
			// Only sync if it was a local change
			await syncData(meta as Meta, config);
		});
	});
});
