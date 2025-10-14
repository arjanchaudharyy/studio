import { describe, it, beforeEach, expect, vi } from 'bun:test'
const mockExecutions = {
  start: vi.fn(),
  getStatus: vi.fn(),
  getTrace: vi.fn(),
  cancel: vi.fn(),
}

vi.mock('@/services/api', () => ({
  api: {
    executions: mockExecutions,
  },
}))

import { useExecutionStore } from '../executionStore'
import type { ExecutionLog, ExecutionStatusResponse } from '@/schemas/execution'

const baseStatus = (overrides: Partial<ExecutionStatusResponse> = {}): ExecutionStatusResponse => ({
  runId: 'run-1',
  workflowId: 'wf-1',
  status: 'RUNNING',
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  taskQueue: 'shipsec-default',
  historyLength: 0,
  ...overrides,
})

const event = (overrides: Partial<ExecutionLog> = {}): ExecutionLog => ({
  id: overrides.id ?? Math.random().toString(16).slice(2),
  runId: 'run-1',
  nodeId: 'node-1',
  type: 'STARTED',
  level: 'info',
  timestamp: new Date().toISOString(),
  ...overrides,
})

beforeEach(() => {
  useExecutionStore.getState().reset()
  vi.resetAllMocks()
})

describe('useExecutionStore', () => {
  it('merges new trace events without duplicating existing ones', async () => {
    const initialEvent = event({ id: '1', type: 'STARTED' })
    useExecutionStore.setState({
      runId: 'run-1',
      workflowId: 'wf-1',
      status: 'running',
      logs: [initialEvent],
    })

    mockExecutions.getStatus.mockResolvedValue(baseStatus())
    mockExecutions.getTrace.mockResolvedValue({
      runId: 'run-1',
      cursor: '2',
      events: [
        initialEvent,
        event({ id: '2', type: 'COMPLETED', nodeId: 'node-1' }),
      ],
    })

    await useExecutionStore.getState().pollOnce()

    const { logs, nodeStates } = useExecutionStore.getState()
    expect(logs).toHaveLength(2)
    expect(nodeStates['node-1']).toBe('success')
  })

  it('stops polling when execution reaches a terminal status', async () => {
    const interval = setInterval(() => {}, 1000)
    useExecutionStore.setState({
      runId: 'run-1',
      pollingInterval: interval,
    })

    mockExecutions.getStatus.mockResolvedValue(baseStatus({ status: 'FAILED' }))
    mockExecutions.getTrace.mockResolvedValue({
      runId: 'run-1',
      cursor: '1',
      events: [event({ id: '1', type: 'FAILED' })],
    })

    await useExecutionStore.getState().pollOnce()

    expect(useExecutionStore.getState().pollingInterval).toBeNull()
    expect(useExecutionStore.getState().status).toBe('failed')
  })
})
