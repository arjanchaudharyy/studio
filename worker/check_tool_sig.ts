import { tool as toolImpl } from 'ai';
import { z } from 'zod/v4';

// Signature check
console.log('Type of toolImpl:', typeof toolImpl);

try {
  const t = (toolImpl as any)({
    description: 'test tool',
    parameters: z.object({ arg: z.string() }),
    execute: async (args: any) => args,
  });
  console.log('Tool created with parameters:', !!t);
} catch (e) {
  console.log('Tool creation with parameters failed:', e);
}

try {
  const t = (toolImpl as any)({
    type: 'dynamic',
    description: 'test tool',
    inputSchema: z.object({ arg: z.string() }),
    execute: async (args: any) => args,
  });
  console.log(
    'Tool object:',
    JSON.stringify(t, (k, v) => (typeof v === 'symbol' ? v.toString() : v), 2),
  );
  console.log('Tool inputSchema symbols:', Object.getOwnPropertySymbols(t.inputSchema));
} catch (e) {
  console.log('Tool creation with inputSchema/type failed:', e);
}
