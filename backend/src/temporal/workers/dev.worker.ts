import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'minio';

import { Worker, NativeConnection } from '@temporalio/worker';

import { runWorkflowActivity } from '../activities/run-workflow.activity';
import { initializeServiceContainer } from '../service-container';
import { MinioConfig } from '../../storage/minio.config';
import { StorageService } from '../../storage/storage.service';
import { FilesService } from '../../storage/files.service';
import { FilesRepository } from '../../storage/files.repository';
import * as schema from '../../database/schema';

async function main() {
  const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? 'shipsec-default';
  const namespace = process.env.TEMPORAL_NAMESPACE ?? 'shipsec-dev';
  const workflowsPath = join(dirname(fileURLToPath(import.meta.url)), '../workflows');

  console.log(`🔌 Connecting to Temporal at ${address}...`);

  // Create connection first
  const connection = await NativeConnection.connect({
    address,
  });

  console.log(`✅ Connected to Temporal`);

  // Initialize database connection for worker
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  console.log(`✅ Connected to database`);

  // Initialize MinIO and services
  const minioConfig = new MinioConfig();
  const storageService = new StorageService(minioConfig);
  const filesRepository = new FilesRepository(db);
  const filesService = new FilesService(filesRepository, storageService);

  // Initialize service container for dependency injection into components
  initializeServiceContainer({
    filesService,
    storageService,
  });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath,
    activities: {
      runWorkflow: runWorkflowActivity,
    },
  });

  console.log(
    `🚛 Temporal worker ready (namespace=${namespace}, taskQueue=${taskQueue}, workflowsPath=${workflowsPath})`,
  );
  console.log(`📡 Polling for tasks on queue: ${taskQueue}`);

  await worker.run();
}

main().catch((error) => {
  console.error('Temporal worker failed', error);
  process.exit(1);
});
