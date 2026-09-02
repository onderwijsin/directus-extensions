<script setup lang="ts">
import type { ComponentMetadata } from '../component-meta/schema'

// These callbacks are local template handlers and do not form a public API.
// oxlint-disable jsdoc/require-param, jsdoc/require-returns
import { computed, ref } from 'vue'

import { parseMdcAttributes } from '../markdown/attributes'

export interface MdcInsertRequest {
	type: 'block' | 'inline'
	name: string
	props: Record<string, string | boolean>
}

const props = defineProps<{ disabled?: boolean; components?: ComponentMetadata[] }>()
const emit = defineEmits<{ insert: [request: MdcInsertRequest] }>()

const isOpen = ref(false)
const type = ref<MdcInsertRequest['type']>('block')
const name = ref('callout')
const attributes = ref('tone="warning"')
const nameIsValid = computed(() => /^[\w-]+$/u.test(name.value.trim()))
const selectedComponent = computed(() =>
	props.components?.find((component) => component.name === name.value),
)
const metadataValues = ref<Record<string, string | number | boolean>>({})
const examples = {
	callout: { name: 'callout', attributes: 'tone="warning"' },
	hero: { name: 'hero', attributes: '' },
	icon: { name: 'icon', attributes: 'name="check"' },
}

/**
 *
 */
function openMenu() {
	if (!props.disabled) isOpen.value = true
}

/**
 *
 */
function closeMenu() {
	isOpen.value = false
}

/**
 *
 */
function chooseExample(example: { name: string; attributes: string }) {
	name.value = example.name
	attributes.value = example.attributes
}

/**
 *
 */
function chooseComponent(component: ComponentMetadata) {
	name.value = component.name
	attributes.value = ''
	metadataValues.value = Object.fromEntries(
		Object.entries(component.props).map(([propName, prop]) => [
			propName,
			typeof prop.default === 'string' ||
			typeof prop.default === 'number' ||
			typeof prop.default === 'boolean'
				? prop.default
				: prop.type?.includes('boolean')
					? false
					: '',
		]),
	)
}

/**
 *
 */
function insert() {
	const componentName = name.value.trim()
	if (!nameIsValid.value || !componentName) return
	emit('insert', {
		type: type.value,
		name: componentName,
		props: {
			...parseMdcAttributes(attributes.value),
			...Object.fromEntries(
				Object.entries(metadataValues.value)
					.filter(([, value]) => value !== '')
					.map(([key, value]) => [
						key,
						typeof value === 'number' ? String(value) : value,
					]),
			),
		},
	})
	closeMenu()
}
</script>

