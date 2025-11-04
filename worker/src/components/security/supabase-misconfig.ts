import { z } from 'zod';
import { Client as PgClient } from 'pg';
import { componentRegistry, ComponentDefinition, port } from '@shipsec/component-sdk';

type Severity = 'high' | 'medium' | 'low' | 'info';
type CheckStatus = 'pass' | 'fail' | 'error';

const severityWeights: Record<Severity, number> = {
  high: 10,
  medium: 5,
  low: 2,
  info: 0,
};

const inputSchema = z
  .object({
    supabaseUrl: z
      .string()
      .trim()
      .transform((value) => {
        const refOnly = /^[a-z0-9]{20}$/i.test(value);
        return refOnly ? `https://${value}.supabase.co` : value;
      })
      .refine((value) => {
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && /\.supabase\.co$/i.test(url.hostname);
        } catch {
          return false;
        }
      }, {
        message:
          'Provide a Supabase URL like https://<project-ref>.supabase.co or a 20-character project ref.',
      }),
    databaseUrl: z.string().min(10).optional(),
    serviceRoleKey: z
      .preprocess((v) => (typeof v === 'string' && v.trim().length > 0 ? v : undefined),
        z.string().min(12, 'Service role key must be at least 12 characters.').optional(),
      ),
    projectRef: z
      .string()
      .regex(/^[a-z0-9]{20}$/i, 'Project ref must be a 20 character base36 string')
      .optional(),
    outputFormat: z.enum(['json', 'csv']).default('json'),
    includeEnvScan: z.boolean().default(false),
    includeEdgeFunctions: z.boolean().default(false),
    envFiles: z
      .array(
        z.object({
          fileName: z.string(),
          content: z.string(),
        }),
      )
      .default([]),
  })
  .transform((params) => {
    const inferredProjectRef = params.projectRef ?? extractProjectRef(params.supabaseUrl);
    return {
      ...params,
      projectRef: inferredProjectRef,
    };
  });

const severitySchema = z.enum(['high', 'medium', 'low', 'info']);
const statusSchema = z.enum(['pass', 'fail', 'error']);

const outputSchema = z.object({
  summary: z.object({
    score: z.number().min(0),
    checksTotal: z.number().int(),
    checksFailed: z.number().int(),
    checksPassed: z.number().int(),
  }),
  findings: z.array(
    z.object({
      id: z.string(),
      severity: severitySchema,
      message: z.string(),
      remediation: z.string(),
      references: z.array(z.string()).optional(),
    }),
  ),
  checks: z.array(
    z.object({
      id: z.string(),
      severity: severitySchema,
      status: statusSchema,
      message: z.string(),
      remediation: z.string().optional(),
      evidence: z.unknown().optional(),
    }),
  ),
  metadata: z.object({
    projectRef: z.string().nullable(),
    supabaseUrl: z.string(),
    ranAt: z.string(),
  }),
  rawReport: z.string(),
  errors: z.array(z.string()).optional(),
});

type Input = z.input<typeof inputSchema>;
export type SupabaseMisconfigInput = z.infer<typeof inputSchema>;
export type SupabaseMisconfigOutput = z.infer<typeof outputSchema>;

type CheckResult = {
  id: string;
  severity: Severity;
  status: CheckStatus;
  message: string;
  remediation?: string;
  evidence?: unknown;
};

type CheckDefinition = {
  id: string;
  severity: Severity;
  remediation: string;
  references?: string[];
  shouldRun?: (ctx: CheckContext) => boolean;
  run: (ctx: CheckContext) => Promise<Omit<CheckResult, 'id' | 'severity'>>;
};

type CheckContext = {
  pg: PgClient | null;
  supabaseUrl: string;
  serviceRoleKey?: string;
  projectRef: string | null;
  fetchJson: <T>(path: string) => Promise<T>;
  envFiles: Array<{ fileName: string; content: string }>;
  includeEnvScan: boolean;
  includeEdgeFunctions: boolean;
};

