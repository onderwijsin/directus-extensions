<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { ComponentMetadata, ComponentProp } from '../../component-meta/schema'

// Metadata has already crossed the Zod boundary before it reaches this form.
import { computed, reactive, shallowRef, watch } from 'vue'

import { isString, keys, toEntries } from '@onderwijsin/directus-extension-utils'

import { isRequiredComponentPropEmpty } from '../../component-meta/freshness'
import {
	componentPropDeprecation,
	componentPropSpecialInputType,
	metadataDeprecation,
} from '../../component-meta/schema'
import { insertComponent, refreshComponentAt, updateComponent } from '../../editor/insertion'
import { linkValueError } from '../../editor/link'
import { normalizeAssetBaseUrl, type AssetStorageMode } from '../../editor/media'
import BooleanInput from '../fields/BooleanInput.vue'
import Field from '../fields/Field.vue'
import ImageInput from '../fields/ImageInput.vue'
import MultiSelectInput from '../fields/MultiSelectInput.vue'
import NumberInput from '../fields/NumberInput.vue'
import SelectInput from '../fields/SelectInput.vue'
import StringInput from '../fields/StringInput.vue'
import UrlInput from '../fields/UrlInput.vue'

const props = defineProps<{
	editor: Editor
	component: ComponentMetadata | null
	disabled?: boolean
	editExisting?: boolean
	initialProps?: Record<string, unknown>
	targetNodeType?: 'mdcBlock' | 'mdcInline'
	targetPosition?: number
	staleProperties?: boolean
	staleSlots?: boolean
	deletedName?: string
	assetStorageMode?: AssetStorageMode
	assetBaseUrl?: string
}>()
const open = defineModel<boolean>('open', { default: false })
const form = reactive<Record<string, unknown>>({})
const missingRequired = computed(() => {
	if (!props.component) return []
	return toEntries(props.component.props)
		.filter(
			([name, definition]) => definition.required && isRequiredComponentPropEmpty(form[name]),
		)
		.map(([name]) => name)
})
const invalidUrlProps = computed(() => {
	if (!props.component) return []
	return toEntries(props.component.props)
		.filter(([name, definition]) => urlPropError(name, definition) !== undefined)
		.map(([name]) => name)
})
const invalidAssetBase = computed(
	() =>
		props.assetStorageMode === 'url' &&
		Boolean(
			props.component &&
			Object.values(props.component.props).some(
				(definition) =>
					definition.type === 'string' &&
					componentPropSpecialInputType(definition) === 'image',
			),
		) &&
		!normalizeAssetBaseUrl(props.assetBaseUrl ?? ''),
)
const canSave = computed(
	() =>
		Boolean(props.component) &&
		!props.disabled &&
		missingRequired.value.length === 0 &&
		invalidUrlProps.value.length === 0 &&
		!invalidAssetBase.value,
)
const refreshed = shallowRef(false)
const refreshSlotsRequested = shallowRef(false)

/**
 * Editor callback.
 * @param component Parameter value.
 * @returns Callback result.
 */
function resetForm(component: ComponentMetadata | null) {
	for (const key of keys(form)) delete form[key]
	if (!component) return
	if (props.editExisting) {
		for (const [name, value] of toEntries(props.initialProps ?? {})) form[name] = value
		refreshed.value = false
		refreshSlotsRequested.value = false
		return
	}
	populateCurrentProperties(component)
}

/**
 * Replace the draft property shape with the current metadata while preserving known values.
 * @returns Nothing.
 */
function refreshProperties() {
	if (!props.component || props.disabled) return
	const previous = { ...form }
	for (const key of keys(form)) delete form[key]
	populateCurrentProperties(props.component, previous)
	refreshed.value = true
}

/**
 * Queue current metadata slots for reconciliation when the drawer is applied.
 * @returns Nothing.
 */
function refreshSlots() {
	if (!props.component || props.disabled) return
	refreshSlotsRequested.value = true
}

/**
 * Populate a form draft from current metadata and existing known values.
 * @param component Current component metadata.
 * @param previous Previously persisted or drafted properties.
 * @returns Nothing.
 */
function populateCurrentProperties(
	component: ComponentMetadata,
	previous: Record<string, unknown> = props.initialProps ?? {},
) {
	for (const [name, definition] of toEntries(component.props)) {
		if (previous[name] !== undefined) form[name] = previous[name]
		else if (definition.default !== undefined) form[name] = definition.default
		else if (definition.type === 'boolean') form[name] = false
		else if (definition.type === 'array') form[name] = []
		else form[name] = ''
	}
}

