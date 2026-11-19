// The shell catalogue: whole-page starting points made of sections. The metadata is
// listed at once; the blocks load on demand. ADR 0064 PS18: a code catalogue read
// directly, never a seed page, never cached and never POSTed. ADR 0065 CV15: no
// shell carries a cover or a cover-layout field.

import type { Block } from '@/entities/block';

export interface ShellMeta {
  id: string;
  title: string;
  icon: string;
  description: string;
}

export const SHELLS: readonly ShellMeta[] = [
  { id: 'profile', title: 'Profile', icon: '🙂', description: 'You, your work and how to reach you' },
  { id: 'landing', title: 'Landing page', icon: '🚀', description: 'Hero, features, proof, pricing and a call to action' },
  { id: 'portfolio', title: 'Portfolio', icon: '🎨', description: 'Your work in a gallery, with kind words' },
  { id: 'docs', title: 'Docs page', icon: '📘', description: 'A guide with an example and next steps' },
  { id: 'blog-post', title: 'Blog post', icon: '✍️', description: 'An article with its author and what to read next' },
  { id: 'about', title: 'About', icon: '🏛️', description: 'The story, the numbers and the team' },
  { id: 'pricing', title: 'Pricing', icon: '💳', description: 'Plans, a comparison and answers' },
  { id: 'changelog', title: 'Changelog', icon: '🧾', description: 'Releases, newest first' },
  { id: 'link-in-bio', title: 'Link in bio', icon: '🔗', description: 'One page of your links' },
  { id: 'resume', title: 'Resume / CV', icon: '📄', description: 'Experience, education and skills' },
  { id: 'event', title: 'Event', icon: '🎟️', description: 'When, where, the schedule and the speakers' },
  { id: 'contact', title: 'Contact', icon: '✉️', description: 'Ways to reach you and common questions' },
];

/** The blocks of one shell, fresh on every call; null for an unknown id. */
export async function loadShell(id: string): Promise<Block[] | null> {
  const { SHELL_BUILDERS } = await import('./shellBuilders');
  return SHELL_BUILDERS[id]?.() ?? null;
}
