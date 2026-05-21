import { describe, expect, it } from 'vitest';
import { detectSite } from './site-detect.ts';

describe('detectSite', () => {
  it('maps known hostnames (incl. www / subdomains) to whitelist labels', () => {
    expect(detectSite('reddit.com')).toBe('reddit');
    expect(detectSite('www.reddit.com')).toBe('reddit');
    expect(detectSite('old.reddit.com')).toBe('reddit');
    expect(detectSite('x.com')).toBe('x');
    expect(detectSite('twitter.com')).toBe('x');
    expect(detectSite('app.slack.com')).toBe('slack');
    expect(detectSite('www.notion.so')).toBe('notion');
    expect(detectSite('github.com')).toBe('github');
    expect(detectSite('www.linkedin.com')).toBe('linkedin');
    expect(detectSite('discord.com')).toBe('discord');
  });

  it('is case-insensitive', () => {
    expect(detectSite('WWW.Reddit.COM')).toBe('reddit');
  });

  it('returns "other" for unrecognized hostnames', () => {
    expect(detectSite('example.com')).toBe('other');
    expect(detectSite('mail.google.com')).toBe('other');
    expect(detectSite('')).toBe('other');
  });

  it('only matches on a real domain-suffix boundary (no substring false positives)', () => {
    expect(detectSite('notreddit.com')).toBe('other');
    expect(detectSite('reddit.com.evil.com')).toBe('other');
  });
});
