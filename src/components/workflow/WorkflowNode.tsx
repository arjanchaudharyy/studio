import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
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
export const WorkflowNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const { getComponent } = useComponentStore()

  // Get component metadata
  const component = getComponent(data.componentSlug)

  if (!component) {
    return (
      <div className="px-4 py-3 shadow-md rounded-lg border-2 border-red-500 bg-red-50 min-w-[200px]">
        <div className="text-sm text-red-600">
          Component not found: {data.componentSlug}
        </div>
      </div>
    )
  }

  // Get icon component from Lucide (only if no logo)
  const IconComponent = (LucideIcons[component.icon as keyof typeof LucideIcons] as React.ComponentType<{ className?: string }>) || LucideIcons.Box

  // Get styling based on execution status
  const nodeStyle = getNodeStyle(data.status || 'idle')
  const typeBorderColor = getTypeBorderColor(component.type)

  // Get status icon
  const StatusIcon = data.status ? STATUS_ICONS[data.status] : null

  // Display label (custom or component name)
  const displayLabel = data.label || component.name

  // Check if there are unfilled required parameters
  const requiredParams = component.parameters.filter(param => param.required)
  const hasUnfilledRequired = requiredParams.some(param => {
    const value = data.parameters?.[param.id]
    const effectiveValue = value !== undefined ? value : param.default
    return effectiveValue === undefined || effectiveValue === null || effectiveValue === ''
  })

  return (
    <div
      className={cn(
        'shadow-lg rounded-lg border-2 min-w-[240px] max-w-[280px] bg-background transition-all',
        data.status ? nodeStyle.border : typeBorderColor,
        data.status && data.status !== 'idle' ? nodeStyle.bg : 'bg-background',
        selected && 'ring-2 ring-blue-500 ring-offset-2',
        hasUnfilledRequired && !data.status && 'border-red-300 shadow-red-100'
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
                {hasUnfilledRequired && !data.status && (
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
        {component.inputs.length > 0 && (
          <div className="space-y-1.5">
            {component.inputs.map((input, index) => (
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
                  {input.required && (
                    <span className="text-red-500 text-[10px]">*required</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Output Ports */}
        {component.outputs.length > 0 && (
          <div className="space-y-1.5">
            {component.outputs.map((output, index) => (
              <div key={output.id} className="flex items-center justify-end gap-2 text-xs">
                <div className="flex-1 text-right">
                  <div className="text-muted-foreground font-medium">{output.label}</div>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
                  style={{ top: `${60 + component.inputs.length * 28 + index * 28}px` }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Required Parameters Display */}
        {component.parameters.filter(param => param.required).length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <div className="space-y-1">
              {component.parameters
                .filter(param => param.required)
                .map((param) => {
                  const value = data.parameters?.[param.id]
                  const effectiveValue = value !== undefined ? value : param.default
                  const hasValue = effectiveValue !== undefined && effectiveValue !== null && effectiveValue !== ''
                  const displayValue = hasValue ? effectiveValue : ''
                  const isDefault = value === undefined && param.default !== undefined
                  
                  return (
                    <div key={param.id} className="flex items-center justify-between gap-2 text-xs">
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
        {data.status === 'success' && data.executionTime && (
          <div className="text-xs text-green-600 pt-2 border-t border-green-200">
            ✓ Completed in {data.executionTime}ms
          </div>
        )}

        {data.status === 'error' && data.error && (
          <div className="text-xs text-red-600 pt-2 border-t border-red-200 truncate" title={data.error}>
            ✗ {data.error}
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
