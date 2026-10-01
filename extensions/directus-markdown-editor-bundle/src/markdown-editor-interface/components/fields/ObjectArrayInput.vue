<script setup lang="ts">
import type { ComponentProp } from '../../component-meta/schema'
import type { AssetStorageMode } from '../../editor/media'

import { computed, ref, watch } from 'vue'

import { isRecord } from '@onderwijsin/directus-extension-utils'
import Draggable from 'vuedraggable'

import { createObjectDraft } from '../../component-meta/property-form'
import PropertyInput from './PropertyInput.vue'

const props = defineProps<{
	id?: string
	describedBy?: string
	invalid?: boolean
	required?: boolean
	disabled?: boolean
	definition: ComponentProp
	path: string
	errors: Record<string, string>
	assetStorageMode: AssetStorageMode
	assetBaseUrl?: string
}>()
const model = defineModel<unknown[]>({ required: true })
let nextRowId = 0
const rowIds = ref<string[]>([])
const removeIndex = ref<number>()
const wrappedRows = computed(() =>
	model.value.map((data, index) => ({ id: rowIds.value[index], data })),
)

watch(
	() => model.value.length,
	(length) => {
		while (rowIds.value.length < length) rowIds.value.push(`row-${nextRowId++}`)
		if (rowIds.value.length > length) rowIds.value.length = length
	},
	{ immediate: true },
)

/**
 * Add an editable row with the nested defaults.
 * @returns Nothing.
 */
function add() {
	if (props.disabled) return
	rowIds.value.push(`row-${nextRowId++}`)
	model.value = [...model.value, createObjectDraft(props.definition)]
}

/**
 * Replace one row's child property.
 * @param index Row position.
 * @param name Child property name.
 * @param value New child value.
 * @returns Nothing.
 */
function update(index: number, name: string, value: unknown) {
	const rows = [...model.value]
	const oldRow = rows[index]
	rows[index] = { ...(isRecord(oldRow) ? oldRow : {}), [name]: value }
	model.value = rows
}

/**
 * Move a row, preserving its stable key and all nested values.
 * @param from Original row position.
 * @param to Target row position.
 * @returns Nothing.
 */
function move(from: number, to: number) {
	if (props.disabled || from === to || to < 0 || to >= model.value.length) return
	const rows = [...model.value]
	const [row] = rows.splice(from, 1)
	if (row === undefined) return
	rows.splice(to, 0, row)
	const ids = [...rowIds.value]
	const [id] = ids.splice(from, 1)
	if (id) ids.splice(to, 0, id)
	rowIds.value = ids
	model.value = rows
}

/**
 * Persist the order supplied by Sortable while keeping row keys with their data.
 * @param rows Reordered rows and their stable identifiers.
 * @returns Nothing.
 */
function reorder(rows: { id: string | undefined; data: unknown }[]) {
	rowIds.value = rows.flatMap((row) => (row.id === undefined ? [] : [row.id]))
	model.value = rows.map((row) => row.data)
}

/**
 * Remove a row only after explicit confirmation.
 * @returns Nothing.
 */
function confirmRemove() {
	const index = removeIndex.value
	if (index === undefined || props.disabled) return
	model.value = model.value.filter((_, current) => current !== index)
	rowIds.value.splice(index, 1)
	removeIndex.value = undefined
}
</script>

<template>
	<div
		:id="id"
		class="object-array"
		:aria-describedby="describedBy"
		:aria-invalid="invalid || undefined"
	>
		<Draggable
			:model-value="wrappedRows"
			:disabled="disabled"
			item-key="id"
			handle=".object-array__handle"
			:force-fallback="true"
			class="object-array__rows"
			@update:model-value="reorder"
		>
			<template #item="{ element, index }">
				<div class="object-array__row">
					<div class="object-array__header">
						<button
							type="button"
							class="object-array__handle"
							:disabled="disabled"
							:aria-label="`Drag item ${index + 1} to reorder`"
						>
							⋮⋮
						</button>
						<strong>Item {{ index + 1 }}</strong>
						<div class="object-array__actions">
							<button
								type="button"
								:disabled="disabled || index === 0"
								:aria-label="`Move item ${index + 1} up`"
								@click="move(index, index - 1)"
							>
								↑
							</button>
							<button
								type="button"
								:disabled="disabled || index === model.length - 1"
								:aria-label="`Move item ${index + 1} down`"
								@click="move(index, index + 1)"
							>
								↓
							</button>
							<VButton
								icon
								small
								secondary
								kind="danger"
								class="object-array__remove"
								:disabled="disabled"
								:aria-label="`Remove item ${index + 1}`"
								@click="removeIndex = index"
							>
								<VIcon name="close" />
							</VButton>
						</div>
					</div>
					<PropertyInput
						v-for="(child, childName) in definition.properties ?? {}"
						:key="childName"
						:name="childName"
						:definition="child"
						:path="`${path}.${index}.${childName}`"
						:errors="errors"
						:model-value="isRecord(element.data) ? element.data[childName] : undefined"
						:disabled="disabled"
						:asset-storage-mode="assetStorageMode"
						:asset-base-url="assetBaseUrl"
						@update:model-value="update(index, childName, $event)"
					/>
				</div>
			</template>
		</Draggable>
		<VButton small secondary :disabled="disabled" @click="add">Add item</VButton>
		<VDialog
			:model-value="removeIndex !== undefined"
			persistent
			@update:model-value="removeIndex = undefined"
		>
			<VCard role="alertdialog" aria-label="Remove item">
				<VCardTitle>Remove item?</VCardTitle>
				<VCardText
					>This item and its fields will be removed when you apply the component
					changes.</VCardText
				>
				<VCardActions>
					<VButton secondary @click="removeIndex = undefined">Cancel</VButton>
					<VButton danger @click="confirmRemove">Remove</VButton>
				</VCardActions>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped>
.object-array {
	display: grid;
	gap: 0.75rem;
}
.object-array__row {
	display: grid;
	gap: 1rem;
	padding: 1rem;
	border: 1px dashed var(--theme--border-color, #d3d9df);
	border-radius: var(--theme--border-radius, 6px);
	background: var(--theme--background-subdued, #f8f9fb);
}
.object-array__rows {
	display: grid;
	gap: 0.75rem;
}
.object-array__header {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}
.object-array__actions {
	display: flex;
	gap: 0.25rem;
	margin-inline-start: auto;
}
.object-array__actions > button,
.object-array__handle {
	border: 0;
	background: transparent;
	color: var(--theme--foreground, #333);
	cursor: pointer;
}
.object-array__handle {
	cursor: grab;
}
.object-array__remove {
	--v-button-color: var(--danger-ondimmed, var(--theme--danger));
	--v-button-color-hover: var(--danger-ondimmed, var(--theme--danger));
	--v-button-background-color: var(--danger-dimmed, var(--theme--danger-background));
	--v-button-background-color-hover: var(--theme--danger-background);
	--v-button-background-color-active: var(--theme--danger-background);
}
</style>
