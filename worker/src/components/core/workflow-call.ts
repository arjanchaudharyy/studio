import { z } from 'zod'
import {
  componentRegistry,
  type ComponentDefinition,
  withPortMeta,
  coerceBooleanFromText,
  coerceNumberFromText,
} from '@shipsec/component-sdk'
import type { PortMeta } from '@shipsec/component-sdk/port-meta'

const runtimeInputDefinitionSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().optional(),
    type: z.enum(['file', 'text', 'number', 'json', 'array', 'string']).optional(),
    required: z.boolean().optional(),
    description: z.string().optional(),
  })
  .strip()

const inputSchema = z
  .object({
    workflowId: z.string().uuid(),
    versionStrategy: z.enum(['latest', 'specific']).default('latest'),
    versionId: z.string().uuid().optional(),
    timeoutSeconds: z.number().int().positive().default(300),
    childRuntimeInputs: z.array(runtimeInputDefinitionSchema).optional(),
  })
  .passthrough()

type Input = z.infer<typeof inputSchema>

const outputSchema = z.object({
  result: withPortMeta(z.record(z.string(), z.unknown()), {
    label: 'Result',
    allowAny: true,
    reason: 'Child workflows can return any shape.',
    connectionType: { kind: 'primitive', name: 'json' },
  }),
  childRunId: withPortMeta(z.string(), {
    label: 'Child Run ID',
  }),
})

type Output = z.infer<typeof outputSchema>

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.workflow.call',
  label: 'Call Workflow',
  category: 'transform',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Execute another workflow synchronously and use its outputs.',
  ui: {
    slug: 'workflow-call',
    version: '1.0.0',
    type: 'process',
    category: 'transform',
    description: 'Execute another workflow synchronously and use its outputs.',
    icon: 'GitBranch',
    author: { name: 'ShipSecAI', type: 'shipsecai' },
    isLatest: true,
    deprecated: false,
    parameters: [
      {
        id: 'workflowId',
        label: 'Workflow',
        type: 'select',
        required: true,
        description: 'The workflow to execute',
        options: [],
      },
      {
        id: 'versionStrategy',
        label: 'Version',
        type: 'select',
        required: true,
        default: 'latest',
        options: [
          { label: 'Latest', value: 'latest' },
          { label: 'Specific', value: 'specific' },
        ],
      },
      {
        id: 'versionId',
        label: 'Specific Version ID',
        type: 'text',
        required: false,
        visibleWhen: { versionStrategy: 'specific' },
        description: 'Only used when versionStrategy is "specific"',
      },
      {
        id: 'timeoutSeconds',
        label: 'Timeout (seconds)',
        type: 'number',
        required: false,
        default: 300,
        min: 1,
      },
      {
        id: 'childRuntimeInputs',
        label: 'Child Runtime Inputs',
        type: 'json',
        required: false,
        description: 'Internal configuration for child runtime input definitions.',
        visibleWhen: { __internal: true },
      },
    ],
    examples: [
      'Use a reusable enrichment workflow inside a larger pipeline.',
    ],
  },
  resolvePorts(params) {
    const parsed = inputSchema.safeParse(params)
    const childRuntimeInputs = parsed.success ? parsed.data.childRuntimeInputs ?? [] : []
    const reservedIds = new Set([
      'workflowId',
      'versionStrategy',
      'versionId',
      'timeoutSeconds',
      'childRuntimeInputs',
      'childWorkflowName',
    ])

    const inputShape: Record<string, z.ZodTypeAny> = {}
    for (const runtimeInput of childRuntimeInputs) {
      const id = runtimeInput.id.trim()
      if (!id || reservedIds.has(id)) {
        continue
      }

      const label = runtimeInput.label?.trim() || id
      const runtimeType = (runtimeInput.type ?? 'text').toLowerCase()
      const required = runtimeInput.required ?? true
      const { schema, meta } = runtimeInputTypeToSchema(runtimeType)
      const schemaWithRequirement = required ? schema : schema.optional()
      inputShape[id] = withPortMeta(schemaWithRequirement, {
        ...(meta ?? {}),
        label,
        description: runtimeInput.description,
      })
    }

    return {
      inputs: z.object(inputShape),
      outputs: outputSchema,
    }
  },
  async execute() {
    throw new Error(
      'core.workflow.call must be executed by the Temporal workflow orchestrator (shipsecWorkflowRun)',
    )
  },
}

componentRegistry.register(definition)

function runtimeInputTypeToSchema(type: string): { schema: z.ZodTypeAny; meta?: PortMeta } {
  switch (type) {
    case 'string':
    case 'text':
      return { schema: z.string() }
    case 'number':
      return { schema: coerceNumberFromText() }
    case 'boolean':
      return { schema: coerceBooleanFromText() }
    case 'file':
      return {
        schema: z.string(),
        meta: { connectionType: { kind: 'primitive', name: 'file' } },
      }
    case 'json':
      return {
        schema: z.unknown(),
        meta: {
          allowAny: true,
          reason: 'Child workflow runtime inputs can be arbitrary JSON.',
          connectionType: { kind: 'primitive', name: 'json' },
        },
      }
    case 'array':
      return { schema: z.array(z.string()) }
    default:
      return {
        schema: z.unknown(),
        meta: {
          allowAny: true,
          reason: 'Child workflow runtime inputs can be arbitrary JSON.',
          connectionType: { kind: 'any' },
        },
      }
  }
}
