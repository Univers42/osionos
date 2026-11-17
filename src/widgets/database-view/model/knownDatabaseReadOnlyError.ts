/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseReadOnlyError.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Its own module so the page-create toast can recognise it without loading the known-database
// store, which stays out of the page store's warm chunk.

/** The known-database store refuses writes: before its stored copy is read, or in a pull-only
 *  tab (devil I7, I9). The message is shown to the user as is. */
export class KnownDatabaseReadOnlyError extends Error {
  constructor() {
    super("Databases are read-only in this tab, so this template's databases can't be copied. Reload the tab to try again.");
    this.name = "KnownDatabaseReadOnlyError";
  }
}
