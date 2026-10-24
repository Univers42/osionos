/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   section.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { BarChart3 } from "lucide-react";

import type { AdminSection } from "../../model/adminSections";

export const section: AdminSection = {
  id: "insights",
  label: "Insights",
  Icon: BarChart3,
  requiredRole: "admin",
  load: () => import("./InsightsPanel"),
};
