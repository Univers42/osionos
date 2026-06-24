/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DataSourceButton.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Hover affordance on a database block in the editor: "Source" opens the
 * DataSourcePicker; picking a table commits the `baas:<dbId>:<table>` id
 * through the editor's own block-update path (the caller passes the commit),
 * and the memoized live adapter takes over purely by id. This is the
 * "settings → select the source of the data" entry point.
 */

import React from "react";
import { DataSourcePicker } from "./DataSourcePicker";

interface DataSourceButtonProps {
  databaseId?: string;
  onChange: (databaseId: string) => void;
}

export const DataSourceButton: React.FC<DataSourceButtonProps> = ({ databaseId, onChange }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="absolute right-2 top-2 z-[var(--osio-z-raised)] opacity-0 transition-opacity group-hover/dbblock:opacity-100 focus-within:opacity-100">
      {open ? (
        <DataSourcePicker
          current={databaseId}
          onPick={(picked) => {
            setOpen(false);
            if (picked !== databaseId) onChange(picked);
          }}
          onClose={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-0.5 text-xs text-[var(--osio-fg-subtle)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
          aria-label="Change data source"
        >
          ⛁ Source
        </button>
      )}
    </div>
  );
};
