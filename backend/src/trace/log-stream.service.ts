import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { LogStreamRepository } from './log-stream.repository';
import type { WorkflowLogStreamRecord } from '../database/schema';
import type { AuthContext } from '../auth/types';

interface FetchLogsOptions {
  nodeRef?: string;
  stream?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  limit?: number;
  cursor?: string; // ISO timestamp for pagination
}

interface LokiEntry {
  timestamp: string;
  message: string;
  level?: string;
  nodeId?: string;
}

@Injectable()
export class LogStreamService {
  private readonly baseUrl?: string;
  private readonly tenantId?: string;
  private readonly username?: string;
  private readonly password?: string;

  constructor(private readonly repository: LogStreamRepository) {
    this.baseUrl = process.env.LOKI_URL;
    this.tenantId = process.env.LOKI_TENANT_ID;
    this.username = process.env.LOKI_USERNAME;
    this.password = process.env.LOKI_PASSWORD;
  }

  async fetch(runId: string, auth: AuthContext | null, options: FetchLogsOptions = {}) {
    if (!this.baseUrl) {
      throw new ServiceUnavailableException('Loki integration is not configured');
    }

    const organizationId = this.requireOrganizationId(auth);
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 2000) : 500;

    // Build Loki query selector
    const selectorLabels: Record<string, string> = { run_id: runId };
    if (options.nodeRef) selectorLabels.node = options.nodeRef;
    if (options.stream) selectorLabels.stream = options.stream;
    if (options.level) selectorLabels.level = options.level;

    const selector = this.buildSelector(selectorLabels);

    // Query Loki directly
    const entries = await this.queryLokiRange(selector, limit, options.cursor);

    // Transform to flat log list
    const logs = entries.map((entry, index) => ({
      id: `${runId}-${entry.timestamp}-${index}`,
      runId,
      nodeId: entry.nodeId || 'unknown',
      level: entry.level || 'info',
      message: entry.message,
      timestamp: entry.timestamp,
    }));

    return {
      runId,
      logs,
      totalCount: logs.length,
      hasMore: logs.length === limit,
      nextCursor: logs.length > 0 ? logs[logs.length - 1].timestamp : undefined,
    };
  }

  private async queryLoki(record: WorkflowLogStreamRecord, limit: number): Promise<LokiEntry[]> {
    const selector = this.buildSelector(this.normalizeLabels(record.labels));
    const start = this.toNanoseconds(record.firstTimestamp);
    const end = this.toNanoseconds(record.lastTimestamp);

    const params = new URLSearchParams({
      query: selector,
      start,
      end,
      direction: 'forward',
      limit: limit.toString(),
    });

    const response = await fetch(this.resolveUrl(`/loki/api/v1/query_range?${params.toString()}`), {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ServiceUnavailableException(
        `Loki query failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const payload = (await response.json()) as {
      data?: { result?: Array<{ values?: [string, string][] }> };
    };

    const entries: LokiEntry[] = [];
    const results = payload.data?.result ?? [];
    for (const result of results) {
      for (const [timestamp, message] of result.values ?? []) {
        entries.push({
          timestamp: this.fromNanoseconds(timestamp),
          message,
        });
      }
    }

    return entries;
  }

  private async queryLokiRange(selector: string, limit: number, cursor?: string): Promise<LokiEntry[]> {
    const params = new URLSearchParams({
      query: selector,
      direction: 'backward', // Most recent first
      limit: limit.toString(),
    });

    if (cursor) {
      // End time is the cursor (exclusive)
      params.set('end', this.toNanoseconds(new Date(cursor)));
    }

    const response = await fetch(this.resolveUrl(`/loki/api/v1/query_range?${params.toString()}`), {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ServiceUnavailableException(
        `Loki query failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const payload = (await response.json()) as {
      data?: {
        result?: Array<{
          stream?: Record<string, string>;
          values?: [string, string][];
        }>;
      };
    };

    const entries: LokiEntry[] = [];
    const results = payload.data?.result ?? [];
    for (const result of results) {
      const streamLabels = result.stream ?? {};
      for (const [timestamp, message] of result.values ?? []) {
        entries.push({
          timestamp: this.fromNanoseconds(timestamp),
          message,
          level: streamLabels.level,
          nodeId: streamLabels.node,
        });
      }
    }

    // Sort by timestamp ascending (Loki returns descending)
    entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return entries;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.tenantId) {
      headers['X-Scope-OrgID'] = this.tenantId;
    }

    if (this.username && this.password) {
      const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      headers.Authorization = `Basic ${credentials}`;
    }

    return headers;
  }

  private resolveUrl(path: string): string {
    const base = (this.baseUrl ?? '').replace(/\/+$/, '');
    return `${base}${path}`;
  }

  private buildSelector(labels: Record<string, string>): string {
    const parts = Object.entries(labels).map(([key, value]) =>
      `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    );
    return `{${parts.join(',')}}`;
  }

  private normalizeLabels(input: unknown): Record<string, string> {
    if (!input || typeof input !== 'object') {
      return {};
    }

    const entries = Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'string') as Array<[string, string]>;

    return Object.fromEntries(entries);
  }

  private toNanoseconds(date: Date): string {
    return (BigInt(date.getTime()) * 1000000n).toString();
  }

  private fromNanoseconds(value: string): string {
    let parsed: bigint;
    try {
      parsed = BigInt(value);
    } catch {
      parsed = BigInt(Date.now()) * 1000000n;
    }
    const millis = Number(parsed / 1000000n);
    return new Date(millis).toISOString();
  }

  private requireOrganizationId(auth: AuthContext | null): string {
    const organizationId = auth?.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('Organization context is required');
    }
    return organizationId;
  }
}
