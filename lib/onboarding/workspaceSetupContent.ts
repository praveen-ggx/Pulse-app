export const WORKSPACE_SETUP_COPY = {
  tag: 'gogopulse',
  headline: 'One workspace for your entire transport business.',
  outcomes: [
    'Plan trips.',
    'Track revenue.',
    'Manage drivers.',
    'Work with customers.',
  ] as const,
  closing: 'Everything stays connected.',
  trust:
    'Trusted by transport companies, fleet owners and logistics teams across every stage of growth.',
  personaTitle: 'Welcome to pulse.',
  personaSubtitle: 'Choose how you want to work.',
  sectionProducts: 'Products',
  sectionWorkspaceAccess: 'Already invited?',
  sectionMoreProducts: 'More products',
  sectionComingSoon: 'Coming soon',
  invitedEyebrow: 'Create a workspace, or start as a driver.',
  signInPrompt: 'Already have an account?',
  signInLink: 'Sign in',
  pulseWebsiteLink: 'pulse.',
} as const;

/** First step inside business signup — sets expectations before phone verification. */
export const WORKSPACE_INTRO_COPY = {
  title: 'Create your workspace',
  subtitle: "We'll ask a few questions.",
  timeLabel: 'Estimated time',
  timeValue: '2 minutes',
  configureTitle: "You'll configure",
  items: ['Company', 'Workspace', 'Owner', 'Preferences'] as const,
  cta: 'Create workspace',
} as const;
