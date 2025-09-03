import { defineHook } from "@directus/extensions-sdk";
import { createOrUpdateFieldsInCollection, disableSchemaChange } from "utils";
import { policyFieldsSchema, settingsFieldSchema, userFieldSchema } from "./schema";

export default defineHook(({ init }, context) => {
	const { env } = context;

	init("cli.after", async () => {
		if (!disableSchemaChange("EMAIL_VIEWER_DISABLE_SCHEMA_CHANGE", env)) {
			await createOrUpdateFieldsInCollection("directus_policies", policyFieldsSchema, context);
			await createOrUpdateFieldsInCollection("directus_settings", settingsFieldSchema, context);
			await createOrUpdateFieldsInCollection("directus_users", userFieldSchema, context);
		}
	});
});
