/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SocialSettings.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The Contacts settings tab body: contacts, blocked users and reports stacked. */

import React from 'react';

import { ContactsPanel } from './ContactsPanel';
import { BlockedUsersPanel } from './BlockedUsersPanel';
import { ReportsPanel } from './ReportsPanel';

export const SocialSettings: React.FC = () => (
  <div className="flex flex-col gap-6">
    <ContactsPanel />
    <BlockedUsersPanel />
    <ReportsPanel />
  </div>
);
