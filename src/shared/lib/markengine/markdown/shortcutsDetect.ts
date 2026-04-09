// Markdown shortcuts — block detection and shortcut map
import type { BlockType } from '@/entities/block';

export interface BlockDetection {
  type: BlockType;
  content: string;
  remainingContent: string;
  checked?: boolean;
}

export const BLOCK_SHORTCUTS: Record<string, string> = {
  heading_1: '# ',
  heading_2: '## ',
  heading_3: '### ',
  heading_4: '#### ',
  heading_5: '##### ',
  heading_6: '###### ',
  bulleted_list: '- ',
  numbered_list: '1. ',
  to_do: '[] ',
  quote: '" ',
  toggle: '> ',
  code: '```',
  divider: '---',
};

function ltrim(s: string): string {
  let i = 0;
  while (i < s.length && s[i] === ' ') i++;
  return s.substring(i);
}

function stripPrefix(s: string, n: number): string {
  let i = n;
  while (i < s.length && s[i] === ' ') i++;
  return s.substring(i);
}

function isRepeated(s: string, c: string): boolean {
  if (s.length === 0) return false;
  for (const ch of s) {
    if (ch !== c) return false;
  }
  return true;
}

function isOrdered(s: string): { num: number; rest: string } | null {
  let i = 0;
  while (i < s.length && s[i] >= '0' && s[i] <= '9') i++;
  if (i === 0 || i >= s.length) return null;
  if (s[i] !== '.') return null;
  const num = Number.parseInt(s.substring(0, i), 10);
  const rest = stripPrefix(s, i + 1);
  return { num, rest };
}

interface HeadingDef {
  prefix: string;
  type: BlockType;
  len: number;
}

const HEADING_DEFS: HeadingDef[] = [
  { prefix: '###### ', type: 'heading_6', len: 7 },
  { prefix: '##### ', type: 'heading_5', len: 6 },
  { prefix: '#### ', type: 'heading_4', len: 5 },
  { prefix: '### ', type: 'heading_3', len: 4 },
  { prefix: '## ', type: 'heading_2', len: 3 },
  { prefix: '# ', type: 'heading_1', len: 2 },
];

function detectHeading(line: string): BlockDetection | null {
  for (const h of HEADING_DEFS) {
    if (line.startsWith(h.prefix)) {
      const c = stripPrefix(line, h.len);
      return { type: h.type, content: c, remainingContent: c };
    }
  }
  return null;
}

function detectToDo(line: string): BlockDetection | null {
  if (line.startsWith('[] ') || line.startsWith('[ ] ')) {
    const prefixLen = line.startsWith('[] ') ? 3 : 4;
    const c = stripPrefix(line, prefixLen);
    return { type: 'to_do', content: c, remainingContent: c, checked: false };
  }
  if (line.startsWith('[x] ') || line.startsWith('[X] ')) {
    const c = stripPrefix(line, 4);
    return { type: 'to_do', content: c, remainingContent: c, checked: true };
  }
  return null;
}

/**
 * Detect block type from a single line of text.
 * Used by the block editor to auto-convert markdown shortcuts.
 */
export function detectBlockType(text: string): BlockDetection | null {
  const line = ltrim(text);

  if (line.length >= 3 && isRepeated(line, '-')) {
    return { type: 'divider', content: '', remainingContent: '' };
  }
  if (line === '```' || line.startsWith('```')) {
    return { type: 'code', content: '', remainingContent: '' };
  }

  const heading = detectHeading(line);
  if (heading) return heading;

  const todo = detectToDo(line);
  if (todo) return todo;

  if (line.startsWith('" ')) { const c = stripPrefix(line, 2); return { type: 'quote', content: c, remainingContent: c }; }
  if (line.startsWith('> ') && !line.startsWith('>![')) {
    const c = stripPrefix(line, 2);
    return { type: 'quote', content: c, remainingContent: c };
  }
  if (line.startsWith('- ')) { const c = stripPrefix(line, 2); return { type: 'bulleted_list', content: c, remainingContent: c }; }

  const orderedResult = isOrdered(line);
  if (orderedResult) return { type: 'numbered_list', content: orderedResult.rest, remainingContent: orderedResult.rest };

  if (line.startsWith('>![')) {
    const close = line.indexOf(']', 3);
    if (close !== -1) {
      const c = stripPrefix(line, close + 1);
      return { type: 'callout', content: c, remainingContent: c };
    }
  }

  return null;
}

/**
 * Parse inline markdown formatting and return HTML string.
 * Used by EditableContent for rendering inline styles in contentEditable blocks.
 *
 * Uses the full AST-based parser internally for accurate rendering.
 */