type ProgressUpdate = {
  level: 'info' | 'warn' | 'error';
  message: string;
};

const definition: ComponentDefinition<SupabaseMisconfigInput, SupabaseMisconfigOutput> = {
  id: 'shipsec.supabase.misconfig',
  label: 'Supabase Misconfiguration Scan',
  category: 'security',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema,
  docs: 'Scans a Supabase project for configuration risks using service role credentials.',
  metadata: {
    slug: 'supabase-misconfig',
    version: '1.0.0',
    type: 'scan',
    category: 'security',
    description:
      'Audits Supabase Auth, Database, Storage, and Edge Functions configuration for common misconfigurations.',
    documentation:
      'Requires Supabase service role credentials. Performs SQL queries and admin API calls to highlight potential risks.',
    documentationUrl: 'https://supabase.com/docs',
    icon: 'ShieldAlert',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    isLatest: true,
    deprecated: false,
    example:
      'Provide Supabase service role credentials to generate a configuration risk report for production projects.',
    inputs: [
      {
        id: 'supabaseUrl',
        label: 'Supabase URL',
        dataType: port.text(),
        required: true,
        description:
          'Project URL in the form https://<project-ref>.supabase.co (e.g., https://abcdefghijklmno12345.supabase.co).',
      },
      {
        id: 'databaseUrl',
        label: 'Database URL',
        dataType: port.secret(),
        required: false,
        description: 'Optional Postgres connection string (URI). If provided, used for DB checks instead of inferring from project ref.',
      },
      {
        id: 'serviceRoleKey',
        label: 'Service Role Key',
        dataType: port.secret(),
        required: false,
        description: 'Optional Supabase service role key (enables additional API checks).',
      },
      {
        id: 'projectRef',
        label: 'Project Reference',
        dataType: port.text(),
        required: false,
        description:
          'Optional Supabase project reference. Automatically inferred from the URL when omitted.',
      },
      {
        id: 'outputFormat',
        label: 'Output Format',
        dataType: port.text(),
        required: false,
        description: 'Report encoding (`json` or `csv`). Defaults to JSON.',
      },
      {
        id: 'includeEnvScan',
        label: 'Scan Environment Files',
        dataType: port.boolean(),
        required: false,
        description: 'When true, inspect provided env files for leaked Supabase credentials.',
      },
      {
        id: 'includeEdgeFunctions',
        label: 'Inspect Edge Functions',
        dataType: port.boolean(),
        required: false,
        description: 'Toggle scanning of deployed Edge Functions metadata.',
      },
      {
        id: 'envFiles',
        label: 'Environment Files',
        dataType: port.list(port.json()),
        required: false,
        description:
          'Optional list of environment/config files to inspect for exposed Supabase keys.',
      },
    ],
    outputs: [
      {
        id: 'summary',
        label: 'Summary',
        dataType: port.json(),
        description: 'Aggregate score, passed, and failed check counts.',
      },
      {
        id: 'findings',
        label: 'Findings',
        dataType: port.list(port.json()),
        description: 'All failed checks with severity and remediation guidance.',
      },
      {
        id: 'rawReport',
        label: 'Raw Report',
        dataType: port.text(),
        description: 'Raw JSON or CSV representation of the checks.',
      },
    ],
    examples: [
      'Run nightly Supabase security posture audits with automated remediation tasks.',
      'Validate production projects prior to go-live against ShipSec security baselines.',
    ],
    parameters: [],
  },
  async execute(params, context) {
    const input = inputSchema.parse(params);
    const progress = createProgressEmitter(context.emitProgress.bind(context));

    progress('info', 'Initialising Supabase misconfiguration scan');

    const pgClient = await createDatabaseClient(input, progress);
    const fetchJson = createSupabaseFetcher(input.supabaseUrl, input.serviceRoleKey);

    const checkContext: CheckContext = {
      pg: pgClient,
      supabaseUrl: input.supabaseUrl,
      serviceRoleKey: input.serviceRoleKey,
      projectRef: input.projectRef ?? null,
      fetchJson,
      envFiles: input.envFiles,
      includeEnvScan: input.includeEnvScan,
      includeEdgeFunctions: input.includeEdgeFunctions,
    };

    const checks = buildChecks();

    const results: CheckResult[] = [];
    for (const check of checks) {
      if (check.shouldRun && !check.shouldRun(checkContext)) {
        continue;
      }

      progress('info', `Running ${check.id}`);
      try {
        const result = await check.run(checkContext);
        results.push({
          id: check.id,
          severity: check.severity,
          status: result.status,
          message: result.message,
          remediation: result.remediation ?? check.remediation,
          evidence: result.evidence,
        });
      } catch (error) {
        results.push({
          id: check.id,
          severity: check.severity,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          remediation: check.remediation,
        });
      }
    }

    const summary = computeSummary(results);
    const findings = results
      .filter((check) => check.status === 'fail')
      .map((check) => ({
        id: check.id,
        severity: check.severity,
        message: check.message,
        remediation: check.remediation ?? '',
      }));

    const errors = results
      .filter((check) => check.status === 'error')
      .map((check) => `${check.id}: ${check.message}`);

    const rawReport =
      input.outputFormat === 'csv'
        ? toCsv(results)
        : JSON.stringify(
            {
              summary,
              checks: results,
            },
            null,
            2,
          );

    progress('info', 'Supabase misconfiguration scan complete');

    await pgClient?.end().catch(() => {
      // Ignore errors on disconnect
    });

    return outputSchema.parse({
      summary,
      findings,
      checks: results,
      metadata: {
        projectRef: input.projectRef ?? null,
        supabaseUrl: input.supabaseUrl,
        ranAt: new Date().toISOString(),
      },
      rawReport,
      errors: errors.length > 0 ? errors : undefined,
    });
  },
};

