import { defineHook } from '@directus/extensions-sdk';
import { SYNC_CONFIG as config } from './config';
import { syncData } from './sync';
import { Meta } from './types';
import { createDataSyncPolicy, createDataSyncUser, assignPolicy } from './utils';

import { dataSyncUserId } from './config';

export default defineHook(async ({ action }, hookContext) => {

	await createDataSyncPolicy(hookContext);
	await createDataSyncUser(hookContext);
	await assignPolicy(hookContext);

	["items.create", "items.update", "items.delete"].forEach(event => {
		action(event, async (meta, eventContext) => {
			if (!config.remotes.filter(remote => remote.schema.find(c => c.name === meta.collection)).length) return; // Skip if not a synced collection
			
			const requestUserId = eventContext.accountability?.user; // Retrieve the user ID of the requestor
			const isRemoteSync = requestUserId === dataSyncUserId;

			// If event was triggered by a remote API key, skip the sync (since that would create an infinite loop)
			if (isRemoteSync) {
				return;
			}
		
			// Only sync if it was a local change
			await syncData(meta as Meta, config, eventContext, hookContext);
		});
	});
});
