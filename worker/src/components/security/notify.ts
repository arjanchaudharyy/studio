import { z } from 'zod';
import { componentRegistry, ComponentDefinition, runComponentWithRunner } from '@shipsec/component-sdk';

const inputSchema = z.object({
  messages: z
    .array(z.string().min(1, 'Message cannot be empty'))
    .min(1, 'Provide at least one message to send')
    .describe('Messages to deliver through ProjectDiscovery notify. Each message is treated as a separate line.'),
  providerConfig: z
    .string()
    .min(1, 'Provider configuration is required')
    .describe('YAML provider configuration content used by notify to reach third-party services.'),
  notifyConfig: z
    .string()
    .trim()
    .min(1, 'Notify configuration cannot be empty')
    .optional()
    .describe('Optional notify CLI configuration file (YAML) providing defaults such as delay or rate limit.'),
  providerIds: z
    .array(z.string().min(1, 'Provider id cannot be empty'))
    .optional()
    .describe('Restrict delivery to specific providers defined in the provider configuration.'),
  recipientIds: z
    .array(z.string().min(1, 'Recipient id cannot be empty'))
    .optional()
    .describe('Restrict delivery to specific recipient identifiers defined under the providers configuration.'),
  messageFormat: z
    .string()
    .trim()
    .min(1, 'Message format cannot be empty')
    .optional()
    .describe('Custom notify message template (e.g. "Finding: {{data}}").'),
  bulk: z
    .boolean()
    .optional()
    .default(true)
    .describe('Send all messages as a single bulk payload.'),
  silent: z
    .boolean()
    .optional()
    .default(true)
    .describe('Enable notify silent mode to suppress CLI output.'),
  verbose: z
    .boolean()
    .optional()
    .default(false)
    .describe('Enable verbose logging from notify.'),
  charLimit: z
    .number()
    .int()
    .positive()
    .max(20000)
    .optional()
    .describe('Maximum character count per message.'),
  delaySeconds: z
    .number()
    .int()
    .min(0)
    .max(3600)
    .optional()
    .describe('Delay in seconds between each notification batch.'),
  rateLimit: z
    .number()
    .int()
    .min(1)
    .max(120)
    .optional()
    .describe('Maximum number of HTTP requests notify should emit per second.'),
  proxy: z
    .string()
    .trim()
    .min(1, 'Proxy URL cannot be empty')
    .optional()
    .describe('HTTP or SOCKSv5 proxy URL for outbound notify requests.'),
});

