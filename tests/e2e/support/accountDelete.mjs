/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accountDelete.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The danger zone is flag-gated (default OFF), so a spec that exercises it turns the
// flag on before the page loads. One copy here, not one per spec.

export async function enableAccountDelete(page) {
  await page.addInitScript(() => {
    try {
      globalThis.localStorage.setItem("osio.account.delete", "1");
    } catch {
      // storage blocked: the spec then fails on the missing row, which is the honest signal.
    }
  });
}
