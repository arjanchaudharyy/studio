/**
 * Test the recommended approach: Store inferred type explicitly
 */
import { z } from 'zod';

// Declare brands
declare const InputsBrand: unique symbol;
declare const OutputsBrand: unique symbol;
declare const ParametersBrand: unique symbol;

// Create branded types with explicit inferred type storage
type InputsSchema<Shape extends Record<string, any>, Inferred> =
  z.ZodObject<Shape> & {
    readonly [InputsBrand]: true;
    readonly __inferred: Inferred;
  };

type OutputsSchema<Shape extends Record<string, any>, Inferred> =
  z.ZodObject<Shape> & {
    readonly [OutputsBrand]: true;
    readonly __inferred: Inferred;
  };
type ParametersSchema<Shape extends Record<string, any>, Inferred> =
  z.ZodObject<Shape> & {
    readonly [ParametersBrand]: true;
    readonly __inferred: Inferred;
  };

// Schema builders
function inputs<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): InputsSchema<T, z.infer<z.ZodObject<T>>> {
  return z.object(shape) as InputsSchema<T, z.infer<z.ZodObject<T>>>;
}

function outputs<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): OutputsSchema<T, z.infer<z.ZodObject<T>>> {
  return z.object(shape) as OutputsSchema<T, z.infer<z.ZodObject<T>>>;
}

function parameters<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): ParametersSchema<T, z.infer<z.ZodObject<T>>> {
  return z.object(shape) as ParametersSchema<T, z.infer<z.ZodObject<T>>>;
}

// Type extractors
type InferInputs<T> = T extends { __inferred: infer I } ? I : never;
type InferOutputs<T> = T extends { __inferred: infer O } ? O : never;
type InferParams<T> = T extends { __inferred: infer P } ? P : never;

// ─────────────────────────────────────────────────────────────────────────────
// TEST: Does this give us the type safety we need?
// ─────────────────────────────────────────────────────────────────────────────

const inputSchema = inputs({
  text: z.string(),
  count: z.number(),
});

const outputSchema = outputs({
  result: z.string(),
});

const paramSchema = parameters({
  mode: z.enum(['upper', 'lower']),
});

// Extract inferred types
type InputType = InferInputs<typeof inputSchema>;
// Should be: { text: string; count: number; }

type OutputType = InferOutputs<typeof outputSchema>;
// Should be: { result: string; }

type ParamType = InferParams<typeof paramSchema>;
// Should be: { mode: 'upper' | 'lower'; }

// Test that we can use these in a function signature
function testExecute(
  payload: {
    inputs: InputType;
    params: ParamType;
  }
): OutputType {
  // This should work:
  const result: string = payload.inputs.text;
  const count: number = payload.inputs.count;
  const mode: 'upper' | 'lower' = payload.params.mode;

  return {
    result: payload.inputs.text + ' ' + payload.params.mode,
  };
}

// Test at runtime
const inputsValue = inputSchema.parse({ text: 'hello', count: 5 });
const paramsValue = paramSchema.parse({ mode: 'upper' as const });

console.log('Inputs:', inputsValue);
console.log('Params:', paramsValue);

const output = testExecute({ inputs: inputsValue, params: paramsValue });
console.log('Output:', output);

// Verify the output shape
const validatedOutput = outputSchema.parse(output);
console.log('Validated output:', validatedOutput);

export {
  inputs,
  outputs,
  parameters,
  InferInputs,
  InferOutputs,
  InferParams,
  type InputsSchema,
  type OutputsSchema,
  type ParametersSchema,
};
