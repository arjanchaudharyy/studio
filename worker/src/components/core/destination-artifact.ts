import { z } from 'zod';
import { componentRegistry, ComponentDefinition, withPortMeta } from '@shipsec/component-sdk';
import { destinationWriterSchema } from '@shipsec/contracts';
import { type DestinationConfig } from '@shipsec/shared';

const inputSchema = z.object({
  saveToRunArtifacts: z.boolean().default(true),
  publishToArtifactLibrary: z.boolean().default(false),
  label: z.string().max(120).optional(),
  description: z.string().max(240).optional(),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  destination: withPortMeta(destinationWriterSchema(), {
    label: 'Destination',
    description: 'Connect this to writer components to store outputs in the artifact store.',
  }),
});

type Output = z.infer<typeof outputSchema>;

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.destination.artifact',
  label: 'Artifact Destination',
  category: 'output',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Produces a destination configuration that saves files to the run timeline and/or the shared Artifact Library.',
  ui: {
    slug: 'destination-artifact',
    version: '1.0.0',
    type: 'process',
    category: 'output',
    description: 'Configure the built-in artifact destination for writers.',
    icon: 'HardDriveDownload',
    parameters: [
      {
        id: 'saveToRunArtifacts',
        label: 'Save to run timeline',
        type: 'boolean',
        default: true,
      },
      {
        id: 'publishToArtifactLibrary',
        label: 'Publish to Artifact Library',
        type: 'boolean',
        default: false,
      },
      {
        id: 'label',
        label: 'Label override',
        type: 'text',
      },
      {
        id: 'description',
        label: 'Description',
        type: 'textarea',
      },
    ],
  },
  async execute(params, context): Promise<Output> {
    const destinations: Array<'run' | 'library'> = [];
    if (params.saveToRunArtifacts) {
      destinations.push('run');
    }
    if (params.publishToArtifactLibrary) {
      destinations.push('library');
    }
    if (destinations.length === 0) {
      destinations.push('run');
    }

    context.logger.info(`[ArtifactDestination] Configured destinations: ${destinations.join(', ')}`);

    const destination: DestinationConfig = {
      adapterId: 'artifact',
      config: { destinations },
      metadata: {
        label: params.label,
        description: params.description,
      },
    };

    return { destination };
  },
};

componentRegistry.register(definition);
