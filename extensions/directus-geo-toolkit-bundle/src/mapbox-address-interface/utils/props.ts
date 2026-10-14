import type { Prop } from 'vue'
import type { InterfaceOptions } from './types'

import { fromEntries } from '@onderwijsin/directus-extension-utils'

import { interfaceOptionsSchema } from './options.schema'

const rawValue: Prop<unknown> = { type: null }

/** Declare raw option props from the schema; their values are validated in the component. */
export const interfaceProps = {
	value: rawValue,
	disabled: Boolean,
	nonEditable: Boolean,
	field: String,
	...fromEntries(
		interfaceOptionsSchema
			.keyof()
			.options.map((key): [keyof InterfaceOptions, Prop<unknown>] => [key, rawValue]),
	),
}
