/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   txnTypes.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Wire types for `POST /query/v1/txn` (baas-txn-endpoint.md). Pure (no env), so
 * the request builder can be unit-tested without touching the network client.
 */

export type TxnOp = "insert" | "update" | "delete" | "upsert";

export interface TxnOperation {
  op: TxnOp;
  resource: string;
  filter?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

/** All operations run on this ONE mount, in order, in one backend transaction. */
export interface TxnRequest {
  mount: string;
  operations: TxnOperation[];
}

export interface TxnResult {
  guarantee: string; // "atomic" for a transactional engine
  mount: string;
  results: { op: string; resource: string; rowCount: number }[];
}
