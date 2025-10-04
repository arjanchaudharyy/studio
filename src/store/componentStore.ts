import { create } from 'zustand'
import { ComponentMetadata } from '@/schemas/component'
import {
  getAllComponents,
  getComponent as getComponentFromRegistry,
  getComponentsByType,
  getComponentsByCategory,
  searchComponents as searchComponentsInRegistry,
} from '@/components/workflow/nodes/registry'

interface ComponentStore {
  // State
  components: Record<string, ComponentMetadata>
  loading: boolean
  error: string | null

  // Actions
  fetchComponents: () => void
  getComponent: (slug: string) => ComponentMetadata | null
  getComponentsByType: (type: ComponentMetadata['type']) => ComponentMetadata[]
  getComponentsByCategory: (category: ComponentMetadata['category']) => ComponentMetadata[]
  searchComponents: (query: string) => ComponentMetadata[]
  getAllComponents: () => ComponentMetadata[]
}

/**
 * Component Store
 * Manages component metadata for the workflow builder
 *
 * Currently uses local registry, but can be extended to fetch from backend
 */
export const useComponentStore = create<ComponentStore>((set, get) => ({
  components: {},
  loading: false,
  error: null,

  /**
   * Fetch components from registry (or backend in the future)
   */
  fetchComponents: () => {
    set({ loading: true, error: null })
    try {
      // For now, use local registry
      // TODO: Replace with API call when backend is ready
      const components = getAllComponents()
      const componentsMap = Object.fromEntries(
        components.map((comp) => [comp.slug, comp])
      )
      set({ components: componentsMap, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch components',
        loading: false,
      })
    }
  },

  /**
   * Get component by slug
   */
  getComponent: (slug: string) => {
    const components = get().components
    if (Object.keys(components).length === 0) {
      // If not loaded yet, try registry directly
      return getComponentFromRegistry(slug)
    }
    return components[slug] || null
  },

  /**
   * Get components by type
   */
  getComponentsByType: (type: ComponentMetadata['type']) => {
    const components = get().components
    if (Object.keys(components).length === 0) {
      // If not loaded yet, try registry directly
      return getComponentsByType(type)
    }
    return Object.values(components).filter((comp) => comp.type === type)
  },

  /**
   * Get components by category
   */
  getComponentsByCategory: (category: ComponentMetadata['category']) => {
    const components = get().components
    if (Object.keys(components).length === 0) {
      // If not loaded yet, try registry directly
      return getComponentsByCategory(category)
    }
    return Object.values(components).filter((comp) => comp.category === category)
  },

  /**
   * Search components by query
   */
  searchComponents: (query: string) => {
    const components = get().components
    if (Object.keys(components).length === 0) {
      // If not loaded yet, try registry directly
      return searchComponentsInRegistry(query)
    }
    const lowerQuery = query.toLowerCase()
    return Object.values(components).filter(
      (comp) =>
        comp.name.toLowerCase().includes(lowerQuery) ||
        comp.description.toLowerCase().includes(lowerQuery) ||
        comp.slug.toLowerCase().includes(lowerQuery)
    )
  },

  /**
   * Get all components
   */
  getAllComponents: () => {
    const components = get().components
    if (Object.keys(components).length === 0) {
      // If not loaded yet, try registry directly
      return getAllComponents()
    }
    return Object.values(components)
  },
}))
