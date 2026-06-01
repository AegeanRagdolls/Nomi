import type { AgentsChatResponseDto, AgentChatV2Session } from '../../api/server'
import { sendWorkbenchAiMessage } from './workbenchAiClient'

/**
 * One shared agent runner for both workbench panels (创作区 + 生成区).
 *
 * The backend engine (`runAgentChatV2`) is identical for both areas; only the
 * tool group differs (selected by skillKey). This runner owns the common
 * plumbing: send the message, stream content back via `onContent`, and surface
 * each LLM tool call as a `ToolCallEvent` whose `confirm` callback feeds the
 * user's decision back into the IPC session so the loop can continue.
 *
 * Read tools are auto-confirmed by the caller; write/destructive tools render a
 * confirmation card and confirm only after the user approves.
 */

/**
 * Both workbench panels (创作区 + 生成区) share one backend memory key so the
 * agent remembers across turns AND across the two areas. Keyed by project so
 * different projects don't bleed context.
 */
export function workbenchSessionKey(): string {
  let projectId = ''
  if (typeof window !== 'undefined') {
    try {
      projectId = String(new URL(window.location.href).searchParams.get('projectId') || '').trim()
    } catch {
      projectId = ''
    }
  }
  return `nomi:workbench:${projectId || 'local'}`
}

export type ToolCallEvent = {
  toolCallId: string
  toolName: string
  args: unknown
  /** Resolve with the user's decision; main process feeds the result back to the model. */
  confirm: (decision: { ok: true; result?: unknown } | { ok: false; message?: string }) => Promise<void>
}

export type RunWorkbenchAgentInput = {
  /** Full prompt handed to the model (system context is added by the backend skill). */
  prompt: string
  /** Short text shown in the user's chat bubble / thread history. */
  displayPrompt: string
  /** Shared backend memory key. Both areas use `nomi:workbench:<projectId|local>`. */
  sessionKey: string
  /** Selects the backend tool group + system prompt. */
  skillKey: string
  skillName: string
  projectId?: string
  mode?: 'auto'
  onContent?: (delta: string, text: string) => void
  /**
   * Called whenever the LLM issues a tool call. The caller shows UI (or
   * auto-executes for read tools) and must invoke `event.confirm(...)`.
   */
  onToolCall?: (event: ToolCallEvent) => void
}

export async function runWorkbenchAgent(input: RunWorkbenchAgentInput): Promise<AgentsChatResponseDto> {
  const request = {
    prompt: input.prompt,
    displayPrompt: input.displayPrompt,
    sessionKey: input.sessionKey,
    projectId: input.projectId || '',
    flowId: '',
    projectName: '',
    skillKey: input.skillKey,
    skillName: input.skillName,
    mode: input.mode || ('auto' as const),
  }

  let activeSession: AgentChatV2Session | null = null
  const handlers = {
    onContent: input.onContent,
    onSession: (session: AgentChatV2Session) => {
      activeSession = session
    },
    onEvent: (event: { event: string; data: Record<string, unknown> | Record<string, never> }) => {
      if (event.event !== 'tool-call') return
      const data = event.data as { toolCallId: string; toolName: string; args: unknown }
      input.onToolCall?.({
        toolCallId: data.toolCallId,
        toolName: data.toolName,
        args: data.args,
        confirm: async (decision) => {
          if (!activeSession) return
          await activeSession.confirmTool(data.toolCallId, decision)
        },
      })
    },
  }

  return sendWorkbenchAiMessage(request, handlers)
}
