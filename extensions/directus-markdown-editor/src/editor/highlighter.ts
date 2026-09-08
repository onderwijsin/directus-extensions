import type { HighlighterCore, LanguageInput } from 'shiki/types'

import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

/* eslint-disable jsdoc-js/require-jsdoc, jsdoc/require-returns, jsdoc/require-returns-description -- Registry loaders are self-describing one-line imports. */

type LanguageLoader = () => Promise<LanguageInput>

/**
 * Explicit language loaders keep Shiki's complete grammar registry out of the Directus app bundle.
 * The keys are the public language identifiers stored in fenced Markdown.
 */
const languageLoaders = {
	html: () => import('shiki/dist/langs/html.mjs').then((module) => module.default),
	css: () => import('shiki/dist/langs/css.mjs').then((module) => module.default),
	scss: () => import('shiki/dist/langs/scss.mjs').then((module) => module.default),
	sass: () => import('shiki/dist/langs/sass.mjs').then((module) => module.default),
	less: () => import('shiki/dist/langs/less.mjs').then((module) => module.default),
	stylus: () => import('shiki/dist/langs/stylus.mjs').then((module) => module.default),
	postcss: () => import('shiki/dist/langs/postcss.mjs').then((module) => module.default),
	js: () => import('shiki/dist/langs/js.mjs').then((module) => module.default),
	ts: () => import('shiki/dist/langs/ts.mjs').then((module) => module.default),
	jsx: () => import('shiki/dist/langs/jsx.mjs').then((module) => module.default),
	tsx: () => import('shiki/dist/langs/tsx.mjs').then((module) => module.default),
	vue: () => import('shiki/dist/langs/vue.mjs').then((module) => module.default),
	'vue-html': () => import('shiki/dist/langs/vue-html.mjs').then((module) => module.default),
	svelte: () => import('shiki/dist/langs/svelte.mjs').then((module) => module.default),
	astro: () => import('shiki/dist/langs/astro.mjs').then((module) => module.default),
	'angular-html': () =>
		import('shiki/dist/langs/angular-html.mjs').then((module) => module.default),
	'angular-ts': () => import('shiki/dist/langs/angular-ts.mjs').then((module) => module.default),
	md: () => import('shiki/dist/langs/md.mjs').then((module) => module.default),
	mdx: () => import('shiki/dist/langs/mdx.mjs').then((module) => module.default),
	mdc: () => import('shiki/dist/langs/mdc.mjs').then((module) => module.default),
	graphql: () => import('shiki/dist/langs/graphql.mjs').then((module) => module.default),
	sql: () => import('shiki/dist/langs/sql.mjs').then((module) => module.default),
	prisma: () => import('shiki/dist/langs/prisma.mjs').then((module) => module.default),
	php: () => import('shiki/dist/langs/php.mjs').then((module) => module.default),
	blade: () => import('shiki/dist/langs/blade.mjs').then((module) => module.default),
	twig: () => import('shiki/dist/langs/twig.mjs').then((module) => module.default),
	liquid: () => import('shiki/dist/langs/liquid.mjs').then((module) => module.default),
	hbs: () => import('shiki/dist/langs/hbs.mjs').then((module) => module.default),
	pug: () => import('shiki/dist/langs/pug.mjs').then((module) => module.default),
	python: () => import('shiki/dist/langs/python.mjs').then((module) => module.default),
	ruby: () => import('shiki/dist/langs/ruby.mjs').then((module) => module.default),
	java: () => import('shiki/dist/langs/java.mjs').then((module) => module.default),
	kotlin: () => import('shiki/dist/langs/kotlin.mjs').then((module) => module.default),
	c: () => import('shiki/dist/langs/c.mjs').then((module) => module.default),
	cpp: () => import('shiki/dist/langs/cpp.mjs').then((module) => module.default),
	csharp: () => import('shiki/dist/langs/csharp.mjs').then((module) => module.default),
	go: () => import('shiki/dist/langs/go.mjs').then((module) => module.default),
	rust: () => import('shiki/dist/langs/rust.mjs').then((module) => module.default),
	swift: () => import('shiki/dist/langs/swift.mjs').then((module) => module.default),
	dart: () => import('shiki/dist/langs/dart.mjs').then((module) => module.default),
	'objective-c': () =>
		import('shiki/dist/langs/objective-c.mjs').then((module) => module.default),
	lua: () => import('shiki/dist/langs/lua.mjs').then((module) => module.default),
	r: () => import('shiki/dist/langs/r.mjs').then((module) => module.default),
	elixir: () => import('shiki/dist/langs/elixir.mjs').then((module) => module.default),
	erlang: () => import('shiki/dist/langs/erlang.mjs').then((module) => module.default),
	bash: () => import('shiki/dist/langs/bash.mjs').then((module) => module.default),
	powershell: () => import('shiki/dist/langs/powershell.mjs').then((module) => module.default),
	batch: () => import('shiki/dist/langs/batch.mjs').then((module) => module.default),
	json: () => import('shiki/dist/langs/json.mjs').then((module) => module.default),
	jsonc: () => import('shiki/dist/langs/jsonc.mjs').then((module) => module.default),
	json5: () => import('shiki/dist/langs/json5.mjs').then((module) => module.default),
	yaml: () => import('shiki/dist/langs/yaml.mjs').then((module) => module.default),
	toml: () => import('shiki/dist/langs/toml.mjs').then((module) => module.default),
	xml: () => import('shiki/dist/langs/xml.mjs').then((module) => module.default),
	csv: () => import('shiki/dist/langs/csv.mjs').then((module) => module.default),
	ini: () => import('shiki/dist/langs/ini.mjs').then((module) => module.default),
	properties: () => import('shiki/dist/langs/properties.mjs').then((module) => module.default),
	dotenv: () => import('shiki/dist/langs/dotenv.mjs').then((module) => module.default),
	hcl: () => import('shiki/dist/langs/hcl.mjs').then((module) => module.default),
	terraform: () => import('shiki/dist/langs/terraform.mjs').then((module) => module.default),
	dockerfile: () => import('shiki/dist/langs/dockerfile.mjs').then((module) => module.default),
	nginx: () => import('shiki/dist/langs/nginx.mjs').then((module) => module.default),
	apache: () => import('shiki/dist/langs/apache.mjs').then((module) => module.default),
	makefile: () => import('shiki/dist/langs/makefile.mjs').then((module) => module.default),
	cmake: () => import('shiki/dist/langs/cmake.mjs').then((module) => module.default),
	nix: () => import('shiki/dist/langs/nix.mjs').then((module) => module.default),
	groovy: () => import('shiki/dist/langs/groovy.mjs').then((module) => module.default),
} satisfies Record<string, LanguageLoader>

