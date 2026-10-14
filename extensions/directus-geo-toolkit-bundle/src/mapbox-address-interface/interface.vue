<script setup lang="ts">
import type { AddressValue } from './utils/types'

import { computed, defineAsyncComponent, ref, shallowRef, useId, watch } from 'vue'

import { useStores } from '@directus/extensions-sdk'

import { useMapboxCredentials } from './composables/useMapboxCredentials'
import { useMapboxGeocoding } from './composables/useMapboxGeocoding'
import { mapboxAddressValueSchema } from './utils/address.schema'
import { interfaceOptionsSchema } from './utils/options.schema'
import { interfaceProps } from './utils/props'

const props = defineProps(interfaceProps)
const emit = defineEmits<{ input: [value: AddressValue | null] }>()
const { useSettingsStore } = useStores()
const settings = useSettingsStore()
const id = useId()
const query = ref('')
const focused = ref(false)
const dirtyQuery = ref(false)
const activeIndex = ref(-1)
const selection = shallowRef<AddressValue | null>(null)
const invalidValue = ref(false)
const optionsResult = computed(() => {
	const { value, disabled, nonEditable, field, ...configuration } = props
	return interfaceOptionsSchema.safeParse(configuration)
})

const options = computed(() => (optionsResult.value.success ? optionsResult.value.data : null))
const { token, error: credentialError } = useMapboxCredentials(
	options,
	() => settings.settings?.mapbox_key,
)
const editable = computed(() => !props.disabled && !props.nonEditable)
const canSearch = computed(
	() =>
		editable.value &&
		focused.value &&
		dirtyQuery.value &&
		!credentialError.value &&
		!!options.value,
)
const {
	results,
	loading,
	error: searchError,
	searched,
	invalidate,
} = useMapboxGeocoding(query, options, token, canSearch)
const noResults = computed(
	() => searched.value && !loading.value && !searchError.value && !results.value.length,
)
const popupOpen = computed(
	() => focused.value && canSearch.value && (results.value.length > 0 || noResults.value),
)
const message = computed(() =>
	!options.value
		? 'Invalid Mapbox interface options. Review the field configuration.'
		: credentialError.value || searchError.value,
)
const AddressMap = defineAsyncComponent(() =>
	import('./components/AddressMap.vue').then((module) => module.default),
)

watch(
	() => props.value,
	(value) => {
		invalidate()
		focused.value = false
		dirtyQuery.value = false
		const parsed = mapboxAddressValueSchema.safeParse(value)
		selection.value = parsed.success ? parsed.data : null
		invalidValue.value = value !== null && value !== undefined && !parsed.success
		query.value = selection.value?.formattedAddress ?? ''
	},
	{ immediate: true, deep: true },
)
watch(results, () => {
	activeIndex.value = -1
})
watch(editable, () => {
	focused.value = false
	dirtyQuery.value = false
	invalidate()
})

/** Applies only an explicit candidate selection to the Directus editor.
 * @param value - A normalized candidate with captured request provenance.
 * @returns Nothing after updating the local interface state.
 */
function select(value: AddressValue) {
	if (!editable.value) return
	selection.value = value
	invalidValue.value = false
	query.value = value.formattedAddress
	focused.value = false
	dirtyQuery.value = false
	invalidate()
	emit('input', value)
}

/** Clears the field only when enabled by both the editor and interface configuration.
 * @returns Nothing after updating the local interface state.
 */
function clear() {
	if (!editable.value || !options.value?.allowClear) return
	invalidate()
	selection.value = null
	invalidValue.value = false
	query.value = ''
	focused.value = false
	dirtyQuery.value = false
	emit('input', null)
}

/** Changes query text without mutating the saved field value.
 * @param value - Text emitted by Directus VInput.
 * @returns Nothing after updating the local interface state.
 */
function changeQuery(value: string | number | null) {
	if (!editable.value) return
	query.value = value === null ? '' : String(value)
	focused.value = true
	dirtyQuery.value = true
}

/** Implements combobox navigation and explicit keyboard selection.
 * @param event - Key pressed while the search input is focused.
 * @returns Nothing after updating the local interface state.
 */
function keydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		focused.value = false
		dirtyQuery.value = false
		invalidate()
		return
	}
	if (!popupOpen.value || !results.value.length) return
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		event.preventDefault()
		activeIndex.value =
			activeIndex.value < 0
				? event.key === 'ArrowDown'
					? 0
					: results.value.length - 1
				: (activeIndex.value +
						(event.key === 'ArrowDown' ? 1 : -1) +
						results.value.length) %
					results.value.length
	} else if (event.key === 'Enter') {
		const candidate = results.value[activeIndex.value]
		if (candidate) {
			event.preventDefault()
			select(candidate)
		}
	}
}
</script>

