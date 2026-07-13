/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SqlRunButton.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from "react";
import { Play } from "lucide-react";
import type { Block } from "@/entities/block";
import { listLiveMounts, type LiveMountInfo } from "@/widgets/database-view/model/liveMountCatalog";
import { useSqlRun } from "../model/useSqlRun";
import { SqlResultTable } from "./SqlResultTable";

const PG_ENGINES = new Set(["postgresql", "postgres"]);

/** Run controls for a `sql` code block: mount picker + Run + read-only results. */
export const SqlRunButton: React.FC<{ block: Block; onUpdateBlock: (blockId: string, updates: Partial<Block>) => void }> = ({ block, onUpdateBlock }) => {
  const [mounts, setMounts] = useState<LiveMountInfo[]>([]);
  const { running, result, error, run } = useSqlRun();

  useEffect(() => {
    listLiveMounts()
      .then((all) => setMounts(all.filter((mount) => PG_ENGINES.has(mount.engine))))
      .catch(() => setMounts([]));
  }, []);

  const mountId = block.sqlMountId ?? mounts[0]?.dbId ?? "";

  return (
    <div className="flex flex-col gap-1.5 border-t border-[var(--osio-code-border)] px-3 py-2">
      <div className="flex items-center gap-2">
        <select
          value={mountId}
          onChange={(event) => onUpdateBlock(block.id, { sqlMountId: event.target.value })}
          className="min-w-0 flex-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-xs text-[var(--osio-fg-default)]"
        >
          {mounts.length === 0 && <option value="">No postgres database mounted</option>}
          {mounts.map((mount) => <option key={mount.dbId} value={mount.dbId}>{mount.name}</option>)}
        </select>
        <button
          type="button"
          onClick={() => void run(mountId, block.content)}
          disabled={running || !mountId}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--osio-accent)] px-2.5 py-1 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90 disabled:opacity-50"
        >
          <Play size={12} /> {running ? "Running…" : "Run"}
        </button>
      </div>
      {error && <p className="text-xs text-[var(--osio-danger)]">{error}</p>}
      {result && <SqlResultTable result={result} />}
    </div>
  );
};
