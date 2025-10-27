import type { ComponentDefinition, ComponentCategory } from '@shipsec/component-sdk';

interface ComponentCategoryConfig {
  label: string;
  color: string;
  description: string;
  emoji: string;
}

const SUPPORTED_CATEGORIES: ReadonlyArray<ComponentCategory> = ['input', 'transform', 'ai', 'security', 'it_ops', 'output'];

const COMPONENT_CATEGORY_CONFIG: Record<ComponentCategory, ComponentCategoryConfig> = {
  input: {
    label: '📥 Input',
    color: 'text-blue-600',
    description: 'Data sources, triggers, and credential access',
    emoji: '📥',
  },
  transform: {
    label: '🔄 Transform',
    color: 'text-orange-600',
    description: 'Data processing, text manipulation, and formatting',
    emoji: '🔄',
  },
  ai: {
    label: '🤖 AI Components',
    color: 'text-violet-600',
    description: 'AI-powered analysis and generation tools',
    emoji: '🤖',
  },
  security: {
    label: '🔒 Security Tools',
    color: 'text-red-600',
    description: 'Security scanning and assessment tools',
    emoji: '🔒',
  },
  it_ops: {
    label: '🏢 IT Ops',
    color: 'text-cyan-600',
    description: 'IT operations and user management workflows',
    emoji: '🏢',
  },
  output: {
    label: '📤 Output',
    color: 'text-green-600',
    description: 'Data export, notifications, and integrations',
    emoji: '📤',
  },
};

function normalizeCategory(category?: string | null): ComponentCategory | null {
  if (!category) {
    return null;
  }

  const normalized = category.toLowerCase();

  if (SUPPORTED_CATEGORIES.includes(normalized as ComponentCategory)) {
    return normalized as ComponentCategory;
  }

  return null;
}

export function categorizeComponent(component: ComponentDefinition): ComponentCategory {
  const fromMetadata = normalizeCategory(component.metadata?.category);
  if (fromMetadata) {
    return fromMetadata;
  }

  const fromDefinition = normalizeCategory(component.category);
  if (fromDefinition) {
    return fromDefinition;
  }

  return 'input';
}

export function getCategoryConfig(category: ComponentCategory): ComponentCategoryConfig {
  return COMPONENT_CATEGORY_CONFIG[category];
}
