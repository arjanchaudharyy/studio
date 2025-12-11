import { X, ExternalLink, ChevronDown, ChevronRight, Circle, CheckCircle2, AlertCircle } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useComponentStore } from '@/store/componentStore'
import { ParameterFieldWrapper } from './ParameterField'
import { SecretSelect } from '@/components/inputs/SecretSelect'
import type { Node } from 'reactflow'
import type { NodeData } from '@/schemas/node'
import type { ComponentType, KeyboardEvent } from 'react'
import {
  describePortDataType,
  inputSupportsManualValue,
  isListOfTextPortDataType,
} from '@/utils/portUtils'

interface CollapsibleSectionProps {
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({ title, count, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  
  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {count !== undefined && (
          <Badge variant="secondary" className="text-xs px-2 py-0.5">
            {count}
          </Badge>
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t bg-background/50">
          {children}
        </div>
      )}
    </div>
  )
}

interface ConfigPanelProps {
  selectedNode: Node<NodeData> | null
  onClose: () => void
  onUpdateNode?: (nodeId: string, data: Partial<NodeData>) => void
}

const formatManualValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch (error) {
    console.error('Failed to serialise manual value for preview', error)
    return String(value)
  }
}

interface ManualListChipsInputProps {
  inputId: string
  manualValue: unknown
  disabled: boolean
  placeholder: string
  onChange: (value: string[] | undefined) => void
}

