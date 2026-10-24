/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   runBusy.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Holds `busy` for the length of one action. */
export async function runBusy<T>(setBusy: (busy: boolean) => void, act: () => Promise<T>): Promise<T> {
  setBusy(true);
  try {
    return await act();
  } finally {
    setBusy(false);
  }
}
