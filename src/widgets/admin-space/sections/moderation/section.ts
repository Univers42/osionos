/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   section.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ShieldAlert } from "lucide-react";

import type { AdminSection } from "../../model/adminSections";

export const section: AdminSection = {
  id: "moderation",
  label: "Moderation",
  Icon: ShieldAlert,
  requiredRole: "moderator",
  load: () => import("./ModerationPanel"),
};
