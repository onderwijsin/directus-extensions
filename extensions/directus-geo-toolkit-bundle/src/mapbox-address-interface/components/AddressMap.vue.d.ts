import type { DefineComponent } from 'vue'
import type { AddressValue, InterfaceOptions } from '../utils/types'

/** Scoped map presentation contract for tooling without native Vue support. */
declare const component: DefineComponent<{
	options: InterfaceOptions
	token: string
	value: AddressValue | null
}>
export default component
