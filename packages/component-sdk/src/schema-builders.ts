import { z } from 'zod';

import { withPortMeta, type PortMeta } from './port-meta';
import { withParamMeta, type ParamMeta } from './param-meta';
import type {
  InputsSchema,
  OutputsSchema,
  ParametersSchema,
  PortSchema,
  ParamSchema,
} from './types';

export function port<T extends z.ZodTypeAny>(schema: T, meta: PortMeta): PortSchema<T> {
  return withPortMeta(schema, meta) as PortSchema<T>;
}

export function param<T extends z.ZodTypeAny>(schema: T, meta: ParamMeta): ParamSchema<T> {
  return withParamMeta(schema, meta) as ParamSchema<T>;
}

/**
 * Create a branded inputs schema from a record of port schemas.
 *
 * The inferred type is automatically stored in the schema for type-safe component definitions.
 *
 * @example
 * ```ts
 * const inputSchema = inputs({
 *   text: port(z.string(), { label: 'Text' }),
 *   count: port(z.number(), { label: 'Count' }),
 * });
 * ```
 */
export function inputs<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): InputsSchema<T> {
  return z.object(shape) as unknown as InputsSchema<T>;
}

/**
 * Create a branded outputs schema from a record of port schemas.
 *
 * @example
 * ```ts
 * const outputSchema = outputs({
 *   result: port(z.string(), { label: 'Result' }),
 * });
 * ```
 */
export function outputs<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): OutputsSchema<T> {
  return z.object(shape) as unknown as OutputsSchema<T>;
}

/**
 * Create a branded parameters schema from a record of parameter schemas.
 *
 * @example
 * ```ts
 * const paramSchema = parameters({
 *   mode: param(z.enum(['upper', 'lower']), {
 *     label: 'Mode',
 *     editor: 'select',
 *   }),
 * });
 * ```
 */
export function parameters<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): ParametersSchema<T> {
  return z.object(shape) as unknown as ParametersSchema<T>;
}
