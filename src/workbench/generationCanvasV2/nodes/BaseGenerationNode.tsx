import React from 'react'
import { IconCopy, IconCrop, IconFlipHorizontal, IconFlipVertical, IconGripVertical, IconGrid3x3, IconInfoCircle, IconLayoutGrid, IconMaximize, IconRotate2, IconRotateClockwise2, IconUpload } from '@tabler/icons-react'
import ProvenancePanel from './ProvenancePanel'
import { getBuiltinCategoryById } from '../../project/projectCategories'
import CharacterCardNode from './render/CharacterCardNode'
import SceneCardNode from './render/SceneCardNode'
import PropCardNode from './render/PropCardNode'
import AudioStripNode from './render/AudioStripNode'
import ImageCropOverlay, { type CropRect } from './render/ImageCropOverlay'
import { cn } from '../../../utils/cn'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useWorkbenchStore } from '../../workbenchStore'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import {
  encodeTimelineGenerationNodeDragPayload,
  TIMELINE_GENERATION_NODE_DRAG_MIME,
} from '../../timeline/timelineDragPayload'
import { clientXToFrame } from '../../timeline/timelineEdit'
import { getTrackTypeForClipType } from '../../timeline/timelineTypes'
import { buildClipFromGenerationNode } from '../model/buildClipFromGenerationNode'
import { canRunGenerationNode } from '../runner/generationRunController'
import { WorkbenchButton } from '../../../design'
import NodeGenerationComposer from './NodeGenerationComposer'
import { buildVideoPlaybackUrl } from '../../../media/videoPlaybackUrl'
import { diagnoseVideoPlaybackFailure, logVideoPlaybackFailure } from '../../../media/videoPlaybackDiagnostics'
import PanoramaViewer, { type PanoramaScreenshot } from './PanoramaViewer'
import { getGenerationNodeExecutionKind } from '../model/generationNodeKinds'
import {
  canDragGenerationNodeToTimeline,
  TIMELINE_DRAG_HANDLE_LABEL,
} from '../model/timelineDragAffordance'

const STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  running: '生成中',
  error: '生成失败',
}

export type BaseGenerationNodeProps = {
  node: GenerationCanvasNode
  selected: boolean
  readOnly?: boolean
  focusFlash?: boolean
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type ImageGridSize = 2 | 3

type ImageGridTile = {
  dataUrl: string
  width: number
  height: number
  row: number
  column: number
}

const RESIZE_DIRECTIONS: ResizeDirection[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const MIN_NODE_WIDTH = 240
const MAX_NODE_WIDTH = 680
const MIN_NODE_HEIGHT = 120
const MAX_NODE_HEIGHT = 520
const TIMELINE_TRACK_CLIPS_SELECTOR = '.workbench-timeline-track__clips'
const FOCUS_GENERATION_NODE_EVENT = 'nomi-focus-generation-node'

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function nodeWidthForAspectRatio(aspectRatio: number): number {
  if (aspectRatio >= 1.75) return 420
  if (aspectRatio <= 0.72) return 260
  return 340
}

function mediaNodeSize(width: number, height: number, preferredWidth?: number): { width: number; height: number; previewHeight: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const aspectRatio = width / height
  const nodeWidth = clampNumber(preferredWidth || nodeWidthForAspectRatio(aspectRatio), 240, 680)
  const previewHeight = clampNumber(Math.round(nodeWidth / aspectRatio), 120, 520)
  return {
    width: nodeWidth,
    height: previewHeight,
    previewHeight,
  }
}

function imageGridTileNodeSize(width: number, height: number, preferredWidth: number): { width: number; height: number; previewHeight: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const aspectRatio = width / height
  const nodeWidth = clampNumber(preferredWidth, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
  const previewHeight = Math.max(1, Math.round(nodeWidth / aspectRatio))
  return {
    width: nodeWidth,
    height: previewHeight,
    previewHeight,
  }
}

function loadImageForCanvas(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image.'))
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      image.crossOrigin = 'anonymous'
    }
    image.src = url
  })
}

async function splitImageIntoGrid(url: string, gridSize: ImageGridSize): Promise<ImageGridTile[]> {
  if (typeof document === 'undefined') return []
  const image = await loadImageForCanvas(url)
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  if (!imageWidth || !imageHeight) return []

  const sourceTileWidth = imageWidth / gridSize
  const sourceTileHeight = imageHeight / gridSize
  const outputTileWidth = Math.max(1, Math.round(sourceTileWidth))
  const outputTileHeight = Math.max(1, Math.round(sourceTileHeight))
  const tiles: ImageGridTile[] = []
  for (let row = 0; row < gridSize; row += 1) {
    const sourceY = row * sourceTileHeight
    for (let column = 0; column < gridSize; column += 1) {
      const sourceX = column * sourceTileWidth
      const canvas = document.createElement('canvas')
      canvas.width = outputTileWidth
      canvas.height = outputTileHeight
      const context = canvas.getContext('2d')
      if (!context) continue
      context.drawImage(image, sourceX, sourceY, sourceTileWidth, sourceTileHeight, 0, 0, outputTileWidth, outputTileHeight)
      tiles.push({
        dataUrl: canvas.toDataURL('image/png'),
        width: outputTileWidth,
        height: outputTileHeight,
        row,
        column,
      })
    }
  }
  return tiles
}

async function cropImageRegion(
  url: string,
  rect: { x: number; y: number; w: number; h: number },
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof document === 'undefined') return null
  const image = await loadImageForCanvas(url)
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  if (!imageWidth || !imageHeight) return null
  const sx = clampNumber(Math.round(rect.x * imageWidth), 0, imageWidth - 1)
  const sy = clampNumber(Math.round(rect.y * imageHeight), 0, imageHeight - 1)
  const sw = clampNumber(Math.round(rect.w * imageWidth), 1, imageWidth - sx)
  const sh = clampNumber(Math.round(rect.h * imageHeight), 1, imageHeight - sy)
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)
  return { dataUrl: canvas.toDataURL('image/png'), width: sw, height: sh }
}

type ImageTransformOp = 'rotate-left' | 'rotate-right' | 'flip-h' | 'flip-v'

const IMAGE_TRANSFORM_LABEL: Record<ImageTransformOp, string> = {
  'rotate-left': '向左旋转 90°',
  'rotate-right': '向右旋转 90°',
  'flip-h': '水平翻转',
  'flip-v': '垂直翻转',
}

async function transformImage(
  url: string,
  op: ImageTransformOp,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof document === 'undefined') return null
  const image = await loadImageForCanvas(url)
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  if (!imageWidth || !imageHeight) return null
  const rotated = op === 'rotate-left' || op === 'rotate-right'
  const canvas = document.createElement('canvas')
  canvas.width = rotated ? imageHeight : imageWidth
  canvas.height = rotated ? imageWidth : imageHeight
  const context = canvas.getContext('2d')
  if (!context) return null
  if (op === 'rotate-left' || op === 'rotate-right') {
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate(op === 'rotate-right' ? Math.PI / 2 : -Math.PI / 2)
    context.drawImage(image, -imageWidth / 2, -imageHeight / 2)
  } else if (op === 'flip-h') {
    context.translate(imageWidth, 0)
    context.scale(-1, 1)
    context.drawImage(image, 0, 0)
  } else {
    context.translate(0, imageHeight)
    context.scale(1, -1)
    context.drawImage(image, 0, 0)
  }
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

