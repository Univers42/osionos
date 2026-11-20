// Shell id → builder. Loaded on demand by the page template catalogue.

import type { Block } from '@/entities/block';
import { agencyShell, careersShell, caseStudyShell, servicesShell, teamShell } from './businessShells';
import { blogIndexShell, courseShell, docsHomeShell, faqShell, knowledgeBaseShell } from './knowledgeShells';
import { appLandingShell, comingSoonShell, newsletterShell, productLaunchShell, webinarShell } from './launchShells';
import { blogPostShell, changelogShell, docsShell, linkInBioShell, profileShell, resumeShell } from './personalShells';
import { aboutShell, contactShell, eventShell, landingShell, portfolioShell, pricingShell } from './siteShells';
import { catalogueShell, galleryShell, productShell, recipeShell, restaurantShell } from './storeShells';
import { dashboardShell, meetingNotesShell, notFoundShell, personalHomeShell, roadmapShell } from './workspaceShells';

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
  'product-launch': productLaunchShell,
  'app-landing': appLandingShell,
  team: teamShell,
  services: servicesShell,
  agency: agencyShell,
  'case-study': caseStudyShell,
  'blog-index': blogIndexShell,
  'docs-home': docsHomeShell,
  'knowledge-base': knowledgeBaseShell,
  faq: faqShell,
  'personal-home': personalHomeShell,
  webinar: webinarShell,
  course: courseShell,
  newsletter: newsletterShell,
  product: productShell,
  catalogue: catalogueShell,
  restaurant: restaurantShell,
  recipe: recipeShell,
  gallery: galleryShell,
  dashboard: dashboardShell,
  roadmap: roadmapShell,
  'meeting-notes': meetingNotesShell,
  careers: careersShell,
  'coming-soon': comingSoonShell,
  'not-found': notFoundShell,
};
