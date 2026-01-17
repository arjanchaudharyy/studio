import { z } from 'zod';
import { componentRegistry, type ComponentDefinition, withPortMeta } from '@shipsec/component-sdk';

const inputSchema = z.object({
  label: withPortMeta(
    z
      .string()
      .min(1)
      .max(120)
      .default('Live Event Heartbeat')
      .describe('Label injected into every progress event.'),
    {
      label: 'Label',
      description: 'Human friendly label that prefixes every message.',
    },
  ),
  durationSeconds: withPortMeta(
    z
      .number()
      .int()
      .min(5)
      .max(1800)
      .default(300)
      .describe('Total runtime in seconds. Defaults to 5 minutes (300 seconds).'),
    {
      label: 'Duration (seconds)',
      description: 'Total runtime (defaults to 300 seconds).',
    },
  ),
  intervalSeconds: withPortMeta(
    z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(5)
      .describe('Spacing between individual heartbeat events.'),
    {
      label: 'Interval (seconds)',
      description: 'Spacing between heartbeats (defaults to 5 seconds).',
    },
  ),
  annotations: withPortMeta(
    z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Optional JSON payload echoed back with every event.'),
    {
      label: 'Annotations',
      description: 'Optional JSON payload that is mirrored in progress events.',
      connectionType: { kind: 'primitive', name: 'json' },
    },
  ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  summary: withPortMeta(
    z.object({
      label: z.string(),
      totalEvents: z.number().int().nonnegative(),
      durationSeconds: z.number().nonnegative(),
      startedAt: z.string(),
      endedAt: z.string(),
    }),
    {
      label: 'Run Summary',
      description: 'Timestamps and counters describing the heartbeat run.',
      connectionType: { kind: 'primitive', name: 'json' },
    },
  ),
});

type Output = z.infer<typeof outputSchema>;

const definition: ComponentDefinition<Input, Output> = {
  id: 'test.live.event.heartbeat',
  label: 'Live Event Heartbeat (Test)',
  category: 'transform',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Emits rich NODE_PROGRESS events for the entire duration (default 5 minutes) before succeeding.',
  ui: {
    slug: 'test-live-event-heartbeat',
    version: '1.0.0',
    type: 'process',
    category: 'transform',
    description: 'Diagnostic component that continuously emits progress events to exercise live trace streaming.',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
  },
  async execute(params, context) {
    const { logger } = context;
    const intervalMs = params.intervalSeconds * 1000;
    const targetDurationMs = params.durationSeconds * 1000;
    const iterations = Math.max(1, Math.ceil(targetDurationMs / intervalMs));
    const startedAt = new Date();
    logger?.info(
      'Starting heartbeat run',
      JSON.stringify({
        label: params.label,
        iterations,
        intervalSeconds: params.intervalSeconds,
        durationSeconds: params.durationSeconds,
      }),
    );

    for (let index = 0; index < iterations; index += 1) {
      const timestamp = new Date();
      const elapsedMs = timestamp.getTime() - startedAt.getTime();
      const remainingMs = Math.max(0, targetDurationMs - elapsedMs);
      const eventNumber = index + 1;
      const message = `[${timestamp.toISOString()}] ${params.label} heartbeat ${eventNumber}/${iterations}`;
      logger?.info(
        'Heartbeat event',
        JSON.stringify({
          eventNumber,
          totalEvents: iterations,
          elapsedSeconds: Number((elapsedMs / 1000).toFixed(2)),
          remainingSeconds: Number((remainingMs / 1000).toFixed(2)),
        }),
      );

      context.emitProgress({
        level: 'info',
        message,
        data: {
          timestamp: timestamp.toISOString(),
          eventNumber,
          totalEvents: iterations,
          elapsedSeconds: Number((elapsedMs / 1000).toFixed(2)),
          remainingSeconds: Number((remainingMs / 1000).toFixed(2)),
          annotations: params.annotations ?? null,
        },
      });

      if (index < iterations - 1) {
        const idealElapsedMs = eventNumber * intervalMs;
        const remainingBudgetMs = Math.max(0, targetDurationMs - idealElapsedMs);
        const nextDelay = Math.min(intervalMs, remainingBudgetMs);
        await delay(nextDelay > 0 ? nextDelay : intervalMs);
      }
    }

    const endedAt = new Date();
    logger?.info(
      'Heartbeat run completed',
      JSON.stringify({
        durationSeconds: Number(((endedAt.getTime() - startedAt.getTime()) / 1000).toFixed(2)),
        totalEvents: iterations,
        endedAt: endedAt.toISOString(),
      }),
    );
    return {
      summary: {
        label: params.label,
        totalEvents: iterations,
        durationSeconds: Number(((endedAt.getTime() - startedAt.getTime()) / 1000).toFixed(2)),
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
      },
    };
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!componentRegistry.has(definition.id)) {
  componentRegistry.register(definition);
}

export type { Input as LiveEventHeartbeatInput, Output as LiveEventHeartbeatOutput };
