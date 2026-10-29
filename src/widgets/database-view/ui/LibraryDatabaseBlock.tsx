/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LibraryDatabaseBlock.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { ObjectDatabaseAdapter, ObjectDatabaseProps, ObjectDatabaseSubItemsController } from "@notion-db/object-database";
import { databaseShellClass } from "../model/databaseShellClass";
import { LIBRARY_DB_ID } from "../model/libraryDatabaseModel";
import { LIBRARY_DEFAULT_VIEW } from "../model/libraryViews";
import { getLibraryDatabaseAdapter } from "../model/libraryDatabaseState";
import { createLibrarySubItemsController, openLibraryItem } from "../model/libraryItems";

interface LibraryDatabaseBlockProps {
  initialViewId?: string;
  mode?: "inline" | "full";
  /** The host renders the ObjectDatabase (DatabaseBlock owns its bridge CSS and host adapters). */
  renderDatabase: (props: {
    adapter: ObjectDatabaseAdapter; initialView: string;
    renderPage: NonNullable<ObjectDatabaseProps["renderPage"]>; subItems: ObjectDatabaseSubItemsController;
  }) => React.ReactNode;
}

/** Opening a row leaves the Library for the item itself, so the peek closes at once. */
const LibraryItemOpen: React.FC<{ itemId: string; onClose: () => void }> = ({ itemId, onClose }) => {
  React.useEffect(() => {
    openLibraryItem(itemId);
    onClose();
  }, [itemId, onClose]);
  return null;
};

/** The workspace's files as one database: real table, views, filters and sub-item tree. */
export const LibraryDatabaseBlock: React.FC<LibraryDatabaseBlockProps> = ({ initialViewId, mode = "full", renderDatabase }) => {
  const subItems = React.useMemo(() => createLibrarySubItemsController(), []);
  const renderPage = React.useCallback<NonNullable<ObjectDatabaseProps["renderPage"]>>(
    (pageId, _state, onClose) => <LibraryItemOpen itemId={pageId} onClose={onClose} />,
    [],
  );
  const view = initialViewId ?? LIBRARY_DEFAULT_VIEW;
  return (
    <div className={databaseShellClass(mode)} data-database-id={LIBRARY_DB_ID} data-database-view-id={view}>
      {renderDatabase({ adapter: getLibraryDatabaseAdapter(), initialView: view, renderPage, subItems })}
    </div>
  );
};
