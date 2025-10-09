import { z } from 'zod';

import { componentRegistry } from '../registry';
import { ComponentDefinition } from '../types';
import { FilesService } from '../../storage/files.service';

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
  docs: 'Loads file content from MinIO storage. Requires a fileId from previously uploaded file.',
  async execute(params, context) {
    context.logger.info(`[FileLoader] Loading file with ID: ${params.fileId}`);

    // Get FilesService instance (injected via DI in activity context)
    const filesService = context.services?.filesService as FilesService | undefined;

    if (!filesService) {
      throw new Error(
        'FilesService not available in component context. Ensure StorageModule is imported.',
      );
    }

    context.emitProgress('Fetching file from storage...');

    // Download file from MinIO
    const { buffer, file } = await filesService.downloadFile(params.fileId);

    context.logger.info(
      `[FileLoader] Loaded file: ${file.fileName} (${file.size} bytes, ${file.mimeType})`,
    );

    context.emitProgress(`File loaded: ${file.fileName}`);

    // Convert to base64 for downstream components
    const content = buffer.toString('base64');

    return {
      fileId: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.size,
      content,
    };
  },
};

componentRegistry.register(definition);