/* eslint-enable jsdoc-js/require-jsdoc, jsdoc/require-returns, jsdoc/require-returns-description */

export type SupportedCodeLanguage = keyof typeof languageLoaders

const highlighterPromise: Promise<HighlighterCore> = createHighlighterCore({
	themes: [
		import('shiki/dist/themes/github-light.mjs').then((module) => module.default),
		import('shiki/dist/themes/github-dark.mjs').then((module) => module.default),
	],
	langs: [],
	engine: createJavaScriptRegexEngine(),
})

/**
 * Determine whether the editor ships a grammar for a language identifier.
 * @param language Language identifier stored in Markdown.
 * @returns Whether the language can be highlighted.
 */
export function isSupportedCodeLanguage(language: string): language is SupportedCodeLanguage {
	return Object.hasOwn(languageLoaders, language)
}

/**
 * Load only the grammars required by the current document into the shared browser highlighter.
 * @param languages Supported language identifiers used by code blocks.
 * @returns The initialized shared Shiki highlighter.
 */
export async function loadCodeHighlighter(
	languages: ReadonlySet<SupportedCodeLanguage>,
): Promise<HighlighterCore> {
	const highlighter = await highlighterPromise
	const loadedLanguages = new Set(highlighter.getLoadedLanguages())
	const missingLanguages = [...languages].filter((language) => !loadedLanguages.has(language))
	if (missingLanguages.length === 0) return highlighter

	const grammars = await Promise.all(
		missingLanguages.map((language) => languageLoaders[language]()),
	)
	await highlighter.loadLanguage(...grammars)
	return highlighter
}
