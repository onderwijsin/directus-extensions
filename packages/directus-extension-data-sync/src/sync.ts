import type { Meta, SyncConfig } from './types';

export const syncData = async (meta: Meta, config: SyncConfig) => {
    // Determine the action type and operations that should be performed
    // If delete; send delete request to all remotes with primary keys
    // if create or update; filter payload based on the fields that should be synced
    // If create; send create request to all remotes with the payload and the id of the new item
    // If update; send update request to all remotes with the payload and the id(s) of the updated item(s) - this is a batch update
    // Loop over the remotes and perform the necessary operations

    // In any scenario; catch errors, log them and sent (slack?) notifications to admin of failed syncs
}