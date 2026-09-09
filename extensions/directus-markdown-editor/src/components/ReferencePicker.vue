<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { ReferenceApiClient, ReferenceSearchResult } from '../reference/api'
import type { ResolvedReferenceCollectionConfig } from '../reference/schema'

import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'

import { searchReferences } from '../reference/api'

const props = defineProps<{
	api: ReferenceApiClient
	collections: ResolvedReferenceCollectionConfig[]
	disabled?: boolean
}>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ select: [result: ReferenceSearchResult] }>()
const query = shallowRef<string | null>('')
const normalizedQuery = computed(() => query.value?.trim() ?? '')
const results = shallowRef<ReferenceSearchResult[]>([])
const loading = shallowRef(false)
const activeIndex = shallowRef(0)
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined

function resetSearch() {
	if (timer) clearTimeout(timer)
	controller?.abort()
	query.value = ''
	results.value = []
	loading.value = false
	activeIndex.value = 0
}

async function runSearch(term: string) {
	controller?.abort()
	const request = new AbortController()
	controller = request
	loading.value = true
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

watch(open, (isOpen) => {
	if (!isOpen) resetSearch()
})

watch(normalizedQuery, (term) => {
	if (timer) clearTimeout(timer)
	controller?.abort()
	results.value = []
	if (!open.value || !term) {
		loading.value = false
		return
	}
	loading.value = true
	timer = setTimeout(() => void runSearch(term), 200)
})

onBeforeUnmount(resetSearch)

function choose(result: ReferenceSearchResult) {
	if (props.disabled) return
	emit('select', result)
	open.value = false
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		open.value = false
		return
	}
	if (event.key === 'ArrowDown' && results.value.length) {
		event.preventDefault()
		activeIndex.value = (activeIndex.value + 1) % results.value.length
	}
	if (event.key === 'ArrowUp' && results.value.length) {
		event.preventDefault()
		activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length
	}
	if (event.key === 'Enter' && results.value[activeIndex.value]) {
		event.preventDefault()
		const result = results.value[activeIndex.value]
		if (result) choose(result)
	}
}
</script>

<template>
	<VDialog v-model="open" persistent>
		<VCard class="reference-picker" role="dialog" aria-label="Insert reference">
			<VCardTitle>Select an item</VCardTitle>
			<VCardText>
				<VInput
					v-model="query"
					autofocus
					placeholder="Search items…"
					aria-label="Search items"
					:disabled="disabled"
					@keydown="handleKeydown"
					><template #prepend><VIcon name="search" /></template
				></VInput>
				<VProgressCircular v-if="loading" indeterminate class="reference-picker__loading" />
				<VNotice v-else-if="normalizedQuery && results.length === 0" type="info"
					>No accessible items match “{{ normalizedQuery }}”.</VNotice
				>
				<VList v-else-if="results.length" class="reference-picker__list">
					<VListItem
						v-for="(result, index) in results"
						:key="`${result.reference.collection}:${result.reference.item}`"
						clickable
						:active="index === activeIndex"
						:disabled="disabled"
						@click="choose(result)"
					>
						<VListItemContent>
							<span class="reference-picker__result">
								<strong class="reference-picker__label">{{
									result.reference.label
								}}</strong>
								<VChip x-small class="reference-picker__collection">{{
									result.reference.collection
								}}</VChip>
							</span>
						</VListItemContent>
					</VListItem>
				</VList>
			</VCardText>
			<VCardActions><VButton secondary @click="open = false">Cancel</VButton></VCardActions>
		</VCard>
	</VDialog>
</template>

<style scoped>
.reference-picker {
	width: min(38rem, calc(100vw - 2rem));
}
.reference-picker__loading {
	display: block;
	margin: 2rem auto;
}
.reference-picker :deep(.v-input) + :deep(.v-notice),
.reference-picker :deep(.v-input) + .reference-picker__loading,
.reference-picker :deep(.v-input) + .reference-picker__list {
	margin-block-start: 1rem;
}
.reference-picker__list {
	max-height: 22rem;
	overflow-y: auto;
}
.reference-picker__result {
	display: inline-flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	min-width: 0;
	gap: 1rem;
	padding-block: 0.5rem;
}
.reference-picker__label {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.reference-picker__collection {
	flex: 0 0 auto;
}
</style>
