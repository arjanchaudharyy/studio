import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  ValidationError,
  ConfigurationError,
  fromHttpResponse,
  ComponentRetryPolicy,
  withPortMeta,
} from '@shipsec/component-sdk';

const inputSchema = z.object({
  indicator: withPortMeta(z.string().describe('The IP, Domain, File Hash, or URL to inspect.'), {
    label: 'Indicator',
  }),
  type: z.enum(['ip', 'domain', 'file', 'url']).default('ip').describe('The type of indicator.'),
  apiKey: withPortMeta(z.string().describe('Your VirusTotal API Key.'), {
    label: 'API Key',
    editor: 'secret',
    connectionType: { kind: 'primitive', name: 'secret' },
  }),
});

const outputSchema = z.object({
  malicious: withPortMeta(z.number().describe('Number of engines flagging this as malicious.'), {
    label: 'Malicious Count',
  }),
  suspicious: withPortMeta(z.number().describe('Number of engines flagging this as suspicious.'), {
    label: 'Suspicious Count',
  }),
  harmless: withPortMeta(z.number().describe('Number of engines flagging this as harmless.'), {
    label: 'Harmless Count',
  }),
  tags: withPortMeta(z.array(z.string()).optional(), {
    label: 'Tags',
    description: 'Tags returned by VirusTotal for the indicator.',
  }),
  reputation: withPortMeta(z.number().optional(), {
    label: 'Reputation',
  }),
  full_report: withPortMeta(
    z.record(z.string(), z.any()).describe('The full raw JSON response from VirusTotal.'),
    {
      label: 'Full Report',
      connectionType: { kind: 'primitive', name: 'json' },
    },
  ),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

// Retry policy for VirusTotal API - handles rate limits and transient failures
const virusTotalRetryPolicy: ComponentRetryPolicy = {
  maxAttempts: 4,
  initialIntervalSeconds: 2,
  maximumIntervalSeconds: 120,
  backoffCoefficient: 2.0,
  nonRetryableErrorTypes: [
    'AuthenticationError',
    'ValidationError',
    'ConfigurationError',
  ],
};

const definition: ComponentDefinition<Input, Output> = {
  id: 'security.virustotal.lookup',
  label: 'VirusTotal Lookup',
  category: 'security',
  runner: { kind: 'inline' },
  retryPolicy: virusTotalRetryPolicy,
  inputs: inputSchema,
  outputs: outputSchema,
  docs: 'Check the reputation of an IP, Domain, File Hash, or URL using the VirusTotal v3 API.',
  ui: {
    slug: 'virustotal-lookup',
    version: '1.0.0',
    type: 'scan', 
    category: 'security',
    description: 'Get threat intelligence reports for IOCs from VirusTotal.',
    icon: 'Shield', // We can update this if there's a better one, or generic Shield
    author: { name: 'ShipSecAI', type: 'shipsecai' },
    isLatest: true,
    deprecated: false,
    parameters: [
       {
        id: 'type',
        label: 'Indicator Type',
        type: 'select',
        default: 'ip',
        options: [
          { label: 'IP Address', value: 'ip' },
          { label: 'Domain', value: 'domain' },
          { label: 'File Hash (MD5/SHA1/SHA256)', value: 'file' },
          { label: 'URL', value: 'url' },
        ],
      },
    ],
  },
  async execute(params, context) {
    const { indicator, type, apiKey } = params;

    if (!indicator) {
      throw new ValidationError('Indicator is required', {
        fieldErrors: { indicator: ['Indicator is required'] },
      });
    }
    if (!apiKey) {
      throw new ConfigurationError('VirusTotal API Key is required', {
        configKey: 'apiKey',
      });
    }

    let endpoint = '';
    
    // API v3 Base URL
    const baseUrl = 'https://www.virustotal.com/api/v3';

    // Construct endpoint based on type
    switch (type) {
      case 'ip':
        endpoint = `${baseUrl}/ip_addresses/${indicator}`;
        break;
      case 'domain':
        endpoint = `${baseUrl}/domains/${indicator}`;
        break;
      case 'file':
        endpoint = `${baseUrl}/files/${indicator}`;
        break;
      case 'url':
        // URL endpoints usually require the URL to be base64 encoded without padding
        const b64Url = Buffer.from(indicator).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        endpoint = `${baseUrl}/urls/${b64Url}`;
        break;
    }

    context.logger.info(`[VirusTotal] Checking ${type}: ${indicator}`);

    // If type is URL, we might need to "scan" it first if it hasn't been seen, 
    // but typically "lookup" implies retrieving existing info. 
    // The GET endpoint retrieves the last analysis.

    const response = await context.http.fetch(endpoint, {
      method: 'GET',
      headers: {
        'x-apikey': apiKey,
        'Accept': 'application/json'
      }
    });

    if (response.status === 404) {
      context.logger.warn(`[VirusTotal] Indicator not found: ${indicator}`);
      // Return neutral/zero stats if not found, or maybe just the error?
      // Usually "not found" fits the schema if we return zeros.
      return {
        malicious: 0,
        suspicious: 0,
        harmless: 0,
        tags: [],
        full_report: { error: 'Not Found in VirusTotal' }
      };
    }

    if (!response.ok) {
       const text = await response.text();
       throw fromHttpResponse(response, text);
    }

    const data = await response.json() as any;
    const attrs = data.data?.attributes || {};
    const stats = attrs.last_analysis_stats || {};

    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const harmless = stats.harmless || 0;
    const tags = attrs.tags || [];
    const reputation = attrs.reputation || 0;

    context.logger.info(`[VirusTotal] Results for ${indicator}: ${malicious} malicious, ${suspicious} suspicious.`);

    return {
      malicious,
      suspicious,
      harmless,
      tags,
      reputation,
      full_report: data,
    };
  },
};

componentRegistry.register(definition);

export { definition };
