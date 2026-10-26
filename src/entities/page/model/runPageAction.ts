/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   runPageAction.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Shared error reporting for a page action: turn a rejected promise into a
 *  stable message and forward it to the caller's error handler. */
export function actionErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Page action failed.";
}

/** Run a page action (sync or async) and report any rejection through `onError`. */
export function runPageAction(work: Promise<unknown> | void, onError: (message: string) => void): void {
  Promise.resolve(work).catch((error) => onError(actionErrorMessage(error)));
}
