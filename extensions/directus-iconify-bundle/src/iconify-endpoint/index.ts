/* eslint-disable jsdoc-js/require-jsdoc -- Endpoint route callbacks are private registration wiring. */
import { defineEndpoint } from '@directus/extensions-sdk'
import { attempt } from '@onderwijsin/directus-extension-utils'
import { asyncHandler } from '@onderwijsin/directus-extension-utils/server'
import { ofetch } from 'ofetch'

const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const upstream = 'https://api.iconify.design'

/**
 * Requests a validated Iconify path from the fixed upstream host.
 * @param path The Iconify API path.
 * @returns The upstream response, including its HTTP status.
 */
function proxy(path: string) {
	return ofetch.raw<string, 'text'>(`${upstream}${path}`, {
		responseType: 'text',
		ignoreResponseError: true,
		retry: 0,
		timeout: 10_000,
		redirect: 'error',
	})
}

/** Registers the Iconify collection, search, icon-data, and SVG proxy routes. */
export default defineEndpoint({
	id: 'iconify',
	handler: (router) => {
		router.get(
			'/collections',
			asyncHandler(async (_request, response) => {
				const { data } = await attempt(() => proxy('/collections'))
				if (data === null) {
					response.sendStatus(502)
					return
				}
				response
					.status(data.status)
					.type('json')
					.send(data._data ?? '')
			}),
		)

		router.get(
			'/collection/:prefix',
			asyncHandler(async (request, response) => {
				const prefix = request.params.prefix
				if (!prefix || !namePattern.test(prefix)) {
					response.sendStatus(400)
					return
				}
				const { data } = await attempt(() => proxy(`/collection?prefix=${prefix}`))
				if (data === null) {
					response.sendStatus(502)
					return
				}
				response
					.status(data.status)
					.type('json')
					.send(data._data ?? '')
			}),
		)

		router.get(
			'/search',
			asyncHandler(async (request, response) => {
				const query = request.query.query
				const prefixes = request.query.prefixes
				const start = request.query.start
				if (
					typeof query !== 'string' ||
					query.length < 2 ||
					query.length > 100 ||
					(prefixes !== undefined &&
						(typeof prefixes !== 'string' ||
							!prefixes.split(',').every((prefix) => namePattern.test(prefix)))) ||
					(start !== undefined &&
						(typeof start !== 'string' || !/^\d{1,6}$/u.test(start)))
				) {
					response.sendStatus(400)
					return
				}
				const params = new URLSearchParams({ query, limit: '999' })
				if (prefixes) params.set('prefixes', prefixes)
				if (typeof start === 'string') params.set('start', start)
				const { data } = await attempt(() => proxy(`/search?${params}`))
				if (data === null) {
					response.sendStatus(502)
					return
				}
				response
					.status(data.status)
					.type('json')
					.send(data._data ?? '')
			}),
		)

		// Iconify's Vue component requests icon-data batches as /{prefix}.json?icons=... .
		router.get(
			'/:prefix.json',
			asyncHandler(async (request, response) => {
				const prefix = request.params.prefix
				const icons = request.query.icons
				if (
					!prefix ||
					!namePattern.test(prefix) ||
					typeof icons !== 'string' ||
					icons.length > 1_800 ||
					!icons.split(',').every((name) => namePattern.test(name))
				) {
					response.sendStatus(400)
					return
				}
				const params = new URLSearchParams({ icons })
				const { data } = await attempt(() => proxy(`/${prefix}.json?${params}`))
				if (data === null) {
					response.sendStatus(502)
					return
				}
				response
					.status(data.status)
					.type('json')
					.send(data._data ?? '')
			}),
		)

		router.get(
			'/icon/:prefix/:name',
			asyncHandler(async (request, response) => {
				const { prefix, name } = request.params
				if (!prefix || !name || !namePattern.test(prefix) || !namePattern.test(name)) {
					response.sendStatus(400)
					return
				}
				const { data } = await attempt(() => proxy(`/${prefix}/${name}.svg`))
				if (data === null) {
					response.sendStatus(502)
					return
				}
				response
					.status(data.status)
					.type(data.ok ? 'image/svg+xml' : 'text/plain')
					.set('Cache-Control', data.ok ? 'public, max-age=86400' : 'no-store')
					.send(data._data ?? '')
			}),
		)
	},
})
