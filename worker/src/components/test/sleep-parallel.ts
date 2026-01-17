import { z } from 'zod';
import { componentRegistry, type ComponentDefinition, withPortMeta } from '@shipsec/component-sdk';

const inputSchema = z.object({
  delay: withPortMeta(z.number().int().nonnegative().describe('Artificial delay in milliseconds'), {
    label: 'Delay',
    description: 'Artificial delay in milliseconds.',
  }),
  label: withPortMeta(z.string().describe('Label used for logs/emitted output'), {
    label: 'Label',
    description: 'Label used for logs/emitted output.',
  }),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  label: withPortMeta(z.string(), {
    label: 'Label',
    description: 'Label emitted by the component.',
  }),
  startedAt: withPortMeta(z.number(), {
    label: 'Started At',
    description: 'Timestamp when the sleep started.',
  }),
  endedAt: withPortMeta(z.number(), {
    label: 'Ended At',
    description: 'Timestamp when the sleep ended.',
  }),
});

type Output = z.infer<typeof outputSchema>;

const definition: ComponentDefinition<Input, Output> = {
  id: 'test.sleep.parallel',
  label: 'Parallel Sleep (Test)',
  category: 'transform',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Deterministic wait used for testing scheduler parallelism and benchmarking.',
  ui: {
    slug: 'test-sleep-parallel',
    version: '1.0.0',
    type: 'process',
    category: 'transform',
    description: 'Utility component that sleeps for a fixed delay and records timestamps.',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
  },
  async execute(params, context) {
    const startedAt = Date.now();
    context.emitProgress({ level: 'debug', message: `Sleeping for ${params.delay}ms` });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, params.delay);
    });

    const endedAt = Date.now();
    context.emitProgress({
      level: 'debug',
      message: `Completed sleep in ${endedAt - startedAt}ms`,
    });

    return {
      label: params.label,
      startedAt,
      endedAt,
    };
  },
};

if (!componentRegistry.has(definition.id)) {
  componentRegistry.register(definition);
}

export type { Input as SleepParallelInput, Output as SleepParallelOutput };
