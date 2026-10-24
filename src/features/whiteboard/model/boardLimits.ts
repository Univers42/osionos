/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   boardLimits.ts                                      +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The ceilings of the board service, mirrored so the whiteboard feature never has to
 * read the other repository: drawnosaurus `packages/contract/src/limits.ts`.
 *
 * Caveat: these are copies. The service enforces its own; when it moves, this file
 * has to be mirrored again, and an import that refuses on these numbers refuses
 * early where the service would have refused the whole write.
 */

/** A board is one document; the service refuses a write over this many elements. */
export const MAX_IMPORT_ELEMENTS = 20_000;

/** The longest text one element may carry. */
export const MAX_TEXT_LENGTH = 10_000;

/** The longest id one element may carry. */
export const MAX_ID_LENGTH = 128;
