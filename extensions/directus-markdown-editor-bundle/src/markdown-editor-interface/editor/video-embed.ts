import { z } from 'zod'

const videoUrlSchema = z.string().trim().pipe(z.httpUrl())
const youtubeIdSchema = z.string().regex(/^[\w-]{11}$/u)
const vimeoIdSchema = z.string().regex(/^[1-9]\d*$/u)
const vimeoHashSchema = z.string().regex(/^[a-z\d]+$/iu)

/** Author-configurable provider playback preferences. */
export const videoPlaybackOptionsSchema = z.object({
	allowFullscreen: z.boolean().default(true),
	showControls: z.boolean().default(true),
	loop: z.boolean().default(false),
	autoplay: z.boolean().default(false),
	muted: z.boolean().default(false),
})
export type VideoPlaybackOptions = z.infer<typeof videoPlaybackOptionsSchema>

/**
 * Create independent defaults for a new provider video draft.
 * @returns Default playback preferences.
 */
export function defaultVideoPlaybackOptions(): VideoPlaybackOptions {
	return videoPlaybackOptionsSchema.parse({})
}

/**
 * Read the supported playback preferences from provider parameters and iframe permissions.
 * @param url Validated provider URL.
 * @param provider Recognized video provider.
 * @param permissions Optional iframe permission policy.
 * @param fullscreen Whether an imported iframe has its fullscreen attribute.
 * @returns Normalized preferences.
 */
function parsePlaybackOptions(
	url: URL,
	provider: VideoEmbed['provider'],
	permissions?: string,
	fullscreen?: boolean,
): VideoPlaybackOptions {
	/**
	 * Read a provider parameter explicitly requesting an enabled feature.
	 * @param name Parameter name.
	 * @returns Whether the parameter enables its feature.
	 */
	const enabled = (name: string) => ['1', 'true'].includes(url.searchParams.get(name) ?? '')
	/**
	 * Read a provider parameter explicitly requesting a disabled feature.
	 * @param name Parameter name.
	 * @returns Whether the parameter disables its feature.
	 */
	const disabled = (name: string) => ['0', 'false'].includes(url.searchParams.get(name) ?? '')
	/**
	 * Resolve a playback feature from the iframe's explicit permission policy.
	 * @param name Feature name.
	 * @param fallback State when no directive is supplied.
	 * @returns Whether the feature is permitted.
	 */
	const permitted = (name: string, fallback: boolean) => {
		const directive = permissions
			?.split(';')
			.find((part) => part.trim().split(/\s+/u)[0] === name)
		return directive === undefined ? fallback : !directive.includes("'none'")
	}
	const youtube = provider === 'youtube'
	return {
		allowFullscreen:
			!disabled(youtube ? 'fs' : 'fullscreen') && permitted('fullscreen', fullscreen ?? true),
		showControls: !disabled('controls'),
		loop: enabled('loop'),
		autoplay: enabled('autoplay') && permitted('autoplay', true),
		muted: enabled(youtube ? 'mute' : 'muted'),
	}
}
const youtubeHosts = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtube-nocookie.com',
	'www.youtube-nocookie.com',
])

/** Recognized provider video and the privacy settings encoded in its URL. */
export interface VideoEmbed {
	provider: 'youtube' | 'vimeo'
	videoId: string
	privacyMode: boolean
	options: VideoPlaybackOptions
	hash?: string
}

/**
 * Recognize a YouTube or Vimeo video URL without contacting the provider.
 * @param value Full watch, share, or player URL.
 * @param permissions Optional iframe permission policy.
 * @param fullscreen Whether an imported iframe has its fullscreen attribute.
 * @returns Validated video details, or nothing for unsupported URLs.
 */
export function parseVideoEmbed(
	value: string,
	permissions?: string,
	fullscreen?: boolean,
): VideoEmbed | undefined {
	const parsed = videoUrlSchema.safeParse(value)
	if (!parsed.success) return undefined
	const url = new URL(parsed.data)
	if (url.username || url.password || url.port) return undefined

	if (youtubeHosts.has(url.hostname) || ['youtu.be', 'www.youtu.be'].includes(url.hostname)) {
		const id = ['youtu.be', 'www.youtu.be'].includes(url.hostname)
			? /^\/([^/]+)\/?$/u.exec(url.pathname)?.[1]
			: /^\/watch\/?$/u.test(url.pathname)
				? url.searchParams.get('v')
				: /^\/(?:embed|shorts|live)\/([^/]+)\/?$/u.exec(url.pathname)?.[1]
		const videoId = youtubeIdSchema.safeParse(id)
		return videoId.success
			? {
					provider: 'youtube',
					videoId: videoId.data,
					privacyMode: url.hostname.endsWith('youtube-nocookie.com'),
					options: parsePlaybackOptions(url, 'youtube', permissions, fullscreen),
				}
			: undefined
	}

	const match = ['vimeo.com', 'www.vimeo.com'].includes(url.hostname)
		? /^\/([^/]+)(?:\/([^/]+))?\/?$/u.exec(url.pathname)
		: url.hostname === 'player.vimeo.com'
			? /^\/video\/([^/]+)\/?$/u.exec(url.pathname)
			: null
	const videoId = vimeoIdSchema.safeParse(match?.[1])
	if (!videoId.success) return undefined
	const hash = url.searchParams.get('h') ?? match?.[2]
	if (hash !== undefined && !vimeoHashSchema.safeParse(hash).success) return undefined
	return {
		provider: 'vimeo',
		videoId: videoId.data,
		privacyMode: ['1', 'true'].includes(url.searchParams.get('dnt') ?? ''),
		options: parsePlaybackOptions(url, 'vimeo', permissions, fullscreen),
		...(hash ? { hash } : {}),
	}
}

/**
 * Build a canonical HTTPS player URL with the requested privacy mode.
 * @param video Recognized provider video.
 * @param privacyMode Whether to enable the provider's privacy option.
 * @param options Supported playback preferences.
 * @returns Player URL containing the identity and supported options only.
 */
export function videoEmbedUrl(
	video: VideoEmbed,
	privacyMode = video.privacyMode,
	options = video.options,
): string {
	const youtube = video.provider === 'youtube'
	const url = new URL(
		youtube
			? `https://www.youtube${privacyMode ? '-nocookie' : ''}.com/embed/${video.videoId}`
			: `https://player.vimeo.com/video/${video.videoId}`,
	)
	if (!youtube) {
		if (video.hash) url.searchParams.set('h', video.hash)
		if (privacyMode) url.searchParams.set('dnt', '1')
	}
	if (!options.allowFullscreen) url.searchParams.set(youtube ? 'fs' : 'fullscreen', '0')
	if (!options.showControls) url.searchParams.set('controls', '0')
	if (options.loop) {
		url.searchParams.set('loop', '1')
		if (youtube) url.searchParams.set('playlist', video.videoId)
	}
	if (options.autoplay) url.searchParams.set('autoplay', '1')
	if (options.muted) url.searchParams.set(youtube ? 'mute' : 'muted', '1')
	return url.href
}

/**
 * Build an iframe policy that grants only the configured playback capabilities.
 * @param options Validated playback preferences.
 * @returns The iframe allow attribute.
 */
export function videoEmbedPermissions(options: VideoPlaybackOptions): string {
	return [
		...(options.autoplay ? ['autoplay'] : []),
		options.allowFullscreen ? 'fullscreen' : "fullscreen 'none'",
		'encrypted-media',
	].join('; ')
}
