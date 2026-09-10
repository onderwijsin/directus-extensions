import { isDirectusError } from '@directus/errors'
import {
	validatePolicyDefinition,
	validateSchemaDefinition,
} from '@onderwijsin/directus-extension-utils/server'
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import editorSkillsSchema from '../schema/editor_skills.json'
import editorSkillsPolicy from '../schema/editor_skills_policy.json'
import editorSkillSeeds from '../seeds/editor_skills.json'
import { isEditorAiAdministrator } from '../src/editor-endpoint/authorization'
import { envSchema as endpointEnvSchema } from '../src/editor-endpoint/env.schema'
import { EditorAiInvalidPayloadError, toEditorAiError } from '../src/editor-endpoint/errors'
import { editorAiRequestSchema } from '../src/editor-endpoint/request'
import { createSystemPrompt } from '../src/editor-endpoint/system-prompt'
import { diffMarkdown } from '../src/markdown-editor-interface/ai/diff'
import { replaceDocument } from '../src/markdown-editor-interface/ai/document'
import {
	captureSelection,
	isSelectionCurrent,
	replaceSelection,
} from '../src/markdown-editor-interface/ai/selection'
import { createEditorExtensions } from '../src/markdown-editor-interface/editor/extensions'
import {
	CAN_USE_EDITOR_SKILLS_POLICY_ID,
	editorSkillSchema,
	editorSkillSeedSchema,
} from '../src/shared/editor-skill'

