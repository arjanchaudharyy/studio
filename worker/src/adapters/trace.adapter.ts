import { ITraceService, TraceEvent } from '@shipsec/component-sdk';

/**
 * Simple in-memory trace adapter
 * In production, this would write to a database or event stream
 */
export class TraceAdapter implements ITraceService {
  private events: TraceEvent[] = [];

  record(event: TraceEvent): void {
    this.events.push(event);
    console.log(`[TRACE] ${event.type} - ${event.nodeRef}:`, event.message || '');
  }

  getEvents(runId: string): TraceEvent[] {
    return this.events.filter((e) => e.runId === runId);
  }

  clear(): void {
    this.events = [];
  }
}

