import { Global, Module } from '@nestjs/common';

import { TraceService } from './trace.service';
import { TraceRepository } from './trace.repository';
import { LogStreamRepository } from './log-stream.repository';
import { LogStreamService } from './log-stream.service';
import { DatabaseModule } from '../database/database.module';
import { LogIngestService } from '../logging/log-ingest.service';
import { EventIngestService } from '../events/event-ingest.service';

// By default, skip ingest services to avoid startup connections during OpenAPI generation
// Enable them only when ENABLE_INGEST_SERVICES is explicitly set to 'true'
const ingestServices = process.env.ENABLE_INGEST_SERVICES === 'true'
  ? [LogIngestService, EventIngestService]
  : [];

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [TraceRepository, TraceService, LogStreamRepository, LogStreamService, ...ingestServices],
  exports: [TraceService, TraceRepository, LogStreamRepository, LogStreamService],
})
export class TraceModule {}
