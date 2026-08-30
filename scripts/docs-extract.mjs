/**
 * Extracts Studio Docs articles from a running Directus instance into their mapped package files.
 *
 * Use `pnpm docs:extract`. Configure `DIRECTUS_DOCS_URL` and either
 * `DIRECTUS_DOCS_TOKEN` or `DIRECTUS_DOCS_EMAIL`/`DIRECTUS_DOCS_PASSWORD` when the defaults do
 * not match the local instance.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const mapPath = resolve(root, 'scripts/docs-article-map.json')
const collection = 'studio_docs'

/**
 * Logs an informational message.
 * @param {string} message - Message to log.
 * @returns {void}
 */
const log = (message) => console.log(message)

/**
 * Logs a warning message.
 * @param {string} message - Message to log.
 * @returns {void}
 */
const warn = (message) => console.warn(`⚠️ ${message}`)

/**
 * Logs an error message.
 * @param {string} message - Message to log.
 * @returns {void}
 */
const fail = (message) => console.error(`❌ ${message}`)

/**
 * Loads and validates the article ID-to-file map.
 * @returns {Promise<Record<string, string>>} Article map.
 */
export async function loadArticleMap() {
	const map = JSON.parse(await readFile(mapPath, 'utf8'))
	if (!map || typeof map !== 'object' || Array.isArray(map)) {
		throw new Error('scripts/docs-article-map.json must contain an object')
	}

	const paths = new Set()
	for (const [id, path] of Object.entries(map)) {
		if (!/^[0-9a-f-]{36}$/iu.test(id) || typeof path !== 'string' || path.length === 0) {
			throw new Error(`Invalid article map entry for ${id}`)
		}
		if (isAbsolute(path) || path.includes('..')) throw new Error(`Unsafe article path: ${path}`)
		if (paths.has(path)) throw new Error(`Article path is mapped more than once: ${path}`)
		paths.add(path)
	}
	return map
}

/**
 * Converts a Directus article to the repository-owned seed shape.
 * @param {Record<string, unknown>} article - Directus article.
 * @returns {Record<string, unknown>} Canonical article.
 */
export function canonicalArticle(article) {
	return {
		body: article.body ?? '',
		icon: article.icon ?? null,
		navigation_label: article.navigation_label ?? '',
		id: article.id,
	}
}

/**
 * Returns only articles that have a known repository destination.
 * @param {Record<string, unknown>[]} articles - Articles returned by Directus.
 * @param {Record<string, string>} map - Article destination map.
 * @returns {{ article: Record<string, unknown>, path: string }[]} Mapped articles.
 */
export function extractMappedArticles(articles, map) {
	return articles.flatMap((article) => {
		const id = typeof article.id === 'string' ? article.id : undefined
		const path = id ? map[id] : undefined
		if (!path) return []
		return [{ article: canonicalArticle(article), path }]
	})
}

/**
 * Resolves a mapped path while preventing writes outside the repository.
 * @param {string} path - Repository-relative path.
 * @returns {string} Absolute destination.
 */
function resolveDestination(path) {
	const destination = resolve(root, path)
	const fromRoot = relative(root, destination)
	if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
		throw new Error(`Refusing to write outside repository: ${path}`)
	}
	return destination
}

/**
 * Requests JSON from Directus.
 * @param {string} url - Request URL.
 * @param {string | undefined} token - Optional bearer token.
 * @returns {Promise<Record<string, unknown>>} JSON response.
 */
async function requestJson(url, token) {
	const response = await fetch(url, {
		headers: token ? { Authorization: `Bearer ${token}` } : undefined,
	})
	const body = await response.json().catch(() => null)
	if (!response.ok) {
		const detail = body && typeof body === 'object' ? JSON.stringify(body) : response.statusText
		throw new Error(`Directus returned ${response.status}: ${detail}`)
	}
	return body
}

/**
 * Extracts the current Studio Docs articles.
 * @returns {Promise<void>} Resolves after all mapped files are written.
 */
export async function extractDocs() {
	const map = await loadArticleMap()
	const baseUrl = (
		process.env.DIRECTUS_DOCS_URL ??
		process.env.DIRECTUS_URL ??
		'http://localhost:8055'
	).replace(/\/$/u, '')
	let token = process.env.DIRECTUS_DOCS_TOKEN ?? process.env.DIRECTUS_TOKEN

	if (!token && process.env.DIRECTUS_DOCS_EMAIL && process.env.DIRECTUS_DOCS_PASSWORD) {
		const response = await fetch(`${baseUrl}/auth/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				email: process.env.DIRECTUS_DOCS_EMAIL,
				password: process.env.DIRECTUS_DOCS_PASSWORD,
			}),
		})
		const body = await response.json().catch(() => null)
		if (!response.ok || typeof body?.data?.access_token !== 'string') {
			throw new Error(
				`Directus login failed with ${response.status}: ${JSON.stringify(body)}`,
			)
		}
		token = body.data.access_token
	}
	if (!token) throw new Error('Set DIRECTUS_DOCS_TOKEN before extracting Studio Docs articles')

	log(`📚 Extracting Studio Docs articles from ${baseUrl}`)
	const query = new URLSearchParams({
		'filter[archived][_eq]': 'false',
		fields: 'id,navigation_label,body,icon',
		limit: '-1',
	})
	const response = await requestJson(`${baseUrl}/items/${collection}?${query}`, token)
	const articles = Array.isArray(response.data) ? response.data : []
	const mapped = extractMappedArticles(articles, map)
	const mappedIds = new Set(mapped.map(({ article }) => article.id))

	for (const article of articles) {
		if (typeof article.id === 'string' && !map[article.id]) {
			warn(`Skipped article ${article.id}; no repository destination is mapped`)
		}
	}
	for (const { article, path } of mapped) {
		const destination = resolveDestination(path)
		await mkdir(resolve(destination, '..'), { recursive: true })
		await writeFile(destination, `${JSON.stringify(article, null, 2)}\n`)
		log(`✅ Wrote ${path}`)
	}

	const missing = Object.keys(map).filter((id) => !mappedIds.has(id))
	for (const id of missing)
		warn(`No article returned for mapped ID ${id}; local file was left unchanged`)
	log(`🎉 Extracted ${mapped.length} mapped article${mapped.length === 1 ? '' : 's'}`)
}

if (import.meta.main) {
	extractDocs().catch((error) => {
		fail(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	})
}
