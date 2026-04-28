// Markdown parser — inline formatting utilities
import type { InlineNode } from './ast';

export function handleNewline(nodes: InlineNode[], text: string, pos: number): void {
  const lastNode = nodes.at(-1);
  if (lastNode?.type === 'text' && lastNode.value.endsWith('  ')) {
    lastNode.value = lastNode.value.slice(0, -2);
    nodes.push({ type: 'line_break' });
  } else if (pos > 0 && text[pos - 1] === '\\') {
    if (lastNode?.type === 'text') {
      lastNode.value = lastNode.value.slice(0, -1);
    }
    nodes.push({ type: 'line_break' });
  } else {
    nodes.push({ type: 'text', value: ' ' });
  }
}

export function appendChar(nodes: InlineNode[], ch: string): void {
  const lastNode = nodes.at(-1);
  if (lastNode?.type === 'text') {
    lastNode.value += ch;
  } else {
    nodes.push({ type: 'text', value: ch });
  }
}

export function findClosingBracket(text: string, openPos: number): number {
  let depth = 0;
  for (let i = openPos; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .trim();
}
