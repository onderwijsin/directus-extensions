<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { ComponentMetadata } from '../component-meta/schema'

// Metadata has already crossed the Zod boundary before it reaches this form.
import { reactive, watch } from 'vue'

import { insertComponent } from '../editor/insertion'
import DirectusButton from '../ui/DirectusButton.vue'
import DirectusCheckbox from '../ui/DirectusCheckbox.vue'
import DirectusDrawer from '../ui/DirectusDrawer.vue'
import DirectusInput from '../ui/DirectusInput.vue'
import DirectusSelect from '../ui/DirectusSelect.vue'

const props = defineProps<{
	editor: Editor
	component: ComponentMetadata | null
	disabled?: boolean
	editExisting?: boolean
	initialProps?: Record<string, unknown>
}>()
const open = defineModel<boolean>('open', { default: false })
const form = reactive<Record<string, unknown>>({})

/**
 * Editor callback.
 * @param component Parameter value.
 * @returns Callback result.
 */
function resetForm(component: ComponentMetadata | null) {
	for (const key of Object.keys(form)) delete form[key]
	if (!component) return
	for (const [name, definition] of Object.entries(component.props)) {
		if (props.initialProps?.[name] !== undefined) form[name] = props.initialProps[name]
		else if (definition.default !== undefined) form[name] = definition.default
		else if (definition.type === 'boolean') form[name] = false
		else form[name] = ''
	}
}

watch(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => [open.value, props.component],

	/**
	 * Editor callback.
	 * @param values Parameter value.
	 * @returns Callback result.
	 */
	(values) => {
		const [isOpen, component] = values
		if (isOpen === true && component && typeof component === 'object') resetForm(component)
	},
)

/**
 * Editor callback.
 * @param name Parameter value.
 * @returns Callback result.
 */
function textValue(name: string) {
	const value = form[name]
	return typeof value === 'string' ? value : value == null ? '' : String(value)
}

/**
 * Editor callback.
 * @param name Parameter value.
 * @param value Parameter value.
 * @returns Callback result.
 */
function setTextValue(name: string, value: string) {
	form[name] = value
}

/**
 * Editor callback.
 * @returns Callback result.
 */
function save() {
	if (!props.component || props.disabled) return
	if (props.editExisting)
		props.editor
			.chain()
			.focus()
			.updateAttributes('mdcBlock', { props: { ...form } })
			.run()
	else insertComponent(props.editor, props.component, { ...form })
	open.value = false
}

/**
 * Delete the currently selected component node.
 * @returns Nothing.
 */
function remove() {
	if (!props.editExisting || props.disabled) return
	props.editor.chain().focus().deleteSelection().run()
	open.value = false
}
</script>

<template>
	<DirectusDrawer
		v-model="open"
		:title="component ? `Configure ${component.label}` : 'Configure component'"
		@cancel="open = false"
		@apply="save"
	>
		<div v-if="component" class="component-props-form">
			<p v-if="component.description" class="component-props-form__description">
				{{ component.description }}
			</p>
			<div
				v-for="(definition, name) in component.props"
				:key="name"
				class="component-props-form__field"
			>
				<label :for="`component-prop-${name}`"
					>{{ definition.name ?? name }}<span v-if="definition.required"> *</span></label
				>
				<DirectusSelect
					v-if="definition.values?.length"
					:model-value="textValue(name)"
					:items="definition.values.map((value) => ({ text: value, value }))"
					@update:model-value="setTextValue(name, $event)"
				/>
				<DirectusCheckbox
					v-else-if="definition.type === 'boolean'"
					:model-value="form[name] === true"
					:label="definition.description ?? name"
					@update:model-value="form[name] = $event"
				/>
				<DirectusInput
					v-else
					:id="`component-prop-${name}`"
					:value="textValue(name)"
					:label="definition.description ?? name"
					@update:model-value="setTextValue(name, $event)"
				/>
			</div>
			<div v-if="component.slots.length" class="component-props-form__slots">
				Slots: {{ component.slots.join(', ') }}
			</div>
		</div>
		<template #actions>
			<DirectusButton
				v-if="editExisting"
				label="Delete"
				:disabled="disabled"
				@click="remove"
			/>
		</template>
		<template #actions:primary>
			<DirectusButton
				:label="editExisting ? 'Apply' : 'Insert'"
				primary
				:disabled="disabled || !component"
				@click="save"
			/>
		</template>
	</DirectusDrawer>
</template>

<style scoped>
.component-props-form {
	display: grid;
	gap: 1rem;
}
.component-props-form__description,
.component-props-form__slots {
	margin: 0;
	color: var(--theme--foreground-subdued, #8b98a5);
}
.component-props-form__field {
	display: grid;
	gap: 0.35rem;
}
.component-props-form__field > label {
	font-size: 0.8rem;
	font-weight: 600;
}
</style>
