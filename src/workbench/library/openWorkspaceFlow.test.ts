import { describe, expect, it, vi } from 'vitest'
import { openWorkspaceFromLibrary } from './openWorkspaceFlow'
import type { DesktopBridge } from '../../desktop/bridge'

function desktopBridge(overrides: Partial<DesktopBridge['workspace']>): DesktopBridge {
  return {
    platform: 'darwin',
    workspace: {
      selectFolder: vi.fn(async () => ({ canceled: true as const })),
      openFolder: vi.fn(async () => ({ id: 'project-id' })),
      ...overrides,
    },
    projects: {} as DesktopBridge['projects'],
    cost: {} as DesktopBridge['cost'],
    assets: {} as DesktopBridge['assets'],
    exports: {} as DesktopBridge['exports'],
    tasks: {} as DesktopBridge['tasks'],
    agents: {} as DesktopBridge['agents'],
    modelCatalog: {} as DesktopBridge['modelCatalog'],
  }
}

describe('openWorkspaceFromLibrary', () => {
  it('does nothing when folder selection is canceled', async () => {
    const bridge = desktopBridge({ selectFolder: vi.fn(async () => ({ canceled: true })) })
    const hydrateProject = vi.fn()

    await openWorkspaceFromLibrary({ bridge, hydrateProject, confirmInitialize: vi.fn(), refreshProjects: vi.fn(), showMessage: vi.fn() })

    expect(bridge.workspace.openFolder).not.toHaveBeenCalled()
    expect(hydrateProject).not.toHaveBeenCalled()
  })

  it('opens existing workspace without reinitializing', async () => {
    const bridge = desktopBridge({
      selectFolder: vi.fn(async () => ({ canceled: false, rootPath: '/tmp/existing' })),
      openFolder: vi.fn(async () => ({ id: 'existing-id' })),
    })
    const hydrateProject = vi.fn(async () => true)
    const refreshProjects = vi.fn()

    await openWorkspaceFromLibrary({ bridge, hydrateProject, confirmInitialize: vi.fn(), refreshProjects, showMessage: vi.fn() })

    expect(bridge.workspace.openFolder).toHaveBeenCalledWith({ rootPath: '/tmp/existing', initialize: false })
    expect(refreshProjects).toHaveBeenCalled()
    expect(hydrateProject).toHaveBeenCalledWith('existing-id')
  })

  it('initializes selected folder when user confirms', async () => {
    const bridge = desktopBridge({
      selectFolder: vi.fn(async () => ({ canceled: false, rootPath: '/tmp/new-folder' })),
      openFolder: vi
        .fn()
        .mockRejectedValueOnce(new Error('Workspace folder is not initialized'))
        .mockResolvedValueOnce({ id: 'new-id' }),
    })
    const hydrateProject = vi.fn(async () => true)
    const confirmInitialize = vi.fn(async () => true)

    await openWorkspaceFromLibrary({ bridge, hydrateProject, confirmInitialize, refreshProjects: vi.fn(), showMessage: vi.fn() })

    expect(confirmInitialize).toHaveBeenCalledWith('/tmp/new-folder')
    expect(bridge.workspace.openFolder).toHaveBeenLastCalledWith({ rootPath: '/tmp/new-folder', initialize: true })
    expect(hydrateProject).toHaveBeenCalledWith('new-id')
  })

  it('surfaces permission errors as user-facing messages', async () => {
    const bridge = desktopBridge({
      selectFolder: vi.fn(async () => ({ canceled: false, rootPath: '/tmp/blocked' })),
      openFolder: vi.fn(async () => { throw new Error('EACCES: permission denied') }),
    })
    const showMessage = vi.fn()

    await openWorkspaceFromLibrary({ bridge, hydrateProject: vi.fn(), confirmInitialize: vi.fn(), refreshProjects: vi.fn(), showMessage })

    expect(showMessage).toHaveBeenCalledWith('EACCES: permission denied', 'error')
  })
})
