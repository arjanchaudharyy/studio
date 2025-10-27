import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import { ComponentRegistry } from '../registry';
import type { ComponentDefinition } from '../types';

describe('ComponentRegistry', () => {
  let registry: ComponentRegistry;

  beforeEach(() => {
    registry = new ComponentRegistry();
  });

  it('should register a component', () => {
    const component: ComponentDefinition = {
      id: 'test.component',
      label: 'Test Component',
      category: 'transform',
      runner: { kind: 'inline' },
      inputSchema: z.object({ input: z.string() }),
      outputSchema: z.object({ output: z.string() }),
      execute: async (params: any) => ({ output: params.input }),
    };

    registry.register(component);

    const retrieved = registry.get('test.component');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test.component');
    expect(retrieved?.label).toBe('Test Component');
  });

  it('should throw error when registering duplicate component', () => {
    const component: ComponentDefinition = {
      id: 'duplicate.component',
      label: 'Duplicate',
      category: 'transform',
      runner: { kind: 'inline' },
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      execute: async () => ({}),
    };

    registry.register(component);

    expect(() => registry.register(component)).toThrow(
      'Component duplicate.component is already registered',
    );
  });

  it('should return undefined for non-existent component', () => {
    const component = registry.get('non.existent');
    expect(component).toBeUndefined();
  });

  it('should list all registered components', () => {
    const component1: ComponentDefinition = {
      id: 'component.one',
      label: 'One',
      category: 'input',
      runner: { kind: 'inline' },
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      execute: async () => ({}),
    };

    const component2: ComponentDefinition = {
      id: 'component.two',
      label: 'Two',
      category: 'output',
      runner: { kind: 'inline' },
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      execute: async () => ({}),
    };

    registry.register(component1);
    registry.register(component2);

    const all = registry.list();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.id)).toContain('component.one');
    expect(all.map((c) => c.id)).toContain('component.two');
  });

  it('should check if component exists', () => {
    const component: ComponentDefinition = {
      id: 'exists.component',
      label: 'Exists',
      category: 'transform',
      runner: { kind: 'inline' },
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      execute: async () => ({}),
    };

    expect(registry.has('exists.component')).toBe(false);

    registry.register(component);

    expect(registry.has('exists.component')).toBe(true);
  });

  it('should clear all components', () => {
    const component: ComponentDefinition = {
      id: 'clear.test',
      label: 'Clear Test',
      category: 'transform',
      runner: { kind: 'inline' },
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      execute: async () => ({}),
    };

    registry.register(component);
    expect(registry.list()).toHaveLength(1);

    registry.clear();
    expect(registry.list()).toHaveLength(0);
  });
});
