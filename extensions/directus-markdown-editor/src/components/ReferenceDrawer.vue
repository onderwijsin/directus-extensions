<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { ReferenceIntegrityState } from '../reference/editor'
import type { ReferenceProps } from '../reference/schema'

import { computed, reactive, watch } from 'vue'

import { useExtensions } from '@directus/extensions-sdk'

const props = defineProps<{
	reference?: ReferenceProps
	status?: ReferenceIntegrityState
	disabled?: boolean
	refreshing?: boolean
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
const statusNotice = computed(() => {
	if (props.status === 'outdated') {
		return 'The referenced item has changed since your last edit. Refresh to use its latest content.'
	}
	if (props.status === 'unconfigured') {
		return 'This reference belongs to a collection that is not configured for this field.'
	}
	if (props.status === 'not_available') {
		return 'The referenced item is unavailable. It may have been removed, or you may no longer have access.'
	}
	if (props.status === 'verification_error') {
		return 'The referenced item could not be verified. Check your connection and try again.'
	}
	if (props.status === 'malformed') return 'This reference contains invalid source data.'
	return undefined
})
const statusNoticeType = computed<'warning' | 'danger' | undefined>(() => {
	if (props.status === 'not_available' || props.status === 'malformed') return 'danger'
	return statusNotice.value ? 'warning' : undefined
})

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
			<VNotice v-if="statusNotice" :type="statusNoticeType" class="reference-drawer__notice">
				{{ statusNotice }}
			</VNotice>
			<section class="reference-drawer__source" aria-label="Source item">
				<div class="reference-drawer__source-icon" aria-hidden="true">
					<VIcon name="database" />
				</div>
				<div class="reference-drawer__source-summary">
					<strong class="reference-drawer__source-label">{{ reference.label }}</strong>
					<span class="reference-drawer__identity">
						{{ reference.collection }} · {{ reference.item }}
					</span>
				</div>
				<div class="reference-drawer__source-actions">
					<VButton
						secondary
						small
						:disabled="disabled || refreshing"
						@click="emit('changeSource')"
						>Change source</VButton
					>
					<VButton
						v-if="status === 'outdated'"
						secondary
						small
						class="reference-drawer__refresh"
						:loading="refreshing"
						:disabled="disabled"
						aria-label="Refresh item"
						@click="emit('refreshSource')"
						>Refresh</VButton
					>
				</div>
			</section>
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
			<VButton secondary small :disabled="disabled || refreshing" @click="emit('remove')"
				>Delete reference</VButton
			>
		</template>
		<template #actions:primary>
			<VButton small :disabled="disabled || refreshing || !reference" @click="apply"
				>Apply</VButton
			>
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
.reference-drawer__notice {
	margin: 0;
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
.reference-drawer__source-actions {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	gap: 0.25rem;
}
.reference-drawer__refresh {
	--v-button-color: var(--theme--warning-foreground, #7a5b00) !important;
	--v-button-color-hover: var(--theme--warning-foreground, #7a5b00) !important;
	--v-button-color-active: var(--theme--warning-foreground, #7a5b00) !important;
	--v-button-background-color: color-mix(
		in srgb,
		var(--theme--warning, #f2c94c) 12%,
		transparent
	) !important;
	--v-button-background-color-hover: color-mix(
		in srgb,
		var(--theme--warning, #f2c94c) 18%,
		transparent
	) !important;
	--v-button-background-color-active: color-mix(
		in srgb,
		var(--theme--warning, #f2c94c) 22%,
		transparent
	) !important;
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
</style>
