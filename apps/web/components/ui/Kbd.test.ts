import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Kbd } from './Kbd.tsx';

describe('Kbd', () => {
  it('renders as <kbd> with data-size="md" by default', () => {
    const html = renderToStaticMarkup(createElement(Kbd, null, 'Shift'));
    expect(html).toMatch(/^<kbd\b/);
    expect(html).toContain('data-size="md"');
    expect(html).toContain('Shift');
  });

  it.each(['sm', 'md'] as const)('renders size=%s', (size) => {
    const html = renderToStaticMarkup(createElement(Kbd, { size }, 'K'));
    expect(html).toContain(`data-size="${size}"`);
  });
});
