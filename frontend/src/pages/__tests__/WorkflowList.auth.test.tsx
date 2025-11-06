import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import type { components } from '@shipsec/backend-client'

import { WorkflowList } from '@/pages/WorkflowList'
import { useAuthStore, DEFAULT_ORG_ID } from '@/store/authStore'

type WorkflowResponseDto = components['schemas']['WorkflowResponseDto']

const mockWorkflows: WorkflowResponseDto[] = []

const listWorkflowsMock = mock(async () => mockWorkflows)

mock.module('@/services/api', () => ({
  api: {
    workflows: {
      list: listWorkflowsMock,
    },
  },
}))

async function resetAuthStore() {
  const persist = (useAuthStore as typeof useAuthStore & { persist?: { clearStorage?: () => Promise<void> } }).persist
  if (persist?.clearStorage) {
    await persist.clearStorage()
  }
  useAuthStore.setState({
    token: null,
    userId: null,
    organizationId: DEFAULT_ORG_ID,
    roles: ['ADMIN'],
    provider: 'local',
  })
}

const renderList = () =>
  render(
    <MemoryRouter>
      <WorkflowList />
    </MemoryRouter>,
  )

describe('WorkflowList role gating', () => {
  beforeEach(async () => {
    await resetAuthStore()
    listWorkflowsMock.mockResolvedValue([])
  })

  it('enables workflow creation for admins', async () => {
    renderList()
    const createButton = await screen.findByRole('button', { name: /create workflow/i })
    expect(createButton).toBeEnabled()
  })

  it('disables workflow creation for members', async () => {
    useAuthStore.setState({ roles: ['MEMBER'] })
    renderList()
    const createButton = await screen.findByRole('button', { name: /create workflow/i })
    expect(createButton).toBeDisabled()
  })
})
