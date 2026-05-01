/// <reference lib="dom" />
import { afterEach, describe, expect, it } from 'vitest';
import { readEditable } from './read.ts';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('readEditable — <textarea>', () => {
  it('returns full text when no selection', () => {
    const ta = document.createElement('textarea');
    ta.value = 'hello world';
    document.body.appendChild(ta);

    const r = readEditable(ta);
    expect(r.text).toBe('hello world');
    expect(r.hasSelection).toBe(false);
  });

  it('returns selection text when selected', () => {
    const ta = document.createElement('textarea');
    ta.value = 'hello world';
    document.body.appendChild(ta);
    ta.setSelectionRange(6, 11);

    const r = readEditable(ta);
    expect(r.text).toBe('world');
    expect(r.hasSelection).toBe(true);
  });

  it('includes context (before+after) when there is selection', () => {
    const ta = document.createElement('textarea');
    ta.value = 'foo bar baz qux';
    document.body.appendChild(ta);
    ta.setSelectionRange(4, 7); // 'bar'

    const r = readEditable(ta);
    expect(r.text).toBe('bar');
    expect(r.context).toContain('foo');
    expect(r.context).toContain('baz');
  });
});

describe('readEditable — contenteditable', () => {
  it('returns full text without selection', () => {
    const ce = document.createElement('div');
    ce.contentEditable = 'true';
    ce.textContent = 'hello';
    document.body.appendChild(ce);

    const r = readEditable(ce);
    expect(r.text).toBe('hello');
    expect(r.hasSelection).toBe(false);
  });
});
