<script setup lang="ts">
import type { ReferenceApiClient, ReferenceSearchResult } from '../../reference/api'
import type { ResolvedReferenceCollectionConfig } from '../../reference/schema'

import ReferenceSearch from './ReferenceSearch.vue'

const props = defineProps<{
	api: ReferenceApiClient
	collections: ResolvedReferenceCollectionConfig[]
	disabled?: boolean
}>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ select: [result: ReferenceSearchResult] }>()

/**
 * Return the selected snapshot and close the single-item picker.
 * @param result Selected source item.
 * @returns Nothing.
 */
function choose(result: ReferenceSearchResult) {
	if (props.disabled) return
	emit('select', result)
	open.value = false
}
</script>

<template>
	<VDialog v-model="open" persistent>
		<VCard class="reference-picker" role="dialog" aria-label="Insert reference">
			<VCardTitle>Select an item</VCardTitle>
			<VCardText>
				<ReferenceSearch
					:api="api"
					:collections="collections"
					:active="open"
					:disabled="disabled"
					@select="choose"
					@cancel="open = false"
				/>
			</VCardText>
			<VCardActions><VButton secondary @click="open = false">Cancel</VButton></VCardActions>
		</VCard>
	</VDialog>
</template>

<style scoped>
.reference-picker {
	width: min(38rem, calc(100vw - 2rem));
}
</style>
