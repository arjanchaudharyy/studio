import { jsonSchema } from 'ai';
console.log('Type of jsonSchema:', typeof jsonSchema);
if (typeof jsonSchema === 'function') {
  try {
    const s = jsonSchema({ type: 'object', properties: {} });
    console.log('jsonSchema result symbols:', Object.getOwnPropertySymbols(s));
  } catch (e) {
    console.log('jsonSchema call failed:', e);
  }
}
import { tool } from 'ai';
console.log('Type of tool:', typeof tool);
