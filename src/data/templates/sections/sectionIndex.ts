// The section catalogue: the metadata menus list at once, and the builders loaded
// only when a section is inserted. ADR 0064 PS18: this is a code catalogue read
// directly; it is never a seed page, never cached and never POSTed.

import type { Block } from '@/entities/block';

export interface SectionMeta {
  id: string;
  label: string;
  description: string;
  icon: string;
  aliases: string[];
}

export const SECTIONS: readonly SectionMeta[] = [
  { id: 'nav', label: 'Navigation bar', description: 'Site name, links and one action', icon: '🧭', aliases: ['nav', 'menu', 'header bar'] },
  { id: 'hero', label: 'Hero', description: 'Headline, lead, two actions and a picture', icon: '✨', aliases: ['hero', 'banner', 'intro'] },
  { id: 'page-header', label: 'Page header', description: 'Eyebrow, title and summary', icon: '🔖', aliases: ['title', 'header'] },
  { id: 'feature-grid', label: 'Feature grid', description: 'Features as cards in a grid', icon: '🧩', aliases: ['features', 'cards', 'grid'] },
  { id: 'bento', label: 'Bento grid', description: 'One large tile beside small ones', icon: '🍱', aliases: ['bento', 'tiles', 'highlights'] },
  { id: 'logo-cloud', label: 'Logo cloud', description: 'A row of logos', icon: '🏷️', aliases: ['logos', 'clients', 'partners'] },
  { id: 'testimonials', label: 'Testimonials', description: 'Quotes with names and roles', icon: '💬', aliases: ['quotes', 'reviews'] },
  { id: 'stats', label: 'Stats', description: 'Key numbers over their labels', icon: '📈', aliases: ['numbers', 'metrics', 'kpi'] },
  { id: 'cta', label: 'Call to action', description: 'One clear ask on its own band', icon: '📣', aliases: ['cta', 'action'] },
  { id: 'pricing', label: 'Pricing', description: 'Plans side by side', icon: '💳', aliases: ['plans', 'prices'] },
  { id: 'faq', label: 'FAQ', description: 'Questions with folded answers', icon: '❓', aliases: ['questions', 'faq'] },
  { id: 'team', label: 'Team', description: 'Portraits, names and roles', icon: '👥', aliases: ['people', 'members'] },
  { id: 'contact', label: 'Contact', description: 'Ways to reach you and an action', icon: '✉️', aliases: ['contact', 'email', 'reach'] },
  { id: 'newsletter', label: 'Newsletter', description: 'A sign-up band', icon: '📰', aliases: ['subscribe', 'signup'] },
  { id: 'post-list', label: 'Post list', description: 'Recent posts as cards', icon: '🗞️', aliases: ['blog', 'posts', 'articles'] },
  { id: 'content', label: 'Content', description: 'A long-form body to write in', icon: '📝', aliases: ['article', 'body', 'text'] },
  { id: 'gallery', label: 'Gallery', description: 'A grid of pictures with captions', icon: '🖼️', aliases: ['images', 'photos', 'pictures'] },
  { id: 'timeline', label: 'Timeline', description: 'Steps or milestones in order', icon: '🗓️', aliases: ['process', 'steps', 'history'] },
  { id: 'comparison', label: 'Comparison', description: 'Two options point by point', icon: '⚖️', aliases: ['compare', 'versus', 'vs'] },
  { id: 'footer', label: 'Footer', description: 'Link groups and the small print', icon: '🔚', aliases: ['footer', 'bottom'] },
];

// The "/" menu's page shells: empty full-page layouts of named regions, never
// part of SECTIONS (the section catalogue stays exactly the twenty sections).
export const PAGE_SHELLS: readonly SectionMeta[] = [
  { id: 'shell-two-sidebars', label: 'Two sidebars', description: 'A header, two sticky sidebars, a main column and a footer', icon: '🧱', aliases: ['layout', 'shell', 'sidebar', 'page'] },
  { id: 'shell-left-sidebar', label: 'Left sidebar', description: 'A header, a sticky sidebar on the left, a main column and a footer', icon: '🗂️', aliases: ['layout', 'shell', 'sidebar', 'page'] },
  { id: 'shell-right-sidebar', label: 'Right sidebar', description: 'A header, a main column, a sticky sidebar on the right and a footer', icon: '🗃️', aliases: ['layout', 'shell', 'sidebar', 'page'] },
  { id: 'shell-header-footer', label: 'Header and footer', description: 'A header, one wide main column and a footer', icon: '📄', aliases: ['layout', 'shell', 'page'] },
];

/** The blocks of one section or page shell, fresh on every call; null for an unknown id. */
export async function buildSection(id: string): Promise<Block[] | null> {
  const { SECTION_BUILDERS, SHELL_BUILDERS } = await import('./sectionBuilders');
  return SECTION_BUILDERS[id]?.() ?? SHELL_BUILDERS[id]?.() ?? null;
}
