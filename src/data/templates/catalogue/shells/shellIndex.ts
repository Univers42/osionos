// These are the page templates' metadata: whole-page starting points made of sections.
// The metadata is listed at once; the blocks load on demand. ADR 0064 PS18: a code catalogue read
// directly, never a seed page, never cached and never POSTed. ADR 0065 CV15: no
// shell carries a cover or a cover-layout field.

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
  { id: 'changelog', title: 'Changelog', icon: '🧾', description: 'Releases and what changed, newest first' },
  { id: 'link-in-bio', title: 'Link in bio', icon: '🔗', description: 'One page for all of your links' },
  { id: 'resume', title: 'Resume / CV', icon: '📄', description: 'Experience, education and skills' },
  { id: 'event', title: 'Event', icon: '🎟️', description: 'When, where, the schedule and the speakers' },
  { id: 'contact', title: 'Contact', icon: '✉️', description: 'Ways to reach you and common questions' },
  { id: 'product-launch', title: 'Product launch', icon: '🛰️', description: 'Announce something new and gather early sign-ups' },
  { id: 'app-landing', title: 'App landing', icon: '📱', description: 'An app with store buttons, features and reviews' },
  { id: 'team', title: 'Team', icon: '👥', description: 'The people, what they value and how to join' },
  { id: 'services', title: 'Services', icon: '🛠️', description: 'What you can be hired for and how you work' },
  { id: 'agency', title: 'Agency', icon: '🏢', description: 'Services, selected work, the team and clients' },
  { id: 'case-study', title: 'Case study', icon: '📊', description: 'A project told as challenge, approach and result' },
  { id: 'blog-index', title: 'Blog index', icon: '🗞️', description: 'A featured post, the latest posts and a sign-up' },
  { id: 'docs-home', title: 'Docs / wiki home', icon: '📚', description: 'Topics, popular pages and recent changes' },
  { id: 'knowledge-base', title: 'Knowledge base', icon: '🛟', description: 'Help topics, popular articles and support' },
  { id: 'faq', title: 'FAQ', icon: '❓', description: 'Questions grouped by topic, answers folded' },
  { id: 'personal-home', title: 'Personal home', icon: '🏠', description: 'Your day, your links, goals and reading list' },
  { id: 'webinar', title: 'Webinar', icon: '🎥', description: 'A live session: when, what it covers, who speaks' },
  { id: 'course', title: 'Course', icon: '🎓', description: 'What learners get, the curriculum and the teacher' },
  { id: 'newsletter', title: 'Newsletter', icon: '📨', description: 'Why subscribe, what readers say and past issues' },
  { id: 'product', title: 'Product', icon: '🛍️', description: 'One product: photos, price, details and reviews' },
  { id: 'catalogue', title: 'Catalogue', icon: '🗂️', description: 'Products in a grid, filtered by category' },
  { id: 'restaurant', title: 'Restaurant', icon: '🍽️', description: 'The menu, pictures, reviews and opening hours' },
  { id: 'recipe', title: 'Recipe', icon: '🥘', description: 'Ingredients to tick off and the method step by step' },
  { id: 'gallery', title: 'Gallery', icon: '🖼️', description: 'Pictures in a grid with highlights and captions' },
  { id: 'dashboard', title: 'Dashboard', icon: '📈', description: 'Key numbers, projects and what needs a decision' },
  { id: 'roadmap', title: 'Roadmap', icon: '🗺️', description: 'Now, next and later, and what already shipped' },
  { id: 'meeting-notes', title: 'Meeting notes', icon: '🗒️', description: 'Agenda, notes, decisions and action items' },
  { id: 'careers', title: 'Careers', icon: '💼', description: 'Why join, the benefits and the open roles' },
  { id: 'coming-soon', title: 'Coming soon', icon: '⏳', description: 'A teaser with a countdown and a sign-up' },
  { id: 'not-found', title: '404 page', icon: '🧭', description: 'A friendly dead end with ways back' },
];
