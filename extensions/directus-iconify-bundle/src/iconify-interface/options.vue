<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import { iconifyCollectionChoices } from '@onderwijsin/directus-extension-utils/app'

// Directus passes collection context; the options form must use only its explicit fields.
defineOptions({ inheritAttrs: false })

interface PickerOptions extends Record<string, unknown> {
	collections?: string[] | null
	useProxy?: boolean
}

interface CollectionEntry {
	prefix?: string | null
}

interface FormOptions extends Record<string, unknown> {
	collections?: CollectionEntry[] | null
	useProxy?: boolean
}

const props = defineProps<{ value?: PickerOptions | null }>()
const emit = defineEmits<{ input: [value: PickerOptions] }>()
const entries = shallowRef<CollectionEntry[]>([])

/**
 * Convert repeater rows to the persisted, ordered collection prefixes.
 * @param rows Repeater rows, including any unfinished new row.
 * @returns Unique, non-empty prefixes in row order.
 */
function prefixes(rows: CollectionEntry[]) {
	return [...new Set(rows.flatMap((row) => (row.prefix ? [row.prefix] : [])))]
}

watch(
	() => props.value?.collections,
	(collections) => {
		const next = collections ?? []
		const current = prefixes(entries.value)
		// Keep the repeater's unfinished row when the parent echoes our saved value.
		if (
			next.length === current.length &&
			next.every((prefix, index) => prefix === current[index])
		)
			return
		entries.value = next.map((prefix) => ({ prefix }))
	},
	{ immediate: true, deep: true },
)

const formValue = computed<FormOptions>({
	/** @returns Options adapted for the native repeater and checkbox. */
	get: () => ({
		...props.value,
		collections: entries.value,
		useProxy: props.value?.useProxy !== false,
	}),
	/**
	 * Persist the native form edits without changing the public option shape.
	 * @param value Updated form values.
	 * @returns Nothing.
	 */
	set: (value) => {
		entries.value = value.collections ?? []
		emit('input', { ...props.value, ...value, collections: prefixes(entries.value) })
	},
})

const fields = [
	{
		field: 'collections',
		name: 'Icon collections',
		type: 'json',
		meta: {
			width: 'full',
			interface: 'list',
			note: 'Drag collections into priority order. Leave empty to include every Iconify collection.',
			options: {
				template: '{{ prefix }}',
				addLabel: 'Add collection',
				fields: [
					{
						field: 'prefix',
						name: 'Collection',
						type: 'string',
						meta: {
							width: 'full',
							interface: 'select-dropdown',
							required: true,
							options: { choices: iconifyCollectionChoices, allowOther: false },
						},
					},
				],
			},
		},
	},
	{
		field: 'useProxy',
		name: 'Use Iconify API proxy',
		type: 'boolean',
		meta: {
			width: 'full',
			interface: 'checkbox',
			note: 'Request icons through the bundled Directus endpoint.',
		},
		schema: { default_value: true },
	},
]
</script>

<template>
	<VForm v-model="formValue" :fields="fields" primary-key="+" />
</template>
