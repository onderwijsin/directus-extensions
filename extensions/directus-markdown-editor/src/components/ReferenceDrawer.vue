<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { ReferenceProps } from '../reference/schema'

import { computed, reactive, watch } from 'vue'

import { useExtensions } from '@directus/extensions-sdk'

const props = defineProps<{
	reference?: ReferenceProps
	disabled?: boolean
}>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{
	apply: [presentation: { text?: string; icon?: string }]
	changeSource: []
	refreshSource: []
	remove: []
}>()
const form = reactive({ text: '', icon: '' })
const { interfaces } = useExtensions()
const iconInterface = computed(
	() => interfaces.value.find((candidate) => candidate.id === 'select-icon')?.component,
)
const sourceData = computed(() => Object.entries(props.reference?.data ?? {}))

watch(
	() => [open.value, props.reference],
	() => {
		if (!open.value) return
		form.text = props.reference?.text ?? ''
		form.icon = props.reference?.icon ?? ''
	},
)

function apply() {
	const text = form.text.trim() ? form.text : undefined
	const icon = form.icon.trim() ? form.icon : undefined
	emit('apply', { text, icon })
}

function setIcon(value: unknown) {
	form.icon = typeof value === 'string' ? value : ''
}

function formatSourceValue(value: unknown) {
	if (value === null) return '—'
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value)
	}
	return JSON.stringify(value)
}
</script>

<template>
	<VDrawer
		:model-value="open"
		title="Edit reference"
		icon="alternate_email"
		@update:model-value="open = $event"
		@cancel="open = false"
		@apply="apply"
	>
		<div v-if="reference" class="reference-drawer">
			<section class="reference-drawer__source" aria-label="Source record">
				<div class="reference-drawer__source-icon" aria-hidden="true">
					<VIcon name="database" />
				</div>
				<div class="reference-drawer__source-summary">
					<span class="reference-drawer__eyebrow">Source record</span>
					<strong class="reference-drawer__source-label">{{ reference.label }}</strong>
					<span class="reference-drawer__identity">
						{{ reference.collection }} · {{ reference.item }}
					</span>
				</div>
				<VButton secondary small :disabled="disabled" @click="emit('changeSource')"
					>Change source</VButton
				>
			</section>
			<dl v-if="sourceData.length" class="reference-drawer__source-data">
				<div v-for="[field, value] in sourceData" :key="field">
					<dt>{{ field }}</dt>
					<dd>{{ formatSourceValue(value) }}</dd>
				</div>
			</dl>
			<section class="reference-drawer__form">
				<label for="reference-text">Link text</label>
				<VInput
					id="reference-text"
					v-model="form.text"
					:placeholder="reference.label"
					:disabled="disabled"
				/>
				<label>Icon</label>
				<component
					:is="iconInterface"
					v-if="iconInterface"
					:value="form.icon || null"
					:disabled="disabled"
					@input="setIcon"
				/>
				<VInput
					v-else
					v-model="form.icon"
					placeholder="Material icon name"
					:disabled="disabled"
				/>
			</section>
		</div>
		<template #actions>
			<VButton secondary small :disabled="disabled" @click="emit('remove')"
				>Delete reference</VButton
			>
			<VButton secondary small :disabled="disabled" @click="emit('refreshSource')"
				>Refresh source</VButton
			>
		</template>
		<template #actions:primary>
			<VButton small :disabled="disabled || !reference" @click="apply">Apply</VButton>
		</template>
	</VDrawer>
</template>

<style scoped>
.reference-drawer {
	display: grid;
	gap: 1.5rem;
	padding: var(--content-padding, 1.125rem);
}
.reference-drawer__source {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	min-width: 0;
	padding-block-end: 1.25rem;
	border-block-end: 1px solid
		var(--theme--border-color-subdued, var(--theme--border-color, #d3dce3));
}
.reference-drawer__source-icon {
	display: grid;
	flex: 0 0 2.5rem;
	place-items: center;
	width: 2.5rem;
	height: 2.5rem;
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--primary-background, #f0edff);
	color: var(--theme--primary, #6644ff);
}
.reference-drawer__source-summary {
	display: grid;
	flex: 1 1 auto;
	min-width: 0;
	gap: 0.125rem;
}
.reference-drawer__eyebrow {
	color: var(--theme--foreground-subdued, #8b98a5);
	font-size: 0.75rem;
}
.reference-drawer__source-label {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.reference-drawer__form {
	display: grid;
	gap: 0.75rem;
}
.reference-drawer label {
	font-size: 0.8rem;
	font-weight: 600;
}
.reference-drawer__identity {
	color: var(--theme--foreground-subdued, #8b98a5);
	font-size: 0.75rem;
}
.reference-drawer__source-data {
	display: grid;
	margin: 0;
	border-block: 1px solid var(--theme--border-color-subdued, var(--theme--border-color, #d3dce3));
}
.reference-drawer__source-data > div {
	display: grid;
	grid-template-columns: minmax(7rem, 0.4fr) minmax(0, 1fr);
	gap: 1rem;
	padding-block: 0.625rem;
}
.reference-drawer__source-data > div + div {
	border-block-start: 1px solid
		var(--theme--border-color-subdued, var(--theme--border-color, #d3dce3));
}
.reference-drawer__source-data dt,
.reference-drawer__source-data dd {
	min-width: 0;
	margin: 0;
	overflow-wrap: anywhere;
}
.reference-drawer__source-data dt {
	color: var(--theme--foreground-subdued, #8b98a5);
	font-size: 0.75rem;
}
</style>
