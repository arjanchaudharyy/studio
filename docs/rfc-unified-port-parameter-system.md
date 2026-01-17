# RFC: Unified Zod-First Port & Parameter System

**Status:** Draft  
**Author:** ShipSec Team  
**Created:** 2026-01-17  
**Supersedes:** `docs/rfc-zod-first-port-system.md`

## 1. Problem Statement

The current component SDK has three separate systems that overlap and create confusion:

### Current Architecture Issues

| System | Location | Purpose | Problem |
|--------|----------|---------|---------|
| **Zod `inputSchema`** | `ComponentDefinition.inputs` | Validate all input data | Mixes ports and parameters |
| **`metadata.inputs`** (legacy) | Removed in migration | Define visible ports | Was redundant with Zod |
| **`ui.parameters`** | `ComponentDefinition.ui.parameters` | Define sidebar form fields | Duplicates input definitions |
| **`withPortMeta()`** | Field-level decorator | Mark fields as ports | No compile-time enforcement |

### Specific Problems

1. **No clear distinction** between runtime data (ports) and design-time config (parameters)
2. **Dual definition** of parameters (in Zod schema AND `ui.parameters`)
3. **No compile-time enforcement** that all ports have metadata
4. **`execute(params)`** receives a flat object mixing both ports and parameters
5. **No type safety** distinguishing port inputs from parameter values

### Example of Current Confusion

```typescript
// Current: everything mixed together
const inputSchema = z.object({
  // Is this a port or a parameter? Only withPortMeta tells us
  apiKey: withPortMeta(z.string(), { label: 'API Key' }),  // Port
  model: z.string().default('gpt-4'),                       // Parameter?? No metadata
});

ui: {
  // Parameters defined AGAIN here - duplication!
  parameters: [
    { id: 'model', label: 'Model', type: 'select', default: 'gpt-4' },
  ]
}

async execute(params) {
  // params.apiKey - came from port connection
  // params.model  - came from UI form
  // No type distinction!
}
```

---

## 2. Proposed Solution

### Core Principle: Separation of Concerns

**Ports** and **Parameters** are fundamentally different:

| Aspect | Ports | Parameters |
|--------|-------|------------|
| **When set** | Runtime (data flows between nodes) | Design-time (set when building workflow) |
| **Source** | Output of another node | UI form in sidebar |
| **Visibility** | Connection handles on node | Form fields in config panel |
| **Variability** | Changes per execution | Static per workflow version |
| **Use case** | Dynamic data flow | Component configuration |

### New API Design

```typescript
import { z } from 'zod';
import { 
  defineComponent, 
  port, 
  param,
  inputs, 
  outputs, 
  parameters 
} from '@shipsec/component-sdk';

export default defineComponent({
  id: 'core.provider.gemini',
  label: 'Gemini Provider',
  category: 'ai',
  runner: { kind: 'inline' },

  // PORTS: Runtime data connections (visible on canvas as handles)
  inputs: inputs({
    apiKey: port(z.string(), { 
      label: 'API Key', 
      editor: 'secret',
      connectionType: { kind: 'primitive', name: 'secret' },
    }),
    conversationHistory: port(z.array(z.any()).optional(), {
      label: 'Conversation History',
      description: 'Optional prior conversation to continue',
    }),
  }),

  outputs: outputs({
    chatModel: port(LLMProviderSchema(), {
      label: 'LLM Provider Config',
      description: 'Provider configuration for AI components',
    }),
  }),

  // PARAMETERS: Design-time configuration (form fields in sidebar)
  parameters: parameters({
    model: param(z.string().default('gemini-2.5-flash'), {
      label: 'Model',
      editor: 'select',
      options: [
        { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
        { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
      ],
    }),
    apiBaseUrl: param(z.string().optional(), {
      label: 'API Base URL',
      editor: 'text',
      description: 'Override for Gemini API endpoint',
    }),
    maxRetries: param(z.number().default(3), {
      label: 'Max Retries',
      editor: 'number',
      min: 0,
      max: 10,
    }),
  }),

  // Execute receives BOTH - clearly typed and separated
  async execute({ inputs, params }, context) {
    // inputs.apiKey - from port connection (runtime)
    // params.model  - from UI form (design-time)
    
    return {
      chatModel: {
        provider: 'gemini',
        modelId: params.model,
        apiKey: inputs.apiKey,
        baseUrl: params.apiBaseUrl,
      },
    };
  },
});
```

