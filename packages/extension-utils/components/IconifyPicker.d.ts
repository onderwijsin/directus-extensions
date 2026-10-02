import type { DefineComponent } from 'vue'

declare const IconifyPicker: DefineComponent<{
	value?: string | null
	disabled?: boolean
	nonEditable?: boolean
	width?: string
	collections?: string[]
	useProxy?: boolean
	id?: string
	ariaDescribedby?: string
}>

export default IconifyPicker
