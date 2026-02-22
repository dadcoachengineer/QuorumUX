import type { QuorumConfig } from '../../src/types';

/**
 * MomentumEQ — Quorum Configuration
 *
 * Values-driven career development platform.
 * React 18 + TypeScript + Vite, Supabase, Vercel.
 */
const config: QuorumConfig = {
  name: 'MomentumEQ',
  description: 'A values-driven career development platform that helps users discover their core values through AI conversation, then set goals and build habits aligned with those values. Includes an AI coach for ongoing guidance.',
  domain: 'career-tech',
  appUrl: 'https://momentumeq.app',
  userJourney: 'Login → Value Discovery (AI chat) → Save Values → Create Goals (3E Framework) → Create Habits → Daily Check-ins → AI Coach interactions',
  artifactsDir: './test-artifacts',

  models: {
    screenshot: [
      { id: 'anthropic/claude-sonnet-4.6', name: 'claude' },
      { id: 'google/gemini-2.0-flash-001', name: 'gemini' },
      { id: 'openai/gpt-4o-2024-11-20', name: 'gpt4o' },
    ],
    video: { id: 'google/gemini-2.0-flash-001', name: 'gemini' },
    synthesis: { id: 'anthropic/claude-opus-4.5', name: 'opus' },
  },

  video: {
    maxSizeMB: 20,
    frameRate: 1,
  },

  analysisContext: `Key product concepts:
- Values Assessment: Users discover 5 core values via AI conversation (Schwartz Values Theory basis)
- 3E Framework: Goals categorized as Education, Exposure, or Experience
- FloatingCoachBar: AI coach that appears after onboarding milestones
- Habit streaks: Daily check-in gamification with streak protection
- Enhanced coaching: Opt-in deeper personalization using conversation history
- Anti-solutioning guard: AI coach should ask questions, not prescribe career advice`,

  synthesisContext: `MomentumEQ launch context:
- Pre-seed stage, 24 beta users
- Monday waitlist launch to Cisco "Growth Mindset" cohort
- Key metrics: 83% weekly active rate, 64% journey completion
- Core differentiator: Values-first approach vs skills-first competitors
- P0 = blocks Monday launch, P1 = fix within first week, P2 = polish within 30 days`,
};

export default config;
