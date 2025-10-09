import { z } from 'zod';
import { componentRegistry, ComponentDefinition } from '@shipsec/component-sdk';

const inputSchema = z.object({
  fileId: z.string().uuid().describe('File ID from uploaded files'),
});

type Input = z.infer<typeof inputSchema>;

type Output = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content: string; // base64 encoded for downstream components
};

const outputSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  content: z.string(),
});

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.file.loader',
  label: 'File Loader',
  category: 'input',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema,
  docs: 'Loads file content from storage. Requires a fileId from previously uploaded file.',
  async execute(params, context) {
    context.logger.info(`[FileLoader] Loading file with ID: ${params.fileId}`);

    // Use storage interface (not concrete implementation!)
    const storage = context.storage;
    
    if (!storage) {
      throw new Error(
        'Storage service not available in execution context. Worker must provide IFileStorageService adapter.',
      );
    }

    context.emitProgress('Fetching file from storage...');

    // Download file using interface
    const { buffer, metadata } = await storage.downloadFile(params.fileId);

    context.logger.info(
      `[FileLoader] Loaded file: ${metadata.fileName} (${metadata.size} bytes, ${metadata.mimeType})`,
    );

    context.emitProgress(`File loaded: ${metadata.fileName}`);

    // Convert to base64 for downstream components
    const content = buffer.toString('base64');

    return {
      fileId: metadata.id,
      fileName: metadata.fileName,
      mimeType: metadata.mimeType,
      size: metadata.size,
      content,
    };
  },
};

componentRegistry.register(definition);