function findTimelineDropTarget(clientX: number, clientY: number): HTMLElement | null {
  // v0.7.3 fix: elementsFromPoint (plural) 返回所有重叠元素，
  // 跳过被拖动的卡片本身（topmost）找下方的时间轴。
  // 单数版 elementFromPoint 只返回最顶层，拖动时永远是被拖卡片，永远找不到 timeline。
  if (typeof document.elementsFromPoint === 'function') {
    const elements = document.elementsFromPoint(clientX, clientY)
    for (const el of elements) {
      const target = el.closest(TIMELINE_TRACK_CLIPS_SELECTOR)
      if (target instanceof HTMLElement) return target
    }
    return null
  }
  // 兜底：老浏览器
  const element = document.elementFromPoint(clientX, clientY)
  if (!element) return null
  return element.closest(TIMELINE_TRACK_CLIPS_SELECTOR) as HTMLElement | null
}

function BaseGenerationNodeImpl({ node, selected, readOnly = false, focusFlash = false }: BaseGenerationNodeProps): JSX.Element {
  const selectNode = useGenerationCanvasStore((state) => state.selectNode)
  const captureHistory = useGenerationCanvasStore((state) => state.captureHistory)
  const commitPersistedChange = useGenerationCanvasStore((state) => state.commitPersistedChange)
  const moveNode = useGenerationCanvasStore((state) => state.moveNode)
  const moveSelectedNodes = useGenerationCanvasStore((state) => state.moveSelectedNodes)
  // v0.7.2 perf: 订阅 boolean primitive 而不是整个 selectedNodeIds 数组
  // 之前数组引用每次变都触发所有节点 rerender；现在仅当 multi-select 状态翻转时触发
  const isMultiSelectActive = useGenerationCanvasStore((state) => state.selectedNodeIds.length > 1)
  // v0.7.2 perf: sourceNode 拆成两个 primitive 订阅，避免对象引用引发的伪 update
  const sourceNodeTitle = useGenerationCanvasStore((state) => {
    if (!node.derivedFrom) return undefined
    return state.nodes.find((candidate) => candidate.id === node.derivedFrom)?.title
  })
  const sourceNodeCategoryId = useGenerationCanvasStore((state) => {
    if (!node.derivedFrom) return undefined
    return state.nodes.find((candidate) => candidate.id === node.derivedFrom)?.categoryId
  })
  const sourceNodeExists = useGenerationCanvasStore((state) => {
    if (!node.derivedFrom) return false
    return state.nodes.some((candidate) => candidate.id === node.derivedFrom)
  })
  const startConnection = useGenerationCanvasStore((state) => state.startConnection)
  const connectToNode = useGenerationCanvasStore((state) => state.connectToNode)
  const addNode = useGenerationCanvasStore((state) => state.addNode)
  const updateNode = useGenerationCanvasStore((state) => state.updateNode)
  const storeConnectNodes = useGenerationCanvasStore((state) => state.connectNodes)
  // v0.7.2 perf: 只关心 "this node 是否是 pending source"，boolean
  const isPendingConnectionSource = useGenerationCanvasStore((state) => state.pendingConnectionSourceId === node.id)
  const isPendingConnectionTarget = useGenerationCanvasStore((state) => state.pendingConnectionSourceId !== '' && state.pendingConnectionSourceId !== node.id)
  const canvasZoom = useGenerationCanvasStore((state) => state.canvasZoom)
  const panoramaFullscreenRef = React.useRef<(() => void) | null>(null)
  const panoramaFourViewRef = React.useRef<(() => void) | null>(null)
  const [splittingGridSize, setSplittingGridSize] = React.useState<ImageGridSize | null>(null)
  const [cropMode, setCropMode] = React.useState(false)
  const [imageOpBusy, setImageOpBusy] = React.useState(false)
  // E11: provenance viewer open state (mounted into node header for AI-generated assets)
  const [provenanceOpen, setProvenanceOpen] = React.useState(false)
  const dragStartRef = React.useRef<{
    pointerX: number
    pointerY: number
    x: number
    y: number
    lastDeltaX: number
    lastDeltaY: number
    multi: boolean
    dragging: boolean
  } | null>(null)
  const resizeStartRef = React.useRef<{
    pointerX: number
    pointerY: number
    x: number
    y: number
    width: number
    height: number
    direction: ResizeDirection
  } | null>(null)
  const moveFrameRef = React.useRef<number | null>(null)
  const pendingNodePositionRef = React.useRef<{ x: number; y: number } | null>(null)
  const pendingSelectedDeltaRef = React.useRef<{ x: number; y: number } | null>(null)

  const flushPendingMove = React.useCallback(() => {
    moveFrameRef.current = null
    const selectedDelta = pendingSelectedDeltaRef.current
    const nodePosition = pendingNodePositionRef.current
    pendingSelectedDeltaRef.current = null
    pendingNodePositionRef.current = null
    if (selectedDelta && (selectedDelta.x !== 0 || selectedDelta.y !== 0)) {
      moveSelectedNodes(selectedDelta, { persist: false })
    }
    if (nodePosition) {
      moveNode(node.id, nodePosition, { persist: false })
    }
  }, [moveNode, moveSelectedNodes, node.id])

  const requestMoveFrame = React.useCallback(() => {
    if (moveFrameRef.current !== null) return
    moveFrameRef.current = window.requestAnimationFrame(flushPendingMove)
  }, [flushPendingMove])

  const scheduleNodeMove = React.useCallback((position: { x: number; y: number }) => {
    pendingNodePositionRef.current = position
    requestMoveFrame()
  }, [requestMoveFrame])

  const scheduleSelectedMove = React.useCallback((delta: { x: number; y: number }) => {
    const pending = pendingSelectedDeltaRef.current
    pendingSelectedDeltaRef.current = pending
      ? { x: pending.x + delta.x, y: pending.y + delta.y }
      : delta
    requestMoveFrame()
  }, [requestMoveFrame])

  const flushScheduledMove = React.useCallback(() => {
    if (moveFrameRef.current !== null) {
      window.cancelAnimationFrame(moveFrameRef.current)
    }
    flushPendingMove()
  }, [flushPendingMove])

  React.useEffect(() => () => {
    if (moveFrameRef.current !== null) {
      window.cancelAnimationFrame(moveFrameRef.current)
      moveFrameRef.current = null
    }
  }, [])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea, select')) return
    if ((target as HTMLElement).tagName === 'VIDEO') return
    event.stopPropagation()
    if (readOnly) {
      selectNode(node.id, event.shiftKey)
      return
    }
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    captureHistory()
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: node.position.x,
      y: node.position.y,
      lastDeltaX: 0,
      lastDeltaY: 0,
      multi: selected && isMultiSelectActive,
      dragging: false,
    }
    selectNode(node.id, event.shiftKey)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resizeStart = resizeStartRef.current
    if (resizeStart) {
      const effectiveZoom = canvasZoom || 1
      const deltaX = Math.round((event.clientX - resizeStart.pointerX) / effectiveZoom)
      const deltaY = Math.round((event.clientY - resizeStart.pointerY) / effectiveZoom)
      const pullsWest = resizeStart.direction.includes('w')
      const pullsEast = resizeStart.direction.includes('e')
      const pullsNorth = resizeStart.direction.includes('n')
      const pullsSouth = resizeStart.direction.includes('s')
      // Compute the stored media aspect ratio (image or video)
      const mediaAspect = (
        typeof node.meta?.imageAspectRatio === 'number' && node.meta.imageAspectRatio > 0
          ? node.meta.imageAspectRatio
          : typeof node.meta?.videoAspectRatio === 'number' && node.meta.videoAspectRatio > 0
            ? node.meta.videoAspectRatio
            : null
      )
      let nextWidth: number
      let nextHeight: number
      if (mediaAspect) {
        // 等比缩放：任意把手（含四角/上下边）都锁图片比例，拉完不留空框。
        // 水平把手（含四角）以宽为主导，纯上下把手以高为主导；触界时按比例回算另一维。
        if (pullsEast || pullsWest) {
          nextWidth = clampNumber(
            pullsWest ? resizeStart.width - deltaX : resizeStart.width + deltaX,
            MIN_NODE_WIDTH,
            MAX_NODE_WIDTH,
          )
          nextHeight = Math.round(nextWidth / mediaAspect)
          if (nextHeight < MIN_NODE_HEIGHT || nextHeight > MAX_NODE_HEIGHT) {
            nextHeight = clampNumber(nextHeight, MIN_NODE_HEIGHT, MAX_NODE_HEIGHT)
            nextWidth = clampNumber(Math.round(nextHeight * mediaAspect), MIN_NODE_WIDTH, MAX_NODE_WIDTH)
          }
        } else {
          nextHeight = clampNumber(
            pullsNorth ? resizeStart.height - deltaY : resizeStart.height + deltaY,
            MIN_NODE_HEIGHT,
            MAX_NODE_HEIGHT,
          )
          nextWidth = Math.round(nextHeight * mediaAspect)
          if (nextWidth < MIN_NODE_WIDTH || nextWidth > MAX_NODE_WIDTH) {
            nextWidth = clampNumber(nextWidth, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
            nextHeight = clampNumber(Math.round(nextWidth / mediaAspect), MIN_NODE_HEIGHT, MAX_NODE_HEIGHT)
          }
        }
      } else {
        // 无媒体比例（未生成）：保持自由拉伸
        nextWidth = pullsWest
          ? clampNumber(resizeStart.width - deltaX, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
          : pullsEast
            ? clampNumber(resizeStart.width + deltaX, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
            : resizeStart.width
        nextHeight = pullsNorth
          ? clampNumber(resizeStart.height - deltaY, MIN_NODE_HEIGHT, MAX_NODE_HEIGHT)
          : pullsSouth
            ? clampNumber(resizeStart.height + deltaY, MIN_NODE_HEIGHT, MAX_NODE_HEIGHT)
            : resizeStart.height
      }
      updateNode(node.id, {
        position: {
          x: pullsWest ? resizeStart.x + resizeStart.width - nextWidth : resizeStart.x,
          y: pullsNorth ? resizeStart.y + resizeStart.height - nextHeight : resizeStart.y,
        },
        size: {
          width: nextWidth,
          height: nextHeight,
        },
        meta: {
          ...(node.meta || {}),
          userResized: true,
          previewHeight: nextHeight,
        },
      }, { persist: false })
      return
    }
    const dragStart = dragStartRef.current
    if (!dragStart) return
    const effectiveZoom = canvasZoom || 1
    const deltaX = Math.round((event.clientX - dragStart.pointerX) / effectiveZoom)
    const deltaY = Math.round((event.clientY - dragStart.pointerY) / effectiveZoom)
    if (!dragStart.dragging) {
      if (Math.abs(deltaX) < 2 && Math.abs(deltaY) < 2) return
      dragStart.dragging = true
    }
    event.preventDefault()
    event.stopPropagation()
    if (dragStart.multi) {
      scheduleSelectedMove({
        x: deltaX - dragStart.lastDeltaX,
        y: deltaY - dragStart.lastDeltaY,
      })
      dragStart.lastDeltaX = deltaX
      dragStart.lastDeltaY = deltaY
      return
    }
    scheduleNodeMove({
      x: Math.round(dragStart.x + deltaX),
      y: Math.round(dragStart.y + deltaY),
    })
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    flushScheduledMove()
    const dragStart = dragStartRef.current
    const hadResize = Boolean(resizeStartRef.current)
    const timelineDropTarget = dragStart?.dragging && node.result?.url
      ? findTimelineDropTarget(event.clientX, event.clientY)
      : null
    if (timelineDropTarget) {
      const timeline = useWorkbenchStore.getState().timeline
      const rect = timelineDropTarget.getBoundingClientRect()
      const startFrame = clientXToFrame(event.clientX, rect.left, timeline.scale)
      const clip = buildClipFromGenerationNode(node, {
        fps: timeline.fps,
        startFrame,
      })
      if (clip) {
        useWorkbenchStore.getState().addTimelineClipAtFrame(clip, getTrackTypeForClipType(clip.type), startFrame)
        if (!dragStart?.multi) {
          moveNode(node.id, {
            x: dragStart?.x ?? node.position.x,
            y: dragStart?.y ?? node.position.y,
          }, { persist: false })
        }
      }
    }
    if (dragStart?.dragging || hadResize) {
      commitPersistedChange()
    }
    dragStartRef.current = null
    resizeStartRef.current = null
    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      typeof event.currentTarget.releasePointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleTimelineDragStart = (event: React.DragEvent<HTMLElement>) => {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(
      TIMELINE_GENERATION_NODE_DRAG_MIME,
      encodeTimelineGenerationNodeDragPayload(node),
    )
  }

  const handleAddToTimelineAtPlayhead = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const timeline = useWorkbenchStore.getState().timeline
    const startFrame = timeline.playheadFrame
    const clip = buildClipFromGenerationNode(node, {
      fps: timeline.fps,
      startFrame,
    })
    if (!clip) return
    useWorkbenchStore.getState().addTimelineClipAtFrame(clip, getTrackTypeForClipType(clip.type), startFrame)
  }

  const handleResizePointerDown = (direction: ResizeDirection) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (readOnly) return
    captureHistory()
    resizeStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: node.position.x,
      y: node.position.y,
      width: visualSize.width,
      height: visualSize.height,
      direction,
    }
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const updateMediaDimensions = (width: number, height: number) => {
    const nextSize = mediaNodeSize(width, height, node.size?.width)
    if (!nextSize) return
    const meta = node.meta || {}
    const previousWidth = readFiniteNumber(meta.imageWidth ?? meta.videoWidth)
    const previousHeight = readFiniteNumber(meta.imageHeight ?? meta.videoHeight)
    const userResized = meta.userResized === true
    const mediaPatch = node.result?.type === 'video'
      ? { videoWidth: width, videoHeight: height, videoAspectRatio: width / height }
      : { imageWidth: width, imageHeight: height, imageAspectRatio: width / height }
    const shouldPatchSize = !userResized && (
      node.size?.width !== nextSize.width ||
      node.size?.height !== nextSize.height
    )
    if (previousWidth === width && previousHeight === height && !shouldPatchSize) return
    updateNode(node.id, {
      ...(shouldPatchSize ? { size: { width: nextSize.width, height: nextSize.height } } : {}),
      meta: {
        ...meta,
        ...mediaPatch,
        previewHeight: nextSize.previewHeight,
      },
    })
  }

  const handleFocusSourceNode = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!node.derivedFrom || typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(FOCUS_GENERATION_NODE_EVENT, { detail: { nodeId: node.derivedFrom } }))
  }, [node.derivedFrom])

  const handlePanoramaFileChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target?.result
      if (typeof dataUrl !== 'string') return
      updateNode(node.id, { result: { id: `panorama-${Date.now()}`, type: 'image', url: dataUrl, createdAt: Date.now() } })
    }
    reader.readAsDataURL(file)
  }, [node.id, updateNode])

  const status = node.status || 'idle'
  const size = node.size || { width: 320, height: 360 }
  // E.2.1: shots 分类的 composer 真正 flex-inlined（不再 absolute 浮在节点下方）
  // 配合 spec §6.1 修正 3：composer 内嵌到 card flex 流，与图像区共占节点视觉空间
  // [DESIGN-CARDS-07] renderKind 分发：非 shots 分类用专属 card 组件
  // renderKind 优先级：node.renderKind > 按 categoryId 推断
  const renderKind = (node.renderKind as string | undefined) ?? (
    node.categoryId === 'cast' ? 'character-card' :
    node.categoryId === 'scene' ? 'scene-card' :
    node.categoryId === 'prop' ? 'prop-card' :
    node.categoryId === 'audio' ? 'audio-strip' :
    undefined
  )
  const isCardKind = renderKind === 'character-card' || renderKind === 'scene-card' || renderKind === 'prop-card' || renderKind === 'audio-strip'
  const isImageGridSplitNode = node.kind === 'image' && typeof node.meta?.source === 'string' && node.meta.source.startsWith('image-grid-split-')
  const storedPreviewHeight = typeof node.meta?.previewHeight === 'number' && Number.isFinite(node.meta.previewHeight)
    ? isImageGridSplitNode
      ? Math.max(1, Math.round(node.meta.previewHeight))
      : clampNumber(Math.round(node.meta.previewHeight), 120, 520)
    : null
  const hasResult = Boolean(node.result?.url)
  // v0.7.1: 卡片模式按 spec 强制固定宽度（cards-design-v1 §4），非卡片走原逻辑
  const CARD_FIXED_WIDTH: Record<string, number> = {
    'character-card': 200,
    'scene-card': 320,
    'prop-card': 200,
    'audio-strip': 420,
  }
  const CARD_FIXED_HEIGHT: Record<string, number | null> = {
    'character-card': null, // 动态：宽/比例
    'scene-card': null,
    'prop-card': null,
    'audio-strip': 80,
  }
  const cardFixedWidth = isCardKind && renderKind ? CARD_FIXED_WIDTH[renderKind] : null
  const cardFixedHeight = isCardKind && renderKind ? CARD_FIXED_HEIGHT[renderKind] : null
  const previewHeight = cardFixedHeight ?? storedPreviewHeight ?? clampNumber(size.height, 120, 520)
  const visualSize = {
    width: cardFixedWidth ?? Math.max(MIN_NODE_WIDTH, size.width),
    height: previewHeight,
  }
  const isGenerating = status === 'queued' || status === 'running'
  // v0.7.2 perf: 用 boolean primitive 订阅 canGenerate，而不是 getState() 同步读
  // 之前 getState() 在 render 外读，不响应 nodes/edges 变化，是个隐藏 bug
  const canGenerate = useGenerationCanvasStore((state) =>
    canRunGenerationNode(node, { nodes: state.nodes, edges: state.edges }),
  ) && !isGenerating
  const canSendToTimeline = canDragGenerationNodeToTimeline(node, { readOnly })
  const showStatusBadge = status === 'queued' || status === 'running' || status === 'error'

  // v0.7.2 perf: 用 primitive 订阅 sourceNodeTitle / categoryId / exists 重组 label
  const sourceNodeLabel = sourceNodeTitle || (node.derivedFrom && !sourceNodeExists ? '源节点已不在当前项目' : (node.derivedFrom || ''))
  const sourceCategoryName = sourceNodeCategoryId
    ? getBuiltinCategoryById(sourceNodeCategoryId)?.name
    : null
  const independentCopyLabel = sourceCategoryName && sourceNodeExists
    ? `独立副本（来自 ${sourceCategoryName}·${sourceNodeLabel}）`
    : sourceNodeExists
      ? `独立副本（来自 ${sourceNodeLabel}）`
      : '独立副本（源节点已不存在）'
  const nodeExecutionKind = getGenerationNodeExecutionKind(node.kind)
  const handlePanoramaScreenshot = React.useCallback((screenshot: PanoramaScreenshot) => {
    const { dataUrl, dimensions } = screenshot
    const createdAt = Date.now()
    const screenshotNode = addNode({
      kind: 'image',
      title: screenshot.title || '全景截图',
      prompt: screenshot.prompt || '全景视口截图',
      position: {
        x: Math.round(node.position.x + visualSize.width + 80),
        y: Math.round(node.position.y),
      },
    })
    const result = {
      id: `panorama-shot-${screenshotNode.id}-${createdAt}`,
      type: 'image' as const,
      url: dataUrl,
      createdAt,
    }
    const screenshotSize = mediaNodeSize(dimensions.width, dimensions.height)
    updateNode(screenshotNode.id, {
      result,
      history: [result],
      status: 'success',
      ...(screenshotSize ? { size: { width: screenshotSize.width, height: screenshotSize.height } } : {}),
      meta: {
        ...(screenshotNode.meta || {}),
        source: screenshot.source || 'panorama-screenshot',
        sourceNodeId: node.id,
        localOnly: true,
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        imageAspectRatio: dimensions.width / Math.max(1, dimensions.height),
      },
    })
    storeConnectNodes(node.id, screenshotNode.id, 'reference')
  }, [addNode, node.id, node.position.x, node.position.y, storeConnectNodes, updateNode, visualSize.width])

  const handleImageGridSplit = React.useCallback(async (gridSize: ImageGridSize) => {
    const imageUrl = node.result?.type === 'image' ? node.result.url : undefined
    if (!imageUrl || splittingGridSize !== null) return

    setSplittingGridSize(gridSize)
    try {
      const tiles = await splitImageIntoGrid(imageUrl, gridSize)
      if (tiles.length !== gridSize * gridSize) return
      const createdAt = Date.now()
      const gap = 42
      const preferredTileWidth = Math.max(MIN_NODE_WIDTH, Math.round(visualSize.width / gridSize))
      const firstTileSize = imageGridTileNodeSize(tiles[0]?.width || 1, tiles[0]?.height || 1, preferredTileWidth)
      const layoutWidth = firstTileSize?.width || 240
      const layoutHeight = firstTileSize?.previewHeight || 180
      const baseX = Math.round(node.position.x + visualSize.width + 80)
      const baseY = Math.round(node.position.y)

      tiles.forEach((tile, index) => {
        const tileSize = imageGridTileNodeSize(tile.width, tile.height, layoutWidth)
        const tileNode = addNode({
          kind: 'image',
          title: `${node.title || '图片'} ${gridSize}x${gridSize} 切片 ${index + 1}`,
          prompt: `${gridSize}x${gridSize} 图片切片 ${tile.row + 1}-${tile.column + 1}`,
          position: {
            x: baseX + tile.column * (layoutWidth + gap),
            y: baseY + tile.row * (layoutHeight + gap),
          },
          select: false,
        })
        const result = {
          id: `image-split-${tileNode.id}-${createdAt}-${index}`,
          type: 'image' as const,
          url: tile.dataUrl,
          createdAt,
        }
        updateNode(tileNode.id, {
          result,
          history: [result],
          status: 'success',
          ...(tileSize ? { size: { width: tileSize.width, height: tileSize.height } } : {}),
          meta: {
            ...(tileNode.meta || {}),
            source: `image-grid-split-${gridSize}x${gridSize}`,
            sourceNodeId: node.id,
            localOnly: true,
            gridSize,
            gridRow: tile.row,
            gridColumn: tile.column,
            imageWidth: tile.width,
            imageHeight: tile.height,
            imageAspectRatio: tile.width / Math.max(1, tile.height),
            previewHeight: tileSize?.previewHeight,
          },
        })
        storeConnectNodes(node.id, tileNode.id, 'reference')
      })
    } catch {
      // Image splitting can fail if the source image cannot be loaded into a canvas due to CORS.
    } finally {
      setSplittingGridSize(null)
    }
  }, [
    addNode,
    node.id,
    node.position.x,
    node.position.y,
    node.result,
    node.title,
    splittingGridSize,
    storeConnectNodes,
    updateNode,
    visualSize.width,
  ])

  // 裁剪：不在原图上做破坏式操作，而是从原图「跳出」一个新节点（对齐宫格截图原则）。
  // 原节点零改动；新裁剪节点是普通 image 节点，可再缩放/再裁剪/拖时间线/当参考。
  const handleCropConfirm = React.useCallback(async (rect: CropRect) => {
    const imageUrl = node.result?.type === 'image' ? node.result.url : undefined
    setCropMode(false)
    if (!imageUrl) return
    try {
      const cropped = await cropImageRegion(imageUrl, rect)
      if (!cropped) return
      const createdAt = Date.now()
      const preferredWidth = clampNumber(visualSize.width, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
      const newSize = imageGridTileNodeSize(cropped.width, cropped.height, preferredWidth)
      const cropNode = addNode({
        kind: 'image',
        title: `${node.title || '图片'} 裁剪`,
        prompt: '图片裁剪',
        position: {
          x: Math.round(node.position.x + visualSize.width + 80),
          y: Math.round(node.position.y),
        },
        select: true,
      })
      const result = {
        id: `image-crop-${cropNode.id}-${createdAt}`,
        type: 'image' as const,
        url: cropped.dataUrl,
        createdAt,
      }
      updateNode(cropNode.id, {
        result,
        history: [result],
        status: 'success',
        ...(newSize ? { size: { width: newSize.width, height: newSize.height } } : {}),
        meta: {
          ...(cropNode.meta || {}),
          source: 'image-crop',
          sourceNodeId: node.id,
          localOnly: true,
          imageWidth: cropped.width,
          imageHeight: cropped.height,
          imageAspectRatio: cropped.width / Math.max(1, cropped.height),
          previewHeight: newSize?.previewHeight,
        },
      })
      storeConnectNodes(node.id, cropNode.id, 'reference')
    } catch {
      // Crop can fail if the source image cannot be loaded into a canvas due to CORS.
    }
  }, [
    addNode,
    node.id,
    node.position.x,
    node.position.y,
    node.result,
    node.title,
    storeConnectNodes,
    updateNode,
    visualSize.width,
  ])

  // 旋转 / 翻转：同款「跳出新节点」原则 —— canvas 处理后派生新 image 节点，原图保留。
  const handleImageTransform = React.useCallback(async (op: ImageTransformOp) => {
    const imageUrl = node.result?.type === 'image' ? node.result.url : undefined
    if (!imageUrl || imageOpBusy) return
    setImageOpBusy(true)
    try {
      const out = await transformImage(imageUrl, op)
      if (!out) return
      const createdAt = Date.now()
      const preferredWidth = clampNumber(visualSize.width, MIN_NODE_WIDTH, MAX_NODE_WIDTH)
      const newSize = imageGridTileNodeSize(out.width, out.height, preferredWidth)
      const opNode = addNode({
        kind: 'image',
        title: `${node.title || '图片'} ${IMAGE_TRANSFORM_LABEL[op]}`,
        prompt: IMAGE_TRANSFORM_LABEL[op],
        position: {
          x: Math.round(node.position.x + visualSize.width + 80),
          y: Math.round(node.position.y),
        },
        select: true,
      })
      const result = {
        id: `image-${op}-${opNode.id}-${createdAt}`,
        type: 'image' as const,
        url: out.dataUrl,
        createdAt,
      }
      updateNode(opNode.id, {
        result,
        history: [result],
        status: 'success',
        ...(newSize ? { size: { width: newSize.width, height: newSize.height } } : {}),
        meta: {
          ...(opNode.meta || {}),
          source: `image-${op}`,
          sourceNodeId: node.id,
          localOnly: true,
          imageWidth: out.width,
          imageHeight: out.height,
          imageAspectRatio: out.width / Math.max(1, out.height),
          previewHeight: newSize?.previewHeight,
        },
      })
      storeConnectNodes(node.id, opNode.id, 'reference')
    } catch {
      // Transform can fail if the source image cannot be loaded into a canvas due to CORS.
    } finally {
      setImageOpBusy(false)
    }
  }, [
    addNode,
    imageOpBusy,
    node.id,
    node.position.x,
    node.position.y,
    node.result,
    node.title,
    storeConnectNodes,
    updateNode,
    visualSize.width,
  ])

  return (
    <article
      className={cn(
        'generation-canvas-v2-node',
        'absolute p-0 border-0 rounded-none bg-transparent shadow-none',
        'cursor-grab select-none touch-none overflow-visible',
        'data-[selected=true]:z-[5]',
        'block',
      )}
      data-kind={node.kind}
      data-expanded={selected ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-focus-flash={focusFlash ? 'true' : 'false'}
      data-status={status}
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        width: visualSize.width,
        height: visualSize.height,
        gridTemplateRows: `${previewHeight}px`,
        willChange: 'transform',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {!readOnly ? (
        <>
          <WorkbenchButton
            className={cn(
              'generation-canvas-v2-node__handle generation-canvas-v2-node__handle--input',
              'absolute top-1/2 left-[-14px] inline-grid w-7 h-7 place-items-center p-0',
              'border-0 rounded-full bg-transparent -translate-y-1/2 cursor-crosshair',
              'opacity-80 transition-opacity duration-150 hover:opacity-100',
              'data-[active=true]:opacity-100',
            )}
            aria-label="连接到此节点"
            data-active={isPendingConnectionTarget ? 'true' : 'false'}
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              connectToNode(node.id)
            }}
          >
            <span className="generation-canvas-v2-node__handle-dot" aria-hidden="true" />
          </WorkbenchButton>
          <WorkbenchButton
            className={cn(
              'generation-canvas-v2-node__handle generation-canvas-v2-node__handle--output',
              'absolute top-1/2 right-[-14px] inline-grid w-7 h-7 place-items-center p-0',
              'border-0 rounded-full bg-transparent -translate-y-1/2 cursor-crosshair',
              'opacity-80 transition-opacity duration-150 hover:opacity-100',
              'data-[active=true]:opacity-100',
            )}
            aria-label="从此节点开始连线"
            data-active={isPendingConnectionSource ? 'true' : 'false'}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (typeof event.currentTarget.releasePointerCapture === 'function') {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
              startConnection(node.id)
            }}
          >
            <span className="generation-canvas-v2-node__handle-dot" aria-hidden="true" />
          </WorkbenchButton>
        </>
      ) : null}

      {node.kind === 'panorama' && selected && !readOnly && node.result?.url ? (
        <div
          className={cn(
            'generation-canvas-v2-node__panorama-toolbar',
            'absolute left-1/2 bottom-[calc(100%+18px)] z-[12]',
            'inline-flex items-center gap-1 min-h-[44px] py-[5px] px-2',
            'border border-[rgba(18,24,38,0.08)] rounded-[14px]',
            'bg-white/[0.96] shadow-[0_12px_34px_rgba(18,24,38,0.14)]',
            '-translate-x-1/2 backdrop-blur-[12px]',
          )}
          role="toolbar"
          aria-label="全景图操作"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className={cn(
              'inline-flex items-center justify-center gap-[7px]',
              'min-w-0 min-h-[34px] px-[11px] border-0 rounded-[9px]',
              'bg-transparent text-nomi-ink-80 font-[inherit] text-[13px] leading-none whitespace-nowrap cursor-pointer',
              'hover:bg-nomi-ink-05 hover:text-nomi-ink',
            )}
            type="button"
            onClick={() => panoramaFullscreenRef.current?.()}
          >
            <IconMaximize size={16} stroke={1.8} />
            <span>全景预览</span>
          </button>
          <button
            className={cn(
              'inline-flex items-center justify-center gap-[7px]',
              'min-w-0 min-h-[34px] px-[11px] border-0 rounded-[9px]',
              'bg-transparent text-nomi-ink-80 font-[inherit] text-[13px] leading-none whitespace-nowrap cursor-pointer',
              'hover:bg-nomi-ink-05 hover:text-nomi-ink',
            )}
            type="button"
            aria-label="四视图截图"
            title="四视图截图"
            onClick={() => panoramaFourViewRef.current?.()}
          >
            <IconLayoutGrid size={16} stroke={1.8} />
            <span>四视图截图</span>
          </button>
          <span className={cn('w-px h-[22px] bg-[rgba(18,24,38,0.1)]')} />
          <label className={cn(
            'inline-flex items-center justify-center gap-[7px]',
            'min-w-0 min-h-[34px] px-[11px] border-0 rounded-[9px]',
            'bg-transparent text-nomi-ink-80 font-[inherit] text-[13px] leading-none whitespace-nowrap cursor-pointer',
            'hover:bg-nomi-ink-05 hover:text-nomi-ink',
          )}>
            <IconUpload size={16} stroke={1.8} />
            <span>重新上传</span>
            <input className="hidden" type="file" accept="image/*" onChange={handlePanoramaFileChange} />
          </label>
        </div>
      ) : null}

      {node.kind === 'image' && selected && !readOnly && node.result?.type === 'image' && node.result.url ? (
        <div
          className={cn(
            'generation-canvas-v2-node__panorama-toolbar',
            'absolute left-1/2 bottom-[calc(100%+18px)] z-[12]',
            'inline-flex items-center gap-1 min-h-[44px] py-[5px] px-2',
            'border border-[rgba(18,24,38,0.08)] rounded-[14px]',
            'bg-white/[0.96] shadow-[0_12px_34px_rgba(18,24,38,0.14)]',
            '-translate-x-1/2 backdrop-blur-[12px]',
          )}
          role="toolbar"
          aria-label="图片切图操作"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className={cn(
              'inline-flex items-center justify-center gap-[7px]',
              'min-w-0 min-h-[34px] px-[11px] border-0 rounded-[9px]',
              'bg-transparent text-nomi-ink-80 font-[inherit] text-[13px] leading-none whitespace-nowrap cursor-pointer',
              'hover:bg-nomi-ink-05 hover:text-nomi-ink',
              'disabled:opacity-[0.45] disabled:cursor-wait',
            )}
            type="button"
            aria-label="四视图截图（2×2）"
            title="四视图截图（2×2）"
            disabled={splittingGridSize !== null}
            onClick={() => { void handleImageGridSplit(2) }}
          >
            <IconLayoutGrid size={16} stroke={1.8} />
            <span>四视图截图</span>
          </button>
          <button
            className={cn(
              'inline-flex items-center justify-center gap-[7px]',
              'min-w-0 min-h-[34px] px-[11px] border-0 rounded-[9px]',
              'bg-transparent text-nomi-ink-80 font-[inherit] text-[13px] leading-none whitespace-nowrap cursor-pointer',
              'hover:bg-nomi-ink-05 hover:text-nomi-ink',
              'disabled:opacity-[0.45] disabled:cursor-wait',
            )}
            type="button"
            aria-label="九宫格截图（3×3）"
            title="九宫格截图（3×3）"
            disabled={splittingGridSize !== null}
            onClick={() => { void handleImageGridSplit(3) }}
          >
            <IconGrid3x3 size={16} stroke={1.8} />
            <span>九宫格截图</span>
          </button>
          <span className={cn('w-px h-[22px] bg-[rgba(18,24,38,0.1)]')} />
          <button
            className={cn(
              'inline-flex items-center justify-center gap-[7px]',
              'min-w-0 min-h-[34px] px-[11px] border-0 rounded-[9px]',
              'bg-transparent text-nomi-ink-80 font-[inherit] text-[13px] leading-none whitespace-nowrap cursor-pointer',
              'hover:bg-nomi-ink-05 hover:text-nomi-ink',
              'disabled:opacity-[0.45] disabled:cursor-wait',
            )}
            type="button"
            aria-label="裁剪图片"
            title="裁剪（裁出一个新节点，原图保留）"
            disabled={cropMode || splittingGridSize !== null}
            onClick={() => setCropMode(true)}
          >
            <IconCrop size={16} stroke={1.8} />
            <span>裁剪</span>
          </button>
          <span className={cn('w-px h-[22px] bg-[rgba(18,24,38,0.1)]')} />
          {([
            { op: 'rotate-left' as const, Icon: IconRotate2 },
            { op: 'rotate-right' as const, Icon: IconRotateClockwise2 },
            { op: 'flip-h' as const, Icon: IconFlipHorizontal },
            { op: 'flip-v' as const, Icon: IconFlipVertical },
          ]).map(({ op, Icon }) => (
            <button
              key={op}
              className={cn(
                'inline-flex items-center justify-center',
                'min-w-0 w-[34px] min-h-[34px] border-0 rounded-[9px]',
                'bg-transparent text-nomi-ink-80 cursor-pointer',
                'hover:bg-nomi-ink-05 hover:text-nomi-ink',
                'disabled:opacity-[0.45] disabled:cursor-wait',
              )}
              type="button"
              aria-label={IMAGE_TRANSFORM_LABEL[op]}
              title={`${IMAGE_TRANSFORM_LABEL[op]}（生成一个新节点，原图保留）`}
              disabled={imageOpBusy || cropMode || splittingGridSize !== null}
              onClick={() => { void handleImageTransform(op) }}
            >
              <Icon size={16} stroke={1.8} />
            </button>
          ))}
        </div>
      ) : null}

      <header className={cn(
        'generation-canvas-v2-node__header',
        'absolute top-[10px] left-[10px] right-[10px] z-[2]',
        'flex items-center justify-start gap-2 min-h-0 p-0',
        'pointer-events-auto cursor-grab',
      )}>
        {showStatusBadge ? (
          <span
            className={cn(
              'text-[10.5px] font-medium tracking-[0.06em] uppercase',
              'py-[3px] px-2 rounded-[4px] backdrop-blur-[8px]',
              'bg-nomi-paper/[0.82] text-nomi-ink-60',
              'data-[status=success]:text-workbench-success-ink data-[status=success]:bg-workbench-success-soft',
              'data-[status=error]:text-workbench-danger data-[status=error]:bg-workbench-danger-soft',
            )}
            data-status={status}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
        ) : null}
        {/* E.2C-25 副本角标（spec §6.3）：跨分类独立副本永久显示。
            注：经 E.2C-16 migration 后，derivedFrom 仅承载跨分类独立副本语义；
            同分类内"基于此重生成"链路存到 regeneratedFrom 字段，不进此角标。 */}
        {node.derivedFrom ? (
          <button
            type="button"
            className="generation-canvas-v2-node__derived-badge"
            aria-label={sourceNodeExists ? `定位源节点：${sourceNodeLabel}` : '源节点已不存在'}
            title={independentCopyLabel}
            disabled={!sourceNodeExists}
            onClick={handleFocusSourceNode}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <IconCopy size={13} stroke={1.8} aria-hidden="true" />
            <span>独立副本</span>
          </button>
        ) : null}
        {hasResult ? (
          <button
            type="button"
            className={cn(
              'ml-auto inline-grid place-items-center w-6 h-6 rounded-full',
              'bg-nomi-paper/[0.82] text-nomi-ink-60 hover:text-nomi-ink',
              'backdrop-blur-[8px] cursor-pointer pointer-events-auto',
              'transition-colors duration-150',
            )}
            aria-label="查看生成记录"
            title="生成记录 / Provenance"
            onClick={(event) => {
              event.stopPropagation()
              setProvenanceOpen(true)
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <IconInfoCircle size={14} stroke={1.6} />
          </button>
        ) : null}
      </header>

      <ProvenancePanel
        node={node}
        open={provenanceOpen}
        onClose={() => setProvenanceOpen(false)}
      />

      {status === 'error' && node.error && !selected ? (
        <div className="generation-canvas-v2-node__error-peek" title={node.error}>
          {node.error.length > 40 ? node.error.slice(0, 40) + '…' : node.error}
        </div>
      ) : null}

      {/* [DESIGN-CARDS-07] 卡片分发：非 shots 分类直接渲染对应 card 组件
          preview div + composer 在卡片模式下隐藏 */}
      {isCardKind ? (
        <div className="w-full h-full rounded-nomi shadow-nomi-md overflow-hidden">
          {renderKind === 'character-card' && <CharacterCardNode node={node} />}
          {renderKind === 'scene-card' && <SceneCardNode node={node} />}
          {renderKind === 'prop-card' && <PropCardNode node={node} />}
          {renderKind === 'audio-strip' && <AudioStripNode node={node} />}
        </div>
      ) : null}

      <div
        className={cn(
          'generation-canvas-v2-node__preview',
          'relative w-full h-full min-h-0 overflow-hidden',
          'rounded-nomi shadow-nomi-md cursor-grab touch-none',
          // 棋盘格占位底纹只在「未生成」态出现；有结果后节点尺寸已贴合图片比例，
          // 不再露出底纹，避免图片外面套一层框。
          !hasResult && 'bg-[repeating-linear-gradient(45deg,var(--nomi-ink-05)_0_10px,var(--nomi-ink-10)_10px_20px)]',
          // [DESIGN-CARDS-07] 卡片模式隐藏 preview div
          isCardKind && 'hidden',
        )}
        data-timeline-draggable={canSendToTimeline ? 'true' : 'false'}
        draggable={false}
      >
        {node.kind === 'panorama' ? (
          node.result?.url || node.meta?.imageUrl ? (
            <PanoramaViewer
              imageUrl={(node.result?.url || node.meta?.imageUrl) as string}
              width={visualSize.width}
              height={previewHeight}
              onEnterFullscreen={(trigger) => { panoramaFullscreenRef.current = trigger }}
              onCaptureFourView={(trigger) => { panoramaFourViewRef.current = trigger }}
              onScreenshot={handlePanoramaScreenshot}
            />
          ) : (
            <div className={cn('flex w-full h-full items-center justify-center')}>
              <label
                className={cn(
                  'inline-flex items-center justify-center',
                  'min-w-[156px] min-h-[48px] px-[18px]',
                  'text-nomi-ink-60 text-[13px] cursor-pointer',
                )}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span>+ 上传全景图</span>
                <input className="hidden" type="file" accept="image/*" onChange={handlePanoramaFileChange} />
              </label>
            </div>
          )
        ) : node.result?.url ? (
          node.result.type === 'video' ? (
            <video
              className={cn(
                'w-full h-full min-h-0 object-contain pointer-events-auto',
                'bg-nomi-ink-05 select-none',
              )}
              src={buildVideoPlaybackUrl(node.result.url)}
              crossOrigin="use-credentials"
              controls
              muted
              playsInline
              preload="metadata"
              draggable={false}
              onPointerDown={(e) => e.stopPropagation()}
              onLoadedMetadata={(event) => {
                updateMediaDimensions(event.currentTarget.videoWidth, event.currentTarget.videoHeight)
              }}
              onError={(event) => {
                void diagnoseVideoPlaybackFailure(node.result?.url || '', event.currentTarget.error).then(logVideoPlaybackFailure)
              }}
            />
          ) : (
            <img
              className={cn(
                'w-full h-full min-h-0 object-contain pointer-events-none',
                'select-none',
              )}
              src={node.result.url}
              alt=""
              draggable={false}
              onLoad={(event) => {
                updateMediaDimensions(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
              }}
            />
          )
        ) : (
          // v0.8: 占位态。对于 video 节点（Kling 等），明确告诉用户需要首帧。
          <div className={cn('flex w-full h-full items-center justify-center pointer-events-none px-4 text-center')}>
            {selected ? null : nodeExecutionKind === 'video' && !canGenerate && !isGenerating ? (
              <span className="text-[11px] text-nomi-ink-40 leading-relaxed">
                把图片节点拖过来<br/>作为首帧
              </span>
            ) : (
              <span className="text-[11px] text-nomi-ink-40">等待生成</span>
            )}
          </div>
        )}
        {cropMode && node.kind === 'image' && node.result?.type === 'image' && node.result.url ? (
          <ImageCropOverlay
            imageUrl={node.result.url}
            onConfirm={(rect) => { void handleCropConfirm(rect) }}
            onCancel={() => setCropMode(false)}
          />
        ) : null}
      </div>

      {canSendToTimeline ? (
        <div
          role="button"
          tabIndex={0}
          className={cn(
            'generation-canvas-v2-node__timeline-drag group',
            'absolute top-1/2 right-[-42px] z-[7]',
            'inline-flex items-center justify-center',
            'w-8 h-12 m-0 p-0 border border-[rgba(18,24,38,0.08)] rounded-full',
            'bg-nomi-paper/[0.94] text-nomi-ink-60 font-[inherit]',
            'cursor-grab backdrop-blur-[10px] shadow-[0_10px_26px_rgba(18,24,38,0.14)]',
            '-translate-y-1/2 transition-[transform,color,background,box-shadow] duration-150 ease-out',
            'active:cursor-grabbing active:scale-[0.96]',
            'hover:bg-white hover:text-nomi-ink hover:shadow-[0_12px_30px_rgba(18,24,38,0.18)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workbench-accent)] focus-visible:ring-offset-2',
          )}
          aria-label={TIMELINE_DRAG_HANDLE_LABEL}
          title={TIMELINE_DRAG_HANDLE_LABEL}
          draggable
          onClick={handleAddToTimelineAtPlayhead}
          onDragStart={handleTimelineDragStart}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            handleAddToTimelineAtPlayhead(event)
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <IconGripVertical size={18} stroke={2.1} aria-hidden="true" />
          <span
            className={cn(
              'pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2',
              'whitespace-nowrap rounded-full px-2.5 py-1.5',
              'bg-[rgba(18,24,38,0.92)] text-white text-[11px] font-medium leading-none',
              'opacity-0 translate-x-[-4px] transition-[opacity,transform] duration-150',
              'group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0',
            )}
          >
            {TIMELINE_DRAG_HANDLE_LABEL}
          </span>
        </div>
      ) : null}

      {/* composer：仅生成类节点 + 选中时浮出（A1.5 抽成 NodeGenerationComposer）。
          素材节点不挂它；点中节点才弹出 prompt + 参数 + 生成按钮，未选中只看图。 */}
      {selected && !readOnly && node.kind !== 'panorama' ? (
        <NodeGenerationComposer node={node} visualSize={visualSize} />
      ) : null}
      {selected && !readOnly ? RESIZE_DIRECTIONS.map((direction) => (
        <WorkbenchButton
          key={direction}
          className={cn(
            'generation-canvas-v2-node__resize-zone',
            `generation-canvas-v2-node__resize-zone--${direction}`,
            'absolute z-[6] p-0 border-0 bg-transparent',
            'focus-visible:outline-2 focus-visible:outline-nomi-accent focus-visible:outline-offset-2',
            (direction === 'n' || direction === 's') && 'left-[10px] w-[calc(100%-20px)] h-[10px] cursor-ns-resize',
            direction === 'n' && 'top-[-5px]',
            direction === 's' && 'bottom-[-5px]',
            (direction === 'e' || direction === 'w') && 'top-[10px] w-[10px] h-[calc(100%-20px)] cursor-ew-resize',
            direction === 'e' && 'right-[-5px]',
            direction === 'w' && 'left-[-5px]',
            (direction === 'ne' || direction === 'nw' || direction === 'se' || direction === 'sw') && 'w-4 h-4',
            (direction === 'ne' || direction === 'sw') && 'cursor-nesw-resize',
            (direction === 'nw' || direction === 'se') && 'cursor-nwse-resize',
            direction === 'ne' && 'top-[-8px] right-[-8px]',
            direction === 'nw' && 'top-[-8px] left-[-8px]',
            direction === 'se' && 'right-[-8px] bottom-[-8px]',
            direction === 'sw' && 'bottom-[-8px] left-[-8px]',
          )}
          aria-label={`从${direction}方向调整节点尺寸`}
          title="调整节点尺寸"
          onPointerDown={handleResizePointerDown(direction)}
        />
      )) : null}
    </article>
  )
}

// v0.7.1 perf: memo wrap — node 引用稳定时跳过 rerender。
// 父级 GenerationCanvas 须保证 node 是 zustand store 里同一引用（zustand immer 默认就是）。
const BaseGenerationNode = React.memo(BaseGenerationNodeImpl, (prev, next) =>
  prev.node === next.node &&
  prev.selected === next.selected &&
  prev.readOnly === next.readOnly &&
  prev.focusFlash === next.focusFlash,
)
BaseGenerationNode.displayName = 'BaseGenerationNode'
export default BaseGenerationNode
