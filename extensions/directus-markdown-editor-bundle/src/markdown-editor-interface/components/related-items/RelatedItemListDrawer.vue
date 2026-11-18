<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { ReferenceApiClient, ReferenceSearchResult } from '../../reference/api'
import type { ResolvedReferenceCollectionConfig } from '../../reference/schema'
import type { RelatedItem } from '../../related-items/schema'

import { shallowRef, watch } from 'vue'

import Draggable from 'vuedraggable'

import { relatedItemKey } from '../../related-items/schema'
import ReferenceSearch from '../references/ReferenceSearch.vue'

const props = defineProps<{
	api: ReferenceApiClient
	collections: ResolvedReferenceCollectionConfig[]
	items: RelatedItem[]
	errors: string[]
	invalid?: boolean
	disabled?: boolean
}>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ apply: [items: RelatedItem[]] }>()
const draft = shallowRef<RelatedItem[]>([])

watch(
	open,
	(value) => {
		if (value) draft.value = [...props.items]
	},
	{ immediate: true },
)

function add(result: ReferenceSearchResult) {
	if (props.disabled || props.invalid) return
	const item = result.reference
	if (draft.value.some((entry) => relatedItemKey(entry) === relatedItemKey(item))) return
	draft.value = [...draft.value, item]
}

function reorder(items: RelatedItem[]) {
	if (!props.disabled && !props.invalid) draft.value = items
}

function remove(index: number) {
	if (!props.disabled && !props.invalid)
		draft.value = draft.value.filter((_, current) => current !== index)
}

function apply() {
	if (props.disabled || props.invalid || !draft.value.length) return
	emit('apply', draft.value)
}
</script>

<template>
	<VDrawer
		:model-value="open"
		title="Related items"
		icon="account_tree"
		@update:model-value="open = $event"
		@cancel="open = false"
		@apply="apply"
	>
		<div class="related-items-drawer">
			<VNotice v-if="invalid" type="danger"
				>This list contains invalid item data. Repair it in the Markdown source before
				editing its items.</VNotice
			>
			<VNotice v-for="error in errors" :key="error" type="warning">{{ error }}</VNotice>
			<ReferenceSearch
				:api="api"
				:collections="collections"
				:active="open"
				:selected-items="draft"
				:disabled="disabled || invalid"
				@select="add"
				@cancel="open = false"
			>
				<template #empty="{ query }">
					<VInfo
						v-if="!invalid && (query || !draft.length)"
						:icon="query ? 'search_off' : 'playlist_add'"
						:title="query ? 'No matching items' : 'No related items selected'"
						class="related-items-drawer__empty"
						role="status"
					>
						<template v-if="query"
							>No items match “{{ query }}”. Try another search term.</template
						>
						<template v-else>Search above to add items.</template>
					</VInfo>
				</template>
			</ReferenceSearch>
			<section
				v-if="draft.length"
				aria-label="Selected related items"
				class="related-items-drawer__selection"
			>
				<h3>Selected items ({{ draft.length }})</h3>
				<Draggable
					:model-value="draft"
					:item-key="relatedItemKey"
					:disabled="disabled || invalid"
					handle=".related-items-drawer__handle"
					:force-fallback="true"
					class="related-items-drawer__items"
					@update:model-value="reorder"
				>
					<template #item="{ element, index }">
						<div class="related-items-drawer__item">
							<button
								type="button"
								class="related-items-drawer__handle"
								:disabled="disabled || invalid"
								:aria-label="`Drag item ${index + 1} to reorder`"
							>
								<VIcon name="drag_indicator" />
							</button>
							<div class="related-items-drawer__identity">
								<strong>{{ element.label }}</strong
								><span>{{ element.collection }} · {{ element.item }}</span>
							</div>
							<VButton
								icon
								small
								ghost
								:disabled="disabled || invalid"
								:aria-label="`Remove item ${index + 1}`"
								@click="remove(index)"
								><VIcon name="close"
							/></VButton>
						</div>
					</template>
				</Draggable>
			</section>
		</div>
		<template #actions:primary
			><VButton small :disabled="disabled || invalid || !draft.length" @click="apply"
				>Apply</VButton
			></template
		>
	</VDrawer>
</template>

<style scoped>
.related-items-drawer {
	display: grid;
	gap: 1.5rem;
	padding: var(--content-padding, 1.125rem);
}
.related-items-drawer__empty {
	padding-block-start: 1.5rem;
}
.related-items-drawer__empty :deep(.icon) {
	inline-size: 3.5rem;
	block-size: 3.5rem;
}
.related-items-drawer__empty :deep(.icon .v-icon) {
	--v-icon-size: 1.5rem;
}
.related-items-drawer__selection,
.related-items-drawer__items {
	display: grid;
	gap: 0.75rem;
}
.related-items-drawer__item {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.5rem;
	border: 1px solid var(--theme--border-color, #d3dce3);
	border-radius: var(--theme--border-radius, 0.25rem);
}
.related-items-drawer__identity {
	display: grid;
	flex: 1;
	min-width: 0;
	gap: 0.125rem;
}
.related-items-drawer__identity strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.related-items-drawer__identity span {
	color: var(--theme--foreground-subdued, #8b98a5);
	font-size: 0.75rem;
}
.related-items-drawer__handle {
	display: flex;
	margin-inline-end: 0.375rem;
	border: 0;
	background: transparent;
	color: var(--theme--foreground-subdued, #8b98a5);
	cursor: grab;
}
</style>
