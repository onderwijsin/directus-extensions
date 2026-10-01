<script setup lang="ts">
import { ref } from 'vue'

import Draggable from 'vuedraggable'

const props = defineProps<{
	id?: string
	describedBy?: string
	invalid?: boolean
	required?: boolean
	disabled?: boolean
}>()
const model = defineModel<string[]>({ required: true })
const draft = ref('')
/**
 * Use each unique tag as its stable drag key.
 * @param tag Tag text.
 * @returns The tag key.
 */
const tagKey = (tag: string) => tag

/**
 * Add a nonempty, unique tag from the text input.
 * @returns Nothing.
 */
function add() {
	if (props.disabled) return
	const value = draft.value.trim()
	if (value && !model.value.includes(value)) model.value = [...model.value, value]
	draft.value = ''
}

/**
 * Submit tags with Enter or comma.
 * @param event Keyboard event from the input.
 * @returns Nothing.
 */
function onKeydown(event: KeyboardEvent) {
	if (event.key !== 'Enter' && event.key !== ',') return
	event.preventDefault()
	add()
}

/**
 * Remove a tag by its position.
 * @param index Tag position.
 * @returns Nothing.
 */
function remove(index: number) {
	if (!props.disabled) model.value = model.value.filter((_, current) => current !== index)
}
</script>

<template>
	<div class="tags-input">
		<VInput
			:id="id"
			v-model="draft"
			:aria-describedby="describedBy"
			:aria-invalid="invalid || undefined"
			:aria-required="required || undefined"
			:disabled="disabled"
			placeholder="Add a tag"
			@keydown="onKeydown"
			@blur="add"
		/>
		<Draggable
			v-if="model.length"
			:model-value="model"
			:disabled="disabled"
			:item-key="tagKey"
			:force-fallback="true"
			class="tags-input__chips"
			@update:model-value="model = $event"
		>
			<template #item="{ element: tag, index }">
				<div class="tags-input__chip">
					<VChip small label>
						{{ tag }}
						<VButton
							icon
							x-small
							secondary
							kind="danger"
							class="tags-input__remove"
							:disabled="disabled"
							:aria-label="`Remove ${tag}`"
							@click="remove(index)"
						>
							<VIcon name="close" x-small />
						</VButton>
					</VChip>
				</div>
			</template>
		</Draggable>
	</div>
</template>

<style scoped>
.tags-input {
	display: grid;
	gap: 0.5rem;
}
.tags-input__chips {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
}
.tags-input__chip {
	cursor: grab;
}
.tags-input__remove {
	margin-inline-start: 0.375rem;
	--v-button-color: var(--danger-ondimmed, var(--theme--danger));
	--v-button-color-hover: var(--danger-ondimmed, var(--theme--danger));
	--v-button-background-color: var(--danger-dimmed, var(--theme--danger-background));
	--v-button-background-color-hover: var(--theme--danger-background);
	--v-button-background-color-active: var(--theme--danger-background);
}
</style>
