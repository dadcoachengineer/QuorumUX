import { PersonaArchetype } from '../types.js';

/**
 * 10 Universal Persona Archetypes for UX Testing
 *
 * Derived from real-world testing patterns, abstracted into behavioral templates
 * that work across any web application.
 */
export const ARCHETYPES: PersonaArchetype[] = [
  {
    id: 'happy-path',
    name: 'Happy Path Hero',
    description: 'Follows the ideal journey, completes every step correctly.',
    device: 'desktop',
    viewport: { width: 1440, height: 900 },
    behaviorNotes:
      'This persona does everything right — fills forms correctly, reads instructions, clicks the right buttons in order. Use this as the baseline. Any issues found here are fundamental UX problems because even an ideal user encounters them. Pay attention to: whether the happy path actually works end-to-end, clarity of success states, and whether the flow feels rewarding.',
  },
  {
    id: 'speed-runner',
    name: 'Speed Runner',
    description: 'Rushes through everything, skips optional content, wants the fastest path.',
    device: 'desktop',
    viewport: { width: 1440, height: 900 },
    behaviorNotes:
      'This persona rushes through flows with minimal reading. They skip optional fields, ignore tooltips, dismiss modals quickly, and want the fastest path to completion. Pay attention to: whether skippable content causes confusion downstream, whether CTAs are prominent enough for scanning users, whether error recovery is fast when they inevitably miss something, and whether required vs optional fields are clearly distinguished.',
  },
  {
    id: 'cautious-explorer',
    name: 'Cautious Explorer',
    description: 'Reads everything, hesitates before committing, needs reassurance.',
    device: 'desktop',
    viewport: { width: 1440, height: 900 },
    behaviorNotes:
      'This persona reads every word, hovers over elements to understand them, and hesitates before irreversible actions. They look for confirmation dialogs, undo options, and "learn more" links. Pay attention to: whether destructive actions have confirmation steps, whether the UI provides enough context for informed decisions, whether progress is clearly saved, and whether there are trust signals (security badges, privacy notes) at key conversion points.',
  },
  {
    id: 'mobile-first',
    name: 'Mobile-First User',
    description: 'Uses the app on a phone — touch interactions, small viewport, on-the-go.',
    device: 'mobile',
    viewport: { width: 390, height: 844 },
    behaviorNotes:
      'This persona uses a mobile device with touch interactions. They have fat fingers, scroll-heavy behavior, and are likely multitasking. Pay attention to: touch target sizes (minimum 44x44px), horizontal overflow or content bleeding off-screen, keyboard covering form fields, scroll performance, text readability without zooming, and whether mobile-specific patterns (swipe, pull-to-refresh) are supported where expected.',
  },
  {
    id: 'accessibility',
    name: 'Accessibility User',
    description: 'Relies on screen reader and keyboard navigation.',
    device: 'desktop',
    viewport: { width: 1440, height: 900 },
    behaviorNotes:
      'This persona uses assistive technology — screen reader and keyboard-only navigation. Pay attention to: logical tab order, focus indicators on all interactive elements, ARIA labels on icons and images, form label associations, skip navigation links, color contrast ratios (4.5:1 minimum), whether information is conveyed through color alone, alt text on images, and whether dynamic content changes are announced.',
    accessibilityNeeds: ['screen-reader', 'keyboard-navigation', 'high-contrast'],
  },
  {
    id: 'distracted',
    name: 'Distracted Multitasker',
    description: 'Switches tabs, pauses mid-flow, returns after interruptions.',
    device: 'desktop',
    viewport: { width: 1440, height: 900 },
    behaviorNotes:
      'This persona has fragmented attention — they switch tabs, get interrupted, and return to the app after minutes or hours. Pay attention to: whether form state is preserved on tab switch, session timeout handling, whether the user can easily resume where they left off, auto-save behavior, and whether progress indicators help reorient after interruption.',
  },
  {
    id: 'novice',
    name: 'Error-Prone Novice',
    description: 'Makes mistakes, enters wrong inputs, gets confused by jargon.',
    device: 'desktop',
    viewport: { width: 1440, height: 900 },
    behaviorNotes:
      'This persona has low tech literacy and makes frequent mistakes — wrong input formats, clicking the wrong buttons, not understanding technical terms. Pay attention to: error message clarity (do they tell the user what to do?), input validation helpfulness (inline vs after submit), jargon-free language, recovery paths from error states, and whether the UI prevents errors in the first place (input masks, dropdowns vs free text).',
  },
  {
    id: 'power-user',
    name: 'Power User',
    description: 'Expects keyboard shortcuts, advanced features, and efficiency tools.',
    device: 'desktop',
    viewport: { width: 1440, height: 900 },
    behaviorNotes:
      'This persona is an expert who expects efficiency features — keyboard shortcuts, bulk operations, advanced filters, and customization. Pay attention to: whether keyboard shortcuts exist and are discoverable, whether power-user workflows (bulk select, batch actions) are supported, whether advanced settings are accessible without cluttering the UI for novices, and whether the app respects system preferences (dark mode, reduced motion).',
  },
  {
    id: 'skeptic',
    name: 'Skeptical Evaluator',
    description: 'Tests edge cases, compares to competitors, looks for flaws.',
    device: 'desktop',
    viewport: { width: 1440, height: 900 },
    behaviorNotes:
      'This persona is evaluating the product critically — they test boundary conditions, look for inconsistencies, and compare to competitors. Pay attention to: empty states (what happens with no data?), boundary values (very long text, special characters, zero items), consistency of design patterns across screens, whether error states are handled gracefully, and whether the product meets industry-standard expectations.',
  },
  {
    id: 'international',
    name: 'International User',
    description: 'Non-English primary language, different locale expectations.',
    device: 'desktop',
    viewport: { width: 1440, height: 900 },
    behaviorNotes:
      'This persona has a non-English primary language and different cultural expectations for UI patterns. Pay attention to: text truncation with longer translations, right-to-left layout support if applicable, date/time/number format localization, currency display, whether UI copy is free of culturally-specific idioms, and whether text in images is translatable. Also check for hardcoded strings vs i18n-ready architecture.',
  },
];
