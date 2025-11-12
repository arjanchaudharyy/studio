import { beforeAll, beforeEach, describe, expect, it, vi } from 'bun:test';
import { componentRegistry, createExecutionContext, type IArtifactService } from '@shipsec/component-sdk';
import type { ComponentDefinition } from '@shipsec/component-sdk';
import type { FileWriterInput, FileWriterOutput } from '../file-writer';

const s3SendMock = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn(() => ({
      send: s3SendMock,
    })),
    PutObjectCommand: vi.fn((input) => ({ input })),
  };
});

describe('core.file.writer component', () => {
  let component: ComponentDefinition<FileWriterInput, FileWriterOutput> | undefined;

  beforeAll(async () => {
    await import('../../index');
    component = componentRegistry.get('core.file.writer');
  });

  beforeEach(() => {
    s3SendMock.mockReset();
  });

  it('registers with the expected metadata', () => {
    expect(component).toBeDefined();
    expect(component?.label).toBe('File Writer');
    expect(component?.metadata?.slug).toBe('file-writer');
  });

  it('uploads to the artifact service when local destinations are selected', async () => {
    if (!component) throw new Error('Component not registered');

    const uploadMock = vi.fn().mockResolvedValue({
      artifactId: 'artifact-1',
      fileId: 'file-1',
      name: 'output.txt',
      destinations: ['run'],
    });

    const artifacts: IArtifactService = {
      upload: uploadMock,
      download: vi.fn(),
    };

    const context = createExecutionContext({
      runId: 'run-123',
      componentRef: 'node-1',
      artifacts,
    });

    const params = component.inputSchema.parse({
      fileName: 'output.txt',
      content: 'Hello world',
      saveToRunArtifacts: true,
      publishToArtifactLibrary: false,
    });

    const result = await component.execute(params, context);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const payload = uploadMock.mock.calls[0][0];
    expect(payload.name).toBe('output.txt');
    expect(payload.destinations).toEqual(['run']);
    expect(payload.content.toString('utf-8')).toBe('Hello world');
    expect(result.artifactId).toBe('artifact-1');
    expect(result.destinations).toEqual(['run']);
    expect(result.size).toBe(11);
  });

  it('throws when no destination is selected', async () => {
    if (!component) throw new Error('Component not registered');

    const context = createExecutionContext({
      runId: 'run-456',
      componentRef: 'node-2',
    });

    const params = component.inputSchema.parse({
      fileName: 'noop.txt',
      content: 'Missing destinations',
      saveToRunArtifacts: false,
      publishToArtifactLibrary: false,
      destinationType: 'local',
    });

    await expect(component.execute(params, context)).rejects.toThrow(
      'Select at least one destination',
    );
  });

  it('uploads to S3 when configured and annotates remote metadata', async () => {
    if (!component) throw new Error('Component not registered');

    s3SendMock.mockResolvedValue({ ETag: '"abc123"' });

    const uploadMock = vi.fn().mockResolvedValue({
      artifactId: 'artifact-s3',
      fileId: 'file-s3',
      name: 'report.json',
      destinations: ['run', 'library'],
    });

    const artifacts: IArtifactService = {
      upload: uploadMock,
      download: vi.fn(),
    };

    const context = createExecutionContext({
      runId: 'run-789',
      componentRef: 'node-3',
      artifacts,
    });

    const params = component.inputSchema.parse({
      fileName: 'report.json',
      mimeType: 'application/json',
      content: { status: 'ok' },
      contentFormat: 'json',
      saveToRunArtifacts: true,
      publishToArtifactLibrary: true,
      destinationType: 's3',
      s3Bucket: 'shipsec-artifacts',
      s3AccessKeyId: 'AKIA123',
      s3SecretAccessKey: 'secret',
      s3PathPrefix: 'runs/demo',
      s3PublicUrl: 'https://cdn.example.com/artifacts',
    });

    const result = await component.execute(params, context);

    expect(s3SendMock).toHaveBeenCalledTimes(1);
    const commandInput = (s3SendMock.mock.calls[0][0] as { input: Record<string, unknown> }).input;
    expect(commandInput.Bucket).toBe('shipsec-artifacts');
    expect(commandInput.Key).toBe('runs/demo/report.json');
    expect(uploadMock).toHaveBeenCalledTimes(1);

    const metadata = uploadMock.mock.calls[0][0].metadata;
    expect(metadata?.remoteUploads).toHaveLength(1);
    expect(metadata?.remoteUploads?.[0]).toMatchObject({
      bucket: 'shipsec-artifacts',
      key: 'runs/demo/report.json',
      url: 'https://cdn.example.com/artifacts/runs/demo/report.json',
      etag: 'abc123',
    });

    expect(result.remoteUploads?.[0].uri).toBe('s3://shipsec-artifacts/runs/demo/report.json');
  });
});