const outputSchema = z.object({
  rawOutput: z.string(),
  messageCount: z.number(),
  providers: z.array(z.string()),
  recipientIds: z.array(z.string()),
  options: z.object({
    bulk: z.boolean(),
    silent: z.boolean(),
    verbose: z.boolean(),
    charLimit: z.number().nullable(),
    delaySeconds: z.number().nullable(),
    rateLimit: z.number().nullable(),
    messageFormat: z.string().nullable(),
    proxy: z.string().nullable(),
  }),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const dockerTimeoutSeconds = (() => {
  const raw = process.env.NOTIFY_TIMEOUT_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return 120;
  }
  return parsed;
})();

const definition: ComponentDefinition<Input, Output> = {
  id: 'shipsec.notify.dispatch',
  label: 'ProjectDiscovery Notify',
  category: 'output',
  runner: {
    kind: 'docker',
    image: 'projectdiscovery/notify:latest',
    entrypoint: 'sh',
    network: 'bridge',
    timeoutSeconds: dockerTimeoutSeconds,
    env: {
      HOME: '/root',
    },
    command: [
      '-c',
      String.raw`set -euo pipefail

INPUT=$(cat)

escape_json() {
  printf '%s' "$1" | sed -e ':a' -e 'N' -e '$!ba' -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\n/\\n/g'
}

extract_string() {
  key="$1"
  printf "%s" "$INPUT" | tr -d '\n' | sed -n "s/.*\"$key\":[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n1
}

extract_number() {
  key="$1"
  printf "%s" "$INPUT" | tr -d '\n' | sed -n "s/.*\"$key\":[[:space:]]*\\([-0-9][0-9]*\\).*/\\1/p" | head -n1
}

extract_bool() {
  key="$1"
  default="$2"
  value=$(printf "%s" "$INPUT" | tr -d '\n' | sed -n "s/.*\"$key\":[[:space:]]*\\(true\\|false\\).*/\\1/p" | head -n1)
  if [ -z "$value" ]; then
    printf "%s" "$default"
  else
    printf "%s" "$value"
  fi
}

MESSAGE_BASE64=$(extract_string "messageBase64")
PROVIDER_CONFIG_BASE64=$(extract_string "providerConfigBase64")
NOTIFY_CONFIG_BASE64=$(extract_string "notifyConfigBase64")
PROVIDER_IDS_CSV=$(extract_string "providerIdsCsv")
RECIPIENT_IDS_CSV=$(extract_string "recipientIdsCsv")
MESSAGE_FORMAT_BASE64=$(extract_string "messageFormatBase64")
PROXY_VALUE=$(extract_string "proxy")
MESSAGE_COUNT_RAW=$(extract_number "messageCount")
CHAR_LIMIT_VALUE=$(extract_number "charLimit")
DELAY_VALUE=$(extract_number "delaySeconds")
RATE_LIMIT_VALUE=$(extract_number "rateLimit")
BULK_VALUE=$(extract_bool "bulk" "true")
SILENT_VALUE=$(extract_bool "silent" "true")
VERBOSE_VALUE=$(extract_bool "verbose" "false")

if [ -z "$PROVIDER_CONFIG_BASE64" ]; then
  echo "Provider configuration payload is required" >&2
  exit 1
fi

CONFIG_DIR="\${HOME:-/root}/.config/notify"
mkdir -p "$CONFIG_DIR"
umask 077

printf "%s" "$PROVIDER_CONFIG_BASE64" | base64 -d > "$CONFIG_DIR/provider-config.yaml"

if [ -n "$NOTIFY_CONFIG_BASE64" ]; then
  printf "%s" "$NOTIFY_CONFIG_BASE64" | base64 -d > "$CONFIG_DIR/config.yaml"
fi

MESSAGE_PAYLOAD=""
if [ -n "$MESSAGE_BASE64" ]; then
  MESSAGE_PAYLOAD=$(printf "%s" "$MESSAGE_BASE64" | base64 -d)
fi

MESSAGE_FORMAT_VALUE=""
if [ -n "$MESSAGE_FORMAT_BASE64" ]; then
  MESSAGE_FORMAT_VALUE=$(printf "%s" "$MESSAGE_FORMAT_BASE64" | base64 -d)
fi

set -- notify -provider-config "$CONFIG_DIR/provider-config.yaml"

if [ -n "$NOTIFY_CONFIG_BASE64" ]; then
  set -- "$@" -config "$CONFIG_DIR/config.yaml"
fi

if [ "$(printf "%s" "$BULK_VALUE" | tr '[:upper:]' '[:lower:]')" = "true" ]; then
  set -- "$@" -bulk
fi

if [ "$(printf "%s" "$SILENT_VALUE" | tr '[:upper:]' '[:lower:]')" = "true" ]; then
  set -- "$@" -silent
fi

if [ "$(printf "%s" "$VERBOSE_VALUE" | tr '[:upper:]' '[:lower:]')" = "true" ]; then
  set -- "$@" -verbose
fi

if [ -n "$CHAR_LIMIT_VALUE" ]; then
  set -- "$@" -char-limit "$CHAR_LIMIT_VALUE"
fi

if [ -n "$DELAY_VALUE" ]; then
  set -- "$@" -delay "$DELAY_VALUE"
fi

if [ -n "$RATE_LIMIT_VALUE" ]; then
  set -- "$@" -rate-limit "$RATE_LIMIT_VALUE"
fi

if [ -n "$PROXY_VALUE" ]; then
  set -- "$@" -proxy "$PROXY_VALUE"
fi

if [ -n "$PROVIDER_IDS_CSV" ]; then
  set -- "$@" -provider "$PROVIDER_IDS_CSV"
fi

if [ -n "$RECIPIENT_IDS_CSV" ]; then
  set -- "$@" -id "$RECIPIENT_IDS_CSV"
fi

if [ -n "$MESSAGE_FORMAT_VALUE" ]; then
  set -- "$@" -msg-format "$MESSAGE_FORMAT_VALUE"
fi

OUTPUT_FILE=$(mktemp)
trap 'rm -f "$OUTPUT_FILE"' EXIT

if ! printf "%s" "$MESSAGE_PAYLOAD" | "$@" >"$OUTPUT_FILE" 2>&1; then
  RAW_OUTPUT=$(cat "$OUTPUT_FILE")
  printf "%s" "$RAW_OUTPUT" >&2
  exit 1
fi

RAW_OUTPUT=$(cat "$OUTPUT_FILE")

providers_json='[]'
if [ -n "$PROVIDER_IDS_CSV" ]; then
  providers_json=$(printf "%s" "$PROVIDER_IDS_CSV" | tr ',' '\n' | sed '/^$/d' | awk 'BEGIN{printf("["); first=1} { if (!first) printf(","); printf("\"%s\"", $0); first=0 } END{ if (first) printf("]"); else printf("]") }')
fi

recipients_json='[]'
if [ -n "$RECIPIENT_IDS_CSV" ]; then
  recipients_json=$(printf "%s" "$RECIPIENT_IDS_CSV" | tr ',' '\n' | sed '/^$/d' | awk 'BEGIN{printf("["); first=1} { if (!first) printf(","); printf("\"%s\"", $0); first=0 } END{ if (first) printf("]"); else printf("]") }')
fi

if [ -n "$MESSAGE_COUNT_RAW" ]; then
  MESSAGE_COUNT="$MESSAGE_COUNT_RAW"
else
  MESSAGE_COUNT=$(printf "%s" "$MESSAGE_PAYLOAD" | awk 'NF {count++} END {print count+0}')
fi

RAW_ESCAPED=$(escape_json "$RAW_OUTPUT")

if [ -n "$MESSAGE_FORMAT_VALUE" ]; then
  MESSAGE_FORMAT_JSON="\"$(escape_json "$MESSAGE_FORMAT_VALUE")\""
else
  MESSAGE_FORMAT_JSON="null"
fi

if [ -n "$PROXY_VALUE" ]; then
  PROXY_JSON="\"$(escape_json "$PROXY_VALUE")\""
else
  PROXY_JSON="null"
fi

if [ -n "$CHAR_LIMIT_VALUE" ]; then
  CHAR_LIMIT_JSON="$CHAR_LIMIT_VALUE"
else
  CHAR_LIMIT_JSON="null"
fi

if [ -n "$DELAY_VALUE" ]; then
  DELAY_JSON="$DELAY_VALUE"
else
  DELAY_JSON="null"
fi

if [ -n "$RATE_LIMIT_VALUE" ]; then
  RATE_JSON="$RATE_LIMIT_VALUE"
else
  RATE_JSON="null"
fi

BULK_JSON=$(printf "%s" "$BULK_VALUE" | tr '[:upper:]' '[:lower:]')
SILENT_JSON=$(printf "%s" "$SILENT_VALUE" | tr '[:upper:]' '[:lower:]')
VERBOSE_JSON=$(printf "%s" "$VERBOSE_VALUE" | tr '[:upper:]' '[:lower:]')

printf '{"rawOutput":"%s","messageCount":%s,"providers":%s,"recipientIds":%s,"options":{"bulk":%s,"silent":%s,"verbose":%s,"charLimit":%s,"delaySeconds":%s,"rateLimit":%s,"messageFormat":%s,"proxy":%s}}' \
  "$RAW_ESCAPED" \
  "$MESSAGE_COUNT" \
  "$providers_json" \
  "$recipients_json" \
  "$BULK_JSON" \
  "$SILENT_JSON" \
  "$VERBOSE_JSON" \
  "$CHAR_LIMIT_JSON" \
  "$DELAY_JSON" \
  "$RATE_JSON" \
  "$MESSAGE_FORMAT_JSON" \
  "$PROXY_JSON"
`,
    ],
  },
  inputSchema,
  outputSchema,
  docs: 'Sends notifications using ProjectDiscovery notify with a provided provider configuration.',
  metadata: {
    slug: 'notify',
    version: '1.0.0',
    type: 'output',
    category: 'security-tool',
    description: 'Deliver security findings to Slack, Teams, and other channels using ProjectDiscovery notify.',
    documentation: 'Configure provider credentials via YAML then stream workflow output to notify for alerting.',
    documentationUrl: 'https://github.com/projectdiscovery/notify',
    icon: 'Bell',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    isLatest: true,
    deprecated: false,
    example: '`echo "Critical finding" | notify -bulk` — Broadcast a message to configured providers.',
    inputs: [
      {
        id: 'messages',
        label: 'Messages',
        type: 'array',
        required: true,
        description: 'Array of messages that notify should deliver.',
      },
      {
        id: 'providerConfig',
        label: 'Provider Configuration',
        type: 'string',
        required: true,
        description: 'YAML defining provider credentials and channels (plain text YAML content).',
      },
    ],
    outputs: [
      {
        id: 'rawOutput',
        label: 'Raw Output',
        type: 'string',
        description: 'Raw CLI output returned by notify.',
      },
      {
        id: 'messageCount',
        label: 'Messages Sent',
        type: 'string',
        description: 'Count of messages forwarded to notify.',
      },
    ],
    examples: [
      'Forward a consolidated reconnaissance summary to Slack and Telegram.',
      'Send high-priority vulnerability findings to multiple notification channels in bulk.',
    ],
    parameters: [],
  },
  async execute(input, context) {
    const dockerPayload = {
      messageBase64: Buffer.from(input.messages.join('\n'), 'utf8').toString('base64'),
      providerConfigBase64: Buffer.from(input.providerConfig, 'utf8').toString('base64'),
      notifyConfigBase64: input.notifyConfig
        ? Buffer.from(input.notifyConfig, 'utf8').toString('base64')
        : '',
      providerIdsCsv: (input.providerIds ?? []).join(','),
      recipientIdsCsv: (input.recipientIds ?? []).join(','),
      messageFormatBase64: input.messageFormat ? Buffer.from(input.messageFormat, 'utf8').toString('base64') : '',
      bulk: input.bulk ?? true,
      silent: input.silent ?? true,
      verbose: input.verbose ?? false,
      charLimit: typeof input.charLimit === 'number' ? input.charLimit : null,
      delaySeconds: typeof input.delaySeconds === 'number' ? input.delaySeconds : null,
      rateLimit: typeof input.rateLimit === 'number' ? input.rateLimit : null,
      proxy: input.proxy ?? '',
      messageCount: input.messages.length,
    };

    const result = await runComponentWithRunner<typeof dockerPayload, Output>(
      this.runner,
      async () => ({} as Output),
      dockerPayload,
      context,
    );

    const baseOutput = {
      messageCount: input.messages.length,
      providers: input.providerIds ?? [],
      recipientIds: input.recipientIds ?? [],
      options: {
        bulk: dockerPayload.bulk,
        silent: dockerPayload.silent,
        verbose: dockerPayload.verbose,
        charLimit: dockerPayload.charLimit,
        delaySeconds: dockerPayload.delaySeconds,
        rateLimit: dockerPayload.rateLimit,
        messageFormat: input.messageFormat ?? null,
        proxy: input.proxy ?? null,
      },
    };

    if (typeof result === 'string') {
      return {
        rawOutput: result,
        ...baseOutput,
      };
    }

    if (result && typeof result === 'object') {
      const parsed = outputSchema.safeParse(result);
      if (parsed.success) {
        return parsed.data;
      }

      const rawOutput =
        'rawOutput' in result && typeof (result as any).rawOutput === 'string'
          ? (result as any).rawOutput
          : JSON.stringify(result);

      const providers = Array.isArray((result as any).providers)
        ? ((result as any).providers as unknown[])
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
        : baseOutput.providers;

      const recipientIds = Array.isArray((result as any).recipientIds)
        ? ((result as any).recipientIds as unknown[])
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
        : baseOutput.recipientIds;

      const options = (result as any).options && typeof (result as any).options === 'object'
        ? (result as any).options
        : {};

      const ensureNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
      const ensureString = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : null);

      return {
        rawOutput,
        messageCount:
          typeof (result as any).messageCount === 'number'
            ? (result as any).messageCount
            : baseOutput.messageCount,
        providers,
        recipientIds,
        options: {
          bulk: typeof (options as any).bulk === 'boolean' ? (options as any).bulk : baseOutput.options.bulk,
          silent: typeof (options as any).silent === 'boolean' ? (options as any).silent : baseOutput.options.silent,
          verbose:
            typeof (options as any).verbose === 'boolean'
              ? (options as any).verbose
              : baseOutput.options.verbose,
          charLimit:
            ensureNumber((options as any).charLimit) ?? baseOutput.options.charLimit,
          delaySeconds:
            ensureNumber((options as any).delaySeconds) ?? baseOutput.options.delaySeconds,
          rateLimit:
            ensureNumber((options as any).rateLimit) ?? baseOutput.options.rateLimit,
          messageFormat:
            ensureString((options as any).messageFormat) ?? baseOutput.options.messageFormat,
          proxy: ensureString((options as any).proxy) ?? baseOutput.options.proxy,
        },
      };
    }

    return {
      rawOutput: '',
      ...baseOutput,
    };
  },
};

componentRegistry.register(definition);
