<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { ComponentOccurrence } from '../component-meta/freshness'

defineProps<{ occurrences: ComponentOccurrence[]; disabled?: boolean }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{
	edit: [occurrence: ComponentOccurrence]
	remove: [occurrence: ComponentOccurrence]
}>()

/**
 * Resolve the concise report status.
 * @param occurrence Component occurrence needing attention.
 * @returns User-facing status label.
 */
function statusLabel(occurrence: ComponentOccurrence) {
	if (occurrence.state === 'missing') return 'Unsupported'
	if (occurrence.state === 'deprecated') return 'Deprecated'
	return 'Outdated'
}

/**
 * Summarize metadata differences for a component occurrence.
 * @param occurrence Component occurrence needing attention.
 * @returns User-facing change summary.
 */
function changes(occurrence: ComponentOccurrence) {
	if (occurrence.state === 'missing') return ['Component is absent from current metadata.']
	if (occurrence.state === 'deprecated') {
		return [occurrence.deprecation ?? 'Replace or remove this component as soon as possible.']
	}
	const values = []
	if (occurrence.missingProps.length)
		values.push(`New properties: ${occurrence.missingProps.join(', ')}`)
	if (occurrence.emptyRequiredProps.length)
		values.push(`Required values missing: ${occurrence.emptyRequiredProps.join(', ')}`)
	if (occurrence.removedProps.length)
		values.push(`Removed properties: ${occurrence.removedProps.join(', ')}`)
	if (occurrence.missingSlots.length)
		values.push(`New slots: ${occurrence.missingSlots.join(', ')}`)
	if (occurrence.removedSlots.length)
		values.push(`Removed slots: ${occurrence.removedSlots.join(', ')}`)
	if (occurrence.deprecation) values.push(`Deprecated: ${occurrence.deprecation}`)
	return values
}

/**
 * Resolve report chip severity styling.
 * @param occurrence Component occurrence needing attention.
 * @returns Warning or danger chip class.
 */
function statusClass(occurrence: ComponentOccurrence) {
	return occurrence.state === 'missing'
		? 'component-props-report__status--danger'
		: 'component-props-report__status--warning'
}
</script>

<template>
	<VDialog v-model="open" persistent>
		<VCard class="component-props-report" role="dialog" aria-label="Component report">
			<VCardTitle>Component report</VCardTitle>
			<VCardText class="component-props-report__body">
				<p v-if="occurrences.length">
					These components need attention because their metadata changed or they are
					deprecated.
				</p>
				<table v-if="occurrences.length">
					<thead>
						<tr>
							<th>Component</th>
							<th>Changes</th>
							<th><span class="visually-hidden">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="occurrence in occurrences" :key="occurrence.key">
							<td>
								<strong>{{ occurrence.name }}</strong>
							</td>
							<td>
								<VChip
									x-small
									class="component-props-report__status"
									:class="statusClass(occurrence)"
									>{{ statusLabel(occurrence) }}</VChip
								>
								<ul class="component-props-report__changes">
									<li v-for="change in changes(occurrence)" :key="change">
										{{ change }}
									</li>
								</ul>
							</td>
							<td>
								<VButton
									v-if="occurrence.state !== 'missing'"
									x-small
									secondary
									:disabled="disabled"
									@click="emit('edit', occurrence)"
									>Review</VButton
								>
								<VButton
									v-else
									x-small
									secondary
									:disabled="disabled"
									@click="emit('remove', occurrence)"
									>Delete component</VButton
								>
							</td>
						</tr>
					</tbody>
				</table>
				<div v-else class="component-props-report__success" role="status">
					<VIcon name="check_circle" large />
					<strong>All component properties are current</strong>
				</div>
			</VCardText>
			<VCardActions><VButton @click="open = false">Close</VButton></VCardActions>
		</VCard>
	</VDialog>
</template>

<style scoped>
.component-props-report {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr) auto;
	width: calc(100vw - 2rem);
	max-width: calc(100vw - 2rem);
	max-height: min(90dvh, 50rem);
	overflow: hidden;
}
@media (min-width: 769px) {
	.component-props-report {
		width: 75vw !important;
		max-width: 75vw !important;
	}
}
.component-props-report__body {
	min-height: 0;
	overflow-y: auto;
}
.component-props-report table {
	width: 100%;
	border-collapse: collapse;
}
.component-props-report th,
.component-props-report td {
	padding: 0.75rem;
	border-block-end: 1px solid var(--theme--border-color, #d3dce3);
	text-align: start;
}
.component-props-report td:last-child,
.component-props-report th:last-child {
	text-align: end;
}
.component-props-report__status {
	margin-block-end: 0.375rem;
	font-size: 0.6875rem;
	font-weight: 600;
}
.component-props-report__status--warning {
	background: color-mix(in srgb, var(--theme--warning, #f2c94c) 18%, transparent);
	color: var(--theme--warning-foreground, #7a5b00);
}
.component-props-report__status--danger {
	background: color-mix(in srgb, var(--theme--danger, #cc3a3a) 12%, transparent);
	color: var(--theme--danger, #cc3a3a);
}
.component-props-report__changes {
	display: grid;
	gap: 0.25rem;
	margin: 0;
	padding-inline-start: 1.25rem;
}
.component-props-report__success {
	display: grid;
	place-items: center;
	gap: 0.75rem;
	padding: 2rem;
	color: var(--theme--success, #2ecda7);
}
</style>
