/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accountEpoch.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Counts active-user changes. A hydrate reads it before its request and drops the answer if
 * it moved, so a late reply for the previous user never lands in the next user's stores.
 * Caveat: it cannot tell a sign-out and sign-in of the same user from no change, so that
 * round trip is treated as a change and the in-flight answer is dropped (a refetch follows).
 */
let epoch = 0;

export const currentAccountEpoch = (): number => epoch;
export const advanceAccountEpoch = (): void => { epoch += 1; };
