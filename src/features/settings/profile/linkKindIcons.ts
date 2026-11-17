/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkKindIcons.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The icon of each link kind, kept apart from `linkKinds` so the pure model stays free of UI
 * imports. Shared by the edit form's link rows and the profile sidebar's link facts.
 */

import type React from "react";
import { Github, Gitlab, Globe, Linkedin, Twitter, Youtube } from 'lucide-react';

import type { LinkKind } from './linkKinds';

export const LINK_KIND_ICON: Record<LinkKind, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean; className?: string }>> = {
  github: Github, gitlab: Gitlab, linkedin: Linkedin, x: Twitter, youtube: Youtube, site: Globe,
};