---

## 3. Detailed Design

### 3.1 Type Definitions

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Brand Symbols (compile-time enforcement)
// ─────────────────────────────────────────────────────────────────────────────

declare const PortBrand: unique symbol;
declare const ParamBrand: unique symbol;

/** A Zod schema marked as a port */
export type PortSchema<T extends z.ZodTypeAny = z.ZodTypeAny> = T & {
  readonly [PortBrand]: true;
};

/** A Zod schema marked as a parameter */
export type ParamSchema<T extends z.ZodTypeAny = z.ZodTypeAny> = T & {
  readonly [ParamBrand]: true;
};

/** Object schema containing only ports */
export type InputsSchema<T = unknown> = z.ZodObject<Record<string, PortSchema>> & {
  readonly [PortBrand]: true;
};

/** Object schema containing only ports */
export type OutputsSchema<T = unknown> = z.ZodObject<Record<string, PortSchema>> & {
  readonly [PortBrand]: true;
};

/** Object schema containing only parameters */
export type ParametersSchema<T = unknown> = z.ZodObject<Record<string, ParamSchema>> & {
  readonly [ParamBrand]: true;
};
```

### 3.2 Port Metadata

```typescript
export interface PortMeta {
  /** Display label (required) */
  label: string;
  /** Tooltip/help text */
  description?: string;
  /** Connection type for compatibility checks */
  connectionType?: ConnectionType;
  /** Editor hint for manual value entry */
  editor?: 'text' | 'textarea' | 'number' | 'boolean' | 'json' | 'secret';
  /** Agent tool binding type */
  bindingType?: 'credential' | 'action' | 'config';
  /** For branching outputs */
  isBranching?: boolean;
  branchColor?: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'slate';
  /** Value resolution priority when both connected and manual */
  valuePriority?: 'manual-first' | 'connection-first';
}

/** Create a port schema with metadata */
export function port<T extends z.ZodTypeAny>(
  schema: T,
  meta: PortMeta
): PortSchema<T> {
  return withMetadata(schema, { kind: 'port', ...meta }) as PortSchema<T>;
}
```

### 3.3 Parameter Metadata

```typescript
export interface ParamMeta {
  /** Display label (required) */
  label: string;
  /** Tooltip/help text */
  description?: string;
  /** Form field editor type */
  editor: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multi-select' | 'json' | 'secret';
  /** Placeholder text */
  placeholder?: string;
  /** For 'select' editor */
  options?: Array<{ label: string; value: unknown }>;
  /** For 'number' editor */
  min?: number;
  max?: number;
  /** For 'textarea' editor */
  rows?: number;
  /** Conditional visibility */
  visibleWhen?: Record<string, unknown>;
}

/** Create a parameter schema with metadata */
export function param<T extends z.ZodTypeAny>(
  schema: T,
  meta: ParamMeta
): ParamSchema<T> {
  return withMetadata(schema, { kind: 'param', ...meta }) as ParamSchema<T>;
}
```

### 3.4 Schema Builders

```typescript
/** Create inputs schema (all fields must be ports) */
export function inputs<T extends Record<string, PortSchema>>(
  shape: T
): InputsSchema<z.infer<z.ZodObject<T>>> {
  return z.object(shape) as unknown as InputsSchema<z.infer<z.ZodObject<T>>>;
}

/** Create outputs schema (all fields must be ports) */
export function outputs<T extends Record<string, PortSchema>>(
  shape: T
): OutputsSchema<z.infer<z.ZodObject<T>>> {
  return z.object(shape) as unknown as OutputsSchema<z.infer<z.ZodObject<T>>>;
}

/** Create parameters schema (all fields must be params) */
export function parameters<T extends Record<string, ParamSchema>>(
  shape: T
): ParametersSchema<z.infer<z.ZodObject<T>>> {
  return z.object(shape) as unknown as ParametersSchema<z.infer<z.ZodObject<T>>>;
}
```

### 3.5 Component Definition

```typescript
export interface ComponentDefinition<
  I = unknown,   // Input port types
  O = unknown,   // Output port types
  P = unknown,   // Parameter types
