import { PersonaArchetype } from '../types';
import { ARCHETYPES } from './archetypes';

export { ARCHETYPES } from './archetypes';

/** Get all 10 archetypes */
export function getArchetypes(): PersonaArchetype[] {
  return ARCHETYPES;
}

/** Get a single archetype by ID, or undefined if not found */
export function getArchetypeById(id: string): PersonaArchetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}

/** Get a subset of archetypes by IDs. Throws if any ID is not found. */
export function getArchetypeSubset(ids: string[]): PersonaArchetype[] {
  return ids.map((id) => {
    const archetype = getArchetypeById(id);
    if (!archetype) {
      const valid = ARCHETYPES.map((a) => a.id).join(', ');
      throw new Error(`Unknown archetype "${id}". Valid IDs: ${valid}`);
    }
    return archetype;
  });
}

/** Preset bundles for the init wizard */
export const PERSONA_BUNDLES = {
  quick: ['happy-path', 'mobile-first', 'accessibility'],
  standard: ['happy-path', 'mobile-first', 'accessibility', 'speed-runner', 'novice'],
  comprehensive: [
    'happy-path',
    'mobile-first',
    'accessibility',
    'speed-runner',
    'novice',
    'cautious-explorer',
    'power-user',
    'skeptic',
  ],
  full: ARCHETYPES.map((a) => a.id),
} as const;
