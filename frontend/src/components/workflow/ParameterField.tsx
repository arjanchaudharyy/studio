import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { RuntimeInputsEditor } from './RuntimeInputsEditor'
import type { Parameter } from '@/schemas/component'
import type { InputMapping } from '@/schemas/node'
import { useSecretStore } from '@/store/secretStore'
import { useIntegrationStore } from '@/store/integrationStore'
import { getCurrentUserId } from '@/lib/currentUser'

interface ParameterFieldProps {
  parameter: Parameter
  value: any
  onChange: (value: any) => void
  connectedInput?: InputMapping
  componentSlug?: string
  parameters?: Record<string, unknown> | undefined
  onUpdateParameter?: (paramId: string, value: any) => void
}

/**
 * ParameterField - Renders appropriate input field based on parameter type
 */
export function ParameterField({
  parameter,
  value,
  onChange,
  connectedInput,
  componentSlug,
  parameters,
  onUpdateParameter,
}: ParameterFieldProps) {
  const currentValue = value !== undefined ? value : parameter.default
  const [jsonText, setJsonText] = useState<string>('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const navigate = useNavigate()

  const secrets = useSecretStore((state) => state.secrets)
  const secretsLoading = useSecretStore((state) => state.loading)
  const secretsError = useSecretStore((state) => state.error)
  const fetchSecrets = useSecretStore((state) => state.fetchSecrets)
  const refreshSecrets = useSecretStore((state) => state.refresh)

  const integrationConnections = useIntegrationStore((state) => state.connections)
  const fetchIntegrationConnections = useIntegrationStore((state) => state.fetchConnections)
  const integrationLoading = useIntegrationStore((state) => state.loadingConnections)
  const integrationError = useIntegrationStore((state) => state.error)

  const currentUserId = useMemo(() => getCurrentUserId(), [])
  const hasFetchedConnectionsRef = useRef(false)
  const autoSelectedConnectionRef = useRef(false)

  const authModeFromParameters: 'manual' | 'connection' = useMemo(() => {
    const map = parameters as Record<string, unknown> | undefined
    if (map && typeof map.authMode === 'string') {
      return map.authMode as 'manual' | 'connection'
    }
    const connectionCandidate = map?.connectionId
    if (typeof connectionCandidate === 'string' && connectionCandidate.trim().length > 0) {
      return 'connection'
    }
    return 'manual'
  }, [parameters])

  const isRemoveGithubComponent = componentSlug === 'github-remove-org-membership'
  const isProviderGithubComponent = componentSlug === 'github-connection-provider'
  const isGitHubConnectionComponent = isRemoveGithubComponent || isProviderGithubComponent
  const isConnectionSelector = isGitHubConnectionComponent && parameter.id === 'connectionId'
  const isGithubConnectionMode = isRemoveGithubComponent && authModeFromParameters === 'connection'

  const githubConnections = useMemo(
    () => integrationConnections.filter((connection) => connection.provider === 'github'),
    [integrationConnections],
  )

  useEffect(() => {
    if (!isConnectionSelector) {
      return
    }
    if (hasFetchedConnectionsRef.current) {
      return
    }
    hasFetchedConnectionsRef.current = true
    fetchIntegrationConnections(currentUserId)
      .catch((error) => {
        console.error('Failed to load integration connections', error)
      })
  }, [isConnectionSelector, fetchIntegrationConnections, currentUserId])

  useEffect(() => {
    if (!isConnectionSelector || integrationLoading) {
      return
    }

    const selectedValue =
      typeof currentValue === 'string' && currentValue.trim().length > 0
        ? currentValue.trim()
        : ''

    if (selectedValue) {
      autoSelectedConnectionRef.current = true
      return
    }

    if (githubConnections.length === 1 && !autoSelectedConnectionRef.current) {
      const [firstConnection] = githubConnections
      if (firstConnection) {
        autoSelectedConnectionRef.current = true
        onChange(firstConnection.id)
        if (isRemoveGithubComponent) {
          onUpdateParameter?.('authMode', 'connection')
          onUpdateParameter?.('clientId', undefined)
          onUpdateParameter?.('clientSecret', undefined)
        }
      }
    }
  }, [
    isConnectionSelector,
    githubConnections,
    integrationLoading,
    currentValue,
    onChange,
    onUpdateParameter,
    isRemoveGithubComponent,
  ])
  
  const handleRefreshConnections = async () => {
    try {
      await fetchIntegrationConnections(currentUserId, true)
    } catch (error) {
      console.error('Failed to refresh integration connections', error)
    }
  }

  const isReceivingInput = Boolean(connectedInput)

  const [secretMode, setSecretMode] = useState<'select' | 'manual'>(() => {
    if (parameter.type !== 'secret') {
      return 'manual'
    }
    if (
      typeof currentValue === 'string' &&
      secrets.some((secret) => secret.id === currentValue)
    ) {
      return 'select'
    }
    return secrets.length > 0 ? 'select' : 'manual'
  })

  useEffect(() => {
    if (parameter.type !== 'json') {
      return
    }

    if (value === undefined || value === null || value === '') {
      setJsonText('')
      setJsonError(null)
      return
    }

    if (typeof value === 'string') {
      setJsonText(value)
      setJsonError(null)
      return
    }

    try {
      setJsonText(JSON.stringify(value, null, 2))
      setJsonError(null)
    } catch (error) {
      console.error('Failed to serialise JSON parameter value', error)
    }
  }, [parameter.type, value])

  useEffect(() => {
    if (parameter.type !== 'secret') {
      return
    }
    fetchSecrets().catch((error) => {
      console.error('Failed to load secrets', error)
    })
  }, [parameter.type, fetchSecrets])

  useEffect(() => {
    if (parameter.type !== 'secret' || isReceivingInput) {
      return
    }

    if (secrets.length === 0) {
      setSecretMode('manual')
      return
    }

    if (
      secretMode === 'select' &&
      (typeof currentValue !== 'string' ||
        !secrets.some((secret) => secret.id === currentValue))
    ) {
      const firstSecret = secrets[0]
      if (firstSecret) {
          onChange(firstSecret.id)
      }
    }
  }, [parameter.type, secretMode, secrets, currentValue, onChange, isReceivingInput])

  useEffect(() => {
    if (parameter.type !== 'secret') {
      return
    }
    // Log connection status for debugging secret input flow
    console.debug(
      `[ParameterField] secret parameter "${parameter.id}" connection state:`,
      connectedInput ?? 'manual'
    )
  }, [parameter.type, parameter.id, connectedInput])

  const updateSecretValue = (nextValue: any) => {
    if (isReceivingInput) {
      console.debug(
        `[ParameterField] manual update blocked for secret "${parameter.id}" while receiving from upstream.`,
        connectedInput
      )
      return
    }
    onChange(nextValue)
  }

  if (isConnectionSelector) {
    const selectedValue = typeof currentValue === 'string' ? currentValue : ''
    const disabled = isReceivingInput || integrationLoading

    return (
      <div className="space-y-2">
        <select
          value={selectedValue}
          onChange={(event) => {
            autoSelectedConnectionRef.current = true
            const nextValue = event.target.value
            console.log('Selected GitHub connection ID:', nextValue)
            if (nextValue === '') {
              onChange(undefined)
              if (isRemoveGithubComponent) {
                onUpdateParameter?.('authMode', 'manual')
              }
            } else {
              onChange(nextValue)
              if (isRemoveGithubComponent) {
                onUpdateParameter?.('authMode', 'connection')
                onUpdateParameter?.('clientId', undefined)
                onUpdateParameter?.('clientSecret', undefined)
              }
            }
          }}
          className="w-full px-3 py-2 text-sm border rounded-md bg-background"
          disabled={disabled}
        >
          <option value="">Select a GitHub connection…</option>
          {githubConnections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.providerName} · {connection.userId}
            </option>
          ))}
        </select>

        {integrationLoading && (
          <p className="text-xs text-muted-foreground">Loading connections…</p>
        )}

        {integrationError && (
          <p className="text-xs text-destructive">{integrationError}</p>
        )}

        {!integrationLoading && githubConnections.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No active GitHub connections yet. Connect GitHub from the Connections manager.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => navigate('/integrations')}
            disabled={isReceivingInput}
          >
            Manage connections
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              void handleRefreshConnections()
            }}
            disabled={integrationLoading || isReceivingInput}
          >
            {integrationLoading ? 'Refreshing…' : 'Refresh'}
          </Button>
          {selectedValue && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange(undefined)
                if (isRemoveGithubComponent) {
                  onUpdateParameter?.('authMode', 'manual')
                }
              }}
              disabled={isReceivingInput}
            >
              Clear selection
            </Button>
          )}
        </div>
      </div>
    )
  }

  switch (parameter.type) {
    case 'text': {
      const disableForGitHubConnection =
        isRemoveGithubComponent && parameter.id === 'clientId' && isGithubConnectionMode

      const inputElement = (
        <Input
          id={parameter.id}
          type="text"
          placeholder={parameter.placeholder}
          value={currentValue || ''}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
          disabled={isReceivingInput || disableForGitHubConnection}
        />
      )

      if (disableForGitHubConnection) {
        return (
          <div className="space-y-2">
            {inputElement}
            <p className="text-xs text-muted-foreground">
              Using a stored GitHub connection, so the client ID is managed automatically.
            </p>
          </div>
        )
      }

      return inputElement
    }

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
          value={currentValue ?? ''}
          onChange={(e) => {
            const inputValue = e.target.value
            if (inputValue === '') {
              onChange(undefined)
              return
            }
            onChange(Number(inputValue))
          }}
          min={parameter.min}
          max={parameter.max}
          className="text-sm"
        />
      )

    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={parameter.id}
            checked={currentValue || false}
            onCheckedChange={(checked) => onChange(checked)}
          />
          <label
            htmlFor={parameter.id}
            className="text-sm text-muted-foreground cursor-pointer select-none"
          >
            {currentValue ? 'Enabled' : 'Disabled'}
          </label>
        </div>
      )

    case 'select': {
      const isAuthModeField = isRemoveGithubComponent && parameter.id === 'authMode'

      return (
        <select
          id={parameter.id}
          value={currentValue || ''}
          onChange={(e) => {
            const nextValue = e.target.value
            onChange(nextValue)

            if (isAuthModeField && nextValue === 'manual') {
              onUpdateParameter?.('connectionId', undefined)
            }
          }}
          className="w-full px-3 py-2 text-sm border rounded-md bg-background"
          disabled={isReceivingInput && !isAuthModeField}
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
    }

    case 'multi-select':
      const selectedValues = Array.isArray(currentValue) ? currentValue : []
      return (
        <div className="space-y-2">
          {parameter.options?.map((option) => {
            const isSelected = selectedValues.includes(option.value)
            return (
              <div
                key={option.value}
                className="flex items-center gap-2 hover:bg-muted/50 p-2 rounded transition-colors"
              >
                <Checkbox
                  id={`${parameter.id}-${option.value}`}
                  checked={isSelected}
                  onCheckedChange={(checked) => {
                    const newValues = checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter((v) => v !== option.value)
                    onChange(newValues)
                  }}
                />
                <label
                  htmlFor={`${parameter.id}-${option.value}`}
                  className="text-sm select-none cursor-pointer flex-1"
                >
                  {option.label}
                </label>
              </div>
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

    case 'secret': {
      const hasSecrets = secrets.length > 0
      const selectedSecretId =
        typeof currentValue === 'string' && secrets.some((secret) => secret.id === currentValue)
          ? currentValue
          : ''
      const manualValue =
        typeof currentValue === 'string' && !secrets.some((secret) => secret.id === currentValue)
          ? currentValue
          : ''
      const disableForGithubConnection =
        isRemoveGithubComponent && parameter.id === 'clientSecret' && isGithubConnectionMode

      const connectionLabel =
        connectedInput?.source && connectedInput?.output
          ? `${connectedInput.source}.${connectedInput.output}`
          : connectedInput?.source

      const handleModeChange = (mode: 'select' | 'manual') => {
        if (disableForGithubConnection) {
          return
        }
        if (isReceivingInput) {
          return
        }
        if (mode === 'select') {
          if (!hasSecrets) {
            setSecretMode('manual')
            return
          }
          const existing =
            secrets.find((secret) => secret.id === selectedSecretId) ?? secrets[0]
          setSecretMode('select')
          updateSecretValue(existing?.id ?? undefined)
          return
        }

        setSecretMode('manual')
        if (selectedSecretId) {
          updateSecretValue(undefined)
        }
      }

      return (
        <div className="space-y-3">
          {isReceivingInput && (
            <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Receiving input from upstream node
              {connectionLabel ? ` (${connectionLabel})` : ''}. Disconnect the mapping to edit manually.
            </div>
          )}
          {disableForGithubConnection && (
            <p className="text-xs text-muted-foreground">
              Using a stored GitHub connection, so the OAuth client secret is managed automatically.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"

              size="sm"
              variant={secretMode === 'select' ? 'default' : 'outline'}
              onClick={() => handleModeChange('select')}
              disabled={!hasSecrets || isReceivingInput || disableForGithubConnection}
            >
              From store
            </Button>
            <Button
              type="button"
              size="sm"
              variant={secretMode === 'manual' ? 'default' : 'outline'}
              onClick={() => handleModeChange('manual')}
              disabled={isReceivingInput || disableForGithubConnection}
            >
              Manual ID
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  refreshSecrets().catch((error) => {
                    console.error('Failed to refresh secrets', error)
                  })
                }}
                disabled={secretsLoading || isReceivingInput || disableForGithubConnection}
              >
                {secretsLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigate('/secrets')}
                disabled={isReceivingInput || disableForGithubConnection}
              >
                Manage secrets
              </Button>
            </div>
          </div>

          {secretsError && (
            <p className="text-xs text-destructive">
              {secretsError}
            </p>
          )}

          {secretMode === 'select' && hasSecrets && (
            <select
              value={selectedSecretId}
              onChange={(e) => {
                const nextValue = e.target.value
                updateSecretValue(nextValue === '' ? undefined : nextValue)
              }}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              disabled={isReceivingInput || disableForGithubConnection}
            >
              <option value="">Select a secret…</option>
              {secrets.map((secret) => (
                <option key={secret.id} value={secret.id}>
                  {secret.name}
                </option>
              ))}
            </select>
          )}

          {secretMode === 'select' && !hasSecrets && (
            <p className="text-xs text-muted-foreground">
              No stored secrets yet. Create one in the Secret Manager or switch to manual entry.
            </p>
          )}

          {secretMode === 'manual' && (
            <Input
              id={`${parameter.id}-manual`}
              type="text"
              placeholder="Paste secret ID…"
              value={manualValue}
              onChange={(e) => updateSecretValue(e.target.value)}
              className="text-sm"
              disabled={isReceivingInput || disableForGithubConnection}
            />
          )}

          {secretMode === 'select' && selectedSecretId && (
            <p className="text-xs text-muted-foreground">
              ID: <span className="font-mono">{selectedSecretId}</span>
            </p>
          )}

          {secretsError && (
            <p className="text-xs text-destructive">
              {secretsError}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Secrets are securely stored; only references are shared with components.
          </p>
        </div>
      )
    }

    case 'json':
      return (
        <div className="space-y-2">
          <textarea
            id={parameter.id}
            value={jsonText}
            onChange={(e) => {
              const nextValue = e.target.value
              setJsonText(nextValue)

              if (nextValue.trim() === '') {
                setJsonError(null)
                onChange(undefined)
                return
              }

              try {
                const parsed = JSON.parse(nextValue)
                setJsonError(null)
                onChange(parsed)
              } catch (error) {
                setJsonError('Invalid JSON')
              }
            }}
            className="w-full px-3 py-2 text-sm border rounded-md bg-background resize-y font-mono"
            rows={parameter.rows || 4}
            placeholder={parameter.placeholder || '{\n  "key": "value"\n}'}
          />
          {jsonError && (
            <p className="text-xs text-red-500">{jsonError}</p>
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
  connectedInput?: InputMapping
  componentSlug?: string
  parameters?: Record<string, unknown> | undefined
  onUpdateParameter?: (paramId: string, value: any) => void
}

/**
 * ParameterFieldWrapper - Wraps parameter field with label and description
 */
export function ParameterFieldWrapper({
  parameter,
  value,
  onChange,
  connectedInput,
  componentSlug,
  parameters,
  onUpdateParameter,
}: ParameterFieldWrapperProps) {
  // Special case: Runtime Inputs Editor for Manual Trigger
  if (parameter.id === 'runtimeInputs') {
    return (
      <div className="p-3 rounded-lg border bg-background space-y-2">
        {parameter.description && (
          <p className="text-xs text-muted-foreground mb-2">
            {parameter.description}
          </p>
        )}

        <RuntimeInputsEditor value={value || []} onChange={onChange} />

        {parameter.helpText && (
          <p className="text-xs text-muted-foreground italic mt-2">
            💡 {parameter.helpText}
          </p>
        )}
      </div>
    )
  }

  // Standard parameter field rendering
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

      <ParameterField
        parameter={parameter}
        value={value}
        onChange={onChange}
        connectedInput={connectedInput}
        componentSlug={componentSlug}
        parameters={parameters}
        onUpdateParameter={onUpdateParameter}
      />

      {parameter.helpText && (
        <p className="text-xs text-muted-foreground italic mt-2">
          💡 {parameter.helpText}
        </p>
      )}
    </div>
  )
}
