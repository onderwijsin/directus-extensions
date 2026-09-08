<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { ReferenceOccurrence } from '../reference/editor'

const props = defineProps<{ occurrences: ReferenceOccurrence[]; disabled?: boolean }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{
	refresh: [occurrence: ReferenceOccurrence]
	refreshAll: []
	replace: [occurrence: ReferenceOccurrence]
	remove: [occurrence: ReferenceOccurrence]
	retry: []
}>()

function statusLabel(state: ReferenceOccurrence['state']) {
	if (state === 'not_available') return 'Source not available'
	if (state === 'verification_error') return 'Could not verify'
	if (state === 'unconfigured') return 'Collection not configured'
	if (state === 'outdated') return 'Snapshot outdated'
	return 'Malformed reference'
}

function rawProperty(
	occurrence: ReferenceOccurrence,
	property: string,
): string | number | undefined {
	if (!occurrence.rawProps || typeof occurrence.rawProps !== 'object') return undefined
	const value = Reflect.get(occurrence.rawProps, property)
	return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function occurrenceLabel(occurrence: ReferenceOccurrence) {
	return (
		occurrence.reference?.label ??
		rawProperty(occurrence, 'label') ??
		rawProperty(occurrence, 'item') ??
		'Invalid reference'
	)
}

function occurrenceCollection(occurrence: ReferenceOccurrence) {
	return (
		occurrence.reference?.collection ??
		rawProperty(occurrence, 'collection') ??
		'Unknown collection'
	)
}
</script>

<template>
	<VDialog v-model="open" persistent>
		<VCard class="reference-report" role="dialog" aria-label="Reference report">
			<VCardTitle>Reference report</VCardTitle>
			<VCardText>
				<p>Some references in this document need attention.</p>
				<VList>
					<VListItem v-for="occurrence in occurrences" :key="occurrence.key">
						<VListItemContent class="reference-report__row">
							<div>
								<strong>{{ occurrenceLabel(occurrence) }}</strong>
								<div>
									{{ occurrenceCollection(occurrence) }} ·
									{{ statusLabel(occurrence.state) }}
								</div>
								<small v-if="occurrence.state === 'not_available'"
									>This source may have been removed or you may no longer have
									access to it.</small
								>
							</div>
							<div class="reference-report__actions">
								<VButton
									v-if="occurrence.state === 'outdated'"
									small
									secondary
									:disabled="disabled"
									@click="emit('refresh', occurrence)"
									>Refresh</VButton
								>
								<VButton
									v-if="occurrence.state !== 'verification_error'"
									small
									secondary
									:disabled="disabled"
									@click="emit('replace', occurrence)"
									>Replace</VButton
								>
								<VButton
									v-if="occurrence.state !== 'verification_error'"
									small
									secondary
									:disabled="disabled"
									@click="emit('remove', occurrence)"
									>Remove</VButton
								>
								<VButton v-else small secondary @click="emit('retry')"
									>Retry</VButton
								>
							</div>
						</VListItemContent>
					</VListItem>
				</VList>
			</VCardText>
			<VCardActions>
				<VButton
					v-if="occurrences.some((entry) => entry.state === 'outdated')"
					secondary
					@click="emit('refreshAll')"
					>Refresh all outdated</VButton
				>
				<VButton @click="open = false">Close</VButton>
			</VCardActions>
		</VCard>
	</VDialog>
</template>

<style scoped>
.reference-report {
	width: min(48rem, calc(100vw - 2rem));
}
.reference-report__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding-block: 0.5rem;
}
.reference-report__row div div,
.reference-report__row small {
	display: block;
	color: var(--theme--foreground-subdued, #8b98a5);
}
.reference-report__actions {
	display: flex;
	gap: 0.375rem;
}
</style>
