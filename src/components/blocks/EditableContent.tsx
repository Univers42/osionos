/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EditableContent.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:24 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/08 19:04:25 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseInlineMarkdown } from '@/shared/lib/markengine';
import {
  INLINE_COLOR_OPTIONS,
  type InlineColorOption,
  normalizeInlineColorToken,
} from '@/shared/lib/inlineTextStyles';

interface EditableContentProps {
  content: string;
  className?: string;
  placeholder?: string;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onRequestSlashMenu?: (position: { x: number; y: number }) => void;
}

interface SelectionSnapshot {
  start: number;
  end: number;
  rect: DOMRect;
}

type PaletteKind = 'text' | 'background' | null;

function getSelectionRange(root: HTMLElement): Range | null {
  const selection = globalThis.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    return null;
  }

  return range;
}

function getSelectionSnapshot(root: HTMLElement): SelectionSnapshot | null {
  const range = getSelectionRange(root);
  if (!range) {
    return null;
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  const start = startRange.toString().length;
  const end = endRange.toString().length;
  if (start === end) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return { start, end, rect };
}

function setSelectionOffsets(root: HTMLElement, start: number, end: number) {
  const selection = globalThis.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let currentNode: Node | null = walker.nextNode();
  let offset = 0;
  let startNode: Node | null = null;
  let endNode: Node | null = null;
  let startOffset = 0;
  let endOffset = 0;

  while (currentNode) {
    const length = currentNode.textContent?.length ?? 0;
    if (!startNode && start <= offset + length) {
      startNode = currentNode;
      startOffset = Math.max(0, start - offset);
    }
    if (!endNode && end <= offset + length) {
      endNode = currentNode;
      endOffset = Math.max(0, end - offset);
      break;
    }
    offset += length;
    currentNode = walker.nextNode();
  }

  if (!startNode || !endNode) {
    range.selectNodeContents(root);
    range.collapse(false);
  } else {
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function normalizeElementColor(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return normalizeInlineColorToken(value);
}

function isBoldElement(element: HTMLElement) {
  if (element.dataset.inlineType === 'bold') {
    return true;
  }

  if (element.tagName === 'STRONG' || element.tagName === 'B') {
    return true;
  }

  const fontWeight = element.style.fontWeight;
  return fontWeight === 'bold' || Number(fontWeight) >= 600;
}

function isItalicElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === 'italic' ||
    element.tagName === 'EM' ||
    element.tagName === 'I' ||
    element.style.fontStyle === 'italic'
  );
}

function isStrikeElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === 'strikethrough' ||
    element.tagName === 'DEL' ||
    element.tagName === 'S' ||
    element.tagName === 'STRIKE' ||
    element.style.textDecoration.includes('line-through')
  );
}

function isCodeElement(element: HTMLElement) {
  return element.dataset.inlineType === 'code' || element.tagName === 'CODE';
}

function isTextColorElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === 'text_color' ||
    (!!element.style.color && normalizeElementColor(element.style.color) !== null) ||
    (!!element.getAttribute('color') && normalizeElementColor(element.getAttribute('color')) !== null)
  );
}

function isBackgroundColorElement(element: HTMLElement) {
  return (
    element.dataset.inlineType === 'background_color' ||
    (!!element.style.backgroundColor &&
      normalizeElementColor(element.style.backgroundColor) !== null)
  );
}

function serializeEditableNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const children = Array.from(element.childNodes)
    .map(serializeEditableNode)
    .join('');

  switch (element.tagName) {
    case 'BR':
      return '\n';
    case 'DIV':
    case 'P':
      return children;
    default:
      break;
  }

  if (isCodeElement(element)) {
    return `\`${children}\``;
  }

  if (element.tagName === 'A' && element.getAttribute('href')) {
    return `[${children}](${element.getAttribute('href') ?? ''})`;
  }

  if (isBoldElement(element)) {
    return `**${children}**`;
  }

  if (isItalicElement(element)) {
    return `*${children}*`;
  }

  if (isStrikeElement(element)) {
    return `~~${children}~~`;
  }

  if (element.tagName === 'U') {
    return `__${children}__`;
  }

  if (element.tagName === 'MARK') {
    return `==${children}==`;
  }

  if (isTextColorElement(element)) {
    const color =
      normalizeElementColor(element.dataset.inlineColor) ??
      normalizeElementColor(element.style.color) ??
      normalizeElementColor(element.getAttribute('color'));
    return color ? `[color=${color}]${children}[/color]` : children;
  }

  if (isBackgroundColorElement(element)) {
    const color =
      normalizeElementColor(element.dataset.inlineColor) ??
      normalizeElementColor(element.style.backgroundColor);
    return color ? `[bg=${color}]${children}[/bg]` : children;
  }

  return children;
}

