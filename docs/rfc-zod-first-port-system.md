# RFC: Zod-First Port System Design

> **Status**: Proposal  
> **Author**: ShipSec Engineering  
> **Date**: 2026-01-16  

## Executive Summary

Replace the current triple-type-system (Zod schemas + PortDataType + Contracts registry) with a **single Zod-based system** using Zod v4's metadata capabilities. This eliminates duplication, reduces maintenance burden, and provides better type safety.

---

## Problem Statement

### Current Architecture Has Three Parallel Type Systems

| Layer | Purpose | Example |
|-------|---------|---------|
| **Zod `inputSchema`** | Runtime validation | `z.object({ target: z.string() })` |
| **`metadata.inputs` (PortDataType)** | UI hints, coercion | `{ id: 'target', dataType: port.text() }` |
| **Contracts registry** | Shared complex types | `registerContract({ name: 'aws', schema: z.object({...}) })` |

### Problems

1. **Duplication**: Every input is defined twice (Zod field + PortDataType)
2. **Drift risk**: Schema changes require updates in two places
3. **Complexity**: Three different APIs to learn and maintain
4. **Inconsistency**: `port.text()` ≠ `z.string()` despite same intent
5. **JSON Schema**: Requires custom mapping from PortDataType

---

## Proposed Solution

### Single Source of Truth: Zod Schemas with Metadata

Use Zod v4's `.meta()` and `.describe()` to attach all port information:

```typescript
import { z } from 'zod';

const inputSchema = z.object({
  apiKey: z.string()
    .describe('API key for authentication')
    .meta({
      label: 'API Key',
      bindingType: 'credential',
      icon: 'Key',
    }),
  ipAddress: z.string()
    .describe('IP address to check')
    .meta({
      label: 'IP Address',
    }),
  maxAge: z.number()
    .default(90)
    .meta({ label: 'Max Age (Days)' }),
});
```

---

## Detailed Design

### 1. Port Metadata Schema

Define a standard interface for port metadata:

```typescript
// In @shipsec/component-sdk

interface PortMeta {
  /** Display label in UI */
  label?: string;
  
  /** Binding type for tool mode */
  bindingType?: 'credential' | 'action' | 'config';
  
  /** Icon name (Lucide icons) */
  icon?: string;
  
  /** Help text shown on hover */
  helpText?: string;
  
  /** Editor type override */
  editor?: 'text' | 'textarea' | 'json' | 'secret' | 'file';
  
  /** For branching outputs */
  isBranching?: boolean;
  branchColor?: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'slate';
  
  /** Schema name for object types (replaces contracts) */
  schemaName?: string;
  
  /** True if this is a credential schema */
  isCredential?: boolean;
}

// Extend Zod's meta type
declare module 'zod' {
  interface ZodTypeDef {
    meta?: PortMeta;
  }
}
```

### 2. Component Definition (New Style)

```typescript
import { z } from 'zod';
import { defineComponent } from '@shipsec/component-sdk';
import { AWSCredentials } from '@shipsec/contracts';

export default defineComponent({
  id: 'security.abuseipdb.check',
  label: 'AbuseIPDB Lookup',
  category: 'security',
  runner: { kind: 'inline' },

  // Unified input definition
  inputs: z.object({
    apiKey: z.string()
      .describe('AbuseIPDB API key')
      .meta({ label: 'API Key', bindingType: 'credential' }),
    ipAddress: z.string()
      .describe('IP address to check')
      .meta({ label: 'IP Address' }),
    maxAgeInDays: z.number()
      .default(90)
      .meta({ label: 'Max Age (Days)' }),
    verbose: z.boolean()
      .optional()
      .meta({ label: 'Verbose Output' }),
  }),

  // Unified output definition
  outputs: z.object({
    abuseScore: z.number().meta({ label: 'Abuse Score' }),
    country: z.string().meta({ label: 'Country' }),
    reports: z.array(z.object({
      reportedAt: z.string(),
      categories: z.array(z.number()),
    })).meta({ label: 'Reports' }),
  }),

  // Metadata for UI (non-port related)
  ui: {
    icon: 'Shield',
    description: 'Check IP reputation using AbuseIPDB',
    examples: ['Check if 1.2.3.4 is malicious'],
    agentTool: {
      enabled: true,
      toolName: 'check_ip_reputation',
      toolDescription: 'Check if an IP address has been reported as malicious',
    },
  },

  async execute(params, context) {
    // params is typed from inputs schema
    const { apiKey, ipAddress, maxAgeInDays, verbose } = params;
    // ...
  },
});
```

