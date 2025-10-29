import { describe, expect, it } from 'bun:test';

import { coerceValueForPort, port } from '../ports';

describe('coerceValueForPort - secret ports', () => {
  it('accepts plain string secrets without modification', () => {
    const dataType = port.secret();

    const result = coerceValueForPort(dataType, 'raw-secret');

    expect(result.ok).toBe(true);
    expect(result.value).toBe('raw-secret');
  });

  it('stringifies object secrets so downstream components receive JSON', () => {
    const dataType = port.secret();
    const secretObject = { clientEmail: 'service@example.com', projectId: 'demo' };

    const result = coerceValueForPort(dataType, secretObject);

    expect(result.ok).toBe(true);
    expect(result.value).toBe(JSON.stringify(secretObject));
  });

  it('rejects non-string, non-object secret values', () => {
    const dataType = port.secret();

    const result = coerceValueForPort(dataType, 12345);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Secret values must be strings or JSON objects');
  });
});
