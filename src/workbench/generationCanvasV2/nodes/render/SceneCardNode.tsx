/**
 * SceneCardNode body — 场景分类节点（spec §4.2）。
 *
 * 视觉：320 宽，图 full-bleed，信息条浮在主图底部（半透明遮罩 + backdrop-blur）。
 * 信息条 absolute 浮动，不占用卡片高度。
 */
import React from 'react'
import { cn } from '../../../../utils/cn'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import { readSceneMeta } from '../../model/nodeMetaFields'
import { useNodeUsageCount, useNodeVariantCount } from '../../hooks/useNodeRelationships'
import { STRIPED_BG_CLASS, UsageDot, VariantChip, UploadFallback } from './CardCommon'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import { getDisplayTitle } from '../../model/titleHeuristics'

type Props = {
  node: GenerationCanvasNode
}

function SceneCardNodeImpl({ node }: Props): JSX.Element {
  const meta = readSceneMeta(node)
  const usageCount = useNodeUsageCount(node.id, node.title)
  const variantCount = useNodeVariantCount(node.id)
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const hasImage = Boolean(node.result?.url)

  const handleUpload = React.useCallback((dataUrl: string) => {
    updateNode(node.id, {
      result: { id: `upload-${Date.now()}`, type: 'image', url: dataUrl, createdAt: Date.now() },
    })
  }, [node.id, updateNode])

  return (
    <div className={cn('relative w-full h-full rounded-nomi overflow-hidden bg-nomi-paper')}>
      {/* 主图 — 占满整个卡片 */}
      <div className={cn('w-full h-full overflow-hidden', !hasImage && STRIPED_BG_CLASS)}>
        {hasImage ? (
          <img
            src={node.result!.url!}
            alt={node.title || '场景'}
            className="w-full h-full object-contain object-center select-none pointer-events-none"
            draggable={false}
          />
        ) : (
          <UploadFallback accept="image/*" label="场景图" onUpload={handleUpload} />
        )}
      </div>

      {/* 信息条 — absolute 浮在主图底部 */}
      <div
        className={cn(
          'absolute bottom-2 left-2 right-2',
          'px-3 py-2 rounded-nomi-sm',
          hasImage
            ? 'bg-nomi-ink/[0.78] backdrop-blur-md text-nomi-paper'
            : 'bg-nomi-ink-10 text-nomi-ink',
          'flex flex-col gap-0.5',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-medium truncate" title={node.title}>
            {getDisplayTitle(node.title, '场景')}
          </span>
          <span className="flex items-center gap-1">
            <UsageDot count={usageCount} />
            <VariantChip count={variantCount} />
          </span>
        </div>
        {meta.mood && meta.mood.length > 0 ? (
          <span className={cn('text-[11px]', hasImage ? 'text-nomi-paper/80' : 'text-nomi-ink-60')}>
            {meta.mood.join(' · ')}
          </span>
        ) : null}
      </div>
    </div>
  )
}

const SceneCardNode = React.memo(SceneCardNodeImpl, (prev, next) => prev.node === next.node)
SceneCardNode.displayName = 'SceneCardNode'
export default SceneCardNode
