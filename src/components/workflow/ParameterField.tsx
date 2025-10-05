import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Parameter } from '@/schemas/component'

interface ParameterFieldProps {
  parameter: Parameter
  value: any
  onChange: (value: any) => void
}

/**
 * ParameterField - Renders appropriate input field based on parameter type
 */
export function ParameterField({ parameter, value, onChange }: ParameterFieldProps) {
  const currentValue = value !== undefined ? value : parameter.default

  switch (parameter.type) {
    case 'text':
      return (
        <Input
          id={parameter.id}
          type="text"
          placeholder={parameter.placeholder}
          value={currentValue || ''}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
        />
      )

    case 'textarea':
      return (
        <textarea
          id={parameter.id}
          placeholder={parameter.placeholder}
          value={currentValue || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={parameter.rows || 3}
          className="w-full px-3 py-2 text-sm border rounded-md bg-background resize-y font-mono"
        />
      )

    case 'number':
      return (
        <Input
          id={parameter.id}
          type="number"
          placeholder={parameter.placeholder}
          value={currentValue || ''}
          onChange={(e) => onChange(Number(e.target.value))}
          min={parameter.min}
          max={parameter.max}
          className="text-sm"
        />
      )

    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            id={parameter.id}
            type="checkbox"
            checked={currentValue || false}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <span className="text-sm text-muted-foreground">
            {currentValue ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      )

    case 'select':
      return (
        <select
          id={parameter.id}
          value={currentValue || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded-md bg-background"
        >
          {!parameter.required && !parameter.default && (
            <option value="">Select an option...</option>
          )}
          {parameter.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )

    case 'multi-select':
      const selectedValues = Array.isArray(currentValue) ? currentValue : []
      return (
        <div className="space-y-2">
          {parameter.options?.map((option) => {
            const isSelected = selectedValues.includes(option.value)
            return (
              <label
                key={option.value}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChange([...selectedValues, option.value])
                    } else {
                      onChange(selectedValues.filter((v) => v !== option.value))
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            )
          })}
          {selectedValues.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedValues.map((val) => {
                const option = parameter.options?.find((o) => o.value === val)
                return (
                  <Badge key={val} variant="secondary" className="text-xs">
                    {option?.label || val}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>
      )

    case 'file':
      return (
        <div className="space-y-2">
          <Input
            id={parameter.id}
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                onChange(file.name)
              }
            }}
            className="text-sm"
          />
          {currentValue && (
            <div className="text-xs text-muted-foreground">
              Selected: <span className="font-mono">{currentValue}</span>
            </div>
          )}
        </div>
      )

    default:
      return (
        <div className="text-xs text-muted-foreground italic">
          Unsupported parameter type: {parameter.type}
        </div>
      )
  }
}

interface ParameterFieldWrapperProps {
  parameter: Parameter
  value: any
  onChange: (value: any) => void
}

/**
 * ParameterFieldWrapper - Wraps parameter field with label and description
 */
export function ParameterFieldWrapper({
  parameter,
  value,
  onChange,
}: ParameterFieldWrapperProps) {
  return (
    <div className="p-3 rounded-lg border bg-background space-y-2">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium" htmlFor={parameter.id}>
          {parameter.label}
        </label>
        {parameter.required && (
          <span className="text-xs text-red-500">*required</span>
        )}
      </div>

      {parameter.description && (
        <p className="text-xs text-muted-foreground mb-2">
          {parameter.description}
        </p>
      )}

      <ParameterField parameter={parameter} value={value} onChange={onChange} />

      {parameter.helpText && (
        <p className="text-xs text-muted-foreground italic mt-2">
          💡 {parameter.helpText}
        </p>
      )}
    </div>
  )
}
