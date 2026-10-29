/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recordPageId.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const RECORD_PAGE_PREFIX = "dbrow-";

/** The osionos page id that shows an engine row in the page editor. Never a server id shape
 *  (not a UUID, not a Mongo id), so the outbox, content fetch and backlinks leave it local. */
export function toRecordPageId(recordId: string): string {
  return recordId.startsWith(RECORD_PAGE_PREFIX) ? recordId : `${RECORD_PAGE_PREFIX}${recordId}`;
}
