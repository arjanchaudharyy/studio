import { ComponentMetadata, ComponentMetadataSchema } from '@/schemas/component'

// Import component specifications
import subfinderSpec from './security-tools/Subfinder/Subfinder.spec.json'
import fileLoaderSpec from './input-output/FileLoader/FileLoader.spec.json'
import mergeSpec from './building-blocks/Merge/Merge.spec.json'

// Import logo assets
import subfinderLogo from './security-tools/Subfinder/subfinder.png'

/**
 * Component Registry
 * Central registry of all available workflow components
 */
export const COMPONENT_REGISTRY: Record<string, ComponentMetadata> = {}

/**
 * Register a component from its JSON spec
 */
function registerComponent(spec: unknown, logoOverride?: string): void {
  const component = ComponentMetadataSchema.parse(spec)
  
  // Override logo with imported asset if provided
  if (logoOverride) {
    component.logo = logoOverride
  }
  
  COMPONENT_REGISTRY[component.slug] = component
}

// Register all components
registerComponent(subfinderSpec, subfinderLogo)
registerComponent(fileLoaderSpec)
registerComponent(mergeSpec)

/**
 * Get component by slug
 */
export function getComponent(slug: string): ComponentMetadata | null {
  return COMPONENT_REGISTRY[slug] || null
}

/**
 * Get all components
 */
export function getAllComponents(): ComponentMetadata[] {
  return Object.values(COMPONENT_REGISTRY)
}

/**
 * Get components by type (input, scan, process, output)
 */
export function getComponentsByType(type: ComponentMetadata['type']): ComponentMetadata[] {
  return Object.values(COMPONENT_REGISTRY).filter(
    (component) => component.type === type
  )
}

/**
 * Get components by category (security-tool, building-block, input-output)
 */
export function getComponentsByCategory(
  category: ComponentMetadata['category']
): ComponentMetadata[] {
  return Object.values(COMPONENT_REGISTRY).filter(
    (component) => component.category === category
  )
}

/**
 * Search components by name or description
 */
export function searchComponents(query: string): ComponentMetadata[] {
  const lowerQuery = query.toLowerCase()
  return Object.values(COMPONENT_REGISTRY).filter(
    (component) =>
      component.name.toLowerCase().includes(lowerQuery) ||
      component.description.toLowerCase().includes(lowerQuery) ||
      component.slug.toLowerCase().includes(lowerQuery)
  )
}
