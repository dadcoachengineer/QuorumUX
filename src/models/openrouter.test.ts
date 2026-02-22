import { describe, it, expect } from 'vitest';
import { redactApiKey } from './openrouter';

describe('redactApiKey', () => {
  it('redacts sk-or-v1-* keys', () => {
    expect(redactApiKey('key is sk-or-v1-abc123def456')).toBe('key is sk-or-***');
  });

  it('redacts sk-or-* keys', () => {
    expect(redactApiKey('key is sk-or-abc123')).toBe('key is sk-or-***');
  });

  it('redacts multiple keys in one string', () => {
    const input = 'first sk-or-v1-aaa then sk-or-bbb end';
    expect(redactApiKey(input)).toBe('first sk-or-*** then sk-or-*** end');
  });

  it('leaves strings without keys unchanged', () => {
    expect(redactApiKey('no keys here')).toBe('no keys here');
  });

  it('handles empty string', () => {
    expect(redactApiKey('')).toBe('');
  });
});
