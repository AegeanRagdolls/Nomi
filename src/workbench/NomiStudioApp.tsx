import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import WorkbenchShell from './WorkbenchShell'
import ProjectLibraryPage from './library/ProjectLibraryPage'
import { CanvasAssistantPanel, GenerationCanvas } from './generationCanvasV2'
import { ToastHost } from '../ui/toast'
import StatsModelCatalogManagement from '../ui/stats/system/modelCatalog/StatsModelCatalogManagement'
import {
  createLocalProject,
  deleteLocalProject,
  useLocalProjects,
  type LocalProjectSummary,
} from './library/localProjectStore'
import { createWorkbenchProjectPersistenceService } from './project/projectPersistenceService'
import { useWorkspaceEvents } from './useWorkspaceEvents'
import { DesignDrawer } from '../design'
import { toast } from '../ui/toast'
import { setDesktopActiveProjectId } from '../desktop/activeProject'
import { buildStudioUrl } from '../utils/appRoutes'

type AppView = 'library' | 'studio'

function readProjectIdFromSearch(search: string): string | null {
  try {
    const value = new URLSearchParams(search).get('projectId')
    return value && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

export default function NomiStudioApp(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const [view, setView] = React.useState<AppView>('library')
  const { projects } = useLocalProjects()
  const [activeProject, setActiveProject] = React.useState<LocalProjectSummary | null>(null)
  const [generationAiCollapsed, setGenerationAiCollapsed] = React.useState(true)
  const [modelCatalogOpened, setModelCatalogOpened] = React.useState(false)
  const hydratingProjectRef = React.useRef(false)
  const activeProjectIdRef = React.useRef<string | null>(null)
  const initialHydrationAttemptedRef = React.useRef(false)
  const projectPersistenceServiceRef = React.useRef<ReturnType<typeof createWorkbenchProjectPersistenceService> | null>(null)
  const routeProjectId = React.useMemo(() => readProjectIdFromSearch(location.search), [location.search])
  const activeProjectPersistenceKey = activeProject ? `${activeProject.id}\u0000${activeProject.name}` : ''

  React.useEffect(() => {
    document.documentElement.dataset.theme = 'light'
    document.documentElement.setAttribute('data-mantine-color-scheme', 'light')
  }, [])

  React.useEffect(() => {
    const handleOpenModelCatalog = () => setModelCatalogOpened(true)
    window.addEventListener('nomi-open-model-catalog', handleOpenModelCatalog)
    return () => window.removeEventListener('nomi-open-model-catalog', handleOpenModelCatalog)
  }, [])

  if (projectPersistenceServiceRef.current === null) {
    projectPersistenceServiceRef.current = createWorkbenchProjectPersistenceService({
      setActiveProject,
      setView,
      onSaveError: (error) => {
        console.error('project save error', error)
        toast('项目保存失败，请检查本地磁盘权限', 'error')
      },
    })
  }

  React.useEffect(() => {
    setDesktopActiveProjectId(activeProject?.id)
  }, [activeProject?.id])

  const hydrateProject = React.useCallback(async (projectId: string, options: { replaceUrl?: boolean } = {}) => {
    const service = projectPersistenceServiceRef.current
    if (!service) return false
    hydratingProjectRef.current = true
    try {
      const hydrated = await service.hydrateProject(projectId)
      if (!hydrated) return false
      activeProjectIdRef.current = hydrated.id
      setActiveProject(hydrated)
      setView('studio')
      navigate(buildStudioUrl(hydrated.id), { replace: options.replaceUrl ?? false })
    } finally {
      hydratingProjectRef.current = false
    }
    return true
  }, [navigate])

  const openProject = React.useCallback((projectId: string) => {
    void hydrateProject(projectId)
  }, [hydrateProject])

  const newProject = React.useCallback(async () => {
    const project = createLocalProject()
    void hydrateProject(project.id)
  }, [hydrateProject])

  const deleteProject = React.useCallback((project: LocalProjectSummary) => {
    const confirmed = window.confirm(`确定删除「${project.name}」吗？项目文件夹和本地资源会一起删除。`)
    if (!confirmed) return
    try {
      deleteLocalProject(project.id)
      if (activeProjectIdRef.current === project.id) {
        activeProjectIdRef.current = null
        setActiveProject(null)
        setView('library')
        navigate(buildStudioUrl(), { replace: true })
      }
      toast('项目已删除', 'success')
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : '项目删除失败'
      console.error(message)
      toast(message, 'error')
    }
  }, [navigate])

  React.useEffect(() => {
    if (initialHydrationAttemptedRef.current) return
    initialHydrationAttemptedRef.current = true
    const service = projectPersistenceServiceRef.current
    if (!service) return
    hydratingProjectRef.current = true
    void service.hydrateInitialProject(projects).then((hydrated) => {
      if (hydrated) {
        activeProjectIdRef.current = hydrated.id
        setActiveProject(hydrated)
        setView('studio')
        navigate(buildStudioUrl(hydrated.id), { replace: true })
      } else {
        if (routeProjectId) navigate(buildStudioUrl(), { replace: true })
      }
    }).catch((error: unknown) => {
      const message = error instanceof Error && error.message ? error.message : '项目恢复失败'
      console.error(message)
    }).finally(() => {
      hydratingProjectRef.current = false
    })
  }, [navigate, projects, routeProjectId])

  React.useEffect(() => {
    if (!initialHydrationAttemptedRef.current || hydratingProjectRef.current) return
    if (!routeProjectId || routeProjectId === activeProjectIdRef.current) return
    void hydrateProject(routeProjectId, { replaceUrl: true }).then((ok) => {
      if (!ok) navigate(buildStudioUrl(), { replace: true })
    })
  }, [hydrateProject, navigate, routeProjectId])

  React.useEffect(() => {
    if (!activeProject?.id) return
    const service = projectPersistenceServiceRef.current
    if (!service) return undefined
    return service.bindProjectPersistence({
      project: activeProject,
      isHydrating: () => hydratingProjectRef.current,
      canPersist: () => activeProjectIdRef.current === activeProject.id,
      onSaved: (saved) => {
        setActiveProject(saved)
      },
      onSaveError: (error) => {
        console.error('project save error', error)
        toast('项目保存失败，请检查本地磁盘权限', 'error')
      },
    })
  }, [activeProjectPersistenceKey])

  useWorkspaceEvents(view === 'studio' ? activeProject?.id : null, (type) => {
    if (type === 'canvas.updated' || type === 'timeline.updated' || type === 'creation.updated') {
      void hydrateProject(activeProject!.id)
    }
  })

  const backToLibrary = React.useCallback(() => {
    setView('library')
    navigate(buildStudioUrl(), { replace: false })
  }, [navigate])

  if (view === 'library') {
    return (
      <>
        <ProjectLibraryPage
          projects={projects}
          onOpenProject={openProject}
          onDeleteProject={deleteProject}
          onNewProject={() => void newProject()}
        />
        <ToastHost className="nomi-studio-app__toast-host" />
      </>
    )
  }

  return (
    <div className="nomi-studio-app" aria-label="Nomi Studio">
      <WorkbenchShell
        generation={<GenerationCanvas />}
        generationAiLayout={generationAiCollapsed ? 'overlay' : 'sidebar'}
        generationAi={<CanvasAssistantPanel defaultCollapsed onCollapsedChange={setGenerationAiCollapsed} />}
        onBackToLibrary={backToLibrary}
        onOpenModelCatalog={() => setModelCatalogOpened(true)}
      />
      <DesignDrawer
        className="nomi-model-catalog-drawer"
        opened={modelCatalogOpened}
        onClose={() => setModelCatalogOpened(false)}
        position="right"
        size={560}
        zIndex={4000}
        withinPortal
      >
        <StatsModelCatalogManagement className="nomi-model-catalog-drawer__content" compact />
      </DesignDrawer>
      <ToastHost className="nomi-studio-app__toast-host" />
    </div>
  )
}
