import type { Style } from '@rewrite/shared';

export type { Style };

// Phase 1 将填充：3 风格 system prompt（中英双套）+ buildMessages
export function buildMessages(_opts: {
  style: Style;
  lang: string;
  text: string;
  context?: string;
  hasSelection: boolean;
}): { role: 'system' | 'user'; content: string }[] {
  throw new Error('not implemented (Phase 1)');
}
