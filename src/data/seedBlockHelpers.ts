/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   seedBlockHelpers.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from '@src/types/database';

let _counter = 0;
export function bid(): string {
  return `block-${++_counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function p(text: string): Block {
  return { id: bid(), type: 'paragraph', content: text };
}
export function h1(text: string): Block {
  return { id: bid(), type: 'heading_1', content: text };
}
export function h2(text: string): Block {
  return { id: bid(), type: 'heading_2', content: text };
}
export function h3(text: string): Block {
  return { id: bid(), type: 'heading_3', content: text };
}
export function bullet(text: string): Block {
  return { id: bid(), type: 'bulleted_list', content: text };
}
export function numbered(text: string): Block {
  return { id: bid(), type: 'numbered_list', content: text };
}
export function todo(text: string, checked = false): Block {
  return { id: bid(), type: 'to_do', content: text, checked };
}
export function code(text: string, language = 'typescript'): Block {
  return { id: bid(), type: 'code', content: text, language };
}
export function quote(text: string): Block {
  return { id: bid(), type: 'quote', content: text };
}
export function callout(text: string, icon = '💡'): Block {
  return { id: bid(), type: 'callout', content: text, color: icon };
}
export function divider(): Block {
  return { id: bid(), type: 'divider', content: '' };
}
export function toggle(text: string, children: Block[] = []): Block {
  return { id: bid(), type: 'toggle', content: text, children, collapsed: true };
}

/** Metadata and content blocks for a seed page. */
export interface SeedPage {
  _id:           string;
  title:         string;
  icon?:         string;
  workspaceId:   string;
  parentPageId?: string | null;
  databaseId?:   string | null;
  archivedAt?:   string | null;
  content:       Block[];
}
