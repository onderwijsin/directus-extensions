<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Picker event handlers are private Vue bindings. */
import { computed, nextTick, onUnmounted, shallowRef, watch } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'

import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { isIconName, useIconCollections } from '@onderwijsin/directus-extension-utils/app/iconify'

import IconImage from './IconImage.vue'

interface Row {
	id: string
	type: 'header' | 'icons'
	name?: string
	icons?: string[]
}

const props = withDefaults(
	defineProps<{
		value?: string | null
		disabled?: boolean
		nonEditable?: boolean
		width?: string
		collections?: string[]
		useProxy?: boolean
		id?: string
		ariaDescribedby?: string
	}>(),
	{ value: null, width: 'half' },
)
const emit = defineEmits<{ input: [value: string | null] }>()
const searchQuery = shallowRef('')
const menuActive = shallowRef(false)
const contentRef = shallowRef<HTMLElement>()
const iconsPerRow = shallowRef(1)
const selectedCollections = computed(() => props.collections ?? [])
const useProxy = computed(() => props.useProxy !== false)
const { groups, loading, error } = useIconCollections(menuActive, selectedCollections, useProxy)
const hasSelectedIcon = computed(() => isIconName(props.value))
let observer: ResizeObserver | undefined

const rows = computed<Row[]>(() => {
	const query = searchQuery.value.trim().toLowerCase()
	const result: Row[] = []
	for (const group of groups.value) {
		const icons = query ? group.icons.filter((icon) => icon.includes(query)) : group.icons
		if (icons.length === 0) continue
		result.push({ id: `header:${group.name}`, type: 'header', name: group.name })
		for (let index = 0; index < icons.length; index += iconsPerRow.value) {
			result.push({
				id: `${group.name}:${index}`,
				type: 'icons',
				icons: icons.slice(index, index + iconsPerRow.value),
			})
		}
	}
	return result
})

function calculateIconsPerRow() {
	const width = contentRef.value?.clientWidth ?? 0
	iconsPerRow.value = Math.max(1, Math.floor((width - 28) / 36))
}

watch(menuActive, async (active) => {
	observer?.disconnect()
	if (!active) return
	await nextTick()
	if (!contentRef.value) return
	observer = new ResizeObserver(calculateIconsPerRow)
	observer.observe(contentRef.value)
	calculateIconsPerRow()
})
onUnmounted(() => observer?.disconnect())

function setIcon(icon: string | null) {
	searchQuery.value = ''
	emit('input', icon)
}

function clearIcon(deactivate: () => void) {
	setIcon(null)
	deactivate()
}

function onClickInput(event: MouseEvent, toggle: () => void) {
	if (event.target instanceof HTMLInputElement) toggle()
}

function onKeydownInput(event: KeyboardEvent, activate: () => void) {
	const systemKey =
		event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.key === 'Tab'
	if (!event.repeat && !systemKey && event.target instanceof HTMLInputElement) activate()
}
</script>

<template>
	<VMenu
		v-model="menuActive"
		v-prevent-focusout="menuActive"
		attached
		:disabled="disabled"
		no-focus-return
	>
		<template #activator="{ active, activate, deactivate, toggle }">
			<VInput
				:id="id"
				:aria-describedby="ariaDescribedby"
				v-model="searchQuery"
				:disabled="disabled"
				:non-editable="nonEditable"
				:placeholder="value || 'Search for an icon'"
				:class="{ 'has-value': value, 'non-editable': nonEditable }"
				:nullable="false"
				@click="onClickInput($event, toggle)"
				@keydown="onKeydownInput($event, activate)"
			>
				<template v-if="hasSelectedIcon" #prepend>
					<IconImage
						class="selected-icon"
						:icon="value ?? ''"
						:use-proxy="useProxy"
						@click="toggle"
					/>
				</template>
				<template #append>
					<div class="item-actions">
						<VRemove
							v-if="value !== null && !nonEditable"
							deselect
							:disabled="disabled"
							@action="clearIcon(deactivate)"
						/>
						<VIcon
							v-else
							clickable
							name="expand_more"
							class="open-indicator"
							:disabled="disabled"
							:class="{ open: active }"
							@click="toggle"
						/>
					</div>
				</template>
			</VInput>
		</template>
		<div ref="contentRef" class="select-icon-popover" :class="width">
			<VNotice v-if="error" type="warning"
				>Some Iconify collections could not be loaded.</VNotice
			>
			<p v-if="loading && rows.length === 0" class="status">Loading icons…</p>
			<p v-else-if="!loading && rows.length === 0" class="status">No icons found.</p>
			<DynamicScroller
				:min-item-size="32"
				:items="rows"
				:buffer="400"
				:prerender="10"
				key-field="id"
				page-mode
			>
				<template #default="{ item }">
					<DynamicScrollerItem :item="item" active>
						<VDivider v-if="item.type === 'header'" inline-title class="icon-row">{{
							item.name
						}}</VDivider>
						<div v-else class="icon-row" :style="{ '--icons-per-row': iconsPerRow }">
							<button
								v-for="icon in item.icons"
								:key="icon"
								type="button"
								class="icon-button"
								:class="{ active: icon === value }"
								:title="icon"
								:aria-label="icon"
								@click="setIcon(icon)"
							>
								<IconImage :icon="icon" :use-proxy="useProxy" />
							</button>
						</div>
					</DynamicScrollerItem>
				</template>
			</DynamicScroller>
		</div>
	</VMenu>
</template>

<style scoped>
.item-actions {
	display: flex;
	align-items: center;
}
.v-input.has-value.non-editable,
.v-input.has-value:not(.disabled) {
	--v-input-placeholder-color: var(--theme--primary);
}
.select-icon-popover {
	padding: 0.4375rem;
}
.icon-row {
	display: grid;
	grid-template-columns: repeat(var(--icons-per-row, 1), 24px);
	gap: 12px;
	justify-content: start;
	padding: 6px;
}
.icon-button {
	appearance: none;
	border: 0;
	background: transparent;
	padding: 0;
	width: 24px;
	height: 24px;
	cursor: pointer;
	border-radius: 3px;
}
.icon-button:hover {
	background: var(--theme--background-accent);
}
.icon-button.active {
	outline: 2px solid var(--theme--primary);
}
.open-indicator {
	transition: transform var(--fast) var(--transition);
}
.open-indicator.open {
	transform: scaleY(-1);
}
.status {
	padding: 8px;
	color: var(--theme--foreground-subdued);
}
</style>