<template>
	<div class="geo-address" :class="{ disabled }">
		<div
			class="address-editor"
			:class="{ 'with-map': options?.showMap && !credentialError }"
			:style="
				options?.showMap && !credentialError
					? { minHeight: `${options.mapHeightPx}px` }
					: undefined
			"
		>
			<AddressMap
				v-if="options?.showMap && !credentialError"
				:options="options"
				:token="token"
				:value="selection"
			/>
			<div class="search-container">
				<label :for="`${id}-input`" class="search-label">Search for an address</label>
				<VMenu
					:model-value="popupOpen"
					attached
					:disabled="!editable"
					@update:model-value="focused = $event && editable"
				>
					<template #activator>
						<div class="search-row">
							<VInput
								:id="`${id}-input`"
								type="text"
								:model-value="query"
								:disabled="disabled"
								:readonly="nonEditable"
								:non-editable="nonEditable"
								small
								placeholder="Search for an address"
								autocomplete="off"
								role="combobox"
								aria-autocomplete="list"
								aria-haspopup="listbox"
								:aria-expanded="popupOpen"
								:aria-controls="`${id}-results`"
								:aria-activedescendant="
									activeIndex >= 0 && popupOpen
										? `${id}-result-${activeIndex}`
										: undefined
								"
								:aria-describedby="`${id}-feedback`"
								@update:model-value="changeQuery"
								@focus="focused = editable"
								@blur="focused = false"
								@keydown="keydown"
							>
								<template #prepend>
									<VProgressCircular
										v-if="loading"
										indeterminate
										small
										aria-label="Searching"
									/>
									<VIcon v-else name="search" />
								</template>
							</VInput>
							<VButton
								v-if="
									editable && options?.allowClear && (selection || invalidValue)
								"
								type="button"
								class="clear-button"
								aria-label="Clear saved address"
								icon
								secondary
								@click="clear"
							>
								<VIcon name="close" :size="16" />
							</VButton>
						</div>
					</template>
					<VList
						v-if="popupOpen"
						:id="`${id}-results`"
						class="results"
						role="listbox"
						aria-label="Address results"
					>
						<VListItem v-if="noResults" role="presentation"
							><span role="status"
								>No addresses found.<span
									v-if="!options?.featureTypes.includes('place')"
								>
									For town searches, enable Place in Result feature types.</span
								></span
							></VListItem
						>
						<VListItem
							v-for="(candidate, index) in results"
							:id="`${id}-result-${index}`"
							:key="`${candidate.mapboxId}-${index}`"
							role="option"
							:aria-selected="index === activeIndex"
							:active="index === activeIndex"
							clickable
							@mousedown.prevent
							@click="select(candidate)"
						>
							{{ candidate.formattedAddress }}
						</VListItem>
					</VList>
				</VMenu>
			</div>
		</div>
		<div :id="`${id}-feedback`" role="status" aria-live="polite" class="feedback">
			<VNotice v-if="message" type="warning">{{ message }}</VNotice>
			<VNotice v-if="invalidValue" type="warning">
				The saved address is invalid or uses an unsupported version. Select another address
				or clear the value.
			</VNotice>
		</div>
	</div>
</template>

<style scoped>
.geo-address {
	display: grid;
	gap: 0.75rem;
	position: relative;
}
.address-editor {
	position: relative;
}
.search-container {
	display: grid;
	gap: 0.5rem;
}
.with-map {
	display: grid;
}
.with-map > .address-map,
.with-map > .search-container {
	grid-area: 1 / 1;
}
.with-map > .search-container {
	align-self: start;
	margin: 0.75rem;
	z-index: 1;
}

.search-label {
	color: var(--theme--foreground-subdued);
	font-size: 0.875rem;
	display: none;
}
.search-row {
	position: relative;
}
.clear-button {
	position: absolute;
	right: 8px;
	top: 50%;
	transform: translateY(-50%);
	--v-button-height: 24px;
	width: 24px;
	height: 24px;
}
.search-row :deep(input) {
	padding-right: 44px;
}
.search-row :deep(.v-input) {
	flex: 1;
	min-width: 0;
}

.feedback {
	display: grid;
	gap: 0.5rem;
}
</style>
