/**
 * This file explores different approaches to type safety with Zod schemas
 * to figure out the best API for our component system.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH 1: Brand the schema, keep the Zod type visible
// ─────────────────────────────────────────────────────────────────────────────

declare const PortBrand1: unique symbol;
type PortSchema1<T extends z.ZodTypeAny> = T & { readonly [PortBrand1]: true };

function port1<T extends z.ZodTypeAny>(schema: T): PortSchema1<T> {
  return schema as PortSchema1<T>;
}

// Test: Can we infer from a branded schema?
const brandedString = port1(z.string());
const brandedNumber = port1(z.number());

// Shape with branded schemas
type BrandedShape = {
  text: PortSchema1<z.ZodString>;
  count: PortSchema1<z.ZodNumber>;
};

// Create a ZodObject from branded shape
const brandedObjectSchema = z.object({
  text: port1(z.string()),
  count: port1(z.number()),
}) as z.ZodObject<BrandedShape>;

type BrandedInferred = z.infer<typeof brandedObjectSchema>;
// Result: { text: unknown; count: unknown; } ❌

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH 2: Extract the inner Zod type from branded schema
// ─────────────────────────────────────────────────────────────────────────────

declare const PortBrand2: unique symbol;
type PortSchema2<T extends z.ZodTypeAny> = T & { readonly [PortBrand2]: true };

type ExtractZodType<T> = T extends PortSchema2<infer U> ? U : T;

type ExtractedShape<T> = {
  [K in keyof T]: ExtractZodType<T[K]>;
};

type BrandedShape2 = {
  text: PortSchema2<z.ZodString>;
  count: PortSchema2<z.ZodNumber>;
};

type Extracted = ExtractedShape<BrandedShape2>;
// Result: { text: ZodString; count: ZodNumber; } ✅

const extractedObjectSchema = z.object({
  text: z.string(),
  count: z.number(),
}) as z.ZodObject<Extracted>;

type ExtractedInferred = z.infer<typeof extractedObjectSchema>;
// Result: { text: string; count: number; } ✅

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH 3: Don't use branded types in the shape, just for the schema object
// ─────────────────────────────────────────────────────────────────────────────

declare const InputsBrand: unique symbol;
type InputsSchema<T extends z.ZodTypeAny> = T & { readonly [InputsBrand]: true };

function inputs3<T extends z.ZodObject<any>>(schema: T): InputsSchema<T> {
  return schema as InputsSchema<T>;
}

const inputsSchema3 = inputs3(
  z.object({
    text: z.string(),
    count: z.number(),
  })
);

type InputsInferred3 = z.infer<typeof inputsSchema3>;
// Result: { text: string; count: number; } ✅

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH 4: Helper that stores both shape and inferred type
// ─────────────────────────────────────────────────────────────────────────────

declare const PortBrand4: unique symbol;
type PortSchema4<T extends z.ZodTypeAny> = T & { readonly [PortBrand4]: true };

declare const InputsBrand4: unique symbol;
type InputsSchema4<Shape extends Record<string, PortSchema4<any>>, Inferred> =
  z.ZodObject<Shape> & { readonly [InputsBrand4]: true; _inferred: Inferred };

function inputs4<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): InputsSchema4<T, z.infer<z.ZodObject<T>>> {
  return z.object(shape) as InputsSchema4<T, z.infer<z.ZodObject<T>>>;
}

const inputs4Schema = inputs4({
  text: z.string(),
  count: z.number(),
});

type Inputs4Inferred = Inputs4Schema4<typeof inputs4Schema, any>['_inferred'];
// This doesn't work well because we can't access the schema's type parameter easily

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH 5 (PROMISING): Use two type parameters - one for shape, one for inferred
// ─────────────────────────────────────────────────────────────────────────────

declare const InputsBrand5: unique symbol;

type InputsSchema5<
  Shape extends Record<string, any> = Record<string, any>,
  Inferred = z.infer<z.ZodObject<Shape>>
> = z.ZodObject<Shape> & {
  readonly [InputsBrand5]: true;
  readonly __inferred: Inferred;
};

function inputs5<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): InputsSchema5<T, z.infer<z.ZodObject<T>>> {
  return z.object(shape) as InputsSchema5<T, z.infer<z.ZodObject<T>>>;
}

const inputs5Schema = inputs5({
  text: z.string(),
  count: z.number(),
});

type Inputs5Inferred = typeof inputs5Schema['__inferred'];
// Result: { text: string; count: number; } ✅✅✅

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH 6: Simple - just rely on Zod's inference, brand doesn't interfere
// ─────────────────────────────────────────────────────────────────────────────

// The key insight: z.infer<z.ZodObject<T>> works correctly as long as T is a record
// of Zod types. The branding on individual types doesn't matter if we extract properly.

// Let's test this with our actual use case:

declare const PortBrand6: unique symbol;
type PortSchema6<T extends z.ZodTypeAny> = T & { readonly [PortBrand6]: true };

declare const InputsBrand6: unique symbol;
type InputsSchema6<Shape extends Record<string, any>> =
  z.ZodObject<Shape> & { readonly [InputsBrand6]: true };

function inputs6<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): InputsSchema6<T> {
  return z.object(shape) as InputsSchema6<T>;
}

// The test case:
const testInputs = inputs6({
  text: z.string(),
  count: z.number(),
});

type TestShape = typeof testInputs extends z.ZodObject<infer S> ? S : never;
// Result: { text: ZodString; count: ZodNumber; } ❌ We lose the branded info

// But if we access T directly from the function return type...
type ExtractFromInputs6<T> = T extends InputsSchema6<infer S> ? S : never;
type TestExtracted = ExtractFromInputs6<typeof testInputs>;
// Result: { text: ZodString; count: ZodNumber; } ❌ Still not branded

// The issue: TypeScript normalizes z.string() to ZodString, losing the brand

// ─────────────────────────────────────────────────────────────────────────────
// CONCLUSION & RECOMMENDATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The core problem: When we call `z.object({ text: z.string() })`, TypeScript
 * sees the shape as `{ text: ZodString }`, not `{ text: PortSchema<ZodString> }`.
 * The branding on the return value of `port()` doesn't propagate into the
 * object literal type.
 *
 * SOLUTION: Store the inferred type explicitly in a branded property.
 *
 * This approach:
 * 1. Marks the schema as branded (for type narrowing)
 * 2. Stores the inferred type in a well-known property
 * 3. Works with Zod's natural inference
 * 4. Provides full type safety in execute functions
 */

