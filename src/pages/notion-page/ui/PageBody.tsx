/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageBody.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 20:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 18:19:49 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { PlaygroundPageEditor } from '@/features/block-editor';

interface PageBodyProps {
  pageId: string;
}

/**
 * Content area — wraps the PlaygroundPageEditor which integrates
 * the markengine for markdown shortcuts and block-level editing.
 */
export const PageBody: React.FC<PageBodyProps> = ({ pageId }) => {
  return (
    <div className="osionos-page-body">
      <PlaygroundPageEditor pageId={pageId} />
    </div>
  );
};
