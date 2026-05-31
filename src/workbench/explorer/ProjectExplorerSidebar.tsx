import React from 'react'
import { cn } from '../../utils/cn'
import { BUILTIN_CATEGORIES, type ProjectCategory } from '../project/projectCategories'
import { useWorkbenchStore, type WorkspaceMode } from '../workbenchStore'
import { useGenerationCanvasStore } from '../generationCanvasV2/store/generationCanvasStore'
import CategoryItem from '../sidebar/CategoryItem'
import WorkspaceFileExplorerPanel from './WorkspaceFileExplorerPanel'

type Props = {
  categories?: ProjectCategory[]
  projectId?: string | null
  workspaceMode?: WorkspaceMode
}

export default function ProjectExplorerSidebar({ categories, projectId = null, workspaceMode = 'generation' }: Props): JSX.Element {
  const preferredTab = workspaceMode === 'creation' ? 'categories' : 'files'
  const [tab, setTab] = React.useState<'categories' | 'files'>(preferredTab)
  React.useEffect(() => {
    setTab(preferredTab)
  }, [preferredTab])
  const collapsed = useWorkbenchStore((s) => s.sidebarCollapsed)
  const toggle = useWorkbenchStore((s) => s.toggleSidebarCollapsed)
  const activeCategoryId = useWorkbenchStore((s) => s.activeCategoryId)
  const setActiveCategoryId = useWorkbenchStore((s) => s.setActiveCategoryId)
  const nodes = useGenerationCanvasStore((s) => s.nodes)
  const reassignCategory = useGenerationCanvasStore((s) => s.reassignNodeCategory)

  const visible = React.useMemo(() => {
    return (categories && categories.length ? categories : BUILTIN_CATEGORIES)
      .filter((c) => !c.isHidden)
      .slice()
      .sort((a, b) => a.order - b.order)
  }, [categories])

  const counts = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const node of nodes) {
      const id = node.categoryId || 'inbox'
      map.set(id, (map.get(id) || 0) + 1)
    }
    return map
  }, [nodes])

  return (
    <aside
      data-collapsed={collapsed ? 'true' : 'false'}
      className={cn(
        'flex flex-col h-full min-h-0 border-r border-nomi-line bg-nomi-paper',
        'transition-[width] duration-150 ease-out',
        collapsed ? 'w-[60px]' : 'w-[240px]',
      )}
      aria-label="项目资源管理器"
    >
      <div className={cn('flex items-center px-2 py-2 border-b border-nomi-line', collapsed ? 'justify-center' : 'justify-between')}>
        {collapsed ? null : (
          <div className="flex items-center gap-1 rounded-md bg-nomi-bg p-0.5">
            <button type="button" onClick={() => setTab('categories')} className={cn('px-2 py-1 text-[11px] rounded', tab === 'categories' ? 'bg-nomi-paper text-nomi-ink' : 'text-nomi-ink-40')}>分类</button>
            <button type="button" onClick={() => setTab('files')} className={cn('px-2 py-1 text-[11px] rounded', tab === 'files' ? 'bg-nomi-paper text-nomi-ink' : 'text-nomi-ink-40')}>文件</button>
          </div>
        )}
        <button type="button" onClick={toggle} className="text-nomi-ink-40 hover:text-nomi-ink p-1 rounded text-[12px]" aria-label={collapsed ? '展开侧栏' : '收起侧栏'}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      {collapsed ? (
        <div className="flex flex-col items-center gap-1 py-2">
          <button type="button" onClick={() => { setTab('categories'); toggle() }} className="w-9 h-8 rounded text-[11px] text-nomi-ink-40 hover:text-nomi-ink hover:bg-nomi-bg" aria-label="展开分类面板">类</button>
          <button type="button" onClick={() => { setTab('files'); toggle() }} className="w-9 h-8 rounded text-[11px] text-nomi-ink-40 hover:text-nomi-ink hover:bg-nomi-bg" aria-label="展开文件面板">文</button>
        </div>
      ) : tab === 'files' ? (
        <WorkspaceFileExplorerPanel projectId={projectId} />
      ) : (
        <>
          <nav className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1">
            {visible.map((cat) => (
              <CategoryItem key={cat.id} category={cat} count={counts.get(cat.id) || 0} active={activeCategoryId === cat.id} collapsed={false} onActivate={() => setActiveCategoryId(cat.id)} onDropNode={(nodeId) => reassignCategory(nodeId, cat.id)} />
            ))}
          </nav>
          <div className="px-2 py-2 border-t border-nomi-line">
            <button type="button" disabled className="w-full px-2 py-1.5 text-[12px] rounded-md border border-dashed border-nomi-line text-nomi-ink-40 cursor-not-allowed" title="自定义分类将在 Phase F 落地">
              + 新分类
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
