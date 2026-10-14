import type { DefineComponent } from 'vue'
import type { AddressValue, InterfaceProps } from './utils/types'

/** Scoped interface props and Directus input event declaration. */
declare const component: DefineComponent<
	InterfaceProps & { onInput?: (value: AddressValue | null) => void }
>
export default component
