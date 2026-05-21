let activeProjectId = ''

export function setDesktopActiveProjectId(projectId: string | null | undefined): void {
  activeProjectId = typeof projectId === 'string' ? projectId.trim() : ''
}

export function getDesktopActiveProjectId(): string {
  return activeProjectId
}
