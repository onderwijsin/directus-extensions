const attributeNamePattern = /[\w-]/u

/** A leading MDC attribute block and the number of source characters it occupies. */
export interface MdcAttributeBlock {
	source: string
	length: number
}

/**
 * Read a balanced MDC attribute block without mistaking quoted braces for its closing delimiter.
 * @param source Markdown beginning at the optional attribute block.
 * @returns The inner attribute source and consumed length, or undefined for no valid block.
 */
export function readMdcAttributeBlock(source: string): MdcAttributeBlock | undefined {
	if (!source.startsWith('{')) return undefined
	let quote: '"' | "'" | undefined
	let escaped = false

	for (let index = 1; index < source.length; index += 1) {
		const character = source[index]
		if (character === '\n' || character === '\r') return undefined
		if (escaped) {
			escaped = false
			continue
		}
		if (character === '\\' && quote) {
			escaped = true
			continue
		}
		if (quote) {
			if (character === quote) quote = undefined
			continue
		}
		if (character === '"' || character === "'") {
			quote = character
			continue
		}
		if (character === '}') {
			return { source: source.slice(1, index), length: index + 1 }
		}
	}

	return undefined
}

interface QuotedValue {
	value: string
	nextIndex: number
}

/**
 * Decode a one-character escape emitted by JSON string serialization.
 * @param character Character following the escape marker.
 * @returns The decoded character.
 */
function decodeEscape(character: string): string {
	if (character === 'n') return '\n'
	if (character === 'r') return '\r'
	if (character === 't') return '\t'
	if (character === 'b') return '\b'
	if (character === 'f') return '\f'
	return character
}

/**
 * Read one quoted attribute value, including escaped delimiters and backslashes.
 * @param source Attribute source containing the quoted value.
 * @param start Index of the opening quote.
 * @param quote Quote delimiter used by the value.
 * @returns The decoded value and next source position, or undefined for an incomplete value.
 */
function readQuotedValue(source: string, start: number, quote: '"' | "'"): QuotedValue | undefined {
	let value = ''
	for (let index = start + 1; index < source.length; index += 1) {
		const character = source[index]
		if (character === quote) return { value, nextIndex: index + 1 }
		if (character === '\\') {
			const escaped = source[index + 1]
			if (escaped === undefined) return undefined
			if (escaped === 'u') {
				const codePoint = source.slice(index + 2, index + 6)
				if (/^[\dA-Fa-f]{4}$/u.test(codePoint)) {
					value += String.fromCharCode(Number.parseInt(codePoint, 16))
					index += 5
					continue
				}
			}
			value += decodeEscape(escaped)
			index += 1
			continue
		}
		value += character
	}
	return undefined
}

/**
 * Parse a dynamic MDC binding while retaining malformed external values as strings.
 * @param value Decoded binding value.
 * @returns Its JSON value, or the original string when it is not valid JSON.
 */
function parseDynamicValue(value: string): unknown {
	try {
		return JSON.parse(value)
	} catch {
		return value
	}
}

/**
 * Parse MDC attributes, including shorthand booleans and JSON-backed dynamic bindings.
 * @param source Attribute content without its surrounding braces.
 * @returns Component properties keyed by their public property names.
 */
export function parseMdcAttributes(source: string | undefined): Record<string, unknown> {
	if (!source?.trim()) return {}
	const attributes: Record<string, unknown> = {}
	let index = 0

	while (index < source.length) {
		while (/\s/u.test(source[index] ?? '')) index += 1
		const dynamic = source[index] === ':'
		if (dynamic) index += 1

		const nameStart = index
		while (attributeNamePattern.test(source[index] ?? '')) index += 1
		const name = source.slice(nameStart, index)
		if (!name) {
			index += 1
			continue
		}

		while (/\s/u.test(source[index] ?? '')) index += 1
		if (source[index] !== '=') {
			attributes[name] = true
			continue
		}

		index += 1
		while (/\s/u.test(source[index] ?? '')) index += 1
		const quote = source[index]
		let value: string
		if (quote === '"' || quote === "'") {
			const quoted = readQuotedValue(source, index, quote)
			if (!quoted) break
			value = quoted.value
			index = quoted.nextIndex
		} else {
			const valueStart = index
			while (index < source.length && !/\s/u.test(source[index] ?? '')) index += 1
			value = source.slice(valueStart, index)
		}

		attributes[name] = dynamic ? parseDynamicValue(value) : value
	}

	return attributes
}

/**
 * Encode a string as a quoted MDC attribute value.
 * @param value String property value.
 * @returns A JSON-compatible quoted string.
 */
function serializeString(value: string): string {
	return JSON.stringify(value)
}

/**
 * Convert a structured value to JSON without passing an undefined result to the serializer.
 * @param value Dynamic property value.
 * @returns Its JSON representation, or a string representation for non-JSON values.
 */
function serializeDynamicValue(value: unknown): string {
	return JSON.stringify(value) ?? String(value)
}

/**
 * Serialize component properties using MDC shorthand and dynamic JSON bindings where needed.
 * @param attributes Component properties to serialize.
 * @returns A complete MDC attribute block, or an empty string when no properties are present.
 */
export function serializeMdcAttributes(attributes: Record<string, unknown> | undefined): string {
	if (!attributes) return ''
	const entries = Object.entries(attributes).filter(
		([, value]) => value !== undefined && value !== null,
	)
	if (entries.length === 0) return ''

	const serialized = entries.map(([name, value]) => {
		if (value === true) return name
		if (typeof value === 'string') return `${name}=${serializeString(value)}`
		return `:${name}=${serializeString(serializeDynamicValue(value))}`
	})

	return `{${serialized.join(' ')}}`
}
