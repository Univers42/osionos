// React renderer — AST to React elements
import React from 'react';
import type { BlockNode } from '../ast';
import { parse } from '../parser';
import { renderTable, renderInlines } from './reactHelpers';

/** Extract plain text from inline AST nodes (for stable React keys). */
function extractInlineText(nodes: readonly Record<string, unknown>[]): string {
  return nodes.map(n => {
    if (typeof n.value === 'string') return n.value;
    if (Array.isArray(n.children)) return extractInlineText(n.children as Record<string, unknown>[]);
    if (typeof n.alt === 'string') return n.alt;
    return '';
  }).join('');
}

export interface ReactRenderOptions {
  /** CSS class prefix (default: 'md') */
  classPrefix?: string;
  /** Open external links in new tab (default: true) */
  externalLinks?: boolean;
  /** Custom code block renderer (for syntax highlighting integrations) */
  codeBlockRenderer?: (lang: string, code: string, meta?: string) => React.ReactElement;
  /** Custom math renderer */
  mathRenderer?: (value: string, display: boolean) => React.ReactElement;
  /** Custom image renderer */
  imageRenderer?: (src: string, alt: string, title?: string) => React.ReactElement;
  /** Callback for checkbox toggle in task lists */
  onTaskToggle?: (index: number, checked: boolean) => void;
}

const defaults: Required<Omit<ReactRenderOptions, 'codeBlockRenderer' | 'mathRenderer' | 'imageRenderer' | 'onTaskToggle'>> = {
  classPrefix: 'md',
  externalLinks: true,
};

export function renderReact(
  blocks: BlockNode[],
  opts?: ReactRenderOptions,
): React.ReactElement[] {
  const o = { ...defaults, ...opts };
  return blocks.map((b, i) => renderBlock(b, o, i));
}

/**
 * Convenience component: parses markdown and renders it.
 */
export function MarkdownView({
  markdown,
  blocks,
  className,
  ...opts
}: { markdown?: string; blocks?: BlockNode[]; className?: string } & ReactRenderOptions) {
  const ast = blocks ?? (markdown ? parse(markdown) : []);
  const elements = renderReact(ast, opts);
  return React.createElement('div', { className: className ?? `${opts.classPrefix ?? 'md'}-content` }, ...elements);
}

let _taskIndex = 0;

function renderBlock(
  node: BlockNode,
  o: ReactRenderOptions & typeof defaults,
  key: number | string,
): React.ReactElement {
  switch (node.type) {
    case 'document':
      return React.createElement(React.Fragment, { key }, ...node.children.map((c, i) => renderBlock(c, o, i)));

    case 'paragraph':
      return React.createElement('p', { key }, ...renderInlines(node.children, o));

    case 'heading': {
      const tag = `h${node.level}`;
      return React.createElement(tag, { key, id: node.id || undefined }, ...renderInlines(node.children, o));
    }

    case 'blockquote':
      return React.createElement('blockquote', { key }, ...node.children.map((c, i) => renderBlock(c, o, i)));

    case 'code_block': {
      if (o.codeBlockRenderer && node.lang) {
        return React.createElement(React.Fragment, { key }, o.codeBlockRenderer(node.lang, node.value, node.meta));
      }
      const code = React.createElement('code', {
        className: node.lang ? `language-${node.lang}` : undefined,
      }, node.value);
      return React.createElement('pre', { key, 'data-meta': node.meta || undefined }, code);
    }

    case 'unordered_list': {
      const ulItems = node.children.map((item, idx) => ({ item, key: `li-${idx}` }));
      return React.createElement('ul', { key },
        ...ulItems.map(({ item, key: liKey }) =>
          React.createElement('li', { key: liKey }, ...item.children.map((b, j) => renderBlock(b, o, j)))
        )
      );
    }

    case 'ordered_list': {
      const olItems = node.children.map((item, idx) => ({ item, key: `li-${idx}` }));
      return React.createElement('ol', { key, start: node.start === 1 ? undefined : node.start },
        ...olItems.map(({ item, key: liKey }) =>
          React.createElement('li', { key: liKey }, ...item.children.map((b, j) => renderBlock(b, o, j)))
        )
      );
    }

    case 'task_list': {
      _taskIndex = 0;
      const taskItems = node.children.map((item, idx) => ({ item, key: `task-${idx}` }));
      return React.createElement('ul', { key, className: `${o.classPrefix}-task-list` },
        ...taskItems.map(({ item, key: taskKey }) => {
          const idx = _taskIndex++;
          const checkbox = React.createElement('input', {
            type: 'checkbox',
            checked: item.checked,
            onChange: o.onTaskToggle ? () => o.onTaskToggle?.(idx, !item.checked) : undefined,
            readOnly: !o.onTaskToggle,
            className: `${o.classPrefix}-task-checkbox`,
          });
          return React.createElement('li', { key: taskKey, className: `${o.classPrefix}-task-item` },
            checkbox,
            ...item.children.map((b, j) => renderBlock(b, o, j))
          );
        })
      );
    }

    case 'thematic_break':
      return React.createElement('hr', { key });

    case 'table':
      return renderTable(node, o, key);

    case 'callout': {
      const cls = `${o.classPrefix}-callout ${o.classPrefix}-callout-${node.kind}`;
      const title = node.title.length
        ? React.createElement('div', { className: `${o.classPrefix}-callout-title`, key: 'title' }, ...renderInlines(node.title, o))
        : null;
      const body = node.children.map((c, i) => renderBlock(c, o, i));
      return React.createElement('div', { key, className: cls }, title, ...body);
    }

    case 'math_block': {
      if (o.mathRenderer) {
        return React.createElement(React.Fragment, { key }, o.mathRenderer(node.value, true));
      }
      return React.createElement('div', { key, className: `${o.classPrefix}-math-block` }, node.value);
    }

    case 'html_block':
      return React.createElement('div', { key, dangerouslySetInnerHTML: { __html: node.value } });

    case 'footnote_def': {
      return React.createElement('div', { key, id: `fn-${node.label}`, className: `${o.classPrefix}-footnote` },
        React.createElement('sup', null, node.label),
        ...node.children.map((c, i) => renderBlock(c, o, i))
      );
    }

    case 'definition_list':
      return React.createElement('dl', { key },
        ...node.items.flatMap((item) => {
          const termKey = extractInlineText(item.term) || crypto.randomUUID();
          return [
            React.createElement('dt', { key: `dt-${termKey}` }, ...renderInlines(item.term, o)),
            ...item.definitions.map((def, j) =>
              React.createElement('dd', { key: `dd-${termKey}-${j}` }, ...renderInlines(def, o))
            ),
          ];
        })
      );

    case 'toggle': {
      const toggleChildren = node.children.map((c, idx) => ({ c, key: `t-${idx}` }));
      return React.createElement('details', { key },
        React.createElement('summary', null, ...renderInlines(node.summary, o)),
        ...toggleChildren.map(({ c, key: k }) => renderBlock(c, o, k))
      );
    }

    default:
      return React.createElement(React.Fragment, { key });
  }
}
