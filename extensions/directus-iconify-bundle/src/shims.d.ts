declare module 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

declare module '*.vue' {
	import type { DefineComponent } from 'vue'

	const component: DefineComponent<{}, {}, any>
	export default component
}
