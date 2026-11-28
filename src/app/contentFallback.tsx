/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   contentFallback.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/** The spinner every lazy region shows while its chunk streams in. */
export const contentFallback = (
  <div className="flex h-full w-full items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--osio-accent)] border-t-transparent" />
  </div>
);
