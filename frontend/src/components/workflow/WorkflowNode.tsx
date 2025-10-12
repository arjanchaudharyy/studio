import { memo } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from 'reactflow'
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { cn } from '@/lib/utils'
import { useComponentStore } from '@/store/componentStore'
import { ComponentBadges } from './ComponentBadge'
import { getNodeStyle, getTypeBorderColor } from './nodeStyles'
import type { NodeData } from '@/schemas/node'

const STATUS_ICONS = {
  running: Loader2,
  success: CheckCircle,
  error: XCircle,
  waiting: Clock,
  idle: null,
} as const

/**
 * WorkflowNode - Visual representation of a workflow component
 */
export const WorkflowNode = memo(({ data, selected, id }: NodeProps<NodeData>) => {
  const { getComponent, loading } = useComponentStore()
  const { getNodes, getEdges } = useReactFlow()

  // Cast to access extended frontend fields (componentId, componentSlug, status, etc.)
  const nodeData = data as any

  // Get component metadata
  const componentRef: string | undefined = nodeData.componentId ?? nodeData.componentSlug
  const component = getComponent(componentRef)

  if (!component) {
    if (loading) {
      return (
        <div className="px-4 py-3 shadow-md rounded-lg border-2 border-dashed border-muted bg-background min-w-[200px]">
          <div className="text-sm text-muted-foreground">
            Loading component metadata…
          </div>
        </div>
      )
    }
    return (
      <div className="px-4 py-3 shadow-md rounded-lg border-2 border-red-500 bg-red-50 min-w-[200px]">
        <div className="text-sm text-red-600">
          Component not found: {componentRef ?? 'unknown'}
        </div>
      </div>
    )
  }

  // Get icon component from Lucide (only if no logo)
  const iconName = component.icon && component.icon in LucideIcons ? component.icon : 'Box'
  const IconComponent = LucideIcons[iconName as keyof typeof LucideIcons] as React.ComponentType<{ className?: string }>

  // Get styling based on execution status
  const nodeStyle = getNodeStyle(nodeData.status || 'idle')
  const typeBorderColor = getTypeBorderColor(component.type)

  // Get status icon
  const StatusIcon = nodeData.status ? STATUS_ICONS[nodeData.status as keyof typeof STATUS_ICONS] : null

  // Display label (custom or component name)
  const displayLabel = data.label || component.name

  // Check if there are unfilled required parameters or inputs
  const componentParameters = component.parameters ?? []
  const componentInputs = component.inputs ?? []
  const requiredParams = componentParameters.filter(param => param.required)
  const requiredInputs = componentInputs.filter(input => input.required)

  // DYNAMIC OUTPUTS: For Manual Trigger, generate outputs based on runtimeInputs parameter
  let effectiveOutputs = component.outputs ?? []
  if (component.slug === 'manual-trigger' && nodeData.parameters?.runtimeInputs) {
    try {
      const runtimeInputs = typeof nodeData.parameters.runtimeInputs === 'string'
        ? JSON.parse(nodeData.parameters.runtimeInputs)
        : nodeData.parameters.runtimeInputs

      if (Array.isArray(runtimeInputs) && runtimeInputs.length > 0) {
        effectiveOutputs = runtimeInputs.map((input: any) => ({
          id: input.id,
          label: input.label,
          type: input.type === 'file' ? 'string' : input.type,
          description: input.description || `Runtime input: ${input.label}`,
        }))
      }
    } catch (error) {
      console.error('Failed to parse runtimeInputs:', error)
    }
  }
  
  const hasUnfilledRequired = 
    // Check unfilled required parameters
    requiredParams.some(param => {
      const value = nodeData.parameters?.[param.id]
      const effectiveValue = value !== undefined ? value : param.default
      return effectiveValue === undefined || effectiveValue === null || effectiveValue === ''
    }) ||
    // Check unfilled required inputs (not connected)
    requiredInputs.some(input => {
      return !nodeData.inputs?.[input.id] // No connection to this input
    })

  return (
    <div
      className={cn(
        'shadow-lg rounded-lg border-2 min-w-[240px] max-w-[280px] bg-background transition-all',
        nodeData.status ? nodeStyle.border : typeBorderColor,
        nodeData.status && nodeData.status !== 'idle' ? nodeStyle.bg : 'bg-background',
        selected && 'ring-2 ring-blue-500 ring-offset-2',
        hasUnfilledRequired && !nodeData.status && 'border-red-300 shadow-red-100'
      )}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="flex items-start gap-2">
          {component.logo ? (
            <img 
              src={component.logo} 
              alt={component.name}
              className="h-5 w-5 mt-0.5 flex-shrink-0 object-contain"
              onError={(e) => {
                // Fallback to icon if image fails to load
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextElementSibling?.classList.remove('hidden')
              }}
            />
          ) : null}
          <IconComponent className={cn(
            "h-5 w-5 mt-0.5 flex-shrink-0 text-foreground",
            component.logo && "hidden"
          )} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold truncate">{displayLabel}</h3>
              <div className="flex items-center gap-1">
                {hasUnfilledRequired && !nodeData.status && (
                  <span className="text-red-500 text-xs" title="Required fields missing">!</span>
                )}
                {StatusIcon && (
                  <StatusIcon className={cn('h-4 w-4 flex-shrink-0', nodeStyle.iconClass)} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body - Input/Output Ports */}
      <div className="px-3 py-3 space-y-2">
        {/* Input Ports */}
        {componentInputs.length > 0 && (
          <div className="space-y-1.5">
            {componentInputs.map((input, index) => {
              // Check if this input has a connection
              const edges = getEdges()
              const connection = edges.find(edge => edge.target === id && edge.targetHandle === input.id)

              // Get source node and output info if connected
              let sourceInfo: string | null = null
              if (connection) {
                const sourceNode = getNodes().find(n => n.id === connection.source)
                if (sourceNode) {
                  const sourceComponent = getComponent(
                    (sourceNode.data as any).componentId ?? (sourceNode.data as any).componentSlug
                  )
                  if (sourceComponent) {
                    const sourceOutput = sourceComponent.outputs.find(o => o.id === connection.sourceHandle)
                    sourceInfo = sourceOutput?.label || 'Connected'
                  }
                }
              }

              return (
                <div key={input.id} className="flex items-center gap-2 text-xs">
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={input.id}
                    className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
                    style={{ top: `${60 + index * 28}px` }}
                  />
                  <div className="flex-1">
                    <div className="text-muted-foreground font-medium">{input.label}</div>
                    {input.required && !sourceInfo && (
                      <span className="text-red-500 text-[10px]">*required</span>
                    )}
                    {sourceInfo && (
                      <span className="text-green-600 text-[10px] italic" title={`Connected to: ${sourceInfo}`}>
                        {sourceInfo}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Output Ports */}
        {effectiveOutputs.length > 0 && (
          <div className="space-y-1.5">
            {effectiveOutputs.map((output, index) => (
              <div key={output.id} className="flex items-center justify-end gap-2 text-xs">
                <div className="flex-1 text-right">
                  <div className="text-muted-foreground font-medium">{output.label}</div>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
                  style={{ top: `${60 + componentInputs.length * 28 + index * 28}px` }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Required Parameters Display */}
        {requiredParams.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <div className="space-y-1">
              {/* Required Parameters */}
              {requiredParams.map((param) => {
                const value = nodeData.parameters?.[param.id]
                const effectiveValue = value !== undefined ? value : param.default
                const hasValue = effectiveValue !== undefined && effectiveValue !== null && effectiveValue !== ''
                const displayValue = hasValue ? effectiveValue : ''
                const isDefault = value === undefined && param.default !== undefined

                return (
                  <div key={`param-${param.id}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground font-medium truncate">
                      {param.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {hasValue ? (
                        <span
                          className={cn(
                            "font-mono px-1 py-0.5 rounded text-[10px] truncate max-w-[80px]",
                            isDefault
                              ? "text-muted-foreground bg-muted/50 italic"
                              : "text-foreground bg-muted"
                          )}
                          title={isDefault ? `Default: ${String(displayValue)}` : String(displayValue)}
                        >
                          {String(displayValue)}
                        </span>
                      ) : (
                        <span className="text-red-500 text-[10px]">*required</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Execution Status Messages */}
        {nodeData.status === 'success' && nodeData.executionTime && (
          <div className="text-xs text-green-600 pt-2 border-t border-green-200">
            ✓ Completed in {nodeData.executionTime}ms
          </div>
        )}

        {nodeData.status === 'error' && nodeData.error && (
          <div className="text-xs text-red-600 pt-2 border-t border-red-200 truncate" title={nodeData.error}>
            ✗ {nodeData.error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border/50 bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">v{component.version}</span>
          <ComponentBadges component={component} />
        </div>
      </div>
    </div>
  )
})

WorkflowNode.displayName = 'WorkflowNode'