> {
  id: string;
  label: string;
  category: ComponentCategory;
  runner: RunnerConfig;

  /** Port inputs - data received at runtime from other nodes */
  inputs: InputsSchema<I>;
  
  /** Port outputs - data sent at runtime to other nodes */
  outputs: OutputsSchema<O>;
  
  /** Parameters - configuration set at design time */
  parameters?: ParametersSchema<P>;

  /** Documentation */
  docs?: string;
  
  /** Retry policy */
  retryPolicy?: ComponentRetryPolicy;

  /** Execute function - receives separated inputs and params */
  execute: (
    context: ExecutionPayload<I, P>,
    ctx: ExecutionContext
  ) => Promise<O>;

  /** Dynamic port resolution */
  resolvePorts?: (params: P) => {
    inputs?: InputsSchema;
    outputs?: OutputsSchema;
  };
}

interface ExecutionPayload<I, P> {
  /** Values from port connections (runtime) */
  inputs: I;
  /** Values from parameter form (design-time) */
  params: P;
}
```

---

## 4. Compile-Time Enforcement

### 4.1 What Gets Enforced

```typescript
// ✅ CORRECT - all fields are ports
const myInputs = inputs({
  apiKey: port(z.string(), { label: 'API Key', editor: 'secret' }),
  target: port(z.string(), { label: 'Target' }),
});

// ❌ COMPILE ERROR - z.string() is not PortSchema
const badInputs = inputs({
  apiKey: z.string(),  // Error: Type 'ZodString' is not assignable to 'PortSchema'
});

// ❌ COMPILE ERROR - param() in inputs
const wrongInputs = inputs({
  apiKey: param(z.string(), { label: 'API Key', editor: 'text' }),  // Error!
});

// ✅ CORRECT - all fields are params
const myParams = parameters({
  model: param(z.string(), { label: 'Model', editor: 'select' }),
});

// ❌ COMPILE ERROR - port() in parameters
const wrongParams = parameters({
  model: port(z.string(), { label: 'Model' }),  // Error!
});
```

### 4.2 Execute Function Type Safety

```typescript
const definition = defineComponent({
  inputs: inputs({
    apiKey: port(z.string(), { label: 'API Key', editor: 'secret' }),
  }),
  outputs: outputs({
    result: port(z.string(), { label: 'Result' }),
  }),
  parameters: parameters({
    model: param(z.string().default('gpt-4'), { label: 'Model', editor: 'select' }),
  }),

  async execute({ inputs, params }) {
    // TypeScript knows:
    // inputs.apiKey: string
    // params.model: string
    
    inputs.model;  // ❌ Error: 'model' does not exist on inputs
    params.apiKey; // ❌ Error: 'apiKey' does not exist on params

    return { result: 'done' };
  },
});
```

---

## 5. Runtime Behavior

### 5.1 Compiler Changes

```typescript
// backend/src/dsl/compiler.ts

function compileWorkflowGraph(graph: WorkflowGraphDto): WorkflowDefinition {
  // ... existing code ...

  const actions: WorkflowAction[] = orderedIds.map((id) => {
    const node = nodes.find((n) => n.id === id)!;
    const component = componentRegistry.get(node.type)!;
    
    // Extract parameter values from node.data.config
    const parameterValues = extractParameterValues(node.data.config, component);
    
    // Build input mappings from edges + per-port manual overrides
    const inputMappings = buildInputMappings(edges, id, component, node.data.config);

    return {
      ref: id,
      componentId: node.type,
      // Separate storage
      params: parameterValues,      // Design-time config
      inputMappings,                // Runtime port mappings (including overrides)
      dependsOn: [...],
    };
  });
}
```

### 5.2 Activity Execution

```typescript
// worker/src/workflow/activities.ts