// Final recommended implementation:

declare const InputsBrandFinal: unique symbol;
declare const OutputsBrandFinal: unique symbol;
declare const ParametersBrandFinal: unique symbol;

type InputsSchemaFinal<
  T extends Record<string, any> = Record<string, any>
> = z.ZodObject<T> & {
  readonly [InputsBrandFinal]: true;
  readonly __inputs: z.infer<z.ZodObject<T>>;
};

type OutputsSchemaFinal<
  T extends Record<string, any> = Record<string, any>
> = z.ZodObject<T> & {
  readonly [OutputsBrandFinal]: true;
  readonly __outputs: z.infer<z.ZodObject<T>>;
};

type ParametersSchemaFinal<
  T extends Record<string, any> = Record<string, any>
> = z.ZodObject<T> & {
  readonly [ParametersBrandFinal]: true;
  readonly __params: z.infer<z.ZodObject<T>>;
};

// Helper to extract inferred type
type InferInputs<T> = T extends { readonly __inputs: infer I } ? I : never;
type InferOutputs<T> = T extends { readonly __outputs: infer O } ? O : never;
type InferParams<T> = T extends { readonly __params: infer P } ? P : never;

function inputsFinal<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): InputsSchemaFinal<T> {
  return z.object(shape) as InputsSchemaFinal<T>;
}

function outputsFinal<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): OutputsSchemaFinal<T> {
  return z.object(shape) as OutputsSchemaFinal<T>;
}

function parametersFinal<T extends Record<string, z.ZodTypeAny>>(
  shape: T
): ParametersSchemaFinal<T> {
  return z.object(shape) as ParametersSchemaFinal<T>;
}

// Test the final approach:
const finalInputs = inputsFinal({
  text: z.string(),
  count: z.number(),
});

type FinalInputsTest = InferInputs<typeof finalInputs>;
// Result: { text: string; count: number; } ✅✅✅

export {
  InputsSchemaFinal,
  OutputsSchemaFinal,
  ParametersSchemaFinal,
  InferInputs,
  InferOutputs,
  InferParams,
  inputsFinal,
  outputsFinal,
  parametersFinal,
};
