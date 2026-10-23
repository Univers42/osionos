/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   no-factor-pg.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** A pg whose factor read answers `[]`: a user with no factor, for callers that hand the mint no PostgREST. */
export const noFactorPg = () => ({ asService: () => ({ get: async () => [] }) });
