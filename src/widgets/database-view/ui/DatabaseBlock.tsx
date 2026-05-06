/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabaseBlock.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:37 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/06 23:05:59 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { ObjectDatabase } from '@notion-db/object-database';

import {
  DEFAULT_OBJECT_DATABASE_ID,
  DEFAULT_OBJECT_DATABASE_VIEW_ID,
} from '@/store/useDatabaseStore';
import { getObjectDatabaseAdapter } from '../model/objectDatabaseAdapter';

interface DatabaseBlockProps {
  databaseId?: string;
  initialViewId?: string;
  mode?: 'inline' | 'full';
}

export const DatabaseBlock: React.FC<DatabaseBlockProps> = ({
  databaseId,
  initialViewId,
  mode = 'inline',
}) => {
  const resolvedMode = mode === 'full' ? 'page' : 'inline';
  const resolvedDatabaseId = databaseId ?? DEFAULT_OBJECT_DATABASE_ID;
  const resolvedInitialView = initialViewId ?? DEFAULT_OBJECT_DATABASE_VIEW_ID;

  return (
    <div
      className={[
        'w-full min-w-0',
        mode === 'full' ? 'h-full overflow-hidden' : 'my-2',
      ].join(' ')}
    >
      <ObjectDatabase
        adapter={getObjectDatabaseAdapter()}
        databaseId={resolvedDatabaseId}
        initialView={resolvedInitialView}
        mode={resolvedMode}
        className={mode === 'full' ? 'h-full' : undefined}
      />
    </div>
  );
};
