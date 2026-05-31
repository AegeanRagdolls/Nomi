import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalProject } from './projectRepository'
import { getDesktopBridge } from '../../desktop/bridge'

vi.mock('../../desktop/bridge', () => ({
  getDesktopBridge: vi.fn(),
}))

const mockedGetDesktopBridge = vi.mocked(getDesktopBridge)

describe('projectRepository workspace project creation', () => {
  beforeEach(() => {
    mockedGetDesktopBridge.mockReset()
  })

  it('desktop createLocalProject does not pass arbitrary rootPath through projects.create', () => {
    const create = vi.fn((record: unknown) => ({ ...(record as object), id: 'desktop-id' }))
    mockedGetDesktopBridge.mockReturnValue({
      platform: 'darwin',
      workspace: {} as never,
      projects: { create } as never,
      cost: {} as never,
      assets: {} as never,
      exports: {} as never,
      tasks: {} as never,
      agents: {} as never,
      modelCatalog: {} as never,
    })

    createLocalProject('Desktop Project', undefined, { rootPath: '/Users/me/Work/Nomi Project' })

    expect(create).toHaveBeenCalledWith(expect.not.objectContaining({ rootPath: expect.any(String) }))
  })

  it('browser fallback still creates local project without rootPath', () => {
    mockedGetDesktopBridge.mockReturnValue(null)

    const record = createLocalProject('Browser Project')

    expect(record).toMatchObject({ name: 'Browser Project', version: 1 })
    expect('rootPath' in record).toBe(false)
  })
})
