/**
 * Extracts Studio Docs articles from a running Directus instance into their mapped package files.
 *
 * Use `pnpm docs:extract`. Configure `DIRECTUS_DOCS_URL` when the default does not match the
 * local instance. The root `.env` file must contain `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
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
	try {
		process.loadEnvFile(resolve(root, '.env'))
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			throw new Error(
				'Unable to load the root .env file; create it with ADMIN_EMAIL and ADMIN_PASSWORD',
			)
		}
		throw error
	}
	const baseUrl = (
		process.env.DIRECTUS_DOCS_URL ??
		process.env.DIRECTUS_URL ??
		process.env.PUBLIC_URL ??
		'http://localhost:8055'
	).replace(/\/$/u, '')
	const email = process.env.ADMIN_EMAIL
	const password = process.env.ADMIN_PASSWORD
	if (!email || !password) {
		throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in the root .env file')
	}

	const loginResponse = await fetch(`${baseUrl}/auth/login`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password }),
	})
	const loginBody = await loginResponse.json().catch(() => null)
	if (!loginResponse.ok || typeof loginBody?.data?.access_token !== 'string') {
		throw new Error(
			`Directus login failed with ${loginResponse.status}: ${JSON.stringify(loginBody)}`,
		)
	}
	const token = loginBody.data.access_token

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
