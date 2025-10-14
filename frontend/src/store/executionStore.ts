import { create } from 'zustand'
import { api } from '@/services/api'
import type { ExecutionLog, ExecutionStatus, ExecutionStatusResponse } from '@/schemas/execution'
import type { NodeStatus } from '@/schemas/node'

type ExecutionLifecycle =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

interface ExecutionStoreState {
  runId: string | null
  workflowId: string | null
  status: ExecutionLifecycle
  runStatus: ExecutionStatusResponse | null
  logs: ExecutionLog[]
  nodeStates: Record<string, NodeStatus>
  cursor: string | null
  pollingInterval: NodeJS.Timeout | null
}

interface ExecutionStoreActions {
  startExecution: (workflowId: string, inputs?: Record<string, unknown>) => Promise<string | undefined>
  monitorRun: (runId: string, workflowId?: string | null) => void
  pollOnce: () => Promise<void>
  stopPolling: () => void
  reset: () => void
}

type ExecutionStore = ExecutionStoreState & ExecutionStoreActions

const TERMINAL_STATUSES: ExecutionStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'TERMINATED', 'TIMED_OUT']

const mapStatusToLifecycle = (status: ExecutionStatus | undefined): ExecutionLifecycle => {
  switch (status) {
    case 'QUEUED':
      return 'queued'
    case 'RUNNING':
      return 'running'
    case 'COMPLETED':
      return 'completed'
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    case 'TERMINATED':
    case 'TIMED_OUT':
      return 'failed'
    default:
      return 'idle'
  }
}

const mergeLogs = (existing: ExecutionLog[], incoming: ExecutionLog[]): ExecutionLog[] => {
  if (incoming.length === 0) return existing
  const seen = new Set(existing.map((event) => event.id))
  const deduped = incoming.filter((event) => {
    if (seen.has(event.id)) return false
    seen.add(event.id)
    return true
  })
  if (deduped.length === 0) return existing
  return [...existing, ...deduped]
}

const deriveNodeStates = (events: ExecutionLog[]): Record<string, NodeStatus> => {
  const states: Record<string, NodeStatus> = {}
  for (const event of events) {
    if (!event.nodeId) continue
    switch (event.type) {
      case 'STARTED':
        states[event.nodeId] = 'running'
        break
      case 'PROGRESS':
        if (!states[event.nodeId]) {
          states[event.nodeId] = 'running'
        }
        break
      case 'COMPLETED':
        states[event.nodeId] = 'success'
        break
      case 'FAILED':
        states[event.nodeId] = 'error'
        break
      default:
        break
    }
  }
  return states
}

const INITIAL_STATE: ExecutionStoreState = {
  runId: null,
  workflowId: null,
  status: 'idle',
  runStatus: null,
  logs: [],
  nodeStates: {},
  cursor: null,
  pollingInterval: null,
}

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  ...INITIAL_STATE,

  startExecution: async (workflowId: string, inputs?: Record<string, unknown>) => {
    try {
      get().reset()
      set({ status: 'queued', workflowId })

      const { executionId } = await api.executions.start(workflowId, inputs)
      if (!executionId) {
        set({ status: 'failed' })
        return undefined
      }

      set({
        runId: executionId,
        status: 'running',
        logs: [],
        nodeStates: {},
        cursor: null,
      })

      await get().pollOnce()
      get().monitorRun(executionId, workflowId)

      return executionId
    } catch (error) {
      console.error('Failed to start execution:', error)
      set({ status: 'failed' })
      throw error
    }
  },

  monitorRun: (runId: string, workflowId?: string | null) => {
    if (!runId) return

    const existingInterval = get().pollingInterval
    if (existingInterval) {
      clearInterval(existingInterval)
    }

    if (workflowId) {
      set({ workflowId })
    }

    const poll = async () => {
      await get().pollOnce()
    }

    poll()

    const interval = setInterval(poll, 2000)
    set({ pollingInterval: interval, runId })
  },

  pollOnce: async () => {
    const runId = get().runId
    if (!runId) return

    try {
      const [statusPayload, traceEnvelope] = await Promise.all([
        api.executions.getStatus(runId),
        api.executions.getTrace(runId),
      ])

      set((state) => {
        const mergedLogs = mergeLogs(state.logs, traceEnvelope.events)
        const nodeStates = deriveNodeStates(mergedLogs)
        const lifecycle = mapStatusToLifecycle(statusPayload.status)

        return {
          runStatus: statusPayload,
          status: lifecycle,
          logs: mergedLogs,
          nodeStates,
          cursor: traceEnvelope.cursor ?? state.cursor,
        }
      })

      if (TERMINAL_STATUSES.includes(statusPayload.status)) {
        get().stopPolling()
      }
    } catch (error) {
      console.error('Failed to poll execution status:', error)
    }
  },

  stopPolling: () => {
    const interval = get().pollingInterval
    if (interval) {
      clearInterval(interval)
      set({ pollingInterval: null })
    }
  },

  reset: () => {
    const interval = get().pollingInterval
    if (interval) {
      clearInterval(interval)
    }
    set({ ...INITIAL_STATE })
  },
}))
