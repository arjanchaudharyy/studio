import type { UnifiedComponentDefinition } from './types';

export function defineComponent<I, O, P>(
  definition: UnifiedComponentDefinition<I, O, P>,
): UnifiedComponentDefinition<I, O, P> {
  return definition;
}