function ManualListChipsInput({
  inputId,
  manualValue,
  disabled,
  placeholder,
  onChange,
}: ManualListChipsInputProps) {
  const listItems = Array.isArray(manualValue)
    ? manualValue.filter((item): item is string => typeof item === 'string')
    : []
  const [draftValue, setDraftValue] = useState('')

  useEffect(() => {
    setDraftValue('')
  }, [manualValue])

  const handleAdd = () => {
    const nextValue = draftValue.trim()
    if (!nextValue) {
      return
    }
    onChange([...listItems, nextValue])
    setDraftValue('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!disabled) {
        handleAdd()
      }
    }
  }

  const handleRemove = (index: number) => {
    if (disabled) return
    const remaining = [...listItems]
    remaining.splice(index, 1)
    onChange(remaining.length > 0 ? remaining : undefined)
  }

  const handleClear = () => {
    if (disabled) return
    onChange(undefined)
  }

  const canAdd = draftValue.trim().length > 0

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={`manual-${inputId}-list`}
          placeholder={placeholder}
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="flex-1 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={disabled || !canAdd}
          onClick={handleAdd}
        >
          Add
        </Button>
      </div>

      {listItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {listItems.map((item, index) => (
            <Badge
              key={`${inputId}-chip-${index}`}
              variant="outline"
              className="gap-1 pr-1"
            >
              <span className="max-w-[160px] truncate">{item}</span>
              {!disabled && (
                <button
                  type="button"
                  className="rounded-full p-0.5 text-muted-foreground transition hover:text-foreground hover:bg-muted"
                  onClick={() => handleRemove(index)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {!disabled && listItems.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-fit text-xs px-2"
          onClick={handleClear}
        >
          Clear manual value
        </Button>
      )}
    </div>
  )
}

/**
 * ConfigPanel - Configuration panel for selected workflow node
 *
 * Shows component information and allows editing node parameters
 */
export function ConfigPanel({ selectedNode, onClose, onUpdateNode }: ConfigPanelProps) {
  const { getComponent, loading } = useComponentStore()

  const handleParameterChange = (paramId: string, value: any) => {
    if (!selectedNode || !onUpdateNode) return

    const nodeData = selectedNode.data as any

    const updatedParameters = {
      ...(nodeData.parameters ?? {}),
    }

    if (value === undefined) {
      delete updatedParameters[paramId]
    } else {
      updatedParameters[paramId] = value
    }

    onUpdateNode(selectedNode.id, {
      parameters: updatedParameters,
    })
  }

  if (!selectedNode) {
    return null
  }

  const nodeData = selectedNode.data as any
  const componentRef: string | undefined = nodeData.componentId ?? nodeData.componentSlug
  const component = getComponent(componentRef)

  if (!component) {
    if (loading) {
      return (
        <div className="config-panel w-[380px] border-l bg-background flex flex-col h-full">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-card">
            <h3 className="font-semibold text-base">Configuration</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-accent" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-sm text-muted-foreground animate-pulse">
              Loading component metadata…
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="config-panel w-[380px] border-l bg-background flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-card">
          <h3 className="font-semibold text-base">Configuration</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-accent" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-sm text-destructive font-medium">Component not found</p>
            <p className="text-xs text-muted-foreground mt-1">{componentRef ?? 'unknown'}</p>
          </div>
        </div>
      </div>
    )
  }

  const iconName = component.icon && component.icon in LucideIcons ? component.icon : 'Box'
  const IconComponent = LucideIcons[iconName as keyof typeof LucideIcons] as ComponentType<{ className?: string }>

  const componentInputs = component.inputs ?? []
  const componentOutputs = component.outputs ?? []
  const componentParameters = component.parameters ?? []
  const exampleItems = [
    component.example,
    ...(component.examples ?? []),
  ].filter((value): value is string => Boolean(value && value.trim().length > 0))
  const manualParameters = (nodeData.parameters ?? {}) as Record<string, unknown>

  return (
    <div className="config-panel w-[380px] border-l bg-background flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b bg-card">
        <h3 className="font-semibold text-base">Configuration</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-accent" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Component Info */}
      <div className="px-5 py-4 border-b">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-accent/50 border flex-shrink-0">
            {component.logo ? (
              <img 
                src={component.logo} 
                alt={component.name}
                className="h-7 w-7 object-contain"
                onError={(e) => {
                  // Fallback to icon if image fails to load
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            <IconComponent className={cn(
              "h-7 w-7 text-primary",
              component.logo && "hidden"
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-base mb-1">{component.name}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {component.description}
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-4">
          {/* Inputs Section */}
          {componentInputs.length > 0 && (
            <CollapsibleSection title="Inputs" count={componentInputs.length} defaultOpen={true}>
              <div className="space-y-3 mt-3">
                {componentInputs.map((input) => {
                  const connection = nodeData.inputs?.[input.id]
                  const hasConnection = Boolean(connection)
                  const manualValue = manualParameters[input.id]
                  const manualOverridesPort = input.valuePriority === 'manual-first'
                  const allowsManualInput = inputSupportsManualValue(input) || manualOverridesPort
                  const manualValueProvided =
                    allowsManualInput &&
                    (!hasConnection || manualOverridesPort) &&
                    manualValue !== undefined &&
                    manualValue !== null &&
                    (typeof manualValue === 'string'
                      ? manualValue.trim().length > 0
                      : true)
                  const manualLocked = hasConnection && !manualOverridesPort
                  const primitiveName =
                    input.dataType?.kind === 'primitive' ? input.dataType.name : null
                  const isNumberInput = primitiveName === 'number'
                  const isBooleanInput = primitiveName === 'boolean'
                  const isListOfTextInput = isListOfTextPortDataType(input.dataType)
                  const manualInputValue =
                    manualValue === undefined || manualValue === null
                      ? ''
                      : typeof manualValue === 'string'
                        ? manualValue
                        : String(manualValue)
                  const manualValuePreview = formatManualValue(manualValue)
                  const useSecretSelect =
                    component.id === 'core.secret.fetch' &&
                    input.id === 'secretId'
                  const manualPlaceholder = useSecretSelect
                    ? 'Select a secret...'
                    : input.id === 'supabaseUrl'
                      ? 'https://<project-ref>.supabase.co or <project_ref>'
                      : isNumberInput
                        ? 'Enter a number to use without a connection'
                        : isListOfTextInput
                          ? 'Add entries or press Add to provide a list'
                          : 'Enter text to use without a connection'
                  const typeLabel = describePortDataType(input.dataType)

                  return (
                    <div
                      key={input.id}
                      className="p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{input.label}</span>
                          {input.required && (
                            <span className="text-[10px] text-destructive font-medium px-1.5 py-0.5 bg-destructive/10 rounded">
                              required
                            </span>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono px-2">
                          {typeLabel}
                        </Badge>
                      </div>
                      {input.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                          {input.description}
                        </p>
                      )}

                      {inputSupportsManualValue(input) && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                          <label
                            htmlFor={`manual-${input.id}`}
                            className="text-xs font-medium text-muted-foreground flex items-center gap-2"
                          >
                            <Circle className="h-2 w-2" />
                            Manual value
                          </label>
                          {useSecretSelect ? (
                            <SecretSelect
                              value={typeof manualValue === 'string' ? manualValue : ''}
                              onChange={(value) => {
                                if (value === '') {
                                  handleParameterChange(input.id, undefined)
                                } else {
                                  handleParameterChange(input.id, value)
                                }
                              }}
                              placeholder={manualPlaceholder}
                              className="text-sm"
                              disabled={manualLocked}
                              allowManualEntry={!manualLocked}
                            />
                          ) : isBooleanInput ? (
                            <div className="space-y-2">
                              <Select
                                value={
                                  typeof manualValue === 'boolean'
                                    ? manualValue
                                      ? 'true'
                                      : 'false'
                                    : undefined
                                }
                                onValueChange={(value) => {
                                  if (value === 'true') {
                                    handleParameterChange(input.id, true)
                                  } else if (value === 'false') {
                                    handleParameterChange(input.id, false)
                                  }
                                }}
                                disabled={manualLocked}
                              >
                                <SelectTrigger className="text-sm">
                                  <SelectValue placeholder="Select true or false" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">True</SelectItem>
                                  <SelectItem value="false">False</SelectItem>
                                </SelectContent>
                              </Select>
                              {!manualLocked && typeof manualValue === 'boolean' && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-fit text-xs px-2"
                                  onClick={() => handleParameterChange(input.id, undefined)}
                                >
                                  Clear manual value
                                </Button>
                              )}
                            </div>
                          ) : isListOfTextInput ? (
                            <ManualListChipsInput
                              inputId={input.id}
                              manualValue={manualValue}
                              disabled={manualLocked}
                              placeholder={manualPlaceholder}
                              onChange={(value) => handleParameterChange(input.id, value)}
                            />
                          ) : (
                            <Input
                              id={`manual-${input.id}`}
                              type={isNumberInput ? 'number' : 'text'}
                              value={manualInputValue}
                              onChange={(e) => {
                                const nextValue = e.target.value
                                if (nextValue === '') {
                                  handleParameterChange(input.id, undefined)
                                  return
                                }
                                if (isNumberInput) {
                                  const parsed = Number(nextValue)
                                  if (Number.isNaN(parsed)) {
                                    return
                                  }
                                  handleParameterChange(input.id, parsed)
                                } else {
                                  handleParameterChange(input.id, nextValue)
                                }
                              }}
                              placeholder={manualPlaceholder}
                              className="text-sm"
                              disabled={manualLocked}
                            />
                          )}
                          {manualLocked ? (
                            <p className="text-xs text-muted-foreground italic">
                              Disconnect the port to edit manual input.
                            </p>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">
                              {isBooleanInput
                                ? 'Select a value or clear manual input to require a port connection.'
                                : isListOfTextInput
                                  ? 'Add entries or clear manual input to require a port connection.'
                                  : 'Leave blank to require a port connection.'}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Connection status - simplified */}
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="text-xs">
                          {manualValueProvided ? (
                            <div className="flex items-start gap-2">
                              <Circle className="h-3 w-3 text-primary mt-0.5 fill-primary" />
                              <div className="space-y-1">
                                <span className="font-medium text-primary">Manual value set</span>
                                {manualValuePreview && (
                                  <p className="text-muted-foreground font-mono text-[11px] break-all bg-muted/50 px-2 py-1 rounded">
                                    {manualValuePreview.length > 100 ? manualValuePreview.slice(0, 100) + '...' : manualValuePreview}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : hasConnection ? (
                            <div className="flex items-start gap-2">
                              <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5" />
                              <div>
                                <span className="font-medium text-green-600 dark:text-green-400">Connected</span>
                                <p className="text-muted-foreground mt-0.5">
                                  From <span className="font-mono text-primary">{connection?.source}</span>
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2">
                              {input.required ? (
                                <>
                                  <AlertCircle className="h-3 w-3 text-destructive mt-0.5" />
                                  <span className="text-destructive font-medium">Required – needs connection or value</span>
                                </>
                              ) : (
                                <>
                                  <Circle className="h-3 w-3 text-muted-foreground mt-0.5" />
                                  <span className="text-muted-foreground">Optional – connect or set value</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* Outputs Section */}
          {componentOutputs.length > 0 && (
            <CollapsibleSection title="Outputs" count={componentOutputs.length} defaultOpen={false}>
              <div className="space-y-3 mt-3">
                {componentOutputs.map((output) => (
                  <div
                    key={output.id}
                    className="p-4 rounded-lg border bg-card/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{output.label}</span>
                      <Badge variant="outline" className="text-[10px] font-mono px-2">
                        {describePortDataType(output.dataType)}
                      </Badge>
                    </div>
                    {output.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {output.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Parameters Section */}
          {componentParameters.length > 0 && (
            <CollapsibleSection title="Parameters" count={componentParameters.length} defaultOpen={true}>
              <div className="space-y-3 mt-3">
                {/* Sort parameters: select types first, then others */}
                {componentParameters
                  .slice()
                  .sort((a, b) => {
                    // Select parameters go first
                    const aIsSelect = a.type === 'select'
                    const bIsSelect = b.type === 'select'
                    if (aIsSelect && !bIsSelect) return -1
                    if (!aIsSelect && bIsSelect) return 1
                    return 0
                  })
                  .map((param) => (
                    <ParameterFieldWrapper
                      key={param.id}
                      parameter={param}
                      value={nodeData.parameters?.[param.id]}
                      onChange={(value) => handleParameterChange(param.id, value)}
                      connectedInput={nodeData.inputs?.[param.id]}
                      componentId={component.id}
                      parameters={nodeData.parameters}
                      onUpdateParameter={handleParameterChange}
                    />
                  ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Examples */}
          {exampleItems.length > 0 && (
            <CollapsibleSection title="Examples" count={exampleItems.length} defaultOpen={false}>
              <div className="space-y-3 mt-3">
                {exampleItems.map((exampleText, index) => {
                  const commandMatch = exampleText.match(/`([^`]+)`/)
                  const command = commandMatch?.[1]?.trim()
                  const description = commandMatch
                    ? exampleText
                        .replace(commandMatch[0], '')
                        .replace(/^[\s\u2013\u2014-]+/, '')
                        .trim()
                    : exampleText.trim()

                  return (
                    <div
                      key={`${exampleText}-${index}`}
                      className="p-3 rounded-lg bg-accent/30"
                    >
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {index + 1}
                        </span>
                        <div className="flex-1 space-y-2">
                          {command && (
                            <code className="block w-full overflow-x-auto rounded bg-background border px-2 py-1.5 text-[11px] font-mono text-foreground">
                              {command}
                            </code>
                          )}
                          {description && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* Documentation */}
          {(component.documentation || component.documentationUrl) && (
            <CollapsibleSection title="Documentation" defaultOpen={false}>
              <div className="space-y-3 mt-3">
                {component.documentationUrl && (
                  <a
                    href={component.documentationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card/50 text-sm hover:bg-accent/50 transition-colors group"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                    <span className="text-muted-foreground group-hover:text-foreground truncate">
                      View documentation
                    </span>
                  </a>
                )}
                {component.documentation && (
                  <div className="p-3 rounded-lg bg-accent/30">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {component.documentation}
                    </p>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t bg-card">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-mono truncate max-w-[140px]" title={selectedNode.id}>
            {selectedNode.id}
          </span>
          <Badge variant="outline" className="text-[10px] font-mono px-2">
            {component.slug}
          </Badge>
        </div>
      </div>
    </div>
  )
}
