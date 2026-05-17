import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './Button.tsx';

// Smoke tests use react-dom/server renderToStaticMarkup instead of RTL/jsdom
// (apps/web ships neither). React.createElement keeps the file JSX-free, and
// children are passed positionally because biome's noChildrenProp rule
// disallows explicit `children` props.

describe('Button', () => {
  it('renders as <button> with data-variant="primary" data-size="md" by default', () => {
    const html = renderToStaticMarkup(createElement(Button, null, 'Click'));
    expect(html).toMatch(/^<button\b/);
    expect(html).toContain('data-variant="primary"');
    expect(html).toContain('data-size="md"');
    expect(html).toContain('type="button"');
    expect(html).toContain('Click');
  });

  it.each(['primary', 'secondary', 'ghost'] as const)('renders variant=%s', (variant) => {
    const html = renderToStaticMarkup(createElement(Button, { variant }, 'X'));
    expect(html).toContain(`data-variant="${variant}"`);
  });

  it.each(['sm', 'md'] as const)('renders size=%s', (size) => {
    const html = renderToStaticMarkup(createElement(Button, { size }, 'X'));
    expect(html).toContain(`data-size="${size}"`);
  });

  it('renders as <a> with href when as="a"', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { as: 'a', href: '/foo', variant: 'ghost' }, 'Link'),
    );
    expect(html).toMatch(/^<a\b/);
    expect(html).toContain('href="/foo"');
    expect(html).toContain('data-variant="ghost"');
    // <a> must not get type="button"
    expect(html).not.toContain('type="button"');
  });

  it('merges user className with internal class', () => {
    const html = renderToStaticMarkup(createElement(Button, { className: 'extra' }, 'X'));
    expect(html).toContain('extra');
  });

  it('forwards arbitrary anchor attributes (target, rel) in as="a" mode', () => {
    const html = renderToStaticMarkup(
      createElement(
        Button,
        { as: 'a', href: 'https://example.com', target: '_blank', rel: 'noopener' },
        'Ext',
      ),
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
  });
});
