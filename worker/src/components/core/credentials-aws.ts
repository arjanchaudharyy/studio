import { z } from 'zod';
import { componentRegistry, ComponentDefinition, withPortMeta } from '@shipsec/component-sdk';
import { awsCredentialSchema } from '@shipsec/contracts';

const inputSchema = z.object({
  accessKeyId: withPortMeta(z.string().min(1, 'Access key ID is required'), {
    label: 'Access Key ID',
    description: 'Resolved AWS access key ID (connect from a Secret Loader).',
    editor: 'secret',
    connectionType: { kind: 'primitive', name: 'secret' },
  }),
  secretAccessKey: withPortMeta(z.string().min(1, 'Secret access key is required'), {
    label: 'Secret Access Key',
    description: 'Resolved AWS secret access key (connect from a Secret Loader).',
    editor: 'secret',
    connectionType: { kind: 'primitive', name: 'secret' },
  }),
  sessionToken: withPortMeta(z.string().optional(), {
    label: 'Session Token',
    description: 'Optional AWS session token (for STS/assumed roles).',
    editor: 'secret',
    connectionType: { kind: 'primitive', name: 'secret' },
  }),
  region: withPortMeta(z.string().optional(), {
    label: 'Default Region',
    description: 'Optional default AWS region to associate with this credential.',
  }),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  credentials: withPortMeta(awsCredentialSchema(), {
    label: 'AWS Credentials',
    description: 'Sensitive credential bundle that can be consumed by AWS-aware components.',
  }),
});

type Output = z.infer<typeof outputSchema>;

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.credentials.aws',
  label: 'AWS Credentials Bundle',
  category: 'output',
  runner: { kind: 'inline' },
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Combine discrete AWS secrets into a structured credential payload for downstream components.',
  ui: {
    slug: 'aws-credentials',
    version: '1.0.0',
    type: 'process',
    category: 'output',
    description: 'Bundle AWS access key, secret key, and optional session token into a single credential object.',
    icon: 'KeySquare',
  },
  async execute(params, context) {
    context.logger.info('[AWSCredentials] Bundled AWS credentials');

    return {
      credentials: {
        accessKeyId: params.accessKeyId,
        secretAccessKey: params.secretAccessKey,
        sessionToken: params.sessionToken,
        region: params.region,
      },
    };
  },
};

componentRegistry.register(definition);
