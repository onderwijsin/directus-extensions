<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { ReferenceApiClient, ReferenceSearchResult } from '../../reference/api'
import type { ReferenceProps, ResolvedReferenceCollectionConfig } from '../../reference/schema'

import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'

import { searchReferences } from '../../reference/api'

const props = defineProps<{
	api: ReferenceApiClient
	collections: ResolvedReferenceCollectionConfig[]
	active: boolean
	disabled?: boolean
	selectedItems?: Pick<ReferenceProps, 'collection' | 'item'>[]
}>()
const emit = defineEmits<{ select: [result: ReferenceSearchResult]; cancel: [] }>()
defineSlots<{ empty?: (props: { query: string }) => unknown }>()
const query = shallowRef<string | null>('')
const normalizedQuery = computed(() => query.value?.trim() ?? '')
const results = shallowRef<ReferenceSearchResult[]>([])
const loading = shallowRef(false)
const activeIndex = shallowRef(0)
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined

function cancelSearch() {
	if (timer) clearTimeout(timer)
	controller?.abort()
	loading.value = false
}

async function runSearch(term: string) {
	const request = new AbortController()
	controller = request
	try {
		const nextResults = await searchReferences(
			props.api,
			props.collections,
			term,
			request.signal,
		)
		if (request.signal.aborted || controller !== request) return
		results.value = nextResults
		activeIndex.value = 0
	} finally {
		if (controller === request) loading.value = false
	}
}

watch([() => props.active, () => props.collections, () => props.disabled, normalizedQuery], () => {
	cancelSearch()
	results.value = []
	if (!props.active) query.value = ''
	if (!props.active || props.disabled || !normalizedQuery.value) return
	loading.value = true
	const term = normalizedQuery.value
	timer = setTimeout(() => void runSearch(term), 200)
})
onBeforeUnmount(cancelSearch)

function isSelected(result: ReferenceSearchResult) {
	return (
		props.selectedItems?.some(
			(item) =>
				item.collection === result.reference.collection &&
				String(item.item) === String(result.reference.item),
		) ?? false
	)
}

function choose(result: ReferenceSearchResult) {
	if (props.disabled || !props.active || isSelected(result)) return
	emit('select', result)
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') emit('cancel')
	if (event.key === 'ArrowDown' && results.value.length) {
		event.preventDefault()
		activeIndex.value = (activeIndex.value + 1) % results.value.length
	}
	if (event.key === 'ArrowUp' && results.value.length) {
		event.preventDefault()
		activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length
	}
	if (event.key === 'Enter') {
		event.preventDefault()
		const result = results.value[activeIndex.value]
		if (result) choose(result)
	}
}
</script>

<template>
	<div class="reference-search">
		<VInput
			v-model="query"
			autofocus
			placeholder="Search items…"
			aria-label="Search items"
			:disabled="disabled"
			@keydown="handleKeydown"
		>
			<template #prepend><VIcon name="search" /></template>
		</VInput>
		<VProgressCircular v-if="loading" indeterminate class="reference-search__loading" />
		<VList v-else-if="results.length" class="reference-search__list">
			<VListItem
				v-for="(result, index) in results"
				:key="`${result.reference.collection}:${result.reference.item}`"
				clickable
				:active="index === activeIndex"
				:disabled="disabled || isSelected(result)"
				@click="choose(result)"
			>
				<VListItemContent>
					<span class="reference-search__result">
						<strong class="reference-search__label">{{
							result.reference.label
						}}</strong>
						<VIcon
							v-if="isSelected(result)"
							name="check"
							aria-label="Already selected"
						/>
						<VChip x-small class="reference-search__collection">{{
							result.reference.collection
						}}</VChip>
					</span>
				</VListItemContent>
			</VListItem>
		</VList>
		<slot v-else name="empty" :query="normalizedQuery">
			<VNotice v-if="normalizedQuery" type="info"
				>No items match “{{ normalizedQuery }}”.</VNotice
			>
		</slot>
	</div>
</template>

<style scoped>
.reference-search {
	display: grid;
	gap: 1rem;
}
.reference-search__loading {
	display: block;
	margin: 2rem auto;
}
.reference-search__list {
	max-height: 22rem;
	overflow-y: auto;
}
.reference-search__result {
	display: inline-flex;
	align-items: center;
	width: 100%;
	min-width: 0;
	gap: 1rem;
	padding-block: 0.5rem;
}
.reference-search__label {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.reference-search__collection {
	flex: 0 0 auto;
}
</style>
