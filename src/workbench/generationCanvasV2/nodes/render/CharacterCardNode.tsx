/**
 * CharacterCardNode body — 角色分类节点的渲染主体。
 *
 * 视觉规格（spec §4.1）：宽度 200 px 固定，图像区高度跟图比例，信息区高度 80px 固定。
 * 完整显示图（object-contain，无裁切）。
 * 数据缺失时隐藏对应行，不显示 '+ 添加' placeholder。
 *
 * 注：本组件**只渲染卡片 body**（取代 BaseGenerationNode 的 preview div + composer）。
 * 节点拖动 / 选中 / 缩放 / 标题 pill 仍由 BaseGenerationNode 提供。
 */
import React from 'react'
import { cn } from '../../../../utils/cn'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import { readCharacterMeta } from '../../model/nodeMetaFields'
import { useNodeUsageCount, useNodeVariantCount } from '../../hooks/useNodeRelationships'
import { STRIPED_BG_CLASS, UsageDot, VariantChip, UploadFallback } from './CardCommon'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import { getDisplayTitle } from '../../model/titleHeuristics'

type Props = {
  node: GenerationCanvasNode
}

function CharacterCardNodeImpl({ node }: Props): JSX.Element {
  const meta = readCharacterMeta(node)
  const usageCount = useNodeUsageCount(node.id, node.title)
  const variantCount = useNodeVariantCount(node.id)
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const hasImage = Boolean(node.result?.url)

  // v0.7.1: 上传角色立绘
  const handleUpload = React.useCallback((dataUrl: string) => {
    updateNode(node.id, {
      result: { id: `upload-${Date.now()}`, type: 'image', url: dataUrl, createdAt: Date.now() },
    })
  }, [node.id, updateNode])

  return (
    <div className={cn('w-full h-full flex flex-col rounded-nomi-sm overflow-hidden bg-nomi-paper')}>
      {/* 图像区 — flex-1 自适应高度 */}
      <div className={cn('w-full flex-1 min-h-0 overflow-hidden', !hasImage && STRIPED_BG_CLASS)}>
        {hasImage ? (
          <img
            src={node.result!.url!}
            alt={node.title || '角色'}
            className="w-full h-full object-contain object-center select-none pointer-events-none"
            draggable={false}
          />
        ) : (
          <UploadFallback accept="image/*" label="角色图" onUpload={handleUpload} />
        )}
      </div>

      {/* 信息区 — 固定 80px */}
      <div className="shrink-0 h-[80px] px-3 py-2 flex flex-col gap-1">
        {/* 第一行：名字 + 使用计数（v0.7.7: hash 文件名走 fallback） */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-medium text-nomi-ink truncate" title={node.title}>
            {getDisplayTitle(node.title, '角色')}
          </span>
          <UsageDot count={usageCount} />
        </div>

        {/* 第二行：tagline (空则隐藏) */}
        {meta.tagline ? (
          <span
            className="text-[12px] text-nomi-ink-60 truncate"
            title={meta.tagline}
          >
            {meta.tagline}
          </span>
        ) : null}

        {/* 第三行：变体 chip (右下) */}
        {variantCount > 0 ? (
          <div className="flex justify-end mt-auto">
            <VariantChip count={variantCount} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

// v0.7.2 perf: memo — node 引用稳定时跳过 rerender
const CharacterCardNode = React.memo(CharacterCardNodeImpl, (prev, next) => prev.node === next.node)
CharacterCardNode.displayName = 'CharacterCardNode'
export default CharacterCardNode
