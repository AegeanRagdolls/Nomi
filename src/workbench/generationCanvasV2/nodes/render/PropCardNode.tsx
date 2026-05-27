/**
 * PropCardNode body — 道具分类节点（spec §4.3）。
 *
 * 视觉：200 宽，图全显，信息区 60px，"归属"用 nomi-accent 高亮。
 */
import React from 'react'
import { IconLink } from '@tabler/icons-react'
import { cn } from '../../../../utils/cn'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import { readPropMeta } from '../../model/nodeMetaFields'
import { useNodeUsageCount } from '../../hooks/useNodeRelationships'
import { STRIPED_BG_CLASS, UsageDot, UploadFallback } from './CardCommon'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import { getDisplayTitle } from '../../model/titleHeuristics'

type Props = {
  node: GenerationCanvasNode
}

function PropCardNodeImpl({ node }: Props): JSX.Element {
  const meta = readPropMeta(node)
  const usageCount = useNodeUsageCount(node.id, node.title)
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const hasImage = Boolean(node.result?.url)

  const handleUpload = React.useCallback((dataUrl: string) => {
    updateNode(node.id, {
      result: { id: `upload-${Date.now()}`, type: 'image', url: dataUrl, createdAt: Date.now() },
    })
  }, [node.id, updateNode])

  return (
    <div className={cn('w-full h-full flex flex-col rounded-nomi-sm overflow-hidden bg-nomi-paper')}>
      <div className={cn('w-full flex-1 min-h-0 overflow-hidden', !hasImage && STRIPED_BG_CLASS)}>
        {hasImage ? (
          <img
            src={node.result!.url!}
            alt={node.title || '道具'}
            className="w-full h-full object-contain object-center select-none pointer-events-none"
            draggable={false}
          />
        ) : (
          <UploadFallback accept="image/*" label="道具图" onUpload={handleUpload} />
        )}
      </div>

      <div className="shrink-0 h-[60px] px-3 py-2 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-medium text-nomi-ink truncate" title={node.title}>
            {getDisplayTitle(node.title, '道具')}
          </span>
          <UsageDot count={usageCount} />
        </div>
        {meta.ownedBy ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-nomi-accent">
            <IconLink size={12} stroke={1.8} aria-hidden />
            <span className="truncate" title={`属于 ${meta.ownedBy}`}>
              {meta.ownedBy}的
            </span>
          </span>
        ) : null}
      </div>
    </div>
  )
}

const PropCardNode = React.memo(PropCardNodeImpl, (prev, next) => prev.node === next.node)
PropCardNode.displayName = 'PropCardNode'
export default PropCardNode
