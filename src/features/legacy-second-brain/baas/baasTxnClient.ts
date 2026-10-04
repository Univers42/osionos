/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   baasTxnClient.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { baasConfigured, baasPost } from "./baasFetch";
import type { TxnRequest, TxnResult } from "./txnTypes";

/**
 * Write client for the BaaS `/query/v1/txn` endpoint (baas-txn-endpoint.md): a
 * single-mount atomic batch of 1..50 operations. The whole batch commits or
 * rolls back together, and the response states the delivered `guarantee`
 * ("atomic" for a transactional engine). Cross-mount atomicity is NOT offered
 * (no 2PC) — co-locate a node and its edges in one mount for atomic edits, else
 * issue separate idempotent batches and treat the result as eventual.
 */
export function isTxnEnabled(): boolean {
  return baasConfigured();
}

export async function commitTxn(request: TxnRequest): Promise<TxnResult> {
  return baasPost<TxnResult>("/query/v1/txn", request);
}

/**
 * Whether a committed txn actually changed any rows. A no-op or owner-scoped
 * miss returns `201 atomic` with every `rowCount: 0` — the optimistic patch must
 * revert in that case, not just on HTTP failure (txn-contract §2.5).
 */
export function txnApplied(result: TxnResult): boolean {
  return result.results.some((entry) => entry.rowCount > 0);
}

export type { TxnOperation, TxnRequest, TxnResult } from "./txnTypes";
