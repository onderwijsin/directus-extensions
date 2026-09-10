import type { EditorSkillMenuItem, EditorSkillScope } from '../../shared/editor-skill'

export type EditorAiScope = EditorSkillScope
export type { EditorSkillMenuItem }

export interface SelectionSnapshot {
	from: number
	to: number
	text: string
}