watch(
	[open, () => props.component],
	/**
	 * Editor callback.
	 * @param values Parameter value.
	 * @returns Callback result.
	 */
	(values) => {
		const [isOpen, component] = values
		if (isOpen && component) resetForm(component)
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
 * Validate a metadata property rendered with the URL editor control.
 * @param name Property name.
 * @param definition Property metadata.
 * @returns Validation message, or nothing for a valid or empty optional value.
 */
function urlPropError(name: string, definition: ComponentProp): string | undefined {
	if (definition.type !== 'string' || componentPropSpecialInputType(definition) !== 'url')
		return undefined
	const value = textValue(name).trim()
	return value ? linkValueError('url', value) : undefined
}

/**
 * Read a numeric input as a number or an empty optional field.
 * @param name Property name.
 * @returns Current numeric or empty value.
 */
function numberValue(name: string): number | '' {
	return typeof form[name] === 'number' ? form[name] : ''
}

/**
 * Read the selected string values for an array property.
 * @param name Property name.
 * @returns Selected string values.
 */
function arrayValue(name: string): string[] {
	const value = form[name]
	return Array.isArray(value) ? value.filter(isString) : []
}

/**
 * Resolve the error displayed for a component property.
 * @param name Property name.
 * @param definition Property metadata.
 * @returns Validation error when the property is invalid.
 */
function fieldError(name: string, definition: ComponentProp): string | undefined {
	if (definition.required && isRequiredComponentPropEmpty(form[name]))
		return 'This field is required.'
	if (definition.type === 'string' && componentPropSpecialInputType(definition) === 'image') {
		return invalidAssetBase.value ? 'Configure a valid HTTP(S) asset base URL.' : undefined
	}
	return urlPropError(name, definition)
}

/**
 * Editor callback.
 * @returns Callback result.
 */
function save() {
	if (!props.component || !canSave.value) return
	if (props.editExisting) {
		if (
			props.targetPosition !== undefined &&
			(refreshed.value || refreshSlotsRequested.value)
		) {
			refreshComponentAt(
				props.editor,
				props.targetPosition,
				{ ...form },
				refreshSlotsRequested.value ? props.component.slots : undefined,
			)
		} else updateComponent(props.editor, props.targetNodeType ?? 'mdcBlock', { ...form })
	} else insertComponent(props.editor, props.component, { ...form })
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
		:title="
			component ? `Configure ${component.label}` : `Unsupported ${deletedName ?? 'component'}`
		"
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
						<VChip v-if="metadataDeprecation(component)" x-small>Deprecated</VChip>
					</div>
				</div>
				<div class="component-props-form__refresh-actions">
					<VButton
						v-if="staleProperties"
						x-small
						secondary
						:disabled="disabled"
						@click="refreshProperties"
					>
						Refresh properties
					</VButton>
					<VButton
						v-if="staleSlots"
						x-small
						secondary
						:disabled="disabled"
						@click="refreshSlots"
					>
						Refresh slots
					</VButton>
				</div>
			</header>
			<VNotice v-if="metadataDeprecation(component)" type="warning">
				This component is deprecated. {{ metadataDeprecation(component)?.text }}
			</VNotice>
			<VNotice v-if="missingRequired.length" type="warning"
				>Complete the required fields: {{ missingRequired.join(', ') }}.</VNotice
			>
			<VNotice v-if="invalidUrlProps.length" type="warning"
				>Enter valid URLs for: {{ invalidUrlProps.join(', ') }}.</VNotice
			>
			<VNotice v-if="refreshed" type="info"
				>Properties now match the current metadata. Review them and apply to save.</VNotice
			>
			<VNotice v-if="refreshSlotsRequested" type="info">
				Slots will match the current metadata when you apply these changes.
			</VNotice>
			<Field
				v-for="(definition, name) in component.props"
				:key="name"
				:id="`component-prop-${name}`"
				:label="definition.name ?? name"
				:description="definition.description"
				:error="fieldError(name, definition)"
				:required="definition.required"
				:disabled="disabled"
			>
				<template #label>
					{{ definition.name ?? name }}
					<VChip v-if="componentPropDeprecation(definition)" x-small>Deprecated</VChip>
				</template>
				<template #default="field">
					<p
						v-if="componentPropDeprecation(definition)?.text"
						class="component-props-form__deprecated"
					>
						{{ componentPropDeprecation(definition)?.text }}
					</p>
					<ImageInput
						v-if="
							definition.type === 'string' &&
							componentPropSpecialInputType(definition) === 'image'
						"
						v-bind="field"
						:model-value="textValue(name)"
						:storage-mode="assetStorageMode ?? 'path'"
						:base-url="assetBaseUrl"
						@update:model-value="setTextValue(name, $event)"
					/>
					<UrlInput
						v-else-if="
							definition.type === 'string' &&
							componentPropSpecialInputType(definition) === 'url'
						"
						v-bind="field"
						:model-value="textValue(name)"
						@update:model-value="setTextValue(name, $event)"
					/>
					<MultiSelectInput
						v-else-if="definition.type === 'array'"
						v-bind="field"
						:model-value="arrayValue(name)"
						:values="definition.values ?? []"
						@update:model-value="form[name] = $event"
					/>
					<SelectInput
						v-else-if="definition.values?.length"
						v-bind="field"
						:model-value="textValue(name)"
						:values="definition.values"
						@update:model-value="setTextValue(name, $event)"
					/>
					<BooleanInput
						v-else-if="definition.type === 'boolean'"
						v-bind="field"
						:model-value="form[name] === true"
						@update:model-value="form[name] = $event"
					/>
					<NumberInput
						v-else-if="definition.type === 'number'"
						v-bind="field"
						:model-value="numberValue(name)"
						@update:model-value="form[name] = $event"
					/>
					<StringInput
						v-else
						v-bind="field"
						:model-value="textValue(name)"
						@update:model-value="setTextValue(name, $event)"
					/>
				</template>
			</Field>
		</div>
		<div v-else-if="editExisting" class="component-props-form">
			<VNotice type="danger">
				{{ deletedName }} is no longer present in component metadata. Delete it from this
				document.
			</VNotice>
		</div>
		<template #actions>
			<VButton v-if="editExisting" secondary small :disabled="disabled" @click="remove"
				>Delete</VButton
			>
		</template>
		<template #actions:primary>
			<VButton v-if="component" :disabled="!canSave" small @click="save">{{
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
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding-block-end: 0.75rem;
	border-block-end: 1px solid var(--theme--border-color-subdued, #edf0f2);
}
.component-props-form__refresh-actions {
	display: flex;
	gap: 0.5rem;
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
.component-props-form__deprecated {
	margin: 0;
	color: var(--theme--warning-foreground, #7a5b00);
	font-size: 0.75rem;
}
</style>
