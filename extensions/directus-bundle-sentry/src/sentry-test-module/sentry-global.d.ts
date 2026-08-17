import type { SentryBrowser } from '@onderwijsin/directus-extension-utils/sentry'

declare global {
	/** Browser Sentry API embedded by the Sentry hook. */
	const Sentry: SentryBrowser
}

export {}
