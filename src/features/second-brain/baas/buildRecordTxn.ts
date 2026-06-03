/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   buildRecordTxn.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { TxnRequest } from "./txnTypes";

/**
 * Pure builders that turn a graph node id (`<mount>:<resource>:<pk>`) into a
 * single-mount `/txn` request for the editable inspector (doc 02, Phase 3).
 *
 * The PK column is assumed to be `id` (the contract default); non-`id` primary
 * keys are a documented additive follow-up. Edits to a single record stay on one
 * mount, so the BaaS returns `guarantee: "atomic"`.
 */

export interface RecordRef {
  mount: string;
  resource: string;
  pk: string;
}

/** Split a BaaS node id into its parts (pk may itself contain `:`). */
export function parseNodeId(nodeId: string): RecordRef {
  const [mount = "", resource = "", ...rest] = nodeId.split(":");
  return { mount, resource, pk: rest.join(":") };
}

/** An atomic update of one record's fields, filtered on its primary key. */
export function buildRecordUpdate(nodeId: string, changes: Record<string, unknown>): TxnRequest {
  const ref = parseNodeId(nodeId);
  return {
    mount: ref.mount,
    operations: [{ op: "update", resource: ref.resource, filter: { id: ref.pk }, data: changes }],
  };
}
