<script setup lang="ts">
import type { ComponentProp } from '../../component-meta/schema'
import type { AssetStorageMode } from '../../editor/media'

import { computed } from 'vue'

import { isRecord, isString } from '@onderwijsin/directus-extension-utils'
import IconifyPicker from '@onderwijsin/directus-extension-utils/app/iconify-picker'

import {
	componentPropDeprecation,
	componentPropIconCollections,
	componentPropSpecialInputType,
} from '../../component-meta/schema'
import BooleanInput from './BooleanInput.vue'
import Field from './Field.vue'
import ImageInput from './ImageInput.vue'
import MultiSelectInput from './MultiSelectInput.vue'
import NumberInput from './NumberInput.vue'
import ObjectArrayInput from './ObjectArrayInput.vue'
import SelectInput from './SelectInput.vue'
import StringInput from './StringInput.vue'
import TagsInput from './TagsInput.vue'
import UrlInput from './UrlInput.vue'

const props = defineProps<{
	name: string
	definition: ComponentProp
	path: string
	errors: Record<string, string>
	disabled?: boolean
	assetStorageMode: AssetStorageMode
	assetBaseUrl?: string
	useIconifyProxy?: boolean
}>()
const model = defineModel<unknown>({ required: true })
const label = computed(() => props.definition.name ?? props.name)
const specialInput = computed(() => componentPropSpecialInputType(props.definition))
const textValue = computed(() =>
	isString(model.value) ? model.value : model.value == null ? '' : String(model.value),
)
const numberValue = computed(() => (typeof model.value === 'number' ? model.value : ''))
const stringArray = computed(() => (Array.isArray(model.value) ? model.value.filter(isString) : []))
const objectValue = computed(() => (isRecord(model.value) ? model.value : {}))
const objectArray = computed(() => (Array.isArray(model.value) ? model.value : []))

/**
 * Update one child without mutating the draft passed by the parent.
 * @param name Child property name.
 * @param value New child value.
 * @returns Nothing.
 */
function updateChild(name: string, value: unknown) {
	model.value = { ...objectValue.value, [name]: value }
}
</script>

<template>
	<Field
		:id="`component-prop-${path.replaceAll('.', '-')}`"
		:label="label"
		:description="definition.description"
		:error="errors[path]"
		:required="definition.required"
		:disabled="disabled"
	>
		<template #label>
			{{ label }}
			<VChip v-if="componentPropDeprecation(definition)" x-small>Deprecated</VChip>
		</template>
		<template #default="field">
			<p v-if="componentPropDeprecation(definition)?.text" class="property-input__deprecated">
				{{ componentPropDeprecation(definition)?.text }}
			</p>
			<div
				v-if="definition.type === 'object'"
				class="property-input__group"
				role="group"
				:aria-label="label"
			>
				<PropertyInput
					v-for="(child, childName) in definition.properties ?? {}"
					:key="childName"
					:name="childName"
					:definition="child"
					:path="`${path}.${childName}`"
					:errors="errors"
					:model-value="objectValue[childName]"
					:disabled="disabled"
					:asset-storage-mode="assetStorageMode"
					:asset-base-url="assetBaseUrl"
					:use-iconify-proxy="useIconifyProxy"
					@update:model-value="updateChild(childName, $event)"
				/>
			</div>
			<ObjectArrayInput
				v-else-if="definition.type === 'array' && definition.items?.type === 'object'"
				v-bind="field"
				:model-value="objectArray"
				:definition="definition.items"
				:path="path"
				:errors="errors"
				:disabled="disabled"
				:asset-storage-mode="assetStorageMode"
				:asset-base-url="assetBaseUrl"
				:use-iconify-proxy="useIconifyProxy"
				@update:model-value="model = $event"
			/>
			<MultiSelectInput
				v-else-if="definition.type === 'array' && definition.values?.length"
				v-bind="field"
				:model-value="stringArray"
				:values="definition.values"
				@update:model-value="model = $event"
			/>
			<TagsInput
				v-else-if="definition.type === 'array'"
				v-bind="field"
				:model-value="stringArray"
				@update:model-value="model = $event"
			/>
			<ImageInput
				v-else-if="definition.type === 'string' && specialInput === 'image'"
				v-bind="field"
				:model-value="textValue"
				:storage-mode="assetStorageMode"
				:base-url="assetBaseUrl"
				@update:model-value="model = $event"
			/>
			<IconifyPicker
				v-else-if="definition.type === 'string' && specialInput === 'icon'"
				v-bind="field"
				:value="textValue || null"
				:collections="componentPropIconCollections(definition)"
				:use-proxy="useIconifyProxy"
				@input="model = $event ?? ''"
			/>
			<UrlInput
				v-else-if="definition.type === 'string' && specialInput === 'url'"
				v-bind="field"
				:model-value="textValue"
				@update:model-value="model = $event"
			/>
			<SelectInput
				v-else-if="definition.type === 'string' && definition.values?.length"
				v-bind="field"
				:model-value="textValue"
				:values="definition.values"
				@update:model-value="model = $event"
			/>
			<BooleanInput
				v-else-if="definition.type === 'boolean'"
				v-bind="field"
				:model-value="model === true"
				@update:model-value="model = $event"
			/>
			<NumberInput
				v-else-if="definition.type === 'number'"
				v-bind="field"
				:model-value="numberValue"
				@update:model-value="model = $event"
			/>
			<StringInput
				v-else
				v-bind="field"
				:model-value="textValue"
				@update:model-value="model = $event"
			/>
		</template>
	</Field>
</template>

<style scoped>
.property-input__group {
	display: grid;
	gap: 1rem;
	padding: 1rem;
	border: 1px dashed var(--theme--border-color, #d3d9df);
	border-radius: var(--theme--border-radius, 6px);
	background: var(--theme--background-subdued, #f8f9fb);
}
.property-input__deprecated {
	margin: 0 0 0.5rem;
	color: var(--theme--warning-foreground, #7a5b00);
	font-size: 0.75rem;
}
</style>