<template>
	<div class="mdc-insert-menu">
		<button type="button" :disabled="disabled" @click="openMenu">
			<span aria-hidden="true">＋</span>
			Component
		</button>
		<div
			v-if="isOpen"
			class="mdc-insert-menu__panel"
			role="dialog"
			aria-label="Insert MDC component"
		>
			<div class="mdc-insert-menu__heading">
				<strong>Insert component</strong>
				<button type="button" aria-label="Close component menu" @click="closeMenu">
					×
				</button>
			</div>
			<p class="mdc-insert-menu__hint">
				Choose a project component or enter any generic MDC name.
			</p>
			<div
				v-if="components?.length"
				class="mdc-insert-menu__components"
				aria-label="Project components"
			>
				<span>Project components</span>
				<button
					v-for="component in components"
					:key="component.name"
					type="button"
					:title="component.description"
					@click="chooseComponent(component)"
				>
					{{ component.label }}
				</button>
			</div>
			<label>
				<span>Kind</span>
				<select v-model="type">
					<option value="block">Block component</option>
					<option value="inline">Inline component</option>
				</select>
			</label>
			<label>
				<span>Name</span>
				<input v-model="name" type="text" autocomplete="off" placeholder="callout" />
			</label>
			<label>
				<span>Attributes</span>
				<input
					v-model="attributes"
					type="text"
					autocomplete="off"
					placeholder='tone="warning"'
				/>
			</label>
			<template v-if="selectedComponent">
				<label v-for="(prop, propName) in selectedComponent.props" :key="propName">
					<span>{{ propName }}</span>
					<select v-if="prop.values?.length" v-model="metadataValues[propName]">
						<option v-for="value in prop.values" :key="value" :value="value">
							{{ value }}
						</option>
					</select>
					<input
						v-else-if="prop.type?.includes('boolean')"
						v-model="metadataValues[propName]"
						type="checkbox"
					/>
					<input
						v-else-if="prop.type?.includes('number')"
						v-model.number="metadataValues[propName]"
						type="number"
					/>
					<input v-else v-model="metadataValues[propName]" type="text" />
				</label>
			</template>
			<p v-if="selectedComponent?.slots.length" class="mdc-insert-menu__hint">
				Slots: {{ selectedComponent.slots.join(', ') }}
			</p>
			<div class="mdc-insert-menu__examples" aria-label="Examples">
				<span>Try:</span>
				<button type="button" @click="chooseExample(examples.callout)">Callout</button>
				<button type="button" @click="chooseExample(examples.hero)">Hero</button>
				<button type="button" @click="chooseExample(examples.icon)">Icon</button>
			</div>
			<div class="mdc-insert-menu__actions">
				<button type="button" @click="closeMenu">Cancel</button>
				<button type="button" :disabled="!nameIsValid" @click="insert">Insert</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.mdc-insert-menu {
	position: relative;
}
.mdc-insert-menu button,
.mdc-insert-menu input,
.mdc-insert-menu select {
	font: inherit;
}
.mdc-insert-menu > button,
.mdc-insert-menu__actions button,
.mdc-insert-menu__examples button,
.mdc-insert-menu__components button {
	border: 0;
	border-radius: 3px;
	padding: 0.35rem 0.5rem;
	background: transparent;
	color: inherit;
	cursor: pointer;
}
.mdc-insert-menu > button:hover:not(:disabled),
.mdc-insert-menu__actions button:hover:not(:disabled),
.mdc-insert-menu__examples button:hover:not(:disabled) {
	background: var(--theme--background-subdued, #eef1f4);
}
.mdc-insert-menu button:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}
.mdc-insert-menu__panel {
	position: absolute;
	top: calc(100% + 0.5rem);
	left: 0;
	z-index: 10;
	width: 18rem;
	padding: 0.75rem;
	border: 1px solid var(--theme--form--field--input--border-color, #c8d0d9);
	border-radius: 4px;
	background: var(--theme--form--field--input--background, #fff);
	box-shadow: 0 8px 20px rgb(0 0 0 / 12%);
}
.mdc-insert-menu__heading,
.mdc-insert-menu__actions,
.mdc-insert-menu__examples,
.mdc-insert-menu__components {
	display: flex;
	align-items: center;
	gap: 0.35rem;
}
.mdc-insert-menu__heading {
	justify-content: space-between;
}
.mdc-insert-menu__hint {
	margin: 0.5rem 0 0.75rem;
	font-size: 0.75rem;
	opacity: 0.7;
}
.mdc-insert-menu label {
	display: grid;
	gap: 0.25rem;
	margin-top: 0.6rem;
	font-size: 0.8rem;
}
.mdc-insert-menu input,
.mdc-insert-menu select {
	min-width: 0;
	padding: 0.4rem;
	border: 1px solid var(--theme--form--field--input--border-color, #c8d0d9);
	border-radius: 3px;
	background: inherit;
	color: inherit;
}
.mdc-insert-menu__examples {
	margin-top: 0.75rem;
	font-size: 0.75rem;
}
.mdc-insert-menu__components {
	flex-wrap: wrap;
	margin-bottom: 0.75rem;
	font-size: 0.75rem;
}
.mdc-insert-menu__components span {
	width: 100%;
	opacity: 0.7;
}
.mdc-insert-menu__components button {
	padding: 0.2rem 0.3rem;
}
.mdc-insert-menu__examples button {
	padding: 0.2rem 0.3rem;
}
.mdc-insert-menu__actions {
	justify-content: flex-end;
	margin-top: 0.75rem;
}
.mdc-insert-menu__actions button:last-child {
	background: var(--theme--primary, #6644ff);
	color: #fff;
}
</style>
