import { describe, it, expect } from 'vitest';
import { generateStableId } from './synthesize.js';

describe('generateStableId', () => {
  it('produces QUX- prefixed IDs', () => {
    const id = generateStableId('Login button broken', 'functional');
    expect(id).toMatch(/^QUX-[a-f0-9]{8}$/);
  });

  it('is deterministic (same inputs → same ID)', () => {
    const a = generateStableId('Login button broken', 'functional');
    const b = generateStableId('Login button broken', 'functional');
    expect(a).toBe(b);
  });

  it('is case-insensitive', () => {
    const a = generateStableId('Login Button Broken', 'Functional');
    const b = generateStableId('login button broken', 'functional');
    expect(a).toBe(b);
  });

  it('produces different IDs for different titles', () => {
    const a = generateStableId('Login button broken', 'functional');
    const b = generateStableId('Signup form missing', 'functional');
    expect(a).not.toBe(b);
  });

  it('produces different IDs for same title with different discriminators', () => {
    const a = generateStableId('Slow loading', 'performance');
    const b = generateStableId('Slow loading', 'video');
    expect(a).not.toBe(b);
  });

  it('trims whitespace from inputs', () => {
    const a = generateStableId('  Login broken  ', '  functional  ');
    const b = generateStableId('Login broken', 'functional');
    expect(a).toBe(b);
  });
});
