// Shell id → builder. Loaded on demand by loadShell (shellIndex.ts).

import type { Block } from '@/entities/block';
import { blogPostShell, changelogShell, docsShell, linkInBioShell, profileShell, resumeShell } from './personalShells';
import { aboutShell, contactShell, eventShell, landingShell, portfolioShell, pricingShell } from './siteShells';

export const SHELL_BUILDERS: Readonly<Record<string, () => Block[]>> = {
  profile: profileShell,
  landing: landingShell,
  portfolio: portfolioShell,
  docs: docsShell,
  'blog-post': blogPostShell,
  about: aboutShell,
  pricing: pricingShell,
  changelog: changelogShell,
  'link-in-bio': linkInBioShell,
  resume: resumeShell,
  event: eventShell,
  contact: contactShell,
};
