import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'

import iconifyInterface from '../src/iconify-interface/index'
import Options from '../src/iconify-interface/options.vue'

const cleanup: (() => void)[] = []

/**
 * Mount the options adapter with a controlled parent and native form test double.
 * @param initial Previously saved interface options.
 * @returns Form events, rendered props, and persisted options.
 */
function mount(initial: Record<string, unknown> | null = null) {
	const value = shallowRef(initial)
	const input = vi.fn((options: Record<string, unknown>) => {
		value.value = options
	})
	const renderForm = vi.fn()
	let update: (value: Record<string, unknown>) => void = () => {
		throw new Error('Form not mounted')
	}
	const app = createApp({
		render: () => h(Options, { value: value.value, collection: 'test', onInput: input }),
	})
	app.component(
		'VForm',
		defineComponent({
			props: ['modelValue', 'fields', 'collection'],
			emits: ['update:modelValue'],
			setup(props, { emit }) {
				update = (next) => emit('update:modelValue', next)
				return () => {
					renderForm(props.modelValue, props.fields)
					return h('div', { 'data-form-collection': props.collection })
				}
			},
		}),
	)
	const element = document.createElement('div')
	document.body.append(element)
	app.mount(element)
	cleanup.push(() => {
		app.unmount()
		element.remove()
	})
	return { value, input, update, renderForm, element }
}

afterEach(() => {
	cleanup.splice(0).forEach((dispose) => dispose())
})

describe('Iconify interface options', () => {
	it('keeps the owning collection context out of the options form', () => {
		const { element } = mount()
		expect(element.querySelector('[data-form-collection]')).toBeNull()
	})

	it('registers custom options with native drag ordering and searchable static choices', () => {
		expect(iconifyInterface.options).toBe(Options)
		const { renderForm, input } = mount()
		expect(renderForm).toHaveBeenLastCalledWith({ collections: [], useProxy: true }, [
			expect.objectContaining({
				field: 'collections',
				meta: expect.objectContaining({
					interface: 'list',
					options: expect.objectContaining({
						template: '{{ prefix }}',
						fields: [
							expect.objectContaining({
								field: 'prefix',
								meta: expect.objectContaining({
									interface: 'select-dropdown',
									required: true,
									options: expect.objectContaining({
										choices: expect.arrayContaining([
											{ text: 'mdi', value: 'mdi' },
										]),
									}),
								}),
							}),
						],
					}),
				}),
			}),
			expect.objectContaining({ field: 'useProxy', schema: { default_value: true } }),
		])
		expect(input).not.toHaveBeenCalled()
	})

	it('loads legacy string arrays and saves reordered rows with the same public shape', async () => {
		const { renderForm, update, value } = mount({
			collections: ['mdi', 'lucide'],
			useProxy: false,
			otherOption: 'keep',
		})
		expect(renderForm.mock.lastCall?.[0]).toEqual({
			collections: [{ prefix: 'mdi' }, { prefix: 'lucide' }],
			useProxy: false,
			otherOption: 'keep',
		})
		update({ collections: [{ prefix: 'lucide' }, { prefix: 'mdi' }], useProxy: false })
		await nextTick()
		expect(value.value).toEqual({
			collections: ['lucide', 'mdi'],
			useProxy: false,
			otherOption: 'keep',
		})
	})

	it('keeps a new row until its dropdown selection is saved', async () => {
		const { renderForm, update, value } = mount({ collections: ['mdi'] })
		update({ collections: [{ prefix: 'mdi' }, {}], useProxy: true })
		await nextTick()
		expect(value.value?.collections).toEqual(['mdi'])
		expect(renderForm.mock.lastCall?.[0]?.collections).toEqual([{ prefix: 'mdi' }, {}])
		update({ collections: [{ prefix: 'mdi' }, { prefix: 'lucide' }], useProxy: true })
		await nextTick()
		expect(value.value?.collections).toEqual(['mdi', 'lucide'])
	})

	it('clears to all collections and preserves proxy changes', async () => {
		const { update, value } = mount({ collections: ['mdi'], useProxy: true })
		update({ collections: null, useProxy: false })
		await nextTick()
		expect(value.value).toEqual({ collections: [], useProxy: false })
	})

	it('syncs external changes without writing them back on mount or update', async () => {
		const { renderForm, input, value } = mount({ collections: ['mdi'] })
		value.value = { collections: ['tabler', 'lucide'], useProxy: false }
		await nextTick()
		expect(renderForm.mock.lastCall?.[0]).toEqual({
			collections: [{ prefix: 'tabler' }, { prefix: 'lucide' }],
			useProxy: false,
		})
		expect(input).not.toHaveBeenCalled()
	})
})
