<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { ComponentMetadata } from '../component-meta/schema'

// Metadata has already crossed the Zod boundary before it reaches this form.
import { computed, reactive, watch } from 'vue'

import { isRecord, isString, keys, toEntries } from '@onderwijsin/directus-extension-utils'

import { insertComponent, updateComponent } from '../editor/insertion'

const props = defineProps<{
	editor: Editor
	component: ComponentMetadata | null
	disabled?: boolean
	editExisting?: boolean
	initialProps?: Record<string, unknown>
	targetNodeType?: 'mdcBlock' | 'mdcInline'
}>()
const open = defineModel<boolean>('open', { default: false })
const form = reactive<Record<string, unknown>>({})
const missingRequired = computed(() => {
	if (!props.component) return []
	return toEntries(props.component.props)
		.filter(
			([name, definition]) =>
				definition.required && (form[name] === '' || form[name] === undefined),
		)
		.map(([name]) => name)
})
const canSave = computed(
	() => Boolean(props.component) && !props.disabled && missingRequired.value.length === 0,
)

/**
 * Editor callback.
 * @param component Parameter value.
 * @returns Callback result.
 */
function resetForm(component: ComponentMetadata | null) {
	for (const key of keys(form)) delete form[key]
	if (!component) return
	for (const [name, definition] of toEntries(component.props)) {
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
		if (isOpen === true && component && isRecord(component)) resetForm(component)
	},
)

/**
 * Editor callback.
 * @param name Parameter value.
 * @returns Callback result.
 */
function textValue(name: string) {
	const value = form[name]
	return isString(value) ? value : value == null ? '' : String(value)
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
	if (!props.component || !canSave.value) return
	if (props.editExisting)
		updateComponent(props.editor, props.targetNodeType ?? 'mdcBlock', { ...form })
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
	<VDrawer
		:model-value="open"
		:title="component ? `Configure ${component.label}` : 'Configure component'"
		icon="tune"
		@update:model-value="open = $event"
		@cancel="open = false"
		@apply="save"
	>
		<div v-if="component" class="component-props-form">
			<header class="component-props-form__header">
				<div class="component-props-form__identity">
					<VIcon name="widgets" />
					<div>
						<strong>{{ component.label }}</strong>
					</div>
				</div>
			</header>
			<VNotice v-if="missingRequired.length" type="warning"
				>Complete the required fields: {{ missingRequired.join(', ') }}.</VNotice
			>
			<div
				v-for="(definition, name) in component.props"
				:key="name"
				class="component-props-form__field"
			>
				<label :for="`component-prop-${name}`"
					>{{ definition.name ?? name }}<span v-if="definition.required"> *</span></label
				>
				<VSelect
					v-if="definition.values?.length"
					:model-value="textValue(name)"
					:items="definition.values.map((value) => ({ text: value, value }))"
					:disabled="disabled"
					@update:model-value="setTextValue(name, $event)"
				/>
				<VCheckbox
					v-else-if="definition.type === 'boolean'"
					:model-value="form[name] === true"
					:label="definition.description ?? name"
					:disabled="disabled"
					@update:model-value="form[name] = $event"
				/>
				<VInput
					v-else
					:id="`component-prop-${name}`"
					:model-value="textValue(name)"
					:placeholder="definition.description"
					:disabled="disabled"
					@update:model-value="setTextValue(name, $event)"
				/>
			</div>
		</div>
		<template #actions>
			<VButton v-if="editExisting" secondary small :disabled="disabled" @click="remove"
				>Delete</VButton
			>
		</template>
		<template #actions:primary>
			<VButton :disabled="!canSave" small @click="save">{{
				editExisting ? 'Apply' : 'Insert'
			}}</VButton>
		</template>
	</VDrawer>
</template>

<style scoped>
.component-props-form {
	display: grid;
	gap: 1rem;
	padding: var(--content-padding, 1.125rem);
}
.component-props-form__header {
	padding-block-end: 0.75rem;
	border-block-end: 1px solid var(--theme--border-color-subdued, #edf0f2);
}
.component-props-form__identity {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}
.component-props-form__identity > div {
	display: grid;
	gap: 0.125rem;
}
.component-props-form__identity code {
	color: var(--theme--foreground-subdued, #8b98a5);
	font-size: 0.75rem;
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
