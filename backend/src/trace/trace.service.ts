import { Injectable } from '@nestjs/common';

import { traceCollector } from './collector';
import { TraceEvent } from './types';

@Injectable()
export class TraceService {
  list(runId: string): TraceEvent[] {
    return traceCollector.list(runId);
  }
}
