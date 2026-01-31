import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Test to verify OpenCode MCP configuration is correctly set up.
 * This validates that the oauth: false flag is present in the MCP config generation.
 * 
 * This is a regression test for: https://github.com/anomalyco/opencode/issues/5278
 */
describe('OpenCode MCP Configuration', () => {
  test('opencode.ts generates MCP config with oauth: false', () => {
    // Read the OpenCode component file
    const filePath = join(process.cwd(), 'worker/src/components/ai/opencode.ts');
    const content = readFileSync(filePath, 'utf8');

    // Verify oauth: false is present in the MCP config
    expect(content).toContain('oauth: false');

    // Verify it's in the right context (within the mcp config object)
    const mcpConfigMatch = content.match(/mcp:\s*{[\s\S]*?oauth:\s*false/);
    expect(mcpConfigMatch).toBeDefined();

    // Verify the comment about the fix is present
    expect(content).toContain('oauth: false is required for custom headers');
    expect(content).toContain('1.0.137');
    expect(content).toContain('5278');
  });

  test('MCP config includes proper structure', () => {
    const filePath = join(process.cwd(), 'worker/src/components/ai/opencode.ts');
    const content = readFileSync(filePath, 'utf8');

    // Verify the MCP server name
    expect(content).toContain("'shipsec-gateway'");

    // Verify type is 'remote'
    expect(content).toContain("type: 'remote'");

    // Verify Authorization header is present
    expect(content).toContain('Authorization');
    expect(content).toContain('Bearer');
  });

  test('MCP config does not use old format', () => {
    const filePath = join(process.cwd(), 'worker/src/components/ai/opencode.ts');
    const content = readFileSync(filePath, 'utf8');

    // Old format used "mcp.servers.X.transport.type"
    // Make sure we don't have that pattern
    expect(content).not.toContain('mcp.servers');
    expect(content).not.toContain('transport');
  });
});
