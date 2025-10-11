import { z } from 'zod';
import { componentRegistry, ComponentDefinition } from '@shipsec/component-sdk';

const inputSchema = z.object({
  url: z.string().url(),
  payload: z.record(z.string(), z.unknown()),
  headers: z.record(z.string(), z.string()).optional(),
  method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  timeoutMs: z.number().int().positive().default(30000),
  retries: z.number().int().min(0).max(5).default(3),
});

type Input = z.infer<typeof inputSchema>;

type Output = {
  status: 'sent' | 'failed';
  statusCode?: number;
  statusText?: string;
  responseBody?: string;
  error?: string;
  attempts: number;
};

const outputSchema = z.object({
  status: z.enum(['sent', 'failed']),
  statusCode: z.number().optional(),
  statusText: z.string().optional(),
  responseBody: z.string().optional(),
  error: z.string().optional(),
  attempts: z.number(),
});

/**
 * Sleep for exponential backoff
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make HTTP request with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.webhook.post',
  label: 'Webhook',
  category: 'output',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema,
  docs: 'Sends payload to an external webhook via HTTP POST/PUT/PATCH with retry logic and auth support.',
  async execute(params, context) {
    const {
      url,
      payload,
      headers = {},
      method = 'POST',
      timeoutMs = 30000,
      retries = 3,
    } = params;
    
    context.logger.info(`[Webhook] Sending ${method} to ${url}`);
    context.emitProgress(`Preparing ${method} request`);
    
    // Build request options
    const requestOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    };
    
    let lastError: Error | null = null;
    let attempt = 0;
    
    // Retry loop with exponential backoff
    for (attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        context.emitProgress(`Attempt ${attempt}/${retries + 1}`);
        
        const response = await fetchWithTimeout(url, requestOptions, timeoutMs);
        
        // Read response body
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch (e) {
          // Ignore body read errors
        }
        
        context.logger.info(`[Webhook] Response: ${response.status} ${response.statusText}`);
        
        // Check if response is successful (2xx)
        if (response.ok) {
          context.emitProgress('Webhook sent successfully');
          return {
            status: 'sent',
            statusCode: response.status,
            statusText: response.statusText,
            responseBody: responseBody.substring(0, 1000), // Limit body size
            attempts: attempt,
          };
        }
        
        // Non-2xx response - treat as error for retry
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        context.logger.error(`[Webhook] ${lastError.message}`);
        
        // If it's a 4xx error (client error), don't retry
        if (response.status >= 400 && response.status < 500) {
          context.logger.error('[Webhook] Client error - not retrying');
          return {
            status: 'failed',
            statusCode: response.status,
            statusText: response.statusText,
            responseBody: responseBody.substring(0, 1000),
            error: lastError.message,
            attempts: attempt,
          };
        }
        
      } catch (error: any) {
        lastError = error;
        const errorMsg = error.name === 'AbortError' ? 'Request timeout' : error.message;
        context.logger.error(`[Webhook] Attempt ${attempt} failed: ${errorMsg}`);
        
        // If it's a timeout or network error, we might want to retry
        if (attempt < retries + 1) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          context.emitProgress(`Retrying in ${backoffMs}ms...`);
          await sleep(backoffMs);
        }
      }
    }
    
    // All retries exhausted
    context.logger.error(`[Webhook] Failed after ${attempt - 1} attempts`);
    context.emitProgress('Webhook failed');
    
    return {
      status: 'failed',
      error: lastError?.message || 'Unknown error',
      attempts: attempt - 1,
    };
  },
};

componentRegistry.register(definition);

