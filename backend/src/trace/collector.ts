import { TraceEvent } from './types';

class TraceCollector {
  private readonly events = new Map<string, TraceEvent[]>();

  record(event: TraceEvent) {
    const list = this.events.get(event.runId) ?? [];
    list.push(event);
    this.events.set(event.runId, list);
  }

  list(runId: string): TraceEvent[] {
    return this.events.get(runId) ?? [];
  }

  clear(runId?: string) {
    if (runId) {
      this.events.delete(runId);
    } else {
      this.events.clear();
    }
  }
}

export const traceCollector = new TraceCollector();
