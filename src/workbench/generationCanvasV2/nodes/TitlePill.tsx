import React from 'react'
import { cn } from '../../../utils/cn'
import { getBuiltinCategoryById } from '../../project/projectCategories'
import { useShotIndex } from '../hooks/useNodeRelationships'
import { looksLikeGeneratedName, getDisplayTitle } from '../model/titleHeuristics'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

type Props = {
  node: GenerationCanvasNode
}

/**
 * Mura 设计标题 pill（spec §6.1）：
 * 深色圆角胶囊，浮在节点左上角，显示分类名 + 自动编号（仅 shots）。
 *
 * v0.7.5 perf: 改用 useShotIndex（WeakMap 缓存），消除每个 TitlePill 各自 O(n log n) filter+sort。
 * v0.7.7: 标题无意义（hash / UUID / 过长）时不显示胶囊，不再灌爆视觉。
 */
function TitlePillImpl({ node }: Props): JSX.Element | null {
  const liveShotIndex = useShotIndex(node.id, node.categoryId)

  const category = node.categoryId ? getBuiltinCategoryById(node.categoryId) : null
  const categoryName = category?.name

  let label: string | null = null
  if (categoryName) {
    if (node.categoryId === 'shots' && typeof liveShotIndex === 'number') {
      label = `${categoryName} ${String(liveShotIndex).padStart(2, '0')}`
    } else {
      label = categoryName
    }
  } else if (node.title && !looksLikeGeneratedName(node.title)) {
    // 长但有意义 → 截断；hash 类直接 null（下面 return null）
    label = getDisplayTitle(node.title, '', 16)
    if (!label) label = null
  }
  // 无分类 + 标题是 hash → 不显示胶囊，让图自己说话

  if (!label) return null

  return (
    <span
      className={cn(
        'generation-canvas-v2-node__title-pill',
        'inline-flex items-center px-2 py-[3px] rounded-md',
        'bg-nomi-ink text-nomi-paper',
        'text-[11px] font-medium leading-none tracking-[0.02em]',
        'pointer-events-none select-none',
        'tabular-nums',
      )}
      aria-label={`分类标签：${label}`}
    >
      {label}
    </span>
  )
}

const TitlePill = React.memo(TitlePillImpl, (prev, next) => prev.node === next.node)
TitlePill.displayName = 'TitlePill'
export default TitlePill
