import { X } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useComponentStore } from '@/store/componentStore'
import { ComponentBadges } from './ComponentBadge'
import { ParameterFieldWrapper } from './ParameterField'
import type { Node } from 'reactflow'
import type { NodeData } from '@/schemas/node'

interface ConfigPanelProps {
  selectedNode: Node<NodeData> | null
  onClose: () => void
  onUpdateNode?: (nodeId: string, data: Partial<NodeData>) => void
}

/**
 * ConfigPanel - Configuration panel for selected workflow node
 *
 * Shows component information and allows editing node parameters
 */
export function ConfigPanel({ selectedNode, onClose, onUpdateNode }: ConfigPanelProps) {
  const { getComponent } = useComponentStore()

  const handleParameterChange = (paramId: string, value: any) => {
    if (!selectedNode || !onUpdateNode) return

    const updatedParameters = {
      ...selectedNode.data.parameters,
      [paramId]: value,
    }

    onUpdateNode(selectedNode.id, {
      parameters: updatedParameters,
    })
  }

  if (!selectedNode) {
    return null
  }

  const component = getComponent(selectedNode.data.componentSlug)

  if (!component) {
    return (
      <div className="w-[360px] border-l bg-background flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Configuration</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 p-4">
          <div className="text-sm text-red-600">
            Component not found: {selectedNode.data.componentSlug}
          </div>
        </div>
      </div>
    )
  }

  const IconComponent = (LucideIcons[component.icon as keyof typeof LucideIcons] as React.ComponentType<{ className?: string }>) || LucideIcons.Box

  return (
    <div className="config-panel w-[400px] border-l bg-background flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Configuration</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Component Info */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-background border">
            <IconComponent className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm mb-1">{component.name}</h4>
            <p className="text-xs text-muted-foreground mb-2">
              {component.description}
            </p>
            <ComponentBadges component={component} />
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Inputs Section */}
          {component.inputs.length > 0 && (
            <div>
              <h5 className="text-sm font-semibold mb-3 text-foreground">Inputs</h5>
              <div className="space-y-3">
                {component.inputs.map((input) => (
                  <div
                    key={input.id}
                    className="p-3 rounded-lg border bg-background"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{input.label}</span>
                      {input.required && (
                        <span className="text-xs text-red-500">*required</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      Type: <span className="font-mono">{input.type}</span>
                    </div>
                    {input.description && (
                      <p className="text-xs text-muted-foreground">
                        {input.description}
                      </p>
                    )}
                    {/* Connection status */}
                    <div className="mt-2 pt-2 border-t">
                      <div className="text-xs text-muted-foreground">
                        {selectedNode.data.inputs?.[input.id] ? (
                          <span className="text-green-600">
                            ✓ Connected from{' '}
                            <span className="font-mono">
                              {selectedNode.data.inputs[input.id].source}
                            </span>
                          </span>
                        ) : (
                          <span className="text-amber-600">
                            ⚠ Not connected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parameters Section */}
          {component.parameters.length > 0 && (
            <div>
              <h5 className="text-sm font-semibold mb-3 text-foreground">
                Parameters
              </h5>
              <div className="space-y-3">
                {component.parameters.map((param) => (
                  <ParameterFieldWrapper
                    key={param.id}
                    parameter={param}
                    value={selectedNode.data.parameters?.[param.id]}
                    onChange={(value) => handleParameterChange(param.id, value)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Documentation */}
          {component.documentation && (
            <div>
              <h5 className="text-sm font-semibold mb-3 text-foreground">
                Documentation
              </h5>
              <div className="p-3 rounded-lg border bg-muted/50">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {component.documentation}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-muted/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Node ID: {selectedNode.id}</span>
          <span>v{component.version}</span>
        </div>
      </div>
    </div>
  )
}
