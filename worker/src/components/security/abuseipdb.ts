import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  port,
  ValidationError,
  ConfigurationError,
  fromHttpResponse,
  ComponentRetryPolicy,
} from '@shipsec/component-sdk';

const inputSchema = z.object({
  ipAddress: z.string().describe('The IPv4 or IPv6 address you want to check.'),
  maxAgeInDays: z.number().default(90).describe('Max age in days for reports to be included (default: 90).'),
  verbose: z.boolean().default(false).describe('Include verbose information.'),
  apiKey: z.string().describe('Your AbuseIPDB API Key.'),
});

const outputSchema = z.object({
  ipAddress: z.string().describe('The IP address that was checked.'),
  isPublic: z.boolean().optional(),
  ipVersion: z.number().optional(),
  isWhitelisted: z.boolean().optional(),
  abuseConfidenceScore: z.number().describe('The confidence score (0-100).'),
  countryCode: z.string().optional(),
  usageType: z.string().optional(),
  isp: z.string().optional(),
  domain: z.string().optional(),
  hostnames: z.array(z.string()).optional(),
  totalReports: z.number().optional(),
  numDistinctUsers: z.number().optional(),
  lastReportedAt: z.string().optional(),
  reports: z.array(z.record(z.string(), z.any())).optional(),
  full_report: z.record(z.string(), z.any()).describe('The full raw JSON response.'),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const abuseIPDBRetryPolicy: ComponentRetryPolicy = {
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

// Port definitions shared between metadata and resolvePorts
const inputPorts = [
  { id: 'ipAddress', label: 'IP Address', dataType: port.text(), required: true },
  { id: 'apiKey', label: 'API Key', dataType: port.secret(), required: true },
  { id: 'maxAgeInDays', label: 'Max Age (Days)', dataType: port.number(), required: false },
  { id: 'verbose', label: 'Verbose', dataType: port.boolean(), required: false },
];

const outputPorts = [
  { id: 'abuseConfidenceScore', label: 'Confidence Score', dataType: port.number() },
  { id: 'isWhitelisted', label: 'Whitelisted', dataType: port.boolean() },
  { id: 'countryCode', label: 'Country', dataType: port.text() },
  { id: 'isp', label: 'ISP', dataType: port.text() },
  { id: 'totalReports', label: 'Total Reports', dataType: port.number() },
  { id: 'full_report', label: 'Full Report', dataType: port.json() },
];

const definition: ComponentDefinition<Input, Output> = {
  id: 'security.abuseipdb.check',
  label: 'AbuseIPDB Check',
  category: 'security',
  runner: { kind: 'inline' },
  retryPolicy: abuseIPDBRetryPolicy,
  inputSchema,
  outputSchema,
  docs: 'Check the reputation of an IP address using the AbuseIPDB API.',
  metadata: {
    slug: 'abuseipdb-check',
    version: '1.0.0',
    type: 'scan',
    category: 'security',
    description: 'Get threat intelligence reports for an IP from AbuseIPDB.',
    icon: 'Shield',
    author: { name: 'ShipSecAI', type: 'shipsecai' },
    isLatest: true,
    deprecated: false,
    inputs: inputPorts,
    outputs: outputPorts,
    parameters: [
      { id: 'maxAgeInDays', label: 'Max Age (Days)', type: 'number', default: 90 },
      { id: 'verbose', label: 'Verbose Output', type: 'boolean', default: false },
    ],
  },
  resolvePorts() {
    return { inputs: inputPorts, outputs: outputPorts };
  },
  async execute(params, context) {
    const { ipAddress, apiKey, maxAgeInDays, verbose } = params;

    if (!ipAddress) {
      throw new ValidationError('IP Address is required', {
        fieldErrors: { ipAddress: ['IP Address is required'] },
      });
    }
    if (!apiKey) {
      throw new ConfigurationError('AbuseIPDB API Key is required', {
        configKey: 'apiKey',
      });
    }

    const endpoint = 'https://api.abuseipdb.com/api/v2/check';
    const queryParams = new URLSearchParams({
      ipAddress,
      maxAgeInDays: String(maxAgeInDays),
    });
    if (verbose) {
      queryParams.append('verbose', 'true');
    }

    const url = `${endpoint}?${queryParams.toString()}`;

    context.logger.info(`[AbuseIPDB] Checking IP: ${ipAddress}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Key': apiKey,
        'Accept': 'application/json'
      }
    });

    if (response.status === 404) {
      context.logger.warn(`[AbuseIPDB] IP not found: ${ipAddress}`);
       return {
        ipAddress,
        abuseConfidenceScore: 0,
        full_report: { error: 'Not Found' }
      };
    }

    if (!response.ok) {
       const text = await response.text();
       throw fromHttpResponse(response, text);
    }

    const data = await response.json() as Record<string, unknown>;
    const info = (data.data || {}) as Record<string, unknown>;

    context.logger.info(`[AbuseIPDB] Score for ${ipAddress}: ${info.abuseConfidenceScore}`);

    return {
      ipAddress: info.ipAddress as string,
      isPublic: info.isPublic as boolean | undefined,
      ipVersion: info.ipVersion as number | undefined,
      isWhitelisted: info.isWhitelisted as boolean | undefined,
      abuseConfidenceScore: info.abuseConfidenceScore as number,
      countryCode: info.countryCode as string | undefined,
      usageType: info.usageType as string | undefined,
      isp: info.isp as string | undefined,
      domain: info.domain as string | undefined,
      hostnames: info.hostnames as string[] | undefined,
      totalReports: info.totalReports as number | undefined,
      numDistinctUsers: info.numDistinctUsers as number | undefined,
      lastReportedAt: info.lastReportedAt as string | undefined,
      reports: info.reports as Record<string, unknown>[] | undefined,
      full_report: data,
    };
  },
};

componentRegistry.register(definition);

export { definition };
