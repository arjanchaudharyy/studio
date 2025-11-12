import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { componentRegistry, ComponentDefinition, port } from '@shipsec/component-sdk';

const contentFormatSchema = z.enum(['text', 'json', 'base64']);
const destinationTypeSchema = z.enum(['local', 's3', 'gcs']);

const inputSchema = z.object({
  fileName: z
    .string()
    .min(1, 'File name is required')
    .default('output.txt')
    .describe('Name to use when persisting the generated file.'),
  content: z
    .any()
    .optional()
    .describe('Payload to store. Accepts strings, JSON objects, arrays, or base64 text.'),
  contentFormat: contentFormatSchema
    .default('text')
    .describe('Controls how the input payload is interpreted before writing.'),
  mimeType: z
    .string()
    .default('text/plain')
    .describe('MIME type for the stored file.'),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional metadata to attach to the artifact record.'),
  saveToRunArtifacts: z
    .boolean()
    .default(true)
    .describe('Store the file under the current run for quick inspection.'),
  publishToArtifactLibrary: z
    .boolean()
    .default(false)
    .describe('Publish the file to the shared Artifact Library.'),
  destinationType: destinationTypeSchema
    .default('local')
    .describe('Primary destination for the file.'),
  s3Bucket: z
    .string()
    .optional()
    .describe('Target S3 bucket when destination type is S3.'),
  s3Region: z
    .string()
    .default('us-east-1')
    .describe('AWS region for the bucket (defaults to us-east-1).'),
  s3ObjectKey: z
    .string()
    .optional()
    .describe('Exact object key to use. Overrides the path prefix + file name.'),
  s3PathPrefix: z
    .string()
    .optional()
    .describe('Prefix or folder path to prepend before the file name (e.g. reports/weekly).'),
  s3CredentialSecretId: z
    .string()
    .optional()
    .describe('Secret ID that stores JSON credentials ({ "accessKeyId": "", "secretAccessKey": "", "sessionToken": "" }).'),
  s3AccessKeyId: z
    .string()
    .optional()
    .describe('Inline AWS access key (only use for testing; prefer secrets).'),
  s3SecretAccessKey: z
    .string()
    .optional()
    .describe('Inline AWS secret key (only use for testing; prefer secrets).'),
  s3SessionToken: z.string().optional().describe('Optional AWS session token.'),
  s3Endpoint: z
    .string()
    .url()
    .optional()
    .describe('Custom S3-compatible endpoint (e.g. MinIO).'),
  s3ForcePathStyle: z
    .boolean()
    .default(false)
    .describe('Force path-style addressing for S3-compatible endpoints.'),
  s3PublicUrl: z
    .string()
    .url()
    .optional()
    .describe('Optional public URL prefix to expose (e.g. https://cdn.example.com/artifacts).'),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  artifactId: z.string().optional(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().nonnegative(),
  destinations: z.array(z.enum(['run', 'library'])).default([]),
  remoteUploads: z
    .array(
      z.object({
        type: z.literal('s3'),
        bucket: z.string(),
        key: z.string(),
        uri: z.string(),
        url: z.string().optional(),
        region: z.string().optional(),
        etag: z.string().optional(),
      }),
    )
    .optional(),
  savedToArtifactLibrary: z.boolean(),
});

type Output = z.infer<typeof outputSchema>;

type ArtifactDestination = 'run' | 'library';

interface S3UploadResult {
  type: 's3';
  bucket: string;
  key: string;
  uri: string;
  url?: string;
  region?: string;
  etag?: string;
}

function buildBufferFromContent(content: unknown, format: Input['contentFormat']): Buffer {
  if (format === 'base64') {
    if (typeof content !== 'string') {
      throw new Error('Base64 content must be provided as a string.');
    }
    return Buffer.from(content, 'base64');
  }

  if (format === 'json') {
    if (typeof content === 'string') {
      return Buffer.from(content, 'utf-8');
    }
    return Buffer.from(JSON.stringify(content ?? null, null, 2), 'utf-8');
  }

  if (typeof content === 'string') {
    return Buffer.from(content, 'utf-8');
  }

  if (content === undefined || content === null) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(content)) {
    return content;
  }

  return Buffer.from(
    typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content),
    'utf-8',
  );
}

function computeDestinations(params: Input): ArtifactDestination[] {
  const destinations: ArtifactDestination[] = [];
  if (params.saveToRunArtifacts) {
    destinations.push('run');
  }
  if (params.publishToArtifactLibrary) {
    destinations.push('library');
  }
  return destinations;
}

function buildS3ObjectKey(params: Input): string {
  if (params.s3ObjectKey && params.s3ObjectKey.trim().length > 0) {
    return params.s3ObjectKey.replace(/^\/+/, '');
  }
  const prefix = params.s3PathPrefix?.replace(/^\/+/, '').replace(/\/+$/, '');
  return prefix && prefix.length > 0 ? `${prefix}/${params.fileName}` : params.fileName;
}

