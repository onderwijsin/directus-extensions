import { describe, expect, it } from 'vitest'

import {
	DEFAULT_DOCUMENT_MIME_TYPES,
	classifyMimeType,
	getFileType,
	isAudioMimeType,
	isDocumentMimeType,
	isImageMimeType,
	isVideoMimeType,
} from '../src/index.js'

describe('MIME utilities', () => {
	it('classifies common MIME families case-insensitively', () => {
		expect(classifyMimeType(' AUDIO/MPEG ')).toBe('audio')
		expect(classifyMimeType('video/mp4')).toBe('video')
		expect(classifyMimeType('image/webp')).toBe('image')
		expect(classifyMimeType('application/pdf')).toBe('document')
		expect(getFileType('text/markdown')).toBe('document')
	})

	it('supports application-specific document MIME types', () => {
		expect(classifyMimeType('application/vnd.example.custom')).toBe('unknown')
		expect(
			classifyMimeType('application/vnd.example.custom', {
				documentMimeTypes: ['application/vnd.example.custom'],
			}),
		).toBe('document')
		expect(
			classifyMimeType(' APPLICATION/VND.EXAMPLE.CUSTOM ', {
				documentMimeTypes: [' application/vnd.example.custom '],
			}),
		).toBe('document')
	})

	it('recognizes every default document MIME type', () => {
		for (const mimeType of DEFAULT_DOCUMENT_MIME_TYPES) {
			expect(classifyMimeType(mimeType)).toBe('document')
		}
	})

	it('rejects invalid values and exposes category predicates', () => {
		expect(classifyMimeType(null)).toBe('unknown')
		expect(isAudioMimeType('audio/mpeg')).toBe(true)
		expect(isVideoMimeType('audio/mpeg')).toBe(false)
		expect(isImageMimeType('image/png')).toBe(true)
		expect(isDocumentMimeType('application/octet-stream')).toBe(false)
		expect(classifyMimeType('')).toBe('unknown')
		expect(classifyMimeType(undefined)).toBe('unknown')
		expect(classifyMimeType('application/octet-stream')).toBe('unknown')
	})
})
