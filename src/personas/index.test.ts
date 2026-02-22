import { describe, it, expect } from 'vitest';
import { getArchetypeById, getArchetypeSubset, PERSONA_BUNDLES, ARCHETYPES } from './index';

describe('getArchetypeById', () => {
  it('finds an existing archetype', () => {
    const result = getArchetypeById('happy-path');
    expect(result).toBeDefined();
    expect(result!.id).toBe('happy-path');
  });

  it('returns undefined for unknown id', () => {
    expect(getArchetypeById('nonexistent')).toBeUndefined();
  });
});

describe('getArchetypeSubset', () => {
  it('returns correct subset', () => {
    const result = getArchetypeSubset(['happy-path', 'mobile-first']);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('happy-path');
    expect(result[1].id).toBe('mobile-first');
  });

  it('preserves order of input IDs', () => {
    const result = getArchetypeSubset(['mobile-first', 'happy-path']);
    expect(result[0].id).toBe('mobile-first');
    expect(result[1].id).toBe('happy-path');
  });

  it('throws on unknown ID with helpful message', () => {
    expect(() => getArchetypeSubset(['happy-path', 'bogus'])).toThrow('Unknown archetype "bogus"');
    expect(() => getArchetypeSubset(['bogus'])).toThrow('Valid IDs:');
  });
});

describe('PERSONA_BUNDLES', () => {
  it('has correct counts', () => {
    expect(PERSONA_BUNDLES.quick).toHaveLength(3);
    expect(PERSONA_BUNDLES.standard).toHaveLength(5);
    expect(PERSONA_BUNDLES.comprehensive).toHaveLength(8);
    expect(PERSONA_BUNDLES.full).toHaveLength(10);
  });

  it('each bundle is a superset of the previous', () => {
    const quick = new Set(PERSONA_BUNDLES.quick);
    const standard = new Set(PERSONA_BUNDLES.standard);
    const comprehensive = new Set(PERSONA_BUNDLES.comprehensive);
    const full = new Set(PERSONA_BUNDLES.full);

    for (const id of quick) expect(standard.has(id)).toBe(true);
    for (const id of standard) expect(comprehensive.has(id)).toBe(true);
    for (const id of comprehensive) expect(full.has(id)).toBe(true);
  });

  it('all IDs resolve to valid archetypes', () => {
    const allIds = [
      ...PERSONA_BUNDLES.quick,
      ...PERSONA_BUNDLES.standard,
      ...PERSONA_BUNDLES.comprehensive,
      ...PERSONA_BUNDLES.full,
    ];
    const validIds = new Set(ARCHETYPES.map((a) => a.id));
    for (const id of allIds) {
      expect(validIds.has(id)).toBe(true);
    }
  });
});
