import { runComponentWithRunner, ValidationError } from '@shipsec/component-sdk';

type StartMcpServerInput = {
  image: string;
  command?: string[];
  args?: string[];
  env?: Record<string, string>;
  port?: number;
  params: Record<string, unknown>;
  context: any;
};

type StartMcpServerOutput = {
  endpoint: string;
  containerId?: string;
};

export async function startMcpDockerServer(
  input: StartMcpServerInput,
): Promise<StartMcpServerOutput> {
  const port = input.port ?? 8080;

  if (!input.image || input.image.trim().length === 0) {
    throw new ValidationError('Docker image is required for MCP server', {
      fieldErrors: { image: ['Docker image is required'] },
    });
  }

  const runnerConfig = {
    kind: 'docker' as const,
    image: input.image,
    command: [...(input.command ?? []), ...(input.args ?? [])],
    env: input.env,
    detached: true,
    ports: { [port]: port },
  };

  const result = await runComponentWithRunner(
    runnerConfig,
    async () => ({}),
    input.params,
    input.context,
  );

  let containerId: string | undefined;
  if (result && typeof result === 'object' && 'containerId' in result) {
    containerId = (result as { containerId?: string }).containerId;
  }

  return {
    endpoint: `http://localhost:${port}`,
    containerId,
  };
}
