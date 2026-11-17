/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublicProfileSection.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The public profile editor of Settings: the shared editor inside its section.
 */

import React from 'react';

import { Section } from '../ui/settingsKit';
import { PublicProfileEditor } from './PublicProfileEditor';

export const PublicProfileSection: React.FC = () => (
  <Section title="Public profile" anchor="public-profile">
    <PublicProfileEditor saveLabel="Save profile" discardLabel="Discard changes" />
  </Section>
);
