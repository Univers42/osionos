/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModerationPanel.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';

import { Section } from '@/features/settings/ui/settingsKit';
import { BlockedUsersPanel } from '@/features/settings/moderation/BlockedUsersPanel';

export const ModerationPanel: React.FC = () => (
  <div className="flex flex-col gap-6">
    <Section title="Blocked users">
      <BlockedUsersPanel />
    </Section>
  </div>
);
