import { useEffect, useState } from 'react'
import type { WebhookConfiguration } from '@shipsec/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, Code, Info } from 'lucide-react'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import Editor, { loader } from '@monaco-editor/react'

// Configure Monaco to use CDN
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs' } })

export interface WorkflowOption {
  id: string
  name: string
}

type WebhookEditorMode = 'create' | 'edit'

interface WebhookEditorDrawerProps {
  open: boolean
  mode: WebhookEditorMode
  webhook?: WebhookConfiguration | null
  defaultWorkflowId?: string | null
  workflowOptions: WorkflowOption[]
  onClose: () => void
  onSaved?: (webhook: WebhookConfiguration, mode: WebhookEditorMode) => void
}

interface WebhookFormState {
  workflowId: string
  name: string
  description: string
  parsingScript: string
  expectedInputs: ExpectedInputDef[]
}

interface ExpectedInputDef {
  id: string
  label: string
  type: 'text' | 'number' | 'json' | 'array' | 'file'
  required: boolean
  description?: string
}

interface WorkflowRuntimeInput {
  id: string
  label: string
  type: string
  required: boolean
  description?: string
}

const DEFAULT_PARSING_SCRIPT = `// Transform the incoming webhook payload into workflow inputs
// Available variables:
//   input.payload - The raw JSON payload from the webhook
//   input.headers - HTTP headers as key-value pairs
export async function script(input: {
  payload: any
  headers: Record<string, string>
}): Promise<Record<string, any>> {
  // Extract data from the payload and return as key-value pairs
  // Keys must match the expected inputs defined in your workflow's Entry Point
  return {
    // Example: Extract GitHub PR title
    // prTitle: input.payload.pull_request?.title,
    // Example: Extract custom header
    // environment: input.headers['x-environment'] || 'production',
  }
}`

const INPUT_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'json', label: 'JSON' },
  { value: 'array', label: 'Array' },
  { value: 'file', label: 'File' },
]


