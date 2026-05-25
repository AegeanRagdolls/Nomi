import React from 'react'
import { cn } from '../../../utils/cn'
import { getBuiltinCategoryById } from '../../project/projectCategories'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

type Props = {
  node: GenerationCanvasNode
}

/**
 * Mura 设计标题 pill（spec §6.1）：
 * 深色圆角胶囊，浮在节点左上角，显示分类名 + 自动编号（仅 shots）。
 *
 * - shots 分类 + shotIndex 存在 → "分镜 NN"
 * - shots 分类 + shotIndex 缺失 → "分镜"
 * - 其它分类 → 分类名（"角色" / "场景" / "道具" / "声音"）
 * - 无 categoryId → 走 node.title fallback，避免空白
 */
export default function TitlePill({ node }: Props): JSX.Element | null {
  const category = node.categoryId ? getBuiltinCategoryById(node.categoryId) : null
  const categoryName = category?.name

  let label: string | null = null
  if (categoryName) {
    if (node.categoryId === 'shots' && typeof node.shotIndex === 'number') {
      label = `${categoryName} ${String(node.shotIndex).padStart(2, '0')}`
    } else {
      label = categoryName
    }
  } else if (node.title) {
    label = node.title
  }

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