### 3. Contracts → Named Zod Schemas

**Before (Contracts Registry):**

```typescript
// Register separately
registerContract({
  name: 'aws-credentials',
  schema: z.object({
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    region: z.string(),
  }),
});

// Use by name
{ id: 'creds', dataType: port.credential('aws-credentials') }
```

**After (Named Exports):**

```typescript
// @shipsec/contracts/aws.ts
export const AWSCredentials = z.object({
  accessKeyId: z.string().describe('AWS Access Key ID'),
  secretAccessKey: z.string().describe('AWS Secret Access Key'),
  region: z.string().describe('AWS Region'),
}).meta({
  schemaName: 'aws-credentials',
  isCredential: true,
  label: 'AWS Credentials',
});

// In component
import { AWSCredentials } from '@shipsec/contracts';

inputs: z.object({
  credentials: AWSCredentials.meta({ bindingType: 'credential' }),
  targetBucket: z.string().meta({ label: 'Target Bucket' }),
}),
```

### 4. SDK Helper Functions

#### Extract Port Metadata from Zod

```typescript
// @shipsec/component-sdk/schema-utils.ts

import { z, ZodObject, ZodType } from 'zod';

export interface ExtractedPort {
  id: string;
  label: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
  required: boolean;
  default?: unknown;
  bindingType?: 'credential' | 'action' | 'config';
  icon?: string;
  helpText?: string;
  schemaName?: string;
}

export function extractPorts(schema: ZodObject<any>): ExtractedPort[] {
  const shape = schema.shape;
  const ports: ExtractedPort[] = [];

  for (const [id, fieldSchema] of Object.entries(shape)) {
    const zod = fieldSchema as ZodType;
    const meta = zod._def.meta ?? {};
    
    ports.push({
      id,
      label: meta.label ?? id,
      description: zod.description,
      type: zodTypeToSimple(zod),
      required: !zod.isOptional(),
      default: getDefaultValue(zod),
      bindingType: meta.bindingType,
      icon: meta.icon,
      helpText: meta.helpText,
      schemaName: meta.schemaName,
    });
  }

  return ports;
}

function zodTypeToSimple(schema: ZodType): ExtractedPort['type'] {
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  if (schema instanceof z.ZodArray) return 'array';
  if (schema instanceof z.ZodObject) return 'object';
  if (schema instanceof z.ZodOptional) return zodTypeToSimple(schema.unwrap());
  if (schema instanceof z.ZodDefault) return zodTypeToSimple(schema.removeDefault());
  return 'any';
}
```

#### Connection Type Checking

```typescript
// @shipsec/component-sdk/connection-types.ts

export type ConnectionType =
  | { kind: 'primitive'; type: 'string' | 'number' | 'boolean' | 'any' }
  | { kind: 'array'; element: ConnectionType }
  | { kind: 'object'; schemaName?: string };

export function zodToConnectionType(schema: ZodType): ConnectionType {
  if (schema instanceof z.ZodString) return { kind: 'primitive', type: 'string' };
  if (schema instanceof z.ZodNumber) return { kind: 'primitive', type: 'number' };
  if (schema instanceof z.ZodBoolean) return { kind: 'primitive', type: 'boolean' };
  if (schema instanceof z.ZodArray) {
    return { kind: 'array', element: zodToConnectionType(schema.element) };
  }
  if (schema instanceof z.ZodObject) {
    return { kind: 'object', schemaName: schema._def.meta?.schemaName };
  }
  if (schema instanceof z.ZodOptional) return zodToConnectionType(schema.unwrap());
  if (schema instanceof z.ZodDefault) return zodToConnectionType(schema.removeDefault());
  return { kind: 'primitive', type: 'any' };
}

export function canConnect(source: ConnectionType, target: ConnectionType): boolean {
  // Any accepts anything
  if (target.kind === 'primitive' && target.type === 'any') return true;

  // Direct match
  if (source.kind === target.kind) {
    if (source.kind === 'primitive' && target.kind === 'primitive') {
      if (source.type === target.type) return true;
      // Coercion: number → string
      if (source.type === 'number' && target.type === 'string') return true;
    }
    
    if (source.kind === 'array' && target.kind === 'array') {
      return canConnect(source.element, target.element);
    }
    
    if (source.kind === 'object' && target.kind === 'object') {
      // If both have schemaNames, they must match
      if (source.schemaName && target.schemaName) {
        return source.schemaName === target.schemaName;
      }
      // If target has no schemaName, accept any object
      if (!target.schemaName) return true;
    }
  }

  return false;
}
```