export function WebhookEditorDrawer({
  open,
  mode,
  webhook,
  defaultWorkflowId,
  workflowOptions,
  onClose,
  onSaved,
}: WebhookEditorDrawerProps) {
  const [form, setForm] = useState<WebhookFormState>(() => ({
    workflowId: defaultWorkflowId ?? '',
    name: '',
    description: '',
    parsingScript: DEFAULT_PARSING_SCRIPT,
    expectedInputs: [],
  }))

  const [workflowRuntimeInputs, setWorkflowRuntimeInputs] = useState<WorkflowRuntimeInput[]>([])
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof WebhookFormState, string>>>({})

  // Fetch workflow runtime inputs when workflowId changes
  useEffect(() => {
    if (!form.workflowId) {
      setWorkflowRuntimeInputs([])
      return
    }

    setIsLoadingWorkflow(true)

    // Use the dedicated runtime-inputs endpoint instead of parsing the graph
    api.workflows.getRuntimeInputs(form.workflowId)
      .then((response) => {
        const inputs = response.inputs.map((input) => ({
          id: input.id,
          label: input.label,
          type: input.type,
          required: input.required ?? true,
          description: input.description,
        }))
        setWorkflowRuntimeInputs(inputs)
        setIsLoadingWorkflow(false)
      })
      .catch((err) => {
        console.error('[WebhookEditor] Failed to load workflow runtime inputs:', err)
        setWorkflowRuntimeInputs([])
        setIsLoadingWorkflow(false)
      })
  }, [form.workflowId])

  // Initialize form when webhook changes (for edit mode)
  useEffect(() => {
    if (!open) return

    if (mode === 'edit' && webhook) {
      setForm({
        workflowId: webhook.workflowId,
        name: webhook.name,
        description: webhook.description ?? '',
        parsingScript: webhook.parsingScript,
        expectedInputs: webhook.expectedInputs.map((input) => ({
          id: input.id,
          label: input.label,
          type: input.type,
          required: input.required,
          description: input.description,
        })),
      })
    } else if (mode === 'create' && defaultWorkflowId) {
      setForm((prev) => ({ ...prev, workflowId: defaultWorkflowId }))
    }
  }, [open, mode, webhook, defaultWorkflowId])

  // Auto-populate expected inputs when workflow runtime inputs are loaded
  useEffect(() => {
    console.log('[WebhookEditor] Auto-populate check:', {
      mode,
      workflowRuntimeInputsCount: workflowRuntimeInputs.length,
      expectedInputsCount: form.expectedInputs.length,
      workflowRuntimeInputs,
    })

    // In create mode, always sync expected inputs with workflow runtime inputs when they change
    if (mode === 'create' && workflowRuntimeInputs.length > 0) {
      // Auto-populate expected inputs from workflow runtime inputs
      const newExpectedInputs: ExpectedInputDef[] = workflowRuntimeInputs.map((input) => ({
        id: input.id,
        label: input.label || input.id,
        type: (input.type === 'string' ? 'text' : input.type) as ExpectedInputDef['type'],
        required: input.required ?? true,
        description: input.description,
      }))

      console.log('[WebhookEditor] Setting expected inputs:', newExpectedInputs)
      setForm((prev) => ({ ...prev, expectedInputs: newExpectedInputs }))
    }
  }, [mode, workflowRuntimeInputs])

  const updateForm = (updates: Partial<WebhookFormState>) => {
    setForm((prev) => ({ ...prev, ...updates }))
    // Clear errors for updated fields
    const updatedKeys = Object.keys(updates) as (keyof WebhookFormState)[]
    setErrors((prev) => {
      const next = { ...prev }
      for (const key of updatedKeys) {
        delete next[key]
      }
      return next
    })
  }

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof WebhookFormState, string>> = {}

    if (!form.workflowId) {
      newErrors.workflowId = 'Workflow is required'
    }
    if (!form.name.trim()) {
      newErrors.name = 'Name is required'
    }
    if (!form.parsingScript.trim()) {
      newErrors.parsingScript = 'Parsing script is required'
    }

    // Validate that all required runtime inputs are covered
    if (workflowRuntimeInputs.length > 0) {
      const requiredInputs = workflowRuntimeInputs.filter((input) => input.required !== false)
      const missingInputs = requiredInputs.filter(
        (input) => !form.expectedInputs.some((expected) => expected.id === input.id)
      )

      if (missingInputs.length > 0) {
        newErrors.expectedInputs = `Missing required inputs: ${missingInputs.map((i) => i.id).join(', ')}`
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return

    setIsSaving(true)

    try {
      const payload = {
        workflowId: form.workflowId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        parsingScript: form.parsingScript.trim(),
        expectedInputs: form.expectedInputs.map((input) => ({
          id: input.id,
          label: input.label,
          type: input.type,
          required: input.required,
          description: input.description,
        })),
      }

      let savedWebhook: WebhookConfiguration

      if (mode === 'create') {
        savedWebhook = (await api.webhooks.create(payload)) as unknown as WebhookConfiguration
      } else {
        savedWebhook = (await api.webhooks.update(webhook!.id, payload)) as unknown as WebhookConfiguration
      }

      onSaved?.(savedWebhook, mode)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save webhook'
      setErrors({ name: message })
    } finally {
      setIsSaving(false)
    }
  }

  const addExpectedInput = () => {
    const newId = `input_${Date.now()}`
    updateForm({
      expectedInputs: [
        ...form.expectedInputs,
        { id: newId, label: '', type: 'text', required: true },
      ],
    })
  }

  const updateExpectedInput = (index: number, updates: Partial<ExpectedInputDef>) => {
    const updated = [...form.expectedInputs]
    updated[index] = { ...updated[index], ...updates }
    updateForm({ expectedInputs: updated })
  }

  const removeExpectedInput = (index: number) => {
    updateForm({
      expectedInputs: form.expectedInputs.filter((_, i) => i !== index),
    })
  }

  const mapToRuntimeInput = (expectedInput: ExpectedInputDef): WorkflowRuntimeInput | undefined => {
    return workflowRuntimeInputs.find((ri) => ri.id === expectedInput.id)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Webhook' : 'Edit Webhook'}
          </DialogTitle>
          <DialogDescription>
            Configure a webhook to receive external events and trigger workflows.
            The parsing script transforms incoming payloads into workflow inputs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workflow">
                Workflow <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.workflowId}
                onValueChange={(value) => updateForm({ workflowId: value })}
                disabled={mode === 'edit'}
              >
                <SelectTrigger id="workflow">
                  <SelectValue placeholder="Select workflow" />
                </SelectTrigger>
                <SelectContent>
                  {workflowOptions.map((workflow) => (
                    <SelectItem key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.workflowId && (
                <p className="text-sm text-destructive">{errors.workflowId}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="GitHub PR Webhook"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
              placeholder="Triggers on pull request events"
            />
          </div>

          {/* Parsing Script */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="script">
                Parsing Script <span className="text-destructive">*</span>
              </Label>
              <Badge variant="outline" className="text-xs">
                TypeScript
              </Badge>
            </div>
            <div className="rounded-md border overflow-hidden">
              <Editor
                height="280px"
                language="typescript"
                value={form.parsingScript}
                onChange={(value) => updateForm({ parsingScript: value ?? '' })}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'off',
                  padding: { top: 8, bottom: 8 },
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                  },
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This script runs in a secure sandbox. Use <code>input.payload</code> to access the webhook body and{' '}
              <code>input.headers</code> for HTTP headers. Return an object with keys matching your expected inputs.
            </p>
            {errors.parsingScript && (
              <p className="text-sm text-destructive">{errors.parsingScript}</p>
            )}
          </div>

          {/* Expected Inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Expected Inputs</Label>
                <Tooltip content="Map webhook data to the workflow's Entry Point runtime inputs.">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </Tooltip>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addExpectedInput}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                Add Input
              </Button>
            </div>

            {isLoadingWorkflow ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : form.expectedInputs.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                No expected inputs defined. Select a workflow with an Entry Point to auto-populate.
              </div>
            ) : (
              <div className="space-y-2">
                {form.expectedInputs.map((input, index) => {
                  const runtimeInput = mapToRuntimeInput(input)
                  const isFromWorkflow = runtimeInput !== undefined

                  return (
                    <div
                      key={input.id}
                      className={cn(
                        "grid grid-cols-12 gap-2 items-start p-3 rounded-md border",
                        isFromWorkflow ? "bg-muted/30" : "bg-background"
                      )}
                    >
                      <div className="col-span-3 space-y-1">
                        <Label className="text-xs">ID</Label>
                        <Input
                          value={input.id}
                          onChange={(e) => updateExpectedInput(index, { id: e.target.value })}
                          disabled={isFromWorkflow}
                          className="h-8 text-sm font-mono"
                          placeholder="input_id"
                        />
                      </div>

                      <div className="col-span-3 space-y-1">
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={input.label}
                          onChange={(e) => updateExpectedInput(index, { label: e.target.value })}
                          className="h-8 text-sm"
                          placeholder="Display Label"
                        />
                      </div>

                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={input.type}
                          onValueChange={(value: any) => updateExpectedInput(index, { type: value })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INPUT_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2 flex items-center pt-5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={input.required}
                            onChange={(e) => updateExpectedInput(index, { required: e.target.checked })}
                            className="h-4 w-4"
                          />
                          <span className="text-sm">Required</span>
                        </label>
                      </div>

                      <div className="col-span-2 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeExpectedInput(index)}
                          disabled={isFromWorkflow}
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {errors.expectedInputs && (
              <p className="text-sm text-destructive">{errors.expectedInputs}</p>
            )}
          </div>

          {/* Info Section */}
          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            <p className="font-medium">How webhooks work:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>External services send POST requests to your unique webhook URL</li>
              <li>Your parsing script extracts and transforms the payload</li>
              <li>The workflow is triggered with the parsed data as runtime inputs</li>
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Code className="h-4 w-4 mr-2" />
                {mode === 'create' ? 'Create Webhook' : 'Save Changes'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Tooltip component for info icon
function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <div className="group relative inline-block">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-popover text-popover-foreground text-xs rounded-md shadow-md border z-50">
        {content}
      </div>
    </div>
  )
}
