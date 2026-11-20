// Section id → builder. Loaded on demand by buildSection (sectionIndex.ts), so the
// sample copy stays out of the boot bundle.

import type { Block } from '@/entities/block';
import { contentSection, gallerySection, postListSection, timelineSection } from './contentSections';
import { bentoSection, comparisonSection, featureGridSection, logoCloudSection, statsSection } from './featureSections';
import { footerSection, heroSection, navSection, pageHeaderSection } from './frameSections';
import { ctaSection, faqSection, pricingSection } from './offerSections';
import { contactSection, newsletterSection, teamSection, testimonialsSection } from './peopleSections';
import { headerFooterShell, leftSidebarShell, rightSidebarShell, twoSidebarsShell } from './shellSections';

export const SECTION_BUILDERS: Readonly<Record<string, () => Block[]>> = {
  nav: navSection,
  hero: heroSection,
  'page-header': pageHeaderSection,
  'feature-grid': featureGridSection,
  bento: bentoSection,
  'logo-cloud': logoCloudSection,
  testimonials: testimonialsSection,
  stats: statsSection,
  cta: ctaSection,
  pricing: pricingSection,
  faq: faqSection,
  team: teamSection,
  contact: contactSection,
  newsletter: newsletterSection,
  'post-list': postListSection,
  content: contentSection,
  gallery: gallerySection,
  timeline: timelineSection,
  comparison: comparisonSection,
  footer: footerSection,
};

// The "/" page shells: full-page layouts of region cells, not sections — kept
// in their own record (listed as PAGE_SHELLS) so SECTION_BUILDERS stays exactly
// the section catalogue the tests pin down.
export const SHELL_BUILDERS: Readonly<Record<string, () => Block[]>> = {
  'shell-two-sidebars': twoSidebarsShell,
  'shell-left-sidebar': leftSidebarShell,
  'shell-right-sidebar': rightSidebarShell,
  'shell-header-footer': headerFooterShell,
};
