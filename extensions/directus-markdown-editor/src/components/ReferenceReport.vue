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
				<div v-if="occurrences.length" class="reference-report__attention">
					<p>Some references in this item need attention.</p>
					<div class="reference-report__table-wrap">
						<table class="reference-report__table">
							<thead>
								<tr>
									<th scope="col">Item</th>
									<th scope="col">Collection</th>
									<th scope="col">Status</th>
									<th scope="col">
										<span class="visually-hidden">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="occurrence in occurrences" :key="occurrence.key">
									<td>
										<strong>{{ occurrenceLabel(occurrence) }}</strong>
									</td>
									<td>{{ occurrenceCollection(occurrence) }}</td>
									<td>
										<span>{{ statusLabel(occurrence.state) }}</span>
										<small v-if="occurrence.state === 'not_available'"
											>This item may have been removed or you may no longer
											have access to it.</small
										>
									</td>
									<td>
										<div class="reference-report__actions">
											<VButton
												v-if="occurrence.state === 'outdated'"
												x-small
												icon
												secondary
												:disabled="disabled"
												tooltip="Refresh reference"
												aria-label="Refresh reference"
												@click="emit('refresh', occurrence)"
												><VIcon name="sync"
											/></VButton>
											<VButton
												v-if="occurrence.state !== 'verification_error'"
												x-small
												icon
												secondary
												:disabled="disabled"
												tooltip="Replace reference"
												aria-label="Replace reference"
												@click="emit('replace', occurrence)"
												><VIcon name="find_replace"
											/></VButton>
											<VButton
												v-if="occurrence.state !== 'verification_error'"
												x-small
												icon
												secondary
												:disabled="disabled"
												tooltip="Remove reference"
												aria-label="Remove reference"
												@click="emit('remove', occurrence)"
												><VIcon name="delete"
											/></VButton>
											<VButton
												v-else
												x-small
												icon
												secondary
												tooltip="Retry verification"
												aria-label="Retry verification"
												@click="emit('retry')"
												><VIcon name="refresh"
											/></VButton>
										</div>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
				<div v-else class="reference-report__success" role="status">
					<VIcon name="check_circle" large />
					<strong>All references are resolved</strong>
					<p>Close this report to continue editing the item.</p>
				</div>
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
	width: min(64rem, calc(100vw - 2rem));
}
.reference-report__attention > p {
	margin-block: 0 1rem;
}
.reference-report__table-wrap {
	overflow-x: auto;
}
.reference-report__table {
	width: 100%;
	border-collapse: collapse;
	text-align: start;
}
.reference-report__table th,
.reference-report__table td {
	padding: 0.75rem;
	border-block-end: 1px solid var(--theme--border-color, #d3dce3);
	text-align: start;
	vertical-align: middle;
}
.reference-report__table th {
	color: var(--theme--foreground-subdued, #8b98a5);
	font-size: 0.75rem;
	font-weight: 600;
}
.reference-report__table td:last-child,
.reference-report__table th:last-child {
	width: 1%;
	text-align: end;
	white-space: nowrap;
}
.reference-report__table small {
	display: block;
	max-width: 30rem;
	color: var(--theme--foreground-subdued, #8b98a5);
}
.reference-report__actions {
	display: flex;
	align-items: center;
	justify-content: end;
	gap: 0.375rem;
}
.reference-report__success {
	display: grid;
	place-items: center;
	gap: 0.5rem;
	min-height: 16rem;
	padding: 2rem;
	text-align: center;
}
.reference-report__success :deep(.v-icon) {
	color: var(--theme--success, #2ecda7);
}
.reference-report__success p {
	margin: 0;
	color: var(--theme--foreground-subdued, #8b98a5);
}
.visually-hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>
