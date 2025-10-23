import { useState, useEffect } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Play, Loader2 } from 'lucide-react'
import { api } from '@/services/api'

interface RuntimeInputDefinition {
  id: string
  label: string
  type: 'file' | 'text' | 'number' | 'json' | 'array'
  required: boolean
  description?: string
}

interface RunWorkflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  runtimeInputs: RuntimeInputDefinition[]
  onRun: (inputs: Record<string, unknown>) => void
}

export function RunWorkflowDialog({
  open,
  onOpenChange,
  workflowId: _workflowId,
  runtimeInputs,
  onRun,
}: RunWorkflowDialogProps) {
  const [inputs, setInputs] = useState<Record<string, unknown>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset inputs when dialog opens
  useEffect(() => {
    if (open) {
      setInputs({})
      setUploading({})
      setErrors({})
    }
  }, [open])

  const handleFileUpload = async (inputId: string, file: File) => {
    setUploading(prev => ({ ...prev, [inputId]: true }))
    setErrors(prev => ({ ...prev, [inputId]: '' }))

    try {
      const formData = new FormData()
      formData.append('file', file)

      const fileData = await api.files.upload(file)
      setInputs(prev => ({ ...prev, [inputId]: fileData.id }))
    } catch (error) {
      console.error('File upload failed:', error)
      setErrors(prev => ({ 
        ...prev, 
        [inputId]: error instanceof Error ? error.message : 'Upload failed' 
      }))
    } finally {
      setUploading(prev => ({ ...prev, [inputId]: false }))
    }
  }

  const handleInputChange = (
    inputId: string,
    value: unknown,
    type: RuntimeInputDefinition['type']
  ) => {
    setErrors(prev => ({ ...prev, [inputId]: '' }))
    
    // Parse based on type
    let parsedValue = value
    if (type === 'number') {
      parsedValue = value ? parseFloat(value as string) : undefined
    } else if (type === 'array') {
      const textValue = typeof value === 'string' ? value : ''
      const trimmedValue = textValue.trim()

      if (trimmedValue === '') {
        parsedValue = undefined
      } else {
        try {
          const parsed = JSON.parse(trimmedValue)
          if (Array.isArray(parsed)) {
            parsedValue = parsed
          } else {
            throw new Error('Value is not an array')
          }
        } catch {
          const fallback = textValue
            .split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0)

          if (fallback.length === 0) {
            setErrors(prev => ({
              ...prev,
              [inputId]: 'Enter comma-separated values or a JSON array',
            }))
            return
          }

          parsedValue = fallback
        }
      }
    } else if (type === 'json') {
      try {
        parsedValue = value ? JSON.parse(value as string) : undefined
      } catch (error) {
        setErrors(prev => ({ 
          ...prev, 
          [inputId]: 'Invalid JSON format' 
        }))
        return
      }
    }
    
    setInputs(prev => ({ ...prev, [inputId]: parsedValue }))
  }

  const handleRun = () => {
    // Validate required inputs
    const newErrors: Record<string, string> = {}
    for (const input of runtimeInputs) {
      if (input.required && !inputs[input.id]) {
        newErrors[input.id] = 'This field is required'
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onRun(inputs)
    onOpenChange(false)
  }

  const renderInput = (input: RuntimeInputDefinition) => {
    const hasError = !!errors[input.id]
    const isUploading = uploading[input.id]

    switch (input.type) {
      case 'file':
        return (
          <div className="space-y-2">
            <Label htmlFor={input.id}>
              {input.label}
              {input.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id={input.id}
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleFileUpload(input.id, file)
                  }
                }}
                disabled={isUploading}
                className={hasError ? 'border-red-500' : ''}
              />
              {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            {inputs[input.id] != null && (
              <p className="text-xs text-green-600">
                ✓ File uploaded: {(typeof inputs[input.id] === 'string' ? inputs[input.id] : String(inputs[input.id])) as React.ReactNode}
              </p>
            )}
            {input.description && (
              <p className="text-xs text-muted-foreground">{input.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{errors[input.id]}</p>
            )}
          </div>
        )

      case 'json':
        return (
          <div className="space-y-2">
            <Label htmlFor={input.id}>
              {input.label}
              {input.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              id={input.id}
              placeholder='{"key": "value"}'
              onChange={(e) => handleInputChange(input.id, e.target.value, input.type)}
              className={hasError ? 'border-red-500' : ''}
              rows={4}
            />
            {input.description && (
              <p className="text-xs text-muted-foreground">{input.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{errors[input.id]}</p>
            )}
          </div>
        )

      case 'array':
        return (
          <div className="space-y-2">
            <Label htmlFor={input.id}>
              {input.label}
              {input.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              id={input.id}
              placeholder='value1, value2 or ["value1", "value2"]'
              onChange={(e) => handleInputChange(input.id, e.target.value, input.type)}
              className={hasError ? 'border-red-500 font-mono' : 'font-mono'}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Enter comma-separated values or provide a JSON array to pass structured data.
            </p>
            {input.description && (
              <p className="text-xs text-muted-foreground">{input.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{errors[input.id]}</p>
            )}
          </div>
        )

      case 'number':
        return (
          <div className="space-y-2">
            <Label htmlFor={input.id}>
              {input.label}
              {input.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={input.id}
              type="number"
              placeholder="Enter a number"
              onChange={(e) => handleInputChange(input.id, e.target.value, input.type)}
              className={hasError ? 'border-red-500' : ''}
            />
            {input.description && (
              <p className="text-xs text-muted-foreground">{input.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{errors[input.id]}</p>
            )}
          </div>
        )

      case 'text':
      default:
        return (
          <div className="space-y-2">
            <Label htmlFor={input.id}>
              {input.label}
              {input.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={input.id}
              type="text"
              placeholder="Enter text"
              onChange={(e) => handleInputChange(input.id, e.target.value, input.type)}
              className={hasError ? 'border-red-500' : ''}
            />
            {input.description && (
              <p className="text-xs text-muted-foreground">{input.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{errors[input.id]}</p>
            )}
          </div>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Run Workflow</DialogTitle>
          <DialogDescription>
            {runtimeInputs.length > 0
              ? 'Provide the required inputs to start the workflow.'
              : 'Click Run to start the workflow execution.'}
          </DialogDescription>
        </DialogHeader>

        {runtimeInputs.length > 0 && (
          <div className="space-y-4 py-4">
            {runtimeInputs.map((input) => (
              <div key={input.id}>{renderInput(input)}</div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRun} className="gap-2">
            <Play className="h-4 w-4" />
            Run Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
