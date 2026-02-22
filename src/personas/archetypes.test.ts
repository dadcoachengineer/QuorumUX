import { describe, it, expect } from 'vitest';
import { ARCHETYPES } from './archetypes.js';

describe('ARCHETYPES', () => {
  it('has exactly 10 archetypes', () => {
    expect(ARCHETYPES).toHaveLength(10);
  });

  it('all have required fields', () => {
    for (const a of ARCHETYPES) {
      expect(a.id).toBeTypeOf('string');
      expect(a.name).toBeTypeOf('string');
      expect(a.description).toBeTypeOf('string');
      expect(a.device).toBeTypeOf('string');
      expect(a.viewport).toBeDefined();
      expect(a.behaviorNotes).toBeTypeOf('string');
    }
  });

  it('all IDs are unique', () => {
    const ids = ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all IDs are kebab-case', () => {
    for (const a of ARCHETYPES) {
      expect(a.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('viewport dimensions are positive integers', () => {
    for (const a of ARCHETYPES) {
      expect(Number.isInteger(a.viewport.width)).toBe(true);
      expect(Number.isInteger(a.viewport.height)).toBe(true);
      expect(a.viewport.width).toBeGreaterThan(0);
      expect(a.viewport.height).toBeGreaterThan(0);
    }
  });

  it('device values are valid', () => {
    const validDevices = new Set(['desktop', 'mobile', 'tablet']);
    for (const a of ARCHETYPES) {
      expect(validDevices.has(a.device)).toBe(true);
    }
  });

  it('mobile-first has mobile device', () => {
    const mobileFirst = ARCHETYPES.find((a) => a.id === 'mobile-first');
    expect(mobileFirst).toBeDefined();
    expect(mobileFirst!.device).toBe('mobile');
  });

  it('accessibility archetype has accessibilityNeeds', () => {
    const a11y = ARCHETYPES.find((a) => a.id === 'accessibility');
    expect(a11y).toBeDefined();
    expect(a11y!.accessibilityNeeds).toBeDefined();
    expect(a11y!.accessibilityNeeds!.length).toBeGreaterThan(0);
  });
});
