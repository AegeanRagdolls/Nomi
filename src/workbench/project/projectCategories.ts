import { z } from 'zod'

// viewType 系统已删除 (E.2C-13)：5 个分类全部基于同一画布底座，
// 仅节点渲染样式按分类不同。详见 docs/plans/2026-05-25-phase-e2-completion-and-tech-uplift.md §3 决策 4。
// 节点渲染分发改由 NodeRenderKind 处理（见 E.2C-14/15）。

export type ProjectCategory = {
  id: string
  name: string
  icon: string
  color?: string
  order: number
  isBuiltin: boolean
  isHidden?: boolean
}

export const BUILTIN_CATEGORY_IDS = [
  'shots',
  'cast',
  'scene',
  'prop',
  'audio',
] as const

export type BuiltinCategoryId = (typeof BUILTIN_CATEGORY_IDS)[number]

export const BUILTIN_CATEGORIES: ProjectCategory[] = [
  { id: 'shots', name: '分镜', icon: '🎬', order: 1, isBuiltin: true },
  { id: 'cast', name: '角色', icon: '👥', order: 2, isBuiltin: true },
  { id: 'scene', name: '场景', icon: '🌍', order: 3, isBuiltin: true },
  { id: 'prop', name: '道具', icon: '🧰', order: 4, isBuiltin: true },
  { id: 'audio', name: '声音', icon: '🎵', order: 5, isBuiltin: true },
]

export const DEFAULT_CATEGORY_ID: BuiltinCategoryId = 'shots'
export const FALLBACK_CATEGORY_ID: BuiltinCategoryId = 'shots'

export const projectCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string(),
  color: z.string().optional(),
  order: z.number().finite(),
  isBuiltin: z.boolean(),
  isHidden: z.boolean().optional(),
})

export function getBuiltinCategoryById(id: string): ProjectCategory | null {
  return BUILTIN_CATEGORIES.find((cat) => cat.id === id) || null
}

export function isBuiltinCategoryId(id: string): id is BuiltinCategoryId {
  return (BUILTIN_CATEGORY_IDS as readonly string[]).includes(id)
}

export function cloneBuiltinCategories(): ProjectCategory[] {
  return BUILTIN_CATEGORIES.map((cat) => ({ ...cat }))
}

export function normalizeCategories(input: unknown): ProjectCategory[] {
  if (!Array.isArray(input)) return cloneBuiltinCategories()
  const merged = new Map<string, ProjectCategory>()
  for (const cat of cloneBuiltinCategories()) merged.set(cat.id, cat)
  for (const item of input) {
    const parsed = projectCategorySchema.safeParse(item)
    if (!parsed.success) continue
    if (!isBuiltinCategoryId(parsed.data.id)) continue
    merged.set(parsed.data.id, parsed.data)
  }
  return Array.from(merged.values()).sort((a, b) => a.order - b.order)
}
