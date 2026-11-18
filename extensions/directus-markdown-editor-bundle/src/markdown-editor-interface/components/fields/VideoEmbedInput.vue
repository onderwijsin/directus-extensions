<script setup lang="ts">
import { computed } from 'vue'

import {
	parseVideoEmbed,
	videoEmbedPermissions,
	videoEmbedUrl,
	type VideoPlaybackOptions,
} from '../../editor/video-embed'
import Field from './Field.vue'
import StringInput from './StringInput.vue'
import VideoEmbedPreview from './VideoEmbedPreview.vue'

defineProps<{ disabled?: boolean }>()
const source = defineModel<string>({ required: true })
const privacyMode = defineModel<boolean>('privacyMode', { required: true })
const options = defineModel<VideoPlaybackOptions>('options', { required: true })
type BooleanOption = keyof VideoPlaybackOptions
const controls: { key: BooleanOption; label: string }[] = [
	{ key: 'allowFullscreen', label: 'Allow fullscreen' },
	{ key: 'showControls', label: 'Show player controls' },
	{ key: 'loop', label: 'Loop' },
	{ key: 'autoplay', label: 'Autoplay' },
	{ key: 'muted', label: 'Start muted' },
]
const video = computed(() => parseVideoEmbed(source.value))
const previewSource = computed(() =>
	video.value ? videoEmbedUrl(video.value, privacyMode.value, options.value) : undefined,
)
const error = computed(() =>
	source.value.trim() && !video.value
		? 'We couldn’t recognize this video URL. Paste a YouTube or Vimeo link to a specific video.'
		: undefined,
)

/**
 * Load supported preferences from a newly entered video URL.
 * @param value User-entered video URL.
 * @returns Nothing.
 */
function updateSource(value: string) {
	source.value = value
	const parsed = parseVideoEmbed(value)
	if (parsed) options.value = parsed.options
}

/**
 * Update a playback checkbox without mutating a parent-owned object.
 * @param key Playback preference.
 * @param value Checkbox state.
 * @returns Nothing.
 */
function updateOption(key: BooleanOption, value: boolean) {
	options.value = { ...options.value, [key]: value }
}
</script>

<template>
	<Field label="Video URL" :error="error" :disabled="disabled" required>
		<template #default="field">
			<StringInput
				:model-value="source"
				@update:model-value="updateSource"
				v-bind="field"
				placeholder="Paste a YouTube or Vimeo video URL"
			/>
		</template>
	</Field>
	<VCheckbox v-model="privacyMode" label="Use privacy mode" :disabled="disabled" block />
	<p class="video-embed-input__note">
		Uses YouTube’s privacy-enhanced player or Vimeo’s Do Not Track option. This does not
		guarantee cookie-free playback.
	</p>
	<div class="video-embed-input__options">
		<VCheckbox
			v-for="control in controls"
			:key="control.key"
			:model-value="options[control.key]"
			:label="control.label"
			:disabled="disabled"
			block
			@update:model-value="updateOption(control.key, $event)"
		/>
	</div>
	<p class="video-embed-input__note">
		Autoplay may be blocked by the browser; starting muted improves support. Some Vimeo controls
		require a supported uploader plan.
	</p>
	<VideoEmbedPreview
		v-if="previewSource"
		:src="previewSource"
		:permissions="videoEmbedPermissions(options)"
	/>
</template>

<style scoped>
.video-embed-input__options {
	display: grid;
	gap: 0.5rem;
}

.video-embed-input__note {
	margin: 0;
	color: var(--theme--foreground-subdued);
	font-size: 0.75rem;
}
</style>
