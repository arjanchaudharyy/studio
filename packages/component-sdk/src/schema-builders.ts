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

export function inputs<T extends Record<string, PortSchema>>(shape: T): InputsSchema<z.infer<z.ZodObject<T>>> {
  return z.object(shape) as unknown as InputsSchema<z.infer<z.ZodObject<T>>>;
}

export function outputs<T extends Record<string, PortSchema>>(shape: T): OutputsSchema<z.infer<z.ZodObject<T>>> {
  return z.object(shape) as unknown as OutputsSchema<z.infer<z.ZodObject<T>>>;
}

export function parameters<T extends Record<string, ParamSchema>>(shape: T): ParametersSchema<z.infer<z.ZodObject<T>>> {
  return z.object(shape) as unknown as ParametersSchema<z.infer<z.ZodObject<T>>>;
}
