/**
 * Makes object properties optional recursively while preserving functions and primitive values.
 * Arrays are transformed element-by-element.
 */
export type PartialNested<T> = T extends (...args: never[]) => unknown
	? T
	: T extends new (...args: never[]) => unknown
		? T
		: T extends (infer U)[]
			? PartialNested<U>[]
			: T extends object
				? { [K in keyof T]?: PartialNested<T[K]> }
				: T