async function resolveS3Credentials(params: Input, context: Parameters<ComponentDefinition<Input, Output>['execute']>[1]) {
  if (params.s3CredentialSecretId) {
    if (!context.secrets) {
      throw new Error(
        'S3 credential secret provided but secrets service is not available in this environment.',
      );
    }
    const secret = await context.secrets.get(params.s3CredentialSecretId);
    if (!secret) {
      throw new Error(`Secret ${params.s3CredentialSecretId} was not found.`);
    }
    try {
      const parsed = JSON.parse(secret.value);
      if (!parsed.accessKeyId || !parsed.secretAccessKey) {
        throw new Error('Secret is missing accessKeyId or secretAccessKey.');
      }
      return {
        accessKeyId: parsed.accessKeyId as string,
        secretAccessKey: parsed.secretAccessKey as string,
        sessionToken: parsed.sessionToken as string | undefined,
        region: (parsed.region as string | undefined) ?? params.s3Region,
      };
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Failed to parse AWS credentials secret: ${error.message}`
          : 'Secret value is not valid JSON.',
      );
    }
  }

  if (params.s3AccessKeyId && params.s3SecretAccessKey) {
    return {
      accessKeyId: params.s3AccessKeyId,
      secretAccessKey: params.s3SecretAccessKey,
      sessionToken: params.s3SessionToken,
      region: params.s3Region,
    };
  }

  throw new Error(
    'S3 credentials are required. Provide a credential secret ID or inline access/secret keys.',
  );
}

async function uploadToS3(params: Input, buffer: Buffer, context: Parameters<ComponentDefinition<Input, Output>['execute']>[1]): Promise<S3UploadResult> {
  if (!params.s3Bucket) {
    throw new Error('S3 bucket is required when destination type is S3.');
  }

  const credentials = await resolveS3Credentials(params, context);
  const key = buildS3ObjectKey(params);
  const client = new S3Client({
    region: credentials.region ?? params.s3Region,
    endpoint: params.s3Endpoint,
    forcePathStyle: params.s3ForcePathStyle,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  context.logger.info(
    `[FileWriter] Uploading to S3 bucket=${params.s3Bucket} key=${key} (${buffer.byteLength} bytes)`,
  );

  const command = new PutObjectCommand({
    Bucket: params.s3Bucket,
    Key: key,
    Body: buffer,
    ContentType: params.mimeType,
    Metadata: {
      'shipsec-run-id': context.runId,
      'shipsec-component-ref': context.componentRef,
    },
  });

  const response = await client.send(command);
  const uri = `s3://${params.s3Bucket}/${key}`;
  const publicUrl = params.s3PublicUrl
    ? `${params.s3PublicUrl.replace(/\/+$/, '')}/${key}`
    : undefined;

  return {
    type: 's3',
    bucket: params.s3Bucket,
    key,
    uri,
    url: publicUrl,
    region: credentials.region ?? params.s3Region,
    etag: typeof response.ETag === 'string' ? response.ETag.replace(/"/g, '') : undefined,
  };
}

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.file.writer',
  label: 'File Writer',
  category: 'output',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema,
  docs:
    'Persists structured or binary output to the Artifact Library and/or S3. Use it to promote scanner reports, JSON payloads, or logs into durable storage.',
  metadata: {
    slug: 'file-writer',
    version: '1.0.0',
    type: 'process',
    category: 'output',
    description: 'Write component output to run artifacts, the Artifact Library, or S3 buckets.',
    icon: 'FolderArchive',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    inputs: [
      {
        id: 'content',
        label: 'Payload',
        dataType: port.any(),
        description:
          'Payload to persist. Accepts strings, JSON data, buffers, or base64 text from upstream components.',
      },
    ],
    outputs: [
      {
        id: 'artifactId',
        label: 'Artifact ID',
        dataType: port.text(),
        description: 'Artifact identifier returned when saving locally.',
      },
    ],
    parameters: [
      {
        id: 'fileName',
        label: 'File Name',
        type: 'text',
        default: 'output.txt',
        description: 'Name for the generated artifact.',
      },
      {
        id: 'mimeType',
        label: 'MIME Type',
        type: 'text',
        default: 'text/plain',
        description: 'Content MIME type (text/plain, application/json, etc).',
      },
      {
        id: 'content',
        label: 'Content',
        type: 'textarea',
        description: 'Manual payload fallback. Connections override this value.',
      },
      {
        id: 'contentFormat',
        label: 'Content Format',
        type: 'select',
        default: 'text',
        options: [
          { label: 'Text', value: 'text' },
          { label: 'JSON', value: 'json' },
          { label: 'Base64', value: 'base64' },
        ],
        description: 'How to interpret the payload before writing.',
      },
      {
        id: 'saveToRunArtifacts',
        label: 'Save to Run Artifacts',
        type: 'boolean',
        default: true,
        description: 'Keep a copy in the current run timeline.',
      },
      {
        id: 'publishToArtifactLibrary',
        label: 'Publish to Artifact Library',
        type: 'boolean',
        default: false,
        description: 'Publish to the shared Artifact Library for reuse.',
      },
      {
        id: 'destinationType',
        label: 'Destination Type',
        type: 'select',
        default: 'local',
        options: [
          { label: 'Artifact Library only', value: 'local' },
          { label: 'AWS S3', value: 's3' },
        ],
        description: 'Choose where the file should be sent.',
      },
      {
        id: 's3Bucket',
        label: 'S3 Bucket',
        type: 'text',
        description: 'Bucket used for uploads when destination is S3.',
      },
      {
        id: 's3Region',
        label: 'S3 Region',
        type: 'text',
        default: 'us-east-1',
        description: 'AWS region for the target bucket.',
      },
      {
        id: 's3PathPrefix',
        label: 'S3 Path Prefix',
        type: 'text',
        description: 'Optional prefix/folder to prepend before the file name.',
      },
      {
        id: 's3ObjectKey',
        label: 'S3 Object Key',
        type: 'text',
        description: 'Explicit object key. Overrides the prefix + file name.',
      },
      {
        id: 's3CredentialSecretId',
        label: 'S3 Credential Secret',
        type: 'secret',
        description: 'Secret containing AWS credentials JSON.',
      },
      {
        id: 's3AccessKeyId',
        label: 'S3 Access Key ID',
        type: 'text',
        description: 'Inline AWS access key (for testing only).',
      },
      {
        id: 's3SecretAccessKey',
        label: 'S3 Secret Access Key',
        type: 'text',
        description: 'Inline AWS secret key (for testing only).',
      },
      {
        id: 's3SessionToken',
        label: 'S3 Session Token',
        type: 'text',
        description: 'Optional AWS session token.',
      },
      {
        id: 's3Endpoint',
        label: 'S3 Endpoint',
        type: 'text',
        description: 'Custom endpoint for S3-compatible storage.',
      },
      {
        id: 's3ForcePathStyle',
        label: 'Force Path Style',
        type: 'boolean',
        default: false,
        description: 'Enable for MinIO or S3-compatible endpoints that require path-style URLs.',
      },
      {
        id: 's3PublicUrl',
        label: 'Public URL Prefix',
        type: 'text',
        description: 'Optional HTTPS base URL to expose for the uploaded object.',
      },
      {
        id: 'metadata',
        label: 'Artifact Metadata',
        type: 'json',
        description: 'Custom metadata stored with the artifact record.',
      },
    ],
  },
  async execute(params, context) {
    if (params.content === undefined || params.content === null) {
      throw new Error('No content provided. Connect an upstream node or set the Content parameter.');
    }

    const buffer = buildBufferFromContent(params.content, params.contentFormat);

    if (buffer.byteLength === 0) {
      context.logger.info('[FileWriter] Payload is empty; writing zero-byte file.');
    } else {
      context.logger.info(
        `[FileWriter] Preparing to write ${buffer.byteLength} bytes as ${params.mimeType}`,
      );
    }

    const destinations = computeDestinations(params);
    const remoteUploads: S3UploadResult[] = [];

    if (params.destinationType === 's3') {
      remoteUploads.push(await uploadToS3(params, buffer, context));
    } else if (params.destinationType === 'gcs') {
      throw new Error('Google Cloud Storage destination is not implemented yet.');
    }

    if (destinations.length === 0 && remoteUploads.length === 0) {
      throw new Error('Select at least one destination (run artifacts, library, or S3).');
    }

    let artifactId: string | undefined;
    if (destinations.length > 0) {
      if (!context.artifacts) {
        throw new Error(
          'Artifact service is not available. Enable artifact storage or disable local destinations.',
        );
      }

      const metadata = {
        ...(params.metadata ?? {}),
        remoteUploads: remoteUploads.length > 0 ? remoteUploads : undefined,
      };

      const upload = await context.artifacts.upload({
        name: params.fileName,
        mimeType: params.mimeType,
        content: buffer,
        destinations,
        metadata,
      });
      artifactId = upload.artifactId;
    }

    return {
      artifactId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      size: buffer.byteLength,
      destinations,
      remoteUploads: remoteUploads.length > 0 ? remoteUploads : undefined,
      savedToArtifactLibrary: destinations.includes('library'),
    };
  },
};

componentRegistry.register(definition);

export type { Input as FileWriterInput, Output as FileWriterOutput };
