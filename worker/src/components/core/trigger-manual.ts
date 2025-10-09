import { z } from 'zod';
import { componentRegistry, ComponentDefinition } from '@shipsec/component-sdk';

const inputSchema = z.object({
  payload: z.record(z.string(), z.unknown()).default({}),
});

type Input = z.infer<typeof inputSchema>;

type Output = {
  payload: Record<string, unknown>;
};

const outputSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.trigger.manual',
  label: 'Manual Trigger',
  category: 'trigger',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema,
  docs: 'Acts as the workflow entrypoint; currently passes through configured payload.',
  async execute(params) {
    return { payload: params.payload };
  },
};

componentRegistry.register(definition);