#### JSON Schema Generation (for MCP Tools)

```typescript
// @shipsec/component-sdk/tool-helpers.ts

import { z } from 'zod';
import type { JSONSchema7 } from 'json-schema';
import { extractPorts } from './schema-utils';

export function getToolSchema(component: ComponentDefinition): JSONSchema7 {
  const ports = extractPorts(component.inputs);
  
  // Filter to action inputs only (not credentials)
  const actionPorts = ports.filter(p => p.bindingType !== 'credential');
  const actionKeys = actionPorts.map(p => p.id);
  
  // Pick only action fields from schema
  const pickObj = Object.fromEntries(actionKeys.map(id => [id, true]));
  const actionSchema = component.inputs.pick(pickObj);
  
  // Use Zod's built-in JSON Schema conversion
  return z.toJSONSchema(actionSchema) as JSONSchema7;
}

export function getToolMetadata(component: ComponentDefinition) {
  return {
    name: component.ui?.agentTool?.toolName ?? component.id.replace(/\./g, '_'),
    description: component.ui?.agentTool?.toolDescription ?? component.ui?.description,
    inputSchema: getToolSchema(component),
  };
}
```

### 5. Type Coercion

**Replace custom coercion with Zod's built-in:**

```typescript
// Before: manual coercion
function coerceValueForPort(dataType: PortDataType, value: unknown) {
  if (dataType.kind === 'primitive' && dataType.name === 'number') {
    if (typeof value === 'string') return Number(value);
  }
  // ...
}

// After: built into schema
inputs: z.object({
  // Automatically coerces string → number
  count: z.coerce.number().meta({ label: 'Count' }),
  
  // Custom coercion
  flexibleId: z.preprocess(
    (val) => typeof val === 'number' ? String(val) : val,
    z.string()
  ).meta({ label: 'ID' }),
}),
```

### 6. Dynamic Ports (resolvePorts)

```typescript
// New signature
resolvePorts(params: Record<string, unknown>): {
  inputs?: z.ZodObject<any>;
  outputs?: z.ZodObject<any>;
} {
  const shape: Record<string, z.ZodType> = {};
  
  for (const v of params.variables ?? []) {
    shape[v.name] = z.string().meta({ label: v.name, dynamic: true });
  }
  
  return {
    inputs: Object.keys(shape).length > 0 ? z.object(shape) : undefined,
  };
}

// SDK merges with base schema
function getEffectiveInputSchema(component, params) {
  const resolved = component.resolvePorts?.(params);
  if (!resolved?.inputs) return component.inputs;
  return component.inputs.merge(resolved.inputs);
}
```

### 7. Frontend Editor Type Inference

```typescript
// Frontend: determine which editor to show

function getEditorType(schema: ZodType, meta: PortMeta): EditorType {
  // Explicit override
  if (meta.editor) return meta.editor;
  
  // Credential → secret input
  if (meta.bindingType === 'credential') return 'secret';
  
  // Infer from Zod type
  if (schema instanceof z.ZodString) {
    if (meta.multiline) return 'textarea';
    return 'text';
  }
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  if (schema instanceof z.ZodEnum) return 'select';
  if (schema instanceof z.ZodObject) return 'json';
  if (schema instanceof z.ZodArray) return 'array';
  
  return 'text';
}
```