function serializeEditableContent(root: HTMLElement) {
  return Array.from(root.childNodes)
    .map(serializeEditableNode)
    .join('');
}

function selectCurrentRange(range: Range) {
  const selection = globalThis.getSelection();
  if (!selection) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function unwrapElement(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  parent.removeChild(element);
}

function getClosestFormatElement(
  node: Node,
  root: HTMLElement,
  predicate: (element: HTMLElement) => boolean,
) {
  let current: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;

  while (current && current !== root) {
    if (predicate(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function getSharedFormatElement(
  range: Range,
  root: HTMLElement,
  predicate: (element: HTMLElement) => boolean,
) {
  const startMatch = getClosestFormatElement(range.startContainer, root, predicate);
  if (startMatch && startMatch.contains(range.endContainer)) {
    return startMatch;
  }

  const endMatch = getClosestFormatElement(range.endContainer, root, predicate);
  if (endMatch && endMatch.contains(range.startContainer)) {
    return endMatch;
  }

  return null;
}

function createCodeElement() {
  const code = document.createElement('code');
  code.dataset.inlineType = 'code';
  code.className = 'inline-code';
  code.style.background = 'var(--color-surface-tertiary-soft2)';
  code.style.border = '1px solid var(--color-line)';
  code.style.borderRadius = '6px';
  code.style.padding = '0 0.35em';
  code.style.fontFamily = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  code.style.fontSize = '0.92em';
  code.style.color = 'var(--color-ink-strong)';
  return code;
}

function createColorElement(kind: 'text' | 'background', option: InlineColorOption) {
  const span = document.createElement('span');
  span.dataset.inlineType = kind === 'text' ? 'text_color' : 'background_color';
  span.dataset.inlineColor = option.id;

  if (kind === 'text') {
    span.style.color = option.textColor;
  } else {
    span.style.backgroundColor = option.backgroundColor;
    span.style.borderRadius = '4px';
    span.style.padding = '0 0.2em';
  }

  return span;
}

function wrapRange(range: Range, wrapper: HTMLElement) {
  const fragment = range.extractContents();
  if (!fragment.textContent?.trim()) {
    return null;
  }

  wrapper.append(fragment);
  range.insertNode(wrapper);
  range.selectNodeContents(wrapper);
  selectCurrentRange(range);
  return wrapper;
}

const TOOLBAR_BUTTON_BASE =
  'grid h-8 min-w-8 place-items-center rounded-md border border-transparent px-2 text-xs font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-ink)]';

const TOOLBAR_ACTIVE_BUTTON =
  'border-[var(--color-line)] bg-[var(--color-surface-secondary)] text-[var(--color-ink)]';

interface InlineSelectionToolbarProps {
  selection: SelectionSnapshot;
  palette: PaletteKind;
  onTogglePalette: (palette: Exclude<PaletteKind, null>) => void;
  onFormatBold: () => void;
  onFormatItalic: () => void;
  onFormatStrike: () => void;
  onFormatCode: () => void;
  onFormatLink: () => void;
  onFormatTextColor: (color: InlineColorOption) => void;
  onFormatBackgroundColor: (color: InlineColorOption) => void;
  onOpenSlashMenu: () => void;
}

const InlineSelectionToolbar: React.FC<InlineSelectionToolbarProps> = ({
  selection,
  palette,
  onTogglePalette,
  onFormatBold,
  onFormatItalic,
  onFormatStrike,
  onFormatCode,
  onFormatLink,
  onFormatTextColor,
  onFormatBackgroundColor,
  onOpenSlashMenu,
}) => (
  <div
    className="fixed z-[10001] -translate-x-1/2"
    style={{
      left: selection.rect.left + selection.rect.width / 2,
      top: Math.max(12, selection.rect.top - 58),
    }}
  >
    <div className="relative rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] px-1.5 py-1 shadow-xl">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Text color"
          className={[
            TOOLBAR_BUTTON_BASE,
            palette === 'text' ? TOOLBAR_ACTIVE_BUTTON : '',
          ].join(' ')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onTogglePalette('text')}
        >
          A
        </button>
        <button
          type="button"
          title="Background color"
          className={[
            TOOLBAR_BUTTON_BASE,
            palette === 'background' ? TOOLBAR_ACTIVE_BUTTON : '',
          ].join(' ')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onTogglePalette('background')}
        >
          ▣
        </button>
        <button
          type="button"
          title="Bold"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormatBold();
          }}
        >
          B
        </button>
        <button
          type="button"
          title="Italic"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormatItalic();
          }}
        >
          I
        </button>
        <button
          type="button"
          title="Strikethrough"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormatStrike();
          }}
        >
          S
        </button>
        <button
          type="button"
          title="Add link"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormatLink();
          }}
        >
          ↗
        </button>
        <button
          type="button"
          title="Inline code"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormatCode();
          }}
        >
          {'</>'}
        </button>
        <button
          type="button"
          title="Open slash menu"
          className={TOOLBAR_BUTTON_BASE}
          onMouseDown={(e) => {
            e.preventDefault();
            onOpenSlashMenu();
          }}
        >
          /
        </button>
      </div>

      {palette && (
        <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-primary)] p-2 shadow-xl">
          <div className="grid grid-cols-3 gap-1.5">
            {INLINE_COLOR_OPTIONS.map((option) => (
              <button
                key={`${palette}-${option.id}`}
                type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)]"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (palette === 'text') {
                    onFormatTextColor(option);
                  } else {
                    onFormatBackgroundColor(option);
                  }
                }}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                  style={{
                    background:
                      palette === 'text'
                        ? option.swatch
                        : option.backgroundColor,
                  }}
                />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
);

