<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { ComponentMetadata } from '../../component-meta/schema'

// Metadata has already crossed the Zod boundary before it reaches this form.
import { computed, reactive, shallowRef, watch } from 'vue'

import { keys, toEntries } from '@onderwijsin/directus-extension-utils'

import {
	createPropertyDraft,
	hasImageProperty,
	refreshPropertyDraft,
	validatePropertyDrafts,
} from '../../component-meta/property-form'
import { metadataDeprecation } from '../../component-meta/schema'
import { insertComponent, refreshComponentAt, updateComponent } from '../../editor/insertion'
import { normalizeAssetBaseUrl, type AssetStorageMode } from '../../editor/media'
import PropertyInput from '../fields/PropertyInput.vue'

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
	useIconifyProxy?: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
const form = reactive<Record<string, unknown>>({})
const fieldErrors = computed(() =>
	props.component ? validatePropertyDrafts(props.component.props, form) : {},
)
const invalidFields = computed(() => Object.keys(fieldErrors.value))
const missingRequired = computed(() =>
	invalidFields.value.filter((path) => fieldErrors.value[path] === 'This field is required.'),
)
const invalidUrlProps = computed(() =>
	invalidFields.value.filter((path) => fieldErrors.value[path] !== 'This field is required.'),
)
const invalidAssetBase = computed(
	() =>
		props.assetStorageMode === 'url' &&
		Boolean(props.component && hasImageProperty(props.component.props)) &&
		!normalizeAssetBaseUrl(props.assetBaseUrl ?? ''),
)
const canSave = computed(
	() =>
		Boolean(props.component) &&
		!props.disabled &&
		invalidFields.value.length === 0 &&
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
	populateCurrentProperties(props.component, previous, true)
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
 * @param refresh Whether to reconcile nested keys with current metadata.
 * @returns Nothing.
 */
function populateCurrentProperties(
	component: ComponentMetadata,
	previous: Record<string, unknown> = props.initialProps ?? {},
	refresh = false,
) {
	for (const [name, definition] of toEntries(component.props)) {
		if (previous[name] !== undefined)
			form[name] = refresh ? refreshPropertyDraft(definition, previous[name]) : previous[name]
		else if (definition.default !== undefined) form[name] = definition.default
		else form[name] = createPropertyDraft(definition)
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
			<VNotice v-if="invalidAssetBase" type="warning"
				>Configure a valid HTTP(S) asset base URL.</VNotice
			>
			<VNotice v-if="refreshed" type="info"
				>Properties now match the current metadata. Review them and apply to save.</VNotice
			>
			<VNotice v-if="refreshSlotsRequested" type="info">
				Slots will match the current metadata when you apply these changes.
			</VNotice>
			<PropertyInput
				v-for="(definition, name) in component.props"
				:key="name"
				:name="name"
				:definition="definition"
				:path="name"
				:errors="fieldErrors"
				:model-value="form[name]"
				:disabled="disabled"
				:asset-storage-mode="assetStorageMode ?? 'path'"
				:asset-base-url="assetBaseUrl"
				:use-iconify-proxy="useIconifyProxy"
				@update:model-value="form[name] = $event"
			/>
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