async function executeComponent(action: WorkflowAction, inputs: ResolvedInputs) {
  const component = componentRegistry.get(action.componentId);
  
  // Separate execution payload
  const payload = {
    inputs: inputs,           // Resolved from port connections
    params: action.params,    // From workflow definition (design-time)
  };

  return component.execute(payload, context);
}
```

---

## 6. Frontend Changes

### 6.1 ConfigPanel

The sidebar configuration panel will:
1. **Show two sections: Parameters + Inputs** (ports appear as they do today)
2. **Parameters** derive form fields from `parameters` schema (no `ui.parameters` duplication)
3. **Inputs** render from `inputs` schema and show connection status + manual override values
4. **Input fields** use `PortMeta.editor` and honor `valuePriority` when both sources exist

### 6.2 Port Handles

Canvas node ports:
1. **Only show fields from `inputs`/`outputs`** - clearly ports
2. **Use `PortMeta`** for connection type, labels, etc.

### 6.3 Remove `ui.parameters`

Remove `ui.parameters` entirely. Parameter metadata comes from `parameters` schema.

---

## 7. Migration Strategy

This is a full cutover. We will not ship backward-compatibility shims.

### Phase 1: Add New Types (Breaking)

1. Add `port()`, `param()`, `inputs()`, `outputs()`, `parameters()` helpers
2. Add branded types `PortSchema`, `ParamSchema`
3. Update `ComponentDefinition` to require the new shapes

### Phase 2: Update Component Definition + Compiler

1. Add `parameters` field to `ComponentDefinition`
2. Change `execute` signature to receive `{ inputs, params }`
3. Compiler extracts `params` and input overrides from node config

### Phase 3: Migrate Components

For each component:
1. Separate fields into `inputs` (ports) and `parameters` 
2. Wrap port fields with `port()`
3. Wrap parameter fields with `param()`
4. Update `execute` to use new signature
5. Remove `ui.parameters` duplication

### Phase 4: Update Runtime

1. Activity passes `{ inputs, params }` to execute
2. Validation uses separated schemas

### Phase 5: Update Frontend

1. ConfigPanel renders parameters and inputs from schemas
2. Inputs show connection/override state and allow manual overrides

### Phase 6: Cleanup

1. Remove any `ui.parameters` remnants
2. Add lint rule preventing `ui.parameters`

---

## 8. Example Migration

### Before

```typescript
const inputSchema = z.object({
  apiKey: withPortMeta(z.string(), { label: 'API Key', editor: 'secret' }),
  model: z.string().default('gpt-4'),
});

const definition: ComponentDefinition<Input, Output> = {
  inputs: inputSchema,
  outputs: outputSchema,
  ui: {
    parameters: [
      { id: 'model', label: 'Model', type: 'select', default: 'gpt-4' },
    ],
  },
  async execute(params) {
    const { apiKey, model } = params;
    // ...
  },
};
```

### After

```typescript
const definition = defineComponent({
  inputs: inputs({
    apiKey: port(z.string(), { 
      label: 'API Key', 
      editor: 'secret',
    }),
  }),
  
  outputs: outputs({
    chatModel: port(LLMProviderSchema(), { 
      label: 'LLM Config' 
    }),
  }),
  
  parameters: parameters({
    model: param(z.string().default('gpt-4'), {
      label: 'Model',
      editor: 'select',
      options: [
        { label: 'GPT-4', value: 'gpt-4' },
        { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
      ],
    }),
  }),
  
  async execute({ inputs, params }) {
    const apiKey = inputs.apiKey;
    const model = params.model;
    // ...
  },
});
```

---

## 9. Benefits

| Benefit | Description |
|---------|-------------|
| **Compile-time safety** | TypeScript catches mixing ports/params |
| **No duplication** | Parameters defined once, not in Zod AND `ui.parameters` |
| **Clear mental model** | Ports = runtime data, Parameters = config |
| **Better typed execute** | `{ inputs, params }` makes source explicit |
| **Easier code review** | Can see at a glance what's a port vs parameter |
| **Frontend simplification** | ConfigPanel reads from schemas for parameters and inputs |

---

## 10. Open Questions

1. **Should `parameters` be optional or required?**
   - Proposal: Optional. Components with no config don't need it.

2. **How to handle fields that are BOTH?**
   - Some fields may accept connection OR manual value
   - Proposal: These are ports with manual overrides in the Inputs UI, and `valuePriority` defines precedence

3. **What about dynamic parameters?**
   - Proposal: `resolveParameters?(params: P) => ParametersSchema` similar to `resolvePorts`

4. **Named contracts for parameters?**
   - Some parameters might be reusable (e.g., AWS region, retry config)
   - Proposal: Can use same contract system with `param(AwsRegionSchema(), {...})`

---

## 11. Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Phase 1 | 1 day | Add new type helpers |
| Phase 2 | 1 day | Update ComponentDefinition |
| Phase 3 | 3-4 days | Migrate ~60 components |
| Phase 4 | 2 days | Update compiler & runtime |
| Phase 5 | 2 days | Update frontend |
| Phase 6 | 1 day | Cleanup & lint rules |
| **Total** | **~2 weeks** | |

---

## 12. Decision

**[  ] Approved**  
**[  ] Approved with changes**  
**[  ] Rejected**  

### Notes

_To be filled after review_