export const EditableContent: React.FC<EditableContentProps> = ({
  content,
  className = '',
  placeholder = '',
  onChange,
  onKeyDown,
  onPaste,
  onRequestSlashMenu,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isComposing = useRef(false);
  const isFocused = useRef(false);
  const [selectionSnapshot, setSelectionSnapshot] = useState<SelectionSnapshot | null>(null);
  const [openPalette, setOpenPalette] = useState<PaletteKind>(null);

  const renderContent = useCallback((nextContent: string) => {
    if (!ref.current) {
      return;
    }

    ref.current.innerHTML = nextContent ? parseInlineMarkdown(nextContent) : '';
  }, []);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const serialized = serializeEditableContent(ref.current);
    if (serialized === content) {
      return;
    }

    renderContent(content);
  }, [content, renderContent]);

  const updateSelectionSnapshot = useCallback(() => {
    const root = ref.current;
    if (!root || !isFocused.current) {
      setSelectionSnapshot(null);
      setOpenPalette(null);
      return;
    }

    const snapshot = getSelectionSnapshot(root);
    setSelectionSnapshot(snapshot);
    if (!snapshot) {
      setOpenPalette(null);
    }
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => updateSelectionSnapshot();
    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('resize', handleSelectionChange);
    window.addEventListener('scroll', handleSelectionChange, true);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('resize', handleSelectionChange);
      window.removeEventListener('scroll', handleSelectionChange, true);
    };
  }, [updateSelectionSnapshot]);

  const syncContentFromDom = useCallback(() => {
    if (!ref.current) {
      return;
    }

    onChange(serializeEditableContent(ref.current));
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (isComposing.current) {
      return;
    }

    syncContentFromDom();
  }, [syncContentFromDom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown(e);
      requestAnimationFrame(updateSelectionSnapshot);
    },
    [onKeyDown, updateSelectionSnapshot],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      onPaste?.(e);
    },
    [onPaste],
  );

  const applyDomMutation = useCallback(
    (mutate: (root: HTMLElement, range: Range) => void) => {
      const root = ref.current;
      if (!root || !selectionSnapshot) {
        return;
      }

      const range = getSelectionRange(root);
      if (!range) {
        return;
      }

      mutate(root, range);
      root.normalize();
      syncContentFromDom();
      root.focus();

      requestAnimationFrame(() => {
        setSelectionOffsets(root, selectionSnapshot.start, selectionSnapshot.end);
        updateSelectionSnapshot();
      });
    },
    [selectionSnapshot, syncContentFromDom, updateSelectionSnapshot],
  );

  const execInlineCommand = useCallback(
    (command: string, value?: string) => {
      applyDomMutation(() => {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand(command, false, value);
      });
    },
    [applyDomMutation],
  );

  const handleApplyColor = useCallback(
    (kind: 'text' | 'background', color: InlineColorOption) => {
      applyDomMutation((root, range) => {
        const existing = getSharedFormatElement(
          range,
          root,
          kind === 'text' ? isTextColorElement : isBackgroundColorElement,
        );

        if (existing) {
          const currentColor =
            normalizeElementColor(existing.dataset.inlineColor) ??
            normalizeElementColor(
              kind === 'text' ? existing.style.color : existing.style.backgroundColor,
            );

          if (currentColor === color.id) {
            unwrapElement(existing);
            return;
          }

          existing.dataset.inlineType =
            kind === 'text' ? 'text_color' : 'background_color';
          existing.dataset.inlineColor = color.id;

          if (kind === 'text') {
            existing.style.color = color.textColor;
          } else {
            existing.style.backgroundColor = color.backgroundColor;
            existing.style.borderRadius = '4px';
            existing.style.padding = '0 0.2em';
          }
          return;
        }

        wrapRange(range, createColorElement(kind, color));
      });

      setOpenPalette(null);
    },
    [applyDomMutation],
  );

  const handleToggleCode = useCallback(() => {
    applyDomMutation((root, range) => {
      const existing = getSharedFormatElement(range, root, isCodeElement);
      if (existing) {
        unwrapElement(existing);
        return;
      }

      wrapRange(range, createCodeElement());
    });
  }, [applyDomMutation]);

  const handleAddLink = useCallback(() => {
    const url = globalThis.prompt('Link URL', 'https://');
    const cleanUrl = url?.trim();
    if (!cleanUrl) {
      return;
    }

    execInlineCommand('createLink', cleanUrl);
  }, [execInlineCommand]);

  const handleOpenSlashMenu = useCallback(() => {
    if (!selectionSnapshot || !onRequestSlashMenu) {
      return;
    }

    onRequestSlashMenu({
      x: selectionSnapshot.rect.left,
      y: selectionSnapshot.rect.bottom,
    });
    setSelectionSnapshot(null);
    setOpenPalette(null);
  }, [onRequestSlashMenu, selectionSnapshot]);

  return (
    <>
      <div // NOSONAR - contentEditable is required for this Notion-like editor UX
        ref={ref}
        role="textbox"
        aria-multiline="true"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={placeholder}
        className={`outline-none whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--color-ink-faint)] empty:before:pointer-events-none focus:empty:before:content-none ${className}`}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onMouseUp={updateSelectionSnapshot}
        onFocus={() => {
          isFocused.current = true;
          renderContent(content);
        }}
        onBlur={() => {
          isFocused.current = false;
          setSelectionSnapshot(null);
          setOpenPalette(null);
          syncContentFromDom();
          renderContent(content);
        }}
        onCompositionStart={() => { isComposing.current = true; }}
        onCompositionEnd={() => {
          isComposing.current = false;
          handleInput();
        }}
      />

      {selectionSnapshot && typeof document !== 'undefined'
        ? createPortal(
            <InlineSelectionToolbar
              selection={selectionSnapshot}
              palette={openPalette}
              onTogglePalette={(palette) =>
                setOpenPalette((current) => (current === palette ? null : palette))
              }
              onFormatBold={() => execInlineCommand('bold')}
              onFormatItalic={() => execInlineCommand('italic')}
              onFormatStrike={() => execInlineCommand('strikeThrough')}
              onFormatCode={handleToggleCode}
              onFormatLink={handleAddLink}
              onFormatTextColor={(color) => handleApplyColor('text', color)}
              onFormatBackgroundColor={(color) => handleApplyColor('background', color)}
              onOpenSlashMenu={handleOpenSlashMenu}
            />,
            document.body,
          )
        : null}
    </>
  );
};
