/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LazySocialSettings.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Code-split boundary for the Contacts settings tab. The three social panels
 * (contacts, blocked users, reports) + their stores form one async chunk so the
 * settings center never drags the social graph into its warm bundle.
 */

import React, { Suspense, lazy } from 'react';

const SocialSettings = lazy(() =>
  import('./SocialSettings').then((m) => ({ default: m.SocialSettings })),
);

const Loading: React.FC = () => (
  <div className="flex items-center justify-center py-8">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--osio-accent)] border-t-transparent" />
  </div>
);

export const LazySocialSettings: React.FC = () => (
  <Suspense fallback={<Loading />}>
    <SocialSettings />
  </Suspense>
);
