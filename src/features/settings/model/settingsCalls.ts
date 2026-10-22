/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsCalls.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { API_BASE, api, getActiveJwt } from '@/shared/api/client';

import { recordSettingsAction } from '@/store/settings';

export function runAsync(work: Promise<unknown>) {
  work.catch(() => undefined);
}

export function runMaybeAsync(work: Promise<unknown> | void) {
  Promise.resolve(work).catch(() => undefined);
}

export function noopHandledAction(label: string, metadata: Record<string, unknown> = {}) {
  recordSettingsAction(label, metadata);
}

export async function postAccountAction<T>(path: string, body: unknown): Promise<T | null> {
  const jwt = getActiveJwt();
  if (!jwt || !API_BASE) return null;
  return api.post<T>(path, body, jwt);
}
