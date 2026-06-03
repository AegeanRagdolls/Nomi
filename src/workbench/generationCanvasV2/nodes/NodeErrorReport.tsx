import React from 'react'
import { createPortal } from 'react-dom'
import { IconAlertTriangle, IconChevronRight, IconChevronDown } from '@tabler/icons-react'
import { classifyGenerationError } from '../runner/generationRunController'

/**
 * Generation failure report on a node.
 *
 * Replaces the old unreadable "!" ErrorBadge (copy-to-clipboard only) and the
 * truncated inline error-peek. Collapsed: one readable human reason. Click →
 * a Portal popover (out of the node's `overflow-hidden` + reactflow zoom) with
 * the reason, an actionable hint, the foldable raw error, and 重试.
 *
 * The classifier (`classifyGenerationError`) is the single source of truth in
 * the runner — the UI never re-implements error parsing.
 */
export function NodeErrorReport({ message, onRetry }: { message: string; onRetry?: () => void }): JSX.Element {
  const report = React.useMemo(() => classifyGenerationError(message), [message])
  const [open, setOpen] = React.useState(false)
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  const [showRaw, setShowRaw] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const stripRef = React.useRef<HTMLButtonElement>(null)

  const close = React.useCallback(() => { setOpen(false); setShowRaw(false) }, [])

  const openPanel = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (stripRef.current) setRect(stripRef.current.getBoundingClientRect())
    setOpen(true)
  }, [])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onWheel = () => close() // canvas pan/zoom → dismiss rather than mis-position
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true, capture: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
    }
  }, [open, close])

  const copy = React.useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(report.raw)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch { /* read-only env */ }
  }, [report.raw])

  return (
    <>
      <button
        ref={stripRef}
        type="button"
        onClick={openPanel}
        aria-label={`生成失败：${report.reason}，点击查看详情`}
        className="flex w-full items-center gap-1.5 rounded-nomi-sm bg-workbench-danger-soft px-2 py-1.5 text-workbench-danger"
      >
        <IconAlertTriangle size={14} stroke={1.6} className="shrink-0" />
        <span className="flex-1 truncate text-left text-[12px] font-medium">{report.reason}</span>
        <IconChevronRight size={14} stroke={1.6} className="shrink-0 opacity-70" />
      </button>

      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[4000]" onMouseDown={close} />
          <div
            role="dialog"
            aria-label={`错误详情：${report.reason}`}
            className="fixed z-[4001] w-[320px] rounded-nomi border border-nomi-line bg-nomi-paper p-3 shadow-nomi-lg"
            style={{
              left: Math.max(8, Math.min(rect.left, window.innerWidth - 328)),
              top: Math.min(rect.bottom + 6, window.innerHeight - 200),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5">
              <IconAlertTriangle size={16} stroke={1.6} className="shrink-0 text-workbench-danger" />
              <span className="text-[13px] font-bold text-workbench-danger">{report.reason}</span>
            </div>
            {report.hint && <p className="my-2 text-[12px] leading-relaxed text-nomi-ink">{report.hint}</p>}
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="flex items-center gap-1 text-[12px] text-nomi-ink-60 hover:text-nomi-ink"
            >
              {showRaw ? <IconChevronDown size={13} stroke={1.6} /> : <IconChevronRight size={13} stroke={1.6} />}
              原始错误
            </button>
            {showRaw && (
              <pre className="mt-1.5 max-h-[90px] overflow-auto whitespace-pre-wrap break-all rounded-nomi-sm bg-nomi-ink-05 p-2 font-nomi-mono text-[11px] text-nomi-ink-60">{report.raw}</pre>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={copy}
                className="h-7 rounded-nomi-sm border border-nomi-line px-3 text-[12px] text-nomi-ink hover:bg-nomi-ink-05"
              >
                {copied ? '已复制' : '复制详情'}
              </button>
              {onRetry && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); close(); onRetry() }}
                  className="h-7 rounded-nomi-sm bg-nomi-ink px-3 text-[12px] text-nomi-paper hover:bg-nomi-accent"
                >
                  重试
                </button>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