---

## Migration Strategy

### Phase 1: Add New Infrastructure (Non-Breaking)

**Timeline: 1 week**

1. Add `extractPorts()`, `zodToConnectionType()`, `canConnect()` helpers
2. Add `getToolSchema()` using Zod directly
3. Add TypeScript extensions for Zod meta types
4. Keep old `port.*` functions working

**Files to create:**
- `packages/component-sdk/src/schema-utils.ts`
- `packages/component-sdk/src/connection-types.ts`
- Update `packages/component-sdk/src/tool-helpers.ts`

### Phase 2: Create @shipsec/contracts Package

**Timeline: 3 days**

1. Create new package with named Zod schema exports
2. Export all current contracts as Zod schemas
3. Components can import from either (backwards compatible)

**New package structure:**
```
packages/contracts/
  src/
    aws.ts        # AWSCredentials, AWSConfig
    github.ts     # GitHubConnection
    okta.ts       # OktaCredentials
    index.ts      # Re-exports all
```

### Phase 3: SDK Auto-Detection

**Timeline: 2 days**

Modify component loading to auto-detect style:

```typescript
function getInputPorts(component: ComponentDefinition): ExtractedPort[] {
  // New style: derive from inputs schema
  if (component.inputs && !component.metadata?.inputs?.length) {
    return extractPorts(component.inputs);
  }
  
  // Old style: use metadata.inputs
  return component.metadata?.inputs?.map(convertOldPort) ?? [];
}
```

### Phase 4: Migrate Components (Gradual)

**Timeline: Ongoing**

Migrate components one team/category at a time:

1. Start with simple components (e.g., `console-log`, `text-joiner`)
2. Then security components (AbuseIPDB, VirusTotal)
3. Then complex components (AI agents, manual actions)

**Per-component migration:**
- Remove `metadata.inputs` and `metadata.outputs`
- Add `.meta()` calls to input/output schema fields
- Replace `port.credential('name')` with imported schema
- Update dynamic ports in `resolvePorts`

### Phase 5: Deprecate Old System

**Timeline: After 80% migration**

1. Add console warnings for `port.*` usage
2. Update documentation
3. Remove old code in major version

---

## Backwards Compatibility

### During Migration

| Old Pattern | Still Works? | Recommended New Pattern |
|-------------|--------------|-------------------------|
| `port.text()` | ✅ Yes | `z.string().meta({...})` |
| `port.credential('aws')` | ✅ Yes | `AWSCredentials.meta({ bindingType: 'credential' })` |
| `metadata.inputs` array | ✅ Yes | Derived from `inputs` schema |
| `registerContract()` | ✅ Yes | Named export from `@shipsec/contracts` |
| `getContract()` | ✅ Yes | Direct import |

### Frontend Changes

The frontend currently expects `metadata.inputs` with `dataType: PortDataType`. 

During migration, the SDK provides a compatibility layer:

```typescript
// SDK normalizes both styles to the same format
function getComponentMetadata(component) {
  return {
    ...component.metadata,
    inputs: extractPorts(component.inputs),  // Always use Zod-derived
    outputs: extractPorts(component.outputs),
  };
}
```

---

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Lines of code per input | 2 (Zod + Port) | 1 (Zod with meta) |
| Type systems to maintain | 3 | 1 |
| JSON Schema generation | Custom mapping | `z.toJSONSchema()` |
| Coercion logic | Custom in ports.ts | Zod built-in |
| Contract sharing | Registry lookup | Direct imports |
| TypeScript types | Separate inference | Unified from Zod |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Frontend breaks during migration | Medium | High | Compatibility layer in SDK |
| Performance of extractPorts() | Low | Low | Cache results |
| Missing metadata during migration | Medium | Medium | Validation in tests |
| Zod v4 API changes | Low | High | Pin Zod version |

---

## Open Questions

