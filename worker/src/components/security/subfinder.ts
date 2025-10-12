import { z } from 'zod';
import { componentRegistry, ComponentDefinition } from '@shipsec/component-sdk';

const inputSchema = z.object({
  domains: z.array(z.string()).describe('Array of target domains'),
});

type Input = z.infer<typeof inputSchema>;

type Output = {
  subdomains: string[];
  rawOutput: string;
  domainCount: number;
  subdomainCount: number;
};

const outputSchema = z.object({
  subdomains: z.array(z.string()),
  rawOutput: z.string(),
  domainCount: z.number(),
  subdomainCount: z.number(),
});

const definition: ComponentDefinition<Input, Output> = {
  id: 'shipsec.subfinder.run',
  label: 'Subfinder',
  category: 'discovery',
  runner: {
    kind: 'docker',
    image: 'projectdiscovery/subfinder:latest',
    entrypoint: 'sh',
    network: 'bridge', // Needs network access for DNS queries
    command: [
      '-c',
      `INPUT=$(cat)

# Extract domains array from JSON input
DOMAINS=$(echo "$INPUT" | awk -F'"' '
/domains/ {
  in_array=1
  next
}
in_array && /"/ {
  gsub(/[\\[\\],"]/, "", $0)
  gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
  if (length($0) > 0 && $0 != "]") {
    print $0
  }
  if (/]/) in_array=0
}
')

if [ -z "$DOMAINS" ]; then
  echo '{"subdomains":[],"rawOutput":"","domainCount":0,"subdomainCount":0}'
  exit 0
fi

# Count domains
DOMAIN_COUNT=$(echo "$DOMAINS" | wc -l)

# Run subfinder for each domain and collect results
ALL_RESULTS=""
echo "$DOMAINS" | while read -r DOMAIN; do
  if [ -n "$DOMAIN" ]; then
    RESULTS=$(subfinder -d "$DOMAIN" -silent 2>&1 | grep -v "INF" | grep -v "subfinder" | grep -v "projectdiscovery" | grep -v "^$" | grep -v "^[[:space:]]*$" | grep -v "^─")
    if [ -n "$RESULTS" ]; then
      ALL_RESULTS="$ALL_RESULTS$RESULTS\\n"
    fi
  fi
done

# Remove trailing newline
ALL_RESULTS=$(echo -e "$ALL_RESULTS" | sed '/^$/d')

# Check if results are empty
if [ -z "$ALL_RESULTS" ]; then
  echo "{\\\"subdomains\\\":[],\\\"rawOutput\\\":\\\"\\\",\\\"domainCount\\\":$DOMAIN_COUNT,\\\"subdomainCount\\\":0}"
  exit 0
fi

# Build JSON with awk for proper formatting
echo "$ALL_RESULTS" | awk -v dc="$DOMAIN_COUNT" '
BEGIN {
  printf "{\\"subdomains\\":["
  count=0
}
{
  if (length($0) > 0) {
    if (count > 0) printf ","
    gsub(/"/, "\\\\\\"", $0)
    printf "\\""$0"\\""
    raw = raw (count>0 ? " " : "") $0
    count++
  }
}
END {
  gsub(/"/, "\\\\\\"", raw)
  printf "],\\"rawOutput\\":\\""raw"\\",\\"domainCount\\":" dc ",\\"subdomainCount\\":" count "}\\n"
}'`,
    ],
    timeoutSeconds: 120,
    env: {
      HOME: '/root', // subfinder needs a home directory for config
    },
  },
  inputSchema,
  outputSchema,
  docs: 'Runs projectdiscovery/subfinder to discover subdomains for a given domain.',
  metadata: {
    slug: 'subfinder',
    version: '1.0.0',
    type: 'scan',
    category: 'security-tool',
    description: 'Discover subdomains for a target domain using ProjectDiscovery subfinder.',
    documentation: 'https://github.com/projectdiscovery/subfinder',
    icon: 'Radar',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    isLatest: true,
    deprecated: false,
    inputs: [
      {
        id: 'domains',
        label: 'Target Domains',
        type: 'array',
        required: true,
        description: 'Array of domain names to enumerate for subdomains.',
      },
    ],
    outputs: [
      {
        id: 'subdomains',
        label: 'Discovered Subdomains',
        type: 'array',
        description: 'Array of all subdomain hostnames discovered.',
      },
      {
        id: 'rawOutput',
        label: 'Raw Output',
        type: 'string',
        description: 'Raw tool output for debugging.',
      },
      {
        id: 'stats',
        label: 'Statistics',
        type: 'object',
        description: 'Domain and subdomain counts.',
      },
    ],
    parameters: [],
  },
  async execute(params, context) {
    // This function should never be called when using Docker runner
    // The Docker runner intercepts execution and runs the container directly
    throw new Error('Subfinder should run in Docker, not inline. Runner config may be misconfigured.');
  },
};

componentRegistry.register(definition);
