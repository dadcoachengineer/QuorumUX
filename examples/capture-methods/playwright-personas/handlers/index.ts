import type { HandlerFn } from '../helpers/types.js';

// Import all handlers
import { navigateUrl, navigateTab } from './navigate.js';
import { login, logout } from './auth.js';
import { valueDiscoveryAI, quickAssessment, saveValues } from './value-discovery.js';
import { createGoal } from './goals.js';
import { createHabit, checkHabits } from './habits.js';
import { coachBarCheck, coachPanel, coachConversation } from './coach.js';
import { settingsCheck, networkPageCheck, pageContentAssert, enhancedCoachingOptIn, legalPageCheck } from './pages.js';
import { mobileViewportCheck, switchToMobile, tapCountAssert } from './mobile.js';
import { keyboardNavigation } from './accessibility.js';
import { adversarialInput, doubleClickGuard, protectedRouteCheck } from './adversarial.js';

// ─── Handler Registry ──────────────────────────────────────────────────────

export const handlers: Record<string, HandlerFn> = {
  // Navigation
  'navigate-url': navigateUrl,
  'navigate-tab': navigateTab,

  // Auth
  'login': login,
  'logout': logout,

  // Value Discovery
  'value-discovery-ai': valueDiscoveryAI,
  'quick-assessment': quickAssessment,
  'save-values': saveValues,

  // Goals
  'create-goal': createGoal,

  // Habits
  'create-habit': createHabit,
  'check-habits': checkHabits,

  // Coach
  'coach-bar-check': coachBarCheck,
  'coach-panel': coachPanel,
  'coach-conversation': coachConversation,

  // Pages
  'settings-check': settingsCheck,
  'network-page-check': networkPageCheck,
  'page-content-assert': pageContentAssert,
  'enhanced-coaching-opt-in': enhancedCoachingOptIn,
  'legal-page-check': legalPageCheck,

  // Mobile
  'switch-to-mobile': switchToMobile,
  'mobile-viewport-check': mobileViewportCheck,
  'tap-count-assert': tapCountAssert,

  // Accessibility
  'keyboard-navigation': keyboardNavigation,

  // Adversarial / Security
  'adversarial-input': adversarialInput,
  'double-click-guard': doubleClickGuard,
  'protected-route-check': protectedRouteCheck,
};

export function getHandler(type: string): HandlerFn | undefined {
  return handlers[type];
}
