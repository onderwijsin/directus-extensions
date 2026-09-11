interface DragHandleOffsetOptions {
	isTextblock: boolean
	node: HTMLElement
	rail: HTMLElement
}

/**
 * Parses a computed CSS length, returning zero for keyword values such as `normal`.
 *
 * @param value - Computed CSS value.
 * @returns The numeric pixel value or zero.
 */
function pixels(value: string): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Aligns text-block controls with their first line instead of the complete block height.
 * Container and atomic nodes stay at the top and therefore need no transform.
 *
 * @param options - The hovered node and drag-handle rail measurements.
 * @returns The vertical text-block offset, or `null` when the rail should remain top-aligned.
 */
export function getDragHandleOffset(options: DragHandleOffsetOptions): number | null {
	const { isTextblock, node, rail } = options
	if (!isTextblock) return null

	const style = node.ownerDocument.defaultView?.getComputedStyle(node)
	const nodeHeight = node.getBoundingClientRect().height
	const railHeight = rail.getBoundingClientRect().height || 34
	if (!style) return (nodeHeight - railHeight) / 2

	const fontSize = pixels(style.fontSize)
	const lineHeight = pixels(style.lineHeight) || fontSize * 1.2 || nodeHeight
	const firstLineTop = pixels(style.borderTopWidth) + pixels(style.paddingTop)
	return firstLineTop + (lineHeight - railHeight) / 2
}
