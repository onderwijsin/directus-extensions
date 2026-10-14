import type { z } from 'zod'
import type { addressComponentsSchema } from '../../shared/address.schema'
import type { mapboxAddressValueSchema } from './address.schema'
import type { interfaceOptionsSchema } from './options.schema'
import type { mapboxFeatureSchema } from './response.schema'

export type AddressValue = z.infer<typeof mapboxAddressValueSchema>
export type AddressComponents = z.infer<typeof addressComponentsSchema>
export type ComponentName = keyof AddressComponents
export type InterfaceOptions = z.infer<typeof interfaceOptionsSchema>
export type MapboxFeature = z.infer<typeof mapboxFeatureSchema>

/** Directus editor props combined with optional, schema-derived interface settings. */
export interface InterfaceProps extends Partial<InterfaceOptions> {
	value?: unknown
	disabled?: boolean
	nonEditable?: boolean
	field?: string
}