1. **Should we keep `port.*` as convenience wrappers?**
   - Option A: Remove entirely (cleaner)
   - Option B: Keep as Zod schema factories (easier migration)

2. **How to handle parameter metadata (non-port UI config)?**
   - Currently in `metadata.parameters`
   - Could move to a separate config or keep as-is

3. **Should resolvePorts return Zod schemas or keep current format?**
   - Zod schemas are more powerful
   - Current format is simpler for basic cases

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1: Infrastructure | 1 week | New SDK helpers, tool-helpers update |
| Phase 2: Contracts package | 3 days | @shipsec/contracts with all schemas |
| Phase 3: Auto-detection | 2 days | SDK compatibility layer |
| Phase 4: Component migration | 2-4 weeks | All components updated |
| Phase 5: Deprecation | After 80% | Remove old code |

**Total: 4-6 weeks for full migration**

---

## Appendix: Example Migrations

### Simple Component: Console Log

**Before:**
```typescript
const inputSchema = z.object({
  message: z.string(),
});

const definition = {
  id: 'core.console_log',
  inputSchema,
  outputSchema: z.void(),
  metadata: {
    inputs: [
      { id: 'message', label: 'Message', dataType: port.text(), required: true },
    ],
    outputs: [],
  },
  execute: async (params) => console.log(params.message),
};
```

**After:**
```typescript
export default defineComponent({
  id: 'core.console_log',
  
  inputs: z.object({
    message: z.string().meta({ label: 'Message' }),
  }),
  
  outputs: z.void(),
  
  execute: async (params) => console.log(params.message),
});
```

### Complex Component: AbuseIPDB

**Before:**
```typescript
const inputSchema = z.object({
  apiKey: z.string(),
  ipAddress: z.string(),
  maxAgeInDays: z.number().optional().default(90),
  includeReports: z.boolean().optional().default(false),
});

const definition = {
  id: 'security.abuseipdb.check',
  inputSchema,
  outputSchema,
  metadata: {
    inputs: [
      { id: 'apiKey', label: 'API Key', dataType: port.secret(), required: true },
      { id: 'ipAddress', label: 'IP Address', dataType: port.text(), required: true },
      { id: 'maxAgeInDays', label: 'Max Age', dataType: port.number() },
      { id: 'includeReports', label: 'Include Reports', dataType: port.boolean() },
    ],
    outputs: [
      { id: 'abuseScore', label: 'Abuse Score', dataType: port.number() },
      { id: 'country', label: 'Country', dataType: port.text() },
      { id: 'reports', label: 'Reports', dataType: port.list(port.json()) },
    ],
  },
  execute,
};
```

**After:**
```typescript
export default defineComponent({
  id: 'security.abuseipdb.check',
  
  inputs: z.object({
    apiKey: z.string()
      .describe('AbuseIPDB API key')
      .meta({ label: 'API Key', bindingType: 'credential' }),
    ipAddress: z.string()
      .describe('IP address to check')
      .meta({ label: 'IP Address' }),
    maxAgeInDays: z.number()
      .default(90)
      .meta({ label: 'Max Age (Days)' }),
    includeReports: z.boolean()
      .default(false)
      .meta({ label: 'Include Reports' }),
  }),
  
  outputs: z.object({
    abuseScore: z.number().meta({ label: 'Abuse Score' }),
    country: z.string().meta({ label: 'Country' }),
    reports: z.array(z.object({
      reportedAt: z.string(),
      categories: z.array(z.number()),
      comment: z.string().optional(),
    })).meta({ label: 'Reports' }),
  }),
  
  ui: {
    agentTool: {
      enabled: true,
      toolName: 'check_ip_reputation',
      toolDescription: 'Check if an IP address has been reported as malicious',
    },
  },
  
  execute,
});
```

---

## References

- [Zod v4 Documentation](https://zod.dev/)
- [Zod v4 Metadata RFC](https://github.com/colinhacks/zod/discussions/2245)
- [JSON Schema Specification](https://json-schema.org/)
- [MCP Protocol - Tools](https://modelcontextprotocol.io/specification/2025-06-18/basic/tools)
