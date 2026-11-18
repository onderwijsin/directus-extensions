import { describe, expect, it } from 'vitest'

import {
	parseVideoEmbed,
	videoEmbedPermissions,
	videoEmbedUrl,
} from '../src/markdown-editor-interface/editor/video-embed'

describe('provider video URLs', () => {
	it.each([
		'https://www.youtube.com/watch?v=M7lc1UVf-VE&list=ignored',
		'https://m.youtube.com/watch?v=M7lc1UVf-VE',
		'https://youtu.be/M7lc1UVf-VE?si=tracking',
		'https://www.youtube.com/shorts/M7lc1UVf-VE',
		'https://www.youtube.com/live/M7lc1UVf-VE',
		'https://www.youtube.com/embed/M7lc1UVf-VE',
	])('recognizes and normalizes %s', (url) => {
		const video = parseVideoEmbed(url)
		expect(video).toMatchObject({
			provider: 'youtube',
			videoId: 'M7lc1UVf-VE',
			privacyMode: false,
		})
		if (!video) throw new Error('Expected a recognized video')
		expect(videoEmbedUrl(video, true)).toBe(
			'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
		)
		expect(parseVideoEmbed(videoEmbedUrl(video, true))?.privacyMode).toBe(true)
		expect(videoEmbedUrl(video, false)).toBe('https://www.youtube.com/embed/M7lc1UVf-VE')
	})

	it.each([
		'https://vimeo.com/76979871/8272103f6e',
		'https://player.vimeo.com/video/76979871?h=8272103f6e&dnt=1',
	])('retains the Vimeo privacy hash in %s', (url) => {
		const video = parseVideoEmbed(url)
		expect(video).toMatchObject({ provider: 'vimeo', videoId: '76979871', hash: '8272103f6e' })
		if (!video) throw new Error('Expected a recognized video')
		expect(videoEmbedUrl(video, true)).toBe(
			'https://player.vimeo.com/video/76979871?h=8272103f6e&dnt=1',
		)
		expect(videoEmbedUrl(video, false)).toBe(
			'https://player.vimeo.com/video/76979871?h=8272103f6e',
		)
	})

	it('supports public Vimeo videos without a privacy hash', () => {
		const video = parseVideoEmbed('https://vimeo.com/76979871')
		if (!video) throw new Error('Expected a recognized video')
		expect(videoEmbedUrl(video, true)).toBe('https://player.vimeo.com/video/76979871?dnt=1')
		expect(videoEmbedUrl(video, false)).toBe('https://player.vimeo.com/video/76979871')
	})

	it.each([
		{
			input: 'https://youtu.be/M7lc1UVf-VE',

			expected:
				'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?fs=0&controls=0&loop=1&playlist=M7lc1UVf-VE&autoplay=1&mute=1',
		},
		{
			input: 'https://vimeo.com/76979871/8272103f6e',

			expected:
				'https://player.vimeo.com/video/76979871?h=8272103f6e&dnt=1&fullscreen=0&controls=0&loop=1&autoplay=1&muted=1',
		},
	])('maps and restores playback preferences for $input', ({ input, expected }) => {
		const video = parseVideoEmbed(input)
		if (!video) throw new Error('Expected a recognized video')
		const options = {
			allowFullscreen: false,
			showControls: false,
			loop: true,
			autoplay: true,
			muted: true,
		}
		const permissions = videoEmbedPermissions(options)
		expect(permissions).toBe("autoplay; fullscreen 'none'; encrypted-media")
		expect(videoEmbedUrl(video, true, options)).toBe(expected)
		expect(parseVideoEmbed(expected, permissions, false)?.options).toEqual(options)
	})

	it('ignores unsupported playback and tracking parameters', () => {
		const video = parseVideoEmbed(
			'https://youtu.be/M7lc1UVf-VE?t=90&start=90&si=tracking&pip=1&cc_load_policy=1&cc_lang_pref=nl',
		)
		if (!video) throw new Error('Expected a recognized video')
		expect(videoEmbedUrl(video, true)).toBe(
			'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
		)
	})

	it.each([
		'not a URL',
		'https://example.com/video.mp4',
		'https://www.youtube.com/playlist?list=123',
		'https://www.youtube.com/watch?v=invalid',
		'https://www.youtube.com.attacker.test/watch?v=M7lc1UVf-VE',
		'https://www.youtube.com@attacker.test/watch?v=M7lc1UVf-VE',
		'https://attacker@www.youtube.com/watch?v=M7lc1UVf-VE',
		'javascript:alert(1)',
		'https://vimeo.com/channels/staffpicks',
		'https://player.vimeo.com/video/not-a-video',
	])('rejects unsupported or unsafe video URL %s', (url) => {
		expect(parseVideoEmbed(url)).toBeUndefined()
	})
})
