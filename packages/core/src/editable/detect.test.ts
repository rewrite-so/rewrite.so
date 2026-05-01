/// <reference lib="dom" />
import { afterEach, describe, expect, it } from 'vitest';
import { getEditableKind, isEditable, isExcluded, isUsableEditable } from './detect.ts';

function el(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild as HTMLElement;
}

describe('isEditable', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('accepts <input type=text>', () => {
    expect(isEditable(el('<input type="text">'))).toBe(true);
  });
  it('accepts <input> without type (defaults to text)', () => {
    expect(isEditable(el('<input>'))).toBe(true);
  });
  it('accepts <input type=search/url>', () => {
    expect(isEditable(el('<input type="search">'))).toBe(true);
    expect(isEditable(el('<input type="url">'))).toBe(true);
  });
  it('rejects <input type=email/tel/checkbox/etc>', () => {
    expect(isEditable(el('<input type="email">'))).toBe(false);
    expect(isEditable(el('<input type="tel">'))).toBe(false);
    expect(isEditable(el('<input type="checkbox">'))).toBe(false);
    expect(isEditable(el('<input type="number">'))).toBe(false);
  });
  it('accepts <textarea>', () => {
    expect(isEditable(el('<textarea></textarea>'))).toBe(true);
  });
  it('accepts contenteditable=true', () => {
    expect(isEditable(el('<div contenteditable="true">x</div>'))).toBe(true);
  });
  it('accepts role=textbox', () => {
    expect(isEditable(el('<div role="textbox">x</div>'))).toBe(true);
  });
  it('rejects null / non-elements', () => {
    expect(isEditable(null)).toBe(false);
    expect(isEditable(undefined)).toBe(false);
  });
  it('rejects plain divs', () => {
    expect(isEditable(el('<div>x</div>'))).toBe(false);
  });
});

describe('isExcluded — PII hard-block', () => {
  it('excludes <input type=password>', () => {
    expect(isExcluded(el('<input type="password">'))).toBe(true);
  });
  it('excludes <input type=hidden>', () => {
    expect(isExcluded(el('<input type="hidden">'))).toBe(true);
  });
  it('excludes autocomplete=cc-number / cc-name / cc-csc', () => {
    expect(isExcluded(el('<input autocomplete="cc-number">'))).toBe(true);
    expect(isExcluded(el('<input autocomplete="cc-name">'))).toBe(true);
    expect(isExcluded(el('<input autocomplete="cc-csc">'))).toBe(true);
  });
  it('excludes autocomplete=current-password / new-password / one-time-code', () => {
    expect(isExcluded(el('<input autocomplete="current-password">'))).toBe(true);
    expect(isExcluded(el('<input autocomplete="new-password">'))).toBe(true);
    expect(isExcluded(el('<input autocomplete="one-time-code">'))).toBe(true);
  });
  it('excludes name containing password / cvv / otp / secret / token', () => {
    expect(isExcluded(el('<input name="user_password">'))).toBe(true);
    expect(isExcluded(el('<input name="cardCVV">'))).toBe(true);
    expect(isExcluded(el('<input name="otpCode">'))).toBe(true);
    expect(isExcluded(el('<input name="api_secret">'))).toBe(true);
    expect(isExcluded(el('<input name="auth_token">'))).toBe(true);
  });
  it('excludes id containing pin', () => {
    expect(isExcluded(el('<input id="enterPin">'))).toBe(true);
  });
  it('excludes readonly / disabled', () => {
    expect(isExcluded(el('<textarea readonly></textarea>'))).toBe(true);
    expect(isExcluded(el('<textarea disabled></textarea>'))).toBe(true);
  });
  it('does NOT exclude normal text input', () => {
    expect(isExcluded(el('<input type="text" name="bio">'))).toBe(false);
    expect(isExcluded(el('<textarea name="content"></textarea>'))).toBe(false);
  });
});

describe('isUsableEditable', () => {
  it('combines isEditable && !isExcluded', () => {
    expect(isUsableEditable(el('<textarea name="bio"></textarea>'))).toBe(true);
    expect(isUsableEditable(el('<input type="password">'))).toBe(false);
    expect(isUsableEditable(el('<input type="text" name="otp">'))).toBe(false);
    expect(isUsableEditable(el('<div>plain</div>'))).toBe(false);
  });
});

describe('getEditableKind', () => {
  it('returns input/textarea/contenteditable', () => {
    expect(getEditableKind(el('<input>'))).toBe('input');
    expect(getEditableKind(el('<textarea></textarea>'))).toBe('textarea');
    expect(getEditableKind(el('<div contenteditable="true">x</div>'))).toBe('contenteditable');
    expect(getEditableKind(el('<div role="textbox">x</div>'))).toBe('contenteditable');
  });
});
