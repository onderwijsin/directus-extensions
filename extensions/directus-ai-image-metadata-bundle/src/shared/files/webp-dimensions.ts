/**
 * Reads the canvas of a Directus-produced WebP without decoding its pixels.
 * @param image - Complete WebP bytes, including the RIFF container.
 * @returns Positive canvas dimensions, or undefined for an unexpected header.
 */
export function readWebpDimensions(image: Buffer) {
	if (
		image.length < 25 ||
		image.toString('ascii', 0, 4) !== 'RIFF' ||
		image.toString('ascii', 8, 12) !== 'WEBP' ||
		image.readUInt32LE(4) + 8 !== image.length
	)
		return undefined
	const chunk = image.toString('ascii', 12, 16)
	const chunkSize = image.readUInt32LE(16)
	if (20 + chunkSize > image.length) return undefined
	if (chunk === 'VP8X' && chunkSize === 10 && image.length >= 30) {
		// Animated derivatives do not provide the single oriented frame required here.
		if ((image.readUInt8(20) & 2) !== 0) return undefined
		return { width: image.readUIntLE(24, 3) + 1, height: image.readUIntLE(27, 3) + 1 }
	}
	if (chunk === 'VP8L' && chunkSize >= 5 && image.readUInt8(20) === 47) {
		const bits = image.readUInt32LE(21)
		return { width: (bits & 16383) + 1, height: ((bits >>> 14) & 16383) + 1 }
	}
	if (
		chunk === 'VP8 ' &&
		chunkSize >= 10 &&
		image.length >= 30 &&
		(image.readUInt8(20) & 1) === 0 &&
		image.subarray(23, 26).equals(Buffer.from([157, 1, 42]))
	) {
		const width = image.readUInt16LE(26) & 16383
		const height = image.readUInt16LE(28) & 16383
		if (width && height) return { width, height }
	}
	return undefined
}
