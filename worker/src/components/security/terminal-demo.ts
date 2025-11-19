import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  port,
  runComponentWithRunner,
  type DockerRunnerConfig,
} from '@shipsec/component-sdk';

const inputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default('ShipSec terminal demo')
    .describe('Message to display in the terminal.'),
  count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('How many progress steps to show.'),
});

const outputSchema = z.object({
  message: z.string(),
  stepsCompleted: z.number(),
  rawOutput: z.string(),
});

export type TerminalDemoInput = z.infer<typeof inputSchema>;
export type TerminalDemoOutput = z.infer<typeof outputSchema>;

const nodeScript = String.raw`const readline = require('readline');

function showInteractiveProgress() {
  const steps = 10;
  const barWidth = 30;
  let current = 0;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('🚀 Starting interactive terminal demo...');
  console.log('📊 Watch the progress bar update in real-time!');
  console.log('');

  const interval = setInterval(() => {
    if (current <= steps) {
      const progress = current;
      const filled = Math.floor((progress / steps) * barWidth);
      const empty = barWidth - filled;
      const bar = '='.repeat(filled) + '.'.repeat(empty);
      const percentage = Math.floor((progress / steps) * 100);
      const spinner = '|/-\\'[Math.floor(Date.now() / 250) % 4];

      process.stdout.write('\\r[' + progress.toString().padStart(2) + '/' + steps + '] [' + bar + '] ' + percentage.toString().padStart(3) + '% ' + spinner);

      if (current < steps) {
        current++;
      } else {
        clearInterval(interval);
        console.log('\\n✅ Interactive demo completed successfully!');
        console.log('🎯 This demonstrates:');
        console.log('   • Real-time progress updates');
        console.log('   • Carriage return for line rewriting');
        console.log('   • PTY terminal capabilities');

        const result = {
          message: "Interactive terminal demo",
          stepsCompleted: steps,
          interactive: true,
          rawOutput: "Demo completed with " + steps + " interactive steps using carriage returns"
        };
        console.log(JSON.stringify(result));

        rl.close();
      }
    }
  }, 200);
}

console.log('🔧 Initializing interactive demo...');
setTimeout(() => {
  showInteractiveProgress();
}, 1000);`;

const runner: DockerRunnerConfig = {
  kind: 'docker',
  image: 'node:18-alpine',
  entrypoint: 'node',
  command: ['-e', nodeScript],
  env: {},
  network: 'none',
  timeoutSeconds: 15,
};

const definition: ComponentDefinition<TerminalDemoInput, TerminalDemoOutput> = {
  id: 'shipsec.security.terminal-demo',
  label: 'Terminal Stream Demo',
  category: 'security',
  runner,
  inputSchema,
  outputSchema,
  metadata: {
    slug: 'terminal-stream-demo',
    version: '1.0.0',
    type: 'process',
    category: 'security',
    documentation:
      'Launches an interactive Node.js demo with real-time progress bar updates using carriage returns to test PTY terminal streaming capabilities.',
    documentationUrl: 'https://asciinema.org/',
    icon: 'Terminal',
    author: {
      name: 'ShipSecAI',
      type: 'shipsecai',
    },
    isLatest: true,
    deprecated: false,
    example:
      'Use this component while building terminal-aware workflows—when executed, it prints a looping progress bar.',
    inputs: [
      {
        id: 'message',
        label: 'Message',
        dataType: port.text(),
        required: false,
        description: 'Message to display in the terminal demo.',
      },
      {
        id: 'count',
        label: 'Steps',
        dataType: port.number(),
        required: false,
        description: 'Number of progress steps to show.',
      },
    ],
    outputs: [
      {
        id: 'rawOutput',
        label: 'Raw Output',
        dataType: port.text(),
        description: 'Captured terminal stream emitted by the Docker container.',
      },
    ],
    examples: ['Verify PTY streaming by running this component inside a workflow.'],
    parameters: [
      {
        id: 'count',
        label: 'Steps',
        type: 'number',
        min: 1,
        max: 20,
        default: 5,
      },
    ],
  },
  async execute(input, context) {
    const params = inputSchema.parse(input)

    context.emitProgress({
      message: 'Launching terminal demo…',
      level: 'info',
      data: {
        message: params.message,
        count: params.count,
      },
    });

    const raw = await runComponentWithRunner<typeof params, any>(
      this.runner,
      async () => ({ message: params.message, stepsCompleted: 0, rawOutput: 'No output' }),
      params,
      context,
    );

    // Parse the JSON output from the Python script
    let parsedOutput = { message: params.message, stepsCompleted: params.count, rawOutput: 'Demo completed' };
    if (typeof raw === 'string') {
      try {
        parsedOutput = JSON.parse(raw);
      } catch (e) {
        // If parsing fails, use the raw string as output
        parsedOutput.rawOutput = raw;
      }
    } else if (raw && typeof raw === 'object') {
      parsedOutput = raw;
    }

    const result: TerminalDemoOutput = {
      message: parsedOutput.message || params.message,
      stepsCompleted: parsedOutput.stepsCompleted || params.count,
      rawOutput: parsedOutput.rawOutput || (typeof raw === 'string' ? raw : JSON.stringify(raw)),
    };

    return outputSchema.parse(result);
  },
};

componentRegistry.register(definition);
