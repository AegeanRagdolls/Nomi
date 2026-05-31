import React from 'react'
import { cn } from '../../utils/cn'
import { useWorkspaceFiles } from '../workspace/useWorkspaceFiles'
import FileTreeNode from './FileTreeNode'

type Props = {
  projectId: string | null
}

export default function WorkspaceFileExplorerPanel({ projectId }: Props): JSX.Element {
  const { items, loading, error, truncated, refresh } = useWorkspaceFiles(projectId)

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-2 py-2 border-b border-nomi-line">
        <span className="text-[11px] uppercase tracking-wider text-nomi-ink-40">项目文件</span>
        <button
          type="button"
          onClick={refresh}
          className="text-[11px] px-1.5 py-1 rounded text-nomi-ink-40 hover:text-nomi-ink hover:bg-nomi-bg"
          aria-label="刷新项目文件"
        >
          刷新
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-1.5 py-2">
        {!projectId ? <p className="px-2 py-4 text-[12px] text-nomi-ink-40">打开项目后显示文件</p> : null}
        {loading ? <p className="px-2 py-4 text-[12px] text-nomi-ink-40">正在读取项目文件…</p> : null}
        {error ? <p className="px-2 py-4 text-[12px] text-red-500">{error}</p> : null}
        {!loading && !error && projectId && items.length === 0 ? (
          <p className="px-2 py-4 text-[12px] text-nomi-ink-40">这个文件夹还没有可用素材</p>
        ) : null}
        {!loading && !error ? (
          <div className={cn('flex flex-col gap-0.5')}>
            {items.map((node) => <FileTreeNode key={node.id} node={node} projectId={projectId || ''} />)}
          </div>
        ) : null}
        {truncated ? <p className="px-2 py-2 text-[11px] text-nomi-ink-40">文件较多，已显示前 500 个</p> : null}
      </div>
    </div>
  )
}
