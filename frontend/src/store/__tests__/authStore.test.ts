import { beforeEach, describe, expect, it } from 'bun:test'
import { useAuthStore, DEFAULT_ORG_ID } from '../authStore'

// Helper to clear persisted storage between tests
const clearPersistedState = async () => {
  const persist = (useAuthStore as typeof useAuthStore & { persist?: any }).persist
  if (persist?.clearStorage) {
    await persist.clearStorage()
  }
}

describe('authStore', () => {
  beforeEach(async () => {
    await clearPersistedState()
    useAuthStore.setState({
      token: null,
      userId: null,
      organizationId: DEFAULT_ORG_ID,
      roles: ['ADMIN'],
      provider: 'local',
    })
  })

  it('initializes with default organization id and no token', () => {
    const state = useAuthStore.getState()
    expect(state.organizationId).toBe(DEFAULT_ORG_ID)
    expect(state.token).toBeNull()
    expect(state.roles).toEqual(['ADMIN'])
    expect(state.userId).toBeNull()
    expect(state.provider).toBe('local')
  })

  it('sets and clears API token', () => {
    useAuthStore.getState().setToken('  test-token  ')
    expect(useAuthStore.getState().token).toBe('test-token')

    useAuthStore.getState().setToken('')
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('updates organization id and falls back to default when blank', () => {
    useAuthStore.getState().setOrganizationId('team-123')
    expect(useAuthStore.getState().organizationId).toBe('team-123')

    useAuthStore.getState().setOrganizationId('')
    expect(useAuthStore.getState().organizationId).toBe(DEFAULT_ORG_ID)
  })

  it('sets roles and falls back to admin when empty', () => {
    useAuthStore.getState().setRoles(['MEMBER'])
    expect(useAuthStore.getState().roles).toEqual(['MEMBER'])

    useAuthStore.getState().setRoles([])
    expect(useAuthStore.getState().roles).toEqual(['ADMIN'])
  })

  it('resets state when cleared', () => {
    useAuthStore.setState({
      token: 'abc',
      organizationId: 'team-42',
      roles: ['MEMBER'],
      userId: 'user-123',
      provider: 'clerk',
    })

    useAuthStore.getState().clear()

    const state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.organizationId).toBe(DEFAULT_ORG_ID)
    expect(state.roles).toEqual(['ADMIN'])
    expect(state.userId).toBeNull()
    expect(state.provider).toBe('local')
  })

  it('sets auth context with fallbacks', () => {
    useAuthStore.getState().setAuthContext({
      token: ' bearer-token ',
      userId: 'user-123',
      organizationId: 'org-777',
      roles: ['MEMBER'],
      provider: 'clerk',
    })

    let state = useAuthStore.getState()
    expect(state.token).toBe('bearer-token')
    expect(state.userId).toBe('user-123')
    expect(state.organizationId).toBe('org-777')
    expect(state.roles).toEqual(['MEMBER'])
    expect(state.provider).toBe('clerk')

    useAuthStore.getState().setAuthContext({
      token: '',
      userId: '',
      organizationId: null,
      roles: null,
    })

    state = useAuthStore.getState()
    expect(state.token).toBeNull()
    expect(state.userId).toBeNull()
    expect(state.organizationId).toBe(DEFAULT_ORG_ID)
    expect(state.roles).toEqual(['ADMIN'])
    expect(state.provider).toBe('local')
  })
})
