/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSqlRun.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useState } from "react";
import { runSqlRo, type SqlRoResult } from "../api/sqlRoClient";

interface SqlRunState {
  running: boolean;
  result: SqlRoResult | null;
  error: string | null;
}

/** Execute a read-only SQL query against a mount and expose the run state. */
export function useSqlRun() {
  const [state, setState] = useState<SqlRunState>({ running: false, result: null, error: null });

  const run = useCallback(async (dbId: string, sql: string) => {
    if (!dbId || !sql.trim()) { setState({ running: false, result: null, error: "Pick a database and write a query." }); return; }
    setState({ running: true, result: null, error: null });
    try {
      setState({ running: false, result: await runSqlRo(dbId, sql), error: null });
    } catch (error) {
      setState({ running: false, result: null, error: error instanceof Error ? error.message : "Query failed." });
    }
  }, []);

  return { ...state, run };
}
