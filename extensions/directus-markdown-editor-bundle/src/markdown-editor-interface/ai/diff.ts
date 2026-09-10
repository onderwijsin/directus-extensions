export interface MarkdownDiffPart {
	value: string
	kind: 'unchanged' | 'added' | 'removed'
}

/**
 * Produce a compact word-and-whitespace diff suitable for transient Markdown comparison UI.
 * @param base Current Markdown.
 * @param incoming Proposed Markdown.
 * @returns Separate current and incoming diff parts.
 */
export function diffMarkdown(
	base: string,
	incoming: string,
): { base: MarkdownDiffPart[]; incoming: MarkdownDiffPart[] } {
	const left = base.match(/\s+|[^\s]+/g) ?? []
	const right = incoming.match(/\s+|[^\s]+/g) ?? []
	const lengths = Array.from({ length: left.length + 1 }, () =>
		Array<number>(right.length + 1).fill(0),
	)
	/**
	 * Read one dynamic-programming cell without leaking sparse-array semantics.
	 * @param index Base token index.
	 * @param other Incoming token index.
	 * @returns Stored subsequence length or zero outside the matrix.
	 */
	const lengthAt = (index: number, other: number): number => lengths[index]?.[other] ?? 0
	for (let index = left.length - 1; index >= 0; index -= 1)
		for (let other = right.length - 1; other >= 0; other -= 1) {
			const row = lengths[index]
			if (row)
				row[other] =
					left[index] === right[other]
						? lengthAt(index + 1, other + 1) + 1
						: Math.max(lengthAt(index + 1, other), lengthAt(index, other + 1))
		}
	const baseParts: MarkdownDiffPart[] = []
	const incomingParts: MarkdownDiffPart[] = []
	let index = 0
	let other = 0
	while (index < left.length || other < right.length) {
		if (left[index] === right[other]) {
			baseParts.push({ value: left[index] ?? '', kind: 'unchanged' })
			incomingParts.push({ value: right[other] ?? '', kind: 'unchanged' })
			index += 1
			other += 1
		} else if (
			other < right.length &&
			(index >= left.length || lengthAt(index, other + 1) >= lengthAt(index + 1, other))
		) {
			incomingParts.push({ value: right[other] ?? '', kind: 'added' })
			other += 1
		} else {
			baseParts.push({ value: left[index] ?? '', kind: 'removed' })
			index += 1
		}
	}
	return { base: merge(baseParts), incoming: merge(incomingParts) }
}

/**
 *
 */
/**
 * Coalesce adjacent parts with identical visual semantics.
 * @param parts Token-level diff parts.
 * @returns Coalesced parts.
 */
function merge(parts: MarkdownDiffPart[]): MarkdownDiffPart[] {
	return parts.reduce<MarkdownDiffPart[]>((result, part) => {
		const previous = result.at(-1)
		if (previous?.kind === part.kind) previous.value += part.value
		else result.push({ ...part })
		return result
	}, [])
}
