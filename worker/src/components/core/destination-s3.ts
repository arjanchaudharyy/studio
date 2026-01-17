import { z } from 'zod';
import { componentRegistry, ComponentDefinition, withPortMeta } from '@shipsec/component-sdk';
import { awsCredentialSchema, destinationWriterSchema } from '@shipsec/contracts';
import { type DestinationConfig } from '@shipsec/shared';

const inputSchema = z.object({
  bucket: z.string().min(1, 'Bucket is required'),
  region: z.string().optional(),
  pathPrefix: z.string().optional(),
  objectKey: z.string().optional(),
  endpoint: z.string().optional(),
  forcePathStyle: z.boolean().default(false),
  publicUrl: z.string().optional(),
  credentials: withPortMeta(
    awsCredentialSchema(),
    {
      label: 'AWS Credentials',
      description: 'Connect the AWS Credentials bundle component.',
    },
  ),
  label: z.string().optional(),
  description: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  destination: withPortMeta(destinationWriterSchema(), {
    label: 'Destination',
    description: 'Connect to writer components to upload artifacts to S3.',
  }),
});

type Output = z.infer<typeof outputSchema>;

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.destination.s3',
  label: 'S3 Destination',
  category: 'output',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Produces a destination configuration that uploads files to an S3 bucket (or compatible storage).',
  ui: {
    slug: 'destination-s3',
    version: '1.0.0',
    type: 'process',
    category: 'output',
    description: 'Configure uploads to S3 buckets for downstream writer components.',
    icon: 'CloudUpload',
    parameters: [
      { id: 'bucket', label: 'Bucket', type: 'text', required: true },
      { id: 'region', label: 'Region', type: 'text' },
      { id: 'pathPrefix', label: 'Path prefix', type: 'text' },
      { id: 'objectKey', label: 'Explicit object key', type: 'text' },
      { id: 'endpoint', label: 'Custom endpoint', type: 'text' },
      { id: 'forcePathStyle', label: 'Force path style', type: 'boolean', default: false },
      { id: 'publicUrl', label: 'Public URL prefix', type: 'text' },
      { id: 'label', label: 'Label override', type: 'text' },
      { id: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  async execute(params, context): Promise<Output> {
    context.logger.info(`[S3Destination] Configured for bucket: ${params.bucket}`);

    const destination: DestinationConfig = {
      adapterId: 's3',
      config: {
        bucket: params.bucket,
        region: params.region,
        pathPrefix: params.pathPrefix,
        objectKey: params.objectKey,
        endpoint: params.endpoint,
        forcePathStyle: params.forcePathStyle,
        publicUrl: params.publicUrl,
        credentials: params.credentials,
      },
      metadata: {
        label: params.label,
        description: params.description,
      },
    };

    return { destination };
  },
};

componentRegistry.register(definition);
