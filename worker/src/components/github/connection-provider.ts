import { z } from 'zod';
import {
  componentRegistry,
  port,
  type ComponentDefinition,
} from '@shipsec/component-sdk';

const inputSchema = z
  .object({
    connectionId: z
      .string()
      .trim()
      .min(1, 'Select a GitHub connection to share downstream.')
      .describe('Existing GitHub connection ID.'),
  })
  .transform((value) => ({
    connectionId: value.connectionId.trim(),
  }));

export type GitHubConnectionProviderInput = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  connectionId: z.string(),
});

export type GitHubConnectionProviderOutput = z.infer<typeof outputSchema>;

const definition: ComponentDefinition<
  GitHubConnectionProviderInput,
  GitHubConnectionProviderOutput
> = {
  id: 'github.connection.provider',
  label: 'GitHub Connection Provider',
  category: 'input',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema,
  docs: 'Expose a selected GitHub integration connection so downstream components can reuse its OAuth token.',
  metadata: {
    slug: 'github-connection-provider',
    version: '1.0.0',
    type: 'input',
    category: 'it_ops',
    description:
      'Surface a GitHub integration connection to downstream automation steps without re-entering OAuth credentials.',
    icon: 'Plug',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    isLatest: true,
    deprecated: false,
    inputs: [],
    outputs: [
      {
        id: 'connectionId',
        label: 'GitHub Connection ID',
        dataType: port.text({ coerceFrom: [] }),
        description: 'Selected GitHub connection identifier. Wire this into GitHub components.',
      },
    ],
    parameters: [
      {
        id: 'connectionId',
        label: 'GitHub Connection',
        type: 'text',
        required: true,
        description: 'Pick an existing GitHub connection to provide to downstream steps.',
        helpText:
          'Connections are created via the Connections page. Selection is stored securely and tokens stay server-side.',
      },
    ],
    examples: ['Use this before GitHub removal steps to consistently reuse the same OAuth connection.'],
  },
  async execute(params, context) {
    const trimmedConnectionId = params.connectionId.trim();

    context.logger.info(`[GitHub] Providing connection ${trimmedConnectionId} to downstream nodes.`);
    context.emitProgress(`Selected GitHub connection ${trimmedConnectionId}.`);

    return {
      connectionId: trimmedConnectionId,
    };
  },
};

componentRegistry.register(definition);