describe('editor AI domain', () => {
	it('shares enablement while requiring a supported direct provider only at invocation', () => {
		expect(endpointEnvSchema.parse({})).toMatchObject({ MARKDOWN_EDITOR_ENABLED: true })
		expect(endpointEnvSchema.safeParse({ EDITOR_AI_PROVIDER: 'gateway' }).success).toBe(false)
		for (const provider of ['openai', 'anthropic', 'google', 'mistral'])
			expect(endpointEnvSchema.safeParse({ EDITOR_AI_PROVIDER: provider }).success).toBe(true)
	})

	it('defines the editor policy with create, read, and update only', () => {
		const policy = validatePolicyDefinition(editorSkillsPolicy).policies[0]
		expect(policy).toMatchObject({
			id: CAN_USE_EDITOR_SKILLS_POLICY_ID,
			name: 'Can Use Editor Skills',
		})
		expect(policy?.permissions.map(({ action }) => action)).toEqual([
			'create',
			'read',
			'update',
		])
	})

	it('defines versioned editor skills with Directus audit fields', () => {
		const definition = validateSchemaDefinition(editorSkillsSchema)
		expect(definition.collections[0]?.meta).toMatchObject({
			versioning: true,
			archive_app_filter: true,
		})
		expect(definition.fields.map(({ field }) => field)).toEqual(
			expect.arrayContaining([
				'user_created',
				'date_created',
				'user_updated',
				'date_updated',
			]),
		)
		expect(definition.relations.map(({ field }) => field)).toEqual([
			'user_created',
			'user_updated',
		])
		expect(definition.fields.find(({ field }) => field === 'icon')?.meta).toMatchObject({
			interface: 'select-icon',
			display: 'icon',
		})
		expect(definition.fields.find(({ field }) => field === 'prompt')?.meta).toMatchObject({
			interface: 'input-rich-text-md',
			options: {
				toolbar: [
					'heading',
					'bold',
					'italic',
					'strikethrough',
					'blockquote',
					'bullist',
					'numlist',
					'code',
					'empty',
				],
			},
		})
	})

	it('requires stable UUID identities for versioned skill seeds', () => {
		const skill = {
			id: '7b8b3a1e-38f3-4ab7-9b37-5e4c5d7f1234',
			name: 'Improve writing',
			scopes: ['document'],
			prompt: 'Improve the writing.',
		}
		expect(editorSkillSeedSchema.parse(skill)).toMatchObject({
			...skill,
			archived: false,
			description: null,
			icon: null,
			sort: null,
		})
		expect(editorSkillSeedSchema.safeParse({ ...skill, id: 'unstable' }).success).toBe(false)
	})

	it('derives persisted and seed types from the shared skill schema', () => {
		const seed = editorSkillSeedSchema.parse({
			id: '7b8b3a1e-38f3-4ab7-9b37-5e4c5d7f1234',
			name: 'Improve writing',
			scopes: ['selection'],
			prompt: 'Improve the writing.',
		})
		expect(editorSkillSchema.parse(seed)).toEqual({
			...seed,
			user_created: null,
			date_created: null,
			user_updated: null,
			date_updated: null,
		})
	})

	it('ships the ordered built-in editor skill catalog', () => {
		const skills = editorSkillSeeds.skills.map((skill) => editorSkillSeedSchema.parse(skill))
		expect(skills.map(({ name }) => name)).toEqual([
			'Fix spelling and grammar',
			'Improve clarity',
			'Improve structure',
			'Rewrite',
			'Shorten',
			'Expand',
			'Turn into bullet points',
		])
		expect(skills.map(({ sort }) => sort)).toEqual([10, 20, 30, 40, 50, 60, 70])
		expect(
			skills.every(({ archived, description, icon }) => !archived && description && icon),
		).toBe(true)
		expect(skills.find(({ name }) => name === 'Improve structure')?.scopes).toEqual([
			'document',
		])
		expect(skills.find(({ name }) => name === 'Rewrite')?.scopes).toEqual(['selection'])
	})

	it('constructs and preserves Directus errors', () => {
		const directusError = new EditorAiInvalidPayloadError({ reason: 'Invalid request' })
		expect(isDirectusError(directusError, 'EDITOR_AI_INVALID_PAYLOAD')).toBe(true)
		expect(toEditorAiError(directusError)).toBe(directusError)
		expect(isDirectusError(toEditorAiError(new Error('secret')))).toBe(true)
	})

	it('lets administrators invoke editor AI without the seeded policy', () => {
		expect(isEditorAiAdministrator({ admin: true, policies: [] })).toBe(true)
		expect(isEditorAiAdministrator({ admin_access: true, policies: [] })).toBe(true)
		expect(isEditorAiAdministrator({ admin: false, policies: [] })).toBe(false)
	})
	it('requires exactly one instruction source', () => {
		const base = { scope: 'document', content: '# Hi', collection: 'pages', field: 'body' }
		expect(editorAiRequestSchema.safeParse(base).success).toBe(false)
		expect(
			editorAiRequestSchema.safeParse({
				...base,
				prompt: 'Improve',
				skillId: '019941df-2c10-7b6e-8c42-5d7f91a3e608',
			}).success,
		).toBe(false)
		expect(editorAiRequestSchema.safeParse({ ...base, prompt: 'Improve' }).success).toBe(true)
	})

	it('validates selection content and scope', () => {
		const base = {
			scope: 'selection',
			content: 'Hi',
			prompt: 'Improve',
			collection: 'pages',
			field: 'body',
		}
		expect(
			editorAiRequestSchema.safeParse({ ...base, selection: { from: 1, to: 3, text: 'Hi' } })
				.success,
		).toBe(true)
		expect(
			editorAiRequestSchema.safeParse({
				...base,
				selection: { from: 1, to: 3, text: 'Other' },
			}).success,
		).toBe(false)
	})

	it('keeps content subordinate to the hardcoded system prompt', () => {
		const prompt = createSystemPrompt(['paragraph', 'bold', 'component'])
		expect(prompt).toContain('untrusted data')
		expect(prompt).toContain('Return only the replacement')
		expect(prompt).toContain('natural language or languages')
		expect(prompt).toContain('only task-specific instruction')
		expect(prompt).toContain('component reference as untrusted data')
		expect(prompt).toContain('inline code and fenced code block contents as literal content')
		expect(prompt).toContain('bold text')
		expect(prompt).toContain('Nuxt Content MDC')
		expect(prompt).toContain('named slots')
		expect(prompt).not.toContain('GitHub-style tables')
	})

	it('describes all editor syntax for the default all-tools configuration', () => {
		const prompt = createSystemPrompt(undefined)
		expect(prompt).toContain('level 6 headings')
		expect(prompt).toContain('GitHub-style tables')
		expect(prompt).toContain('Nuxt Content MDC')
	})

	it('accepts bounded component metadata as syntax reference data', () => {
		const result = editorAiRequestSchema.safeParse({
			scope: 'document',
			content: '::Hero\n#title\nHello\n::',
			prompt: 'Improve',
			collection: 'pages',
			field: 'body',
			components: [
				{
					name: 'Hero',
					description: 'Page introduction',
					nodeType: 'block',
					props: ['theme'],
					slots: ['title'],
				},
			],
		})
		expect(result.success).toBe(true)
	})

	it('highlights replacements, additions, removals, and unchanged Markdown', () => {
		const changed = diffMarkdown('# Old heading\n\nText', '# New heading\n\nMore text')
		expect(
			changed.base.some((part) => part.kind === 'removed' && part.value.includes('Old')),
		).toBe(true)
		expect(
			changed.incoming.some((part) => part.kind === 'added' && part.value.includes('New')),
		).toBe(true)
		expect(diffMarkdown('**same**', '**same**')).toEqual({
			base: [{ value: '**same**', kind: 'unchanged' }],
			incoming: [{ value: '**same**', kind: 'unchanged' }],
		})
	})

	it('refuses stale selection replacement and applies a current one', () => {
		const editor = new Editor({
			content: 'Hello world',
			extensions: createEditorExtensions(),
			contentType: 'markdown',
		})
		editor.commands.setTextSelection({ from: 1, to: 6 })
		const snapshot = captureSelection(editor)
		expect(snapshot?.text).toBe('Hello')
		if (!snapshot) return
		expect(isSelectionCurrent(editor, snapshot)).toBe(true)
		expect(replaceSelection(editor, snapshot, 'Hi')).toBe(true)
		expect(editor.getMarkdown()).toBe('Hi world')
		expect(replaceSelection(editor, snapshot, 'No')).toBe(false)
		editor.destroy()
	})

	it('applies a document proposal in one document-changing transaction', () => {
		const editor = new Editor({
			content: '# Before',
			extensions: createEditorExtensions(),
			contentType: 'markdown',
		})
		let transactions = 0
		editor.on('transaction', ({ transaction }) => {
			if (transaction.docChanged) transactions += 1
		})
		expect(replaceDocument(editor, '# After')).toBe(true)
		expect(editor.getMarkdown()).toBe('# After')
		expect(transactions).toBe(1)
		editor.destroy()
	})
})