componentRegistry.register(definition);

function extractProjectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function createProgressEmitter(emit: (event: ProgressUpdate) => void) {
  return (level: 'info' | 'warn' | 'error', message: string) => {
    emit({
      level,
      message,
    });
  };
}

async function createDatabaseClient(input: SupabaseMisconfigInput, emit: ReturnType<typeof createProgressEmitter>) {
  // Prefer explicit database URL when provided
  if (input.databaseUrl && input.databaseUrl.trim().length > 0) {
    const client = new PgClient({
      connectionString: input.databaseUrl,
      ssl: { rejectUnauthorized: false },
      statement_timeout: 10_000,
    });
    try {
      await client.connect();
      emit('info', 'Connected to Supabase Postgres (via Database URL)');
      return client;
    } catch (error) {
      emit('error', `Failed to connect using Database URL: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    }
  }

  if (!input.projectRef) {
    emit('warn', 'Project reference could not be inferred; database checks will be skipped.');
    return null;
  }

  const client = new PgClient({
    host: `db.${input.projectRef}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: input.serviceRoleKey,
    database: 'postgres',
    ssl: {
      rejectUnauthorized: false,
    },
    statement_timeout: 10_000,
  });

  try {
    await client.connect();
    emit('info', 'Connected to Supabase Postgres instance');
    return client;
  } catch (error) {
    emit(
      'error',
      `Failed to establish Postgres connection: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
    return null;
  }
}

function createSupabaseFetcher(baseUrl: string, serviceRoleKey?: string) {
  return async <T>(path: string): Promise<T> => {
    const targetUrl = new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    const headers: Record<string, string> = {};
    if (serviceRoleKey && serviceRoleKey.trim().length > 0) {
      headers.apikey = serviceRoleKey;
      headers.Authorization = `Bearer ${serviceRoleKey}`;
    }
    const response = await fetch(targetUrl, { headers });

    if (!response.ok) {
      throw new Error(`Request to ${targetUrl.pathname} failed (${response.status})`);
    }

    return (await response.json()) as T;
  };
}

function buildChecks(): CheckDefinition[] {
  return [
    {
      id: 'DB_RLS_PUBLIC_TABLE',
      severity: 'high',
      remediation: "Enable RLS: ALTER TABLE <table> ENABLE ROW LEVEL SECURITY; add policies afterwards.",
      run: async ({ pg }) => {
        if (!pg) {
          return {
            status: 'error',
            message: 'Postgres connection unavailable; skipping table RLS inspection.',
          };
        }

        const result = await pg.query<{
          schema: string;
          table: string;
        }>(
          `
            SELECT nspname AS schema, relname AS table
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE relkind = 'r'
              AND nspname = 'public'
              AND relrowsecurity = false;
          `,
        );

        if (result.rows.length === 0) {
          return {
            status: 'pass',
            message: 'All public schema tables enforce row level security.',
          };
        }

        return {
          status: 'fail',
          message: `Tables without RLS: ${result.rows
            .map((row) => `${row.schema}.${row.table}`)
            .join(', ')}`,
          evidence: result.rows,
        };
      },
    },
    {
      id: 'DB_NO_POLICY',
      severity: 'high',
      remediation:
        'Create RLS policies with CREATE POLICY after enabling RLS to enforce access controls.',
      run: async ({ pg }) => {
        if (!pg) {
          return {
            status: 'error',
            message: 'Postgres connection unavailable; skipping policy inspection.',
          };
        }

        const result = await pg.query<{
          schema: string;
          table: string;
        }>(
          `
            SELECT n.nspname AS schema, c.relname AS table
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'r'
              AND n.nspname = 'public'
              AND relrowsecurity = true
              AND NOT EXISTS (
                SELECT 1
                FROM pg_policies p
                WHERE p.schemaname = n.nspname
                  AND p.tablename = c.relname
              );
          `,
        );

        if (result.rows.length === 0) {
          return {
            status: 'pass',
            message: 'All RLS-enabled tables include policies.',
          };
        }

        return {
          status: 'fail',
          message: `Tables missing RLS policies: ${result.rows
            .map((row) => `${row.schema}.${row.table}`)
            .join(', ')}`,
          evidence: result.rows,
        };
      },
    },
    {
      id: 'DB_SUPERUSER_ROLE_EXISTS',
      severity: 'high',
      remediation: 'Drop unnecessary superuser roles or revoke the SUPERUSER privilege.',
      run: async ({ pg }) => {
        if (!pg) {
          return {
            status: 'error',
            message: 'Postgres connection unavailable; skipping role inspection.',
          };
        }

        const allowed = new Set(['postgres', 'supabase_admin', 'supabase_storage_admin']);

        const result = await pg.query<{
          rolname: string;
        }>(
          `
            SELECT rolname
            FROM pg_roles
            WHERE rolsuper = true
          `,
        );

        const unexpected = result.rows
          .map((row) => row.rolname)
          .filter((role) => !allowed.has(role));

        if (unexpected.length === 0) {
          return {
            status: 'pass',
            message: 'No unexpected superuser roles detected.',
          };
        }

        return {
          status: 'fail',
          message: `Unexpected superuser roles: ${unexpected.join(', ')}`,
          evidence: unexpected,
        };
      },
    },
    {
      id: 'DB_FUNCTION_PUBLIC',
      severity: 'medium',
      remediation:
        'Revoke EXECUTE from public on sensitive functions or restrict schemas accessible to public.',
      run: async ({ pg }) => {
        if (!pg) {
          return {
            status: 'error',
            message: 'Postgres connection unavailable; skipping function ACL inspection.',
          };
        }

        const result = await pg.query<{
          schema: string;
          function: string;
        }>(
          `
            SELECT n.nspname AS schema, p.proname AS function
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE has_function_privilege('public', p.oid, 'EXECUTE')
              AND n.nspname = 'public';
          `,
        );

        if (result.rows.length === 0) {
          return {
            status: 'pass',
            message: 'No public EXECUTE privileges detected on public schema functions.',
          };
        }

        return {
          status: 'fail',
          message: `Functions executable by public: ${result.rows
            .map((row) => `${row.schema}.${row.function}`)
            .join(', ')}`,
          evidence: result.rows,
        };
      },
    },
    {
      id: 'DB_LOGGING_DISABLED',
      severity: 'medium',
      remediation: 'Enable query logging: ALTER SYSTEM SET log_statement = \'ddl\';',
      run: async ({ pg }) => {
        if (!pg) {
          return {
            status: 'error',
            message: 'Postgres connection unavailable; skipping logging inspection.',
          };
        }

        const result = await pg.query<{ setting: string }>('SHOW log_statement;');
        const value = result.rows[0]?.setting ?? 'none';

        if (value.toLowerCase() === 'none') {
          return {
            status: 'fail',
            message: 'Database statement logging disabled.',
            evidence: value,
          };
        }

        return {
          status: 'pass',
          message: `Database logging enabled (${value}).`,
        };
      },
    },
    {
      id: 'DB_SSL_DISABLED',
      severity: 'high',
      remediation: 'Ensure SSL is enforced: ALTER SYSTEM SET ssl = on;',
      run: async ({ pg }) => {
        if (!pg) {
          return {
            status: 'error',
            message: 'Postgres connection unavailable; skipping SSL inspection.',
          };
        }

        const result = await pg.query<{ setting: string }>('SHOW ssl;');
        const value = (result.rows[0]?.setting ?? '').toLowerCase();

        if (value !== 'on') {
          return {
            status: 'fail',
            message: `Database SSL is not enforced (value=${value || 'unknown'}).`,
            evidence: value,
          };
        }

        return {
          status: 'pass',
          message: 'Database SSL enforced.',
        };
      },
    },
    {
      id: 'DB_EXTENSIONS_RISKY',
      severity: 'medium',
      remediation: 'Review installed extensions and drop any unnecessary risky extensions.',
      run: async ({ pg }) => {
        if (!pg) {
          return {
            status: 'error',
            message: 'Postgres connection unavailable; skipping extension inspection.',
          };
        }

        const risky = new Set(['dblink', 'file_fdw', 'postgres_fdw', 'plpythonu']);

        const result = await pg.query<{ extname: string }>('SELECT extname FROM pg_extension;');
        const riskyExtensions = result.rows
          .map((row) => row.extname)
          .filter((ext) => risky.has(ext));

        if (riskyExtensions.length === 0) {
          return {
            status: 'pass',
            message: 'No risky extensions detected.',
          };
        }

        return {
          status: 'fail',
          message: `Risky extensions enabled: ${riskyExtensions.join(', ')}`,
          evidence: riskyExtensions,
        };
      },
    },
    {
      id: 'AUTH_EMAIL_CONFIRM_DISABLED',
      severity: 'medium',
      remediation: 'Disable auto-confirm: set AUTO_CONFIRM_EMAIL=false within Auth settings.',
      run: async ({ fetchJson }) => {
        const settings = await fetchJson<Record<string, unknown>>('auth/v1/settings');

        const autoConfirm =
          getBoolean(settings, ['AUTO_CONFIRM_EMAIL']) ??
          getBoolean(settings, ['email', 'auto_confirm']) ??
          false;

        if (autoConfirm) {
          return {
            status: 'fail',
            message: 'Email confirmations are disabled; users can sign in without verification.',
          };
        }

        return {
          status: 'pass',
          message: 'Email confirmation required for new users.',
        };
      },
    },
    {
      id: 'AUTH_MFA_DISABLED',
      severity: 'medium',
      remediation: 'Enable MFA enforcement under Auth security settings.',
      run: async ({ fetchJson }) => {
        const settings = await fetchJson<Record<string, unknown>>('auth/v1/settings');
        const mfaEnforced =
          getBoolean(settings, ['MFA', 'ENABLED']) ??
          getBoolean(settings, ['mfa', 'enforced']) ??
          false;

        if (!mfaEnforced) {
          return {
            status: 'fail',
            message: 'Multi-factor authentication is not enforced.',
          };
        }

        return {
          status: 'pass',
          message: 'Multi-factor authentication enforced.',
        };
      },
    },
    {
      id: 'AUTH_PASSWORD_POLICY_WEAK',
      severity: 'medium',
      remediation: 'Increase password minimum length to at least 8 characters.',
      run: async ({ fetchJson }) => {
        const settings = await fetchJson<Record<string, unknown>>('auth/v1/settings');
        const minLength =
          getNumber(settings, ['PASSWORD_MIN_LENGTH']) ??
          getNumber(settings, ['password', 'min_length']) ??
          0;

        if (Number.isNaN(minLength) || minLength < 8) {
          return {
            status: 'fail',
            message: `Password minimum length is ${
              Number.isNaN(minLength) ? 'unknown' : minLength
            }, below recommended threshold.`,
            evidence: minLength,
          };
        }

        return {
          status: 'pass',
          message: `Password minimum length is ${minLength}.`,
        };
      },
    },
    {
      id: 'AUTH_ALLOW_SIGNUPS_TRUE',
      severity: 'low',
      remediation: 'Disable anonymous signups when project is in production.',
      run: async ({ fetchJson }) => {
        const settings = await fetchJson<Record<string, unknown>>('auth/v1/settings');
        const allowSignups =
          getBoolean(settings, ['ALLOW_SIGNUPS']) ??
          getBoolean(settings, ['email', 'enable_signup']) ??
          true;

        if (allowSignups) {
          return {
            status: 'fail',
            message: 'Auth signups are open without restriction.',
          };
        }

        return {
          status: 'pass',
          message: 'New user signups restricted.',
        };
      },
    },
    {
      id: 'AUTH_TOKEN_EXPIRY_LONG',
      severity: 'medium',
      remediation: 'Reduce JWT expiry to 3600 seconds (1 hour) or less for production workloads.',
      run: async ({ fetchJson }) => {
        const settings = await fetchJson<Record<string, unknown>>('auth/v1/settings');
        const jwtExpiry =
          getNumber(settings, ['JWT_EXPIRY']) ??
          getNumber(settings, ['jwt', 'exp']) ??
          getNumber(settings, ['token', 'expiry']) ??
          0;

        if (jwtExpiry > 3600) {
          return {
            status: 'fail',
            message: `JWT expiry set to ${jwtExpiry} seconds.`,
            evidence: jwtExpiry,
          };
        }

        return {
          status: 'pass',
          message: `JWT expiry set to ${jwtExpiry || 3600} seconds.`,
        };
      },
    },
    {
      id: 'STORAGE_PUBLIC_BUCKET',
      severity: 'high',
      remediation: 'Set public buckets to private or gate access via signed URLs.',
      run: async ({ fetchJson }) => {
        const buckets = await fetchJson<Array<{ name: string; public: boolean }>>(
          'storage/v1/bucket',
        );

        const publicBuckets = buckets.filter((bucket) => bucket.public).map((bucket) => bucket.name);

        if (publicBuckets.length === 0) {
          return {
            status: 'pass',
            message: 'No storage buckets are public by default.',
          };
        }

        return {
          status: 'fail',
          message: `Public buckets detected: ${publicBuckets.join(', ')}`,
          evidence: publicBuckets,
        };
      },
    },
    {
      id: 'STORAGE_SIGNED_URLS_DISABLED',
      severity: 'medium',
      remediation: 'Enforce signed URL access policies for public assets.',
      run: async ({ fetchJson }) => {
        const policies = await fetchJson<
          Array<{ name: string; definition: string; bucket_id: string }>
        >('storage/v1/policies');

        const overlyPermissive = policies.filter((policy) =>
          /public|anon|role\s*=\s*public/i.test(policy.definition),
        );

        if (overlyPermissive.length === 0) {
          return {
            status: 'pass',
            message: 'Storage policies restrict anonymous access.',
          };
        }

        return {
          status: 'fail',
          message: `Overly broad storage policies detected: ${overlyPermissive
            .map((policy) => policy.name)
            .join(', ')}`,
          evidence: overlyPermissive,
        };
      },
    },
    {
      id: 'ENV_SERVICE_ROLE_EXPOSED',
      severity: 'high',
      remediation: 'Remove service role key from environment files; keep it server-side only.',
      shouldRun: ({ includeEnvScan }) => includeEnvScan,
      run: async ({ envFiles }) => {
        const leaks = envFiles
          .map((file) => ({
            file: file.fileName,
            value: findEnvValue(file.content, ['SUPABASE_SERVICE_ROLE_KEY']),
          }))
          .filter((entry) => entry.value);

        if (leaks.length === 0) {
          return {
            status: 'pass',
            message: 'Service role key not present in provided env files.',
          };
        }

        return {
          status: 'fail',
          message: `Service role key exposed in: ${leaks.map((leak) => leak.file).join(', ')}`,
          evidence: leaks,
        };
      },
    },
    {
      id: 'ENV_ANON_KEY_EXPOSED_OK',
      severity: 'info',
      remediation: 'Anon keys may appear in client environments; ensure least privilege policies.',
      shouldRun: ({ includeEnvScan }) => includeEnvScan,
      run: async ({ envFiles }) => {
        const exposures = envFiles
          .map((file) => ({
            file: file.fileName,
            value: findEnvValue(file.content, ['SUPABASE_ANON_KEY']),
          }))
          .filter((entry) => entry.value);

        if (exposures.length === 0) {
          return {
            status: 'pass',
            message: 'Anon key not detected in provided env files.',
          };
        }

        return {
          status: 'pass',
          message: `Anon key present in ${exposures.map((exposure) => exposure.file).join(', ')}.`,
          evidence: exposures,
        };
      },
    },
    {
      id: 'EDGE_FUNCTION_PUBLIC',
      severity: 'medium',
      remediation: 'Restrict publicly exposed Edge Functions or add authentication guards.',
      shouldRun: ({ includeEdgeFunctions }) => includeEdgeFunctions,
      run: async ({ fetchJson }) => {
        const response = await fetchJson<
          Array<{ name: string; verify_jwt?: boolean | null; invocation_url?: string }>
        >('functions/v1/list');

        const publicFunctions = response.filter((fn) => fn.verify_jwt === false);

        if (publicFunctions.length === 0) {
          return {
            status: 'pass',
            message: 'No publicly accessible Edge Functions detected.',
          };
        }

        return {
          status: 'fail',
          message: `Edge Functions without JWT verification: ${publicFunctions
            .map((fn) => fn.name)
            .join(', ')}`,
          evidence: publicFunctions,
        };
      },
    },
  ];
}

function computeSummary(results: CheckResult[]) {
  const total = results.length;
  const failed = results.filter((check) => check.status === 'fail').length;
  const passed = results.filter((check) => check.status === 'pass').length;

  const scorePenalty = results.reduce((acc, check) => {
    if (check.status !== 'fail') return acc;
    return acc + severityWeights[check.severity];
  }, 0);

  return {
    score: Math.max(0, 100 - scorePenalty),
    checksTotal: total,
    checksFailed: failed,
    checksPassed: passed,
  };
}

function toCsv(results: CheckResult[]): string {
  const header = ['id', 'severity', 'status', 'message'];
  const rows = results.map((check) =>
    [check.id, check.severity, check.status, check.message]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(','),
  );

  return [header.join(','), ...rows].join('\n');
}

function getBoolean(source: Record<string, unknown>, path: string[]): boolean | null {
  const value = getPathValue(source, path);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
}

function getNumber(source: Record<string, unknown>, path: string[]): number | null {
  const value = getPathValue(source, path);
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function getPathValue(source: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = source;

  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

function findEnvValue(content: string, keys: string[]): string | null {
  for (const key of keys) {
    const match = content.match(new RegExp(`${key}\\s*=\\s*([^\\n\\r]+)`, 'i'));
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

export { definition as supabaseMisconfigComponent };
