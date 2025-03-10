import { createError } from "@directus/errors";

export const InvalidProvider = createError(
	"INTERNAL_SERVER_ERROR",
	"No valid provider was found in the environment variables",
	500
);

export const InvalidProviderOptions = createError(
	"INTERNAL_SERVER_ERROR",
	"Invalid provider options found in environment variables",
	500
);

export const ProviderError = createError<{
	provider_error: any;
}>(
	"PROVIDER_ERROR",
	"Error fetching data from provider",
	400
);
