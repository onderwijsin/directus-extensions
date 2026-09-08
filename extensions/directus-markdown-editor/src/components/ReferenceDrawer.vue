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
			<section>
				<h3>Source</h3>
				<p>
					<strong>{{ reference.label }}</strong>
				</p>
				<p class="reference-drawer__identity">
					{{ reference.collection }} · {{ reference.item }}
				</p>
				<VButton secondary small :disabled="disabled" @click="emit('changeSource')"
					>Change source</VButton
				>
				<VButton secondary small :disabled="disabled" @click="emit('refreshSource')"
					>Refresh source</VButton
				>
			</section>
			<section>
				<h3>Presentation</h3>
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
.reference-drawer section {
	display: grid;
	gap: 0.5rem;
}
.reference-drawer h3,
.reference-drawer p {
	margin: 0;
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
