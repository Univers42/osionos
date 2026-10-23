/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DangerZone.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';

import { Section } from '../settingsKit';

/**
 * A bordered "Danger zone": the irreversible rows of a panel, together, under the
 * `--osio-danger` border. Children are `SettingRow danger`. Reused by the account
 * panel now and by the workspace and organisation panels later.
 */
export const DangerZone: React.FC<{ anchor?: string; children: React.ReactNode }> = ({ anchor = 'danger', children }) => (
  <Section title="Danger zone" anchor={anchor}>
    <div className="rounded-md border border-[var(--osio-danger)] px-4">{children}</div>
  </Section>
);
