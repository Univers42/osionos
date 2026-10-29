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

import { History } from "lucide-react";

import type { AdminSection } from "../../model/adminSections";

export const section: AdminSection = {
  id: "audit",
  label: "Audit",
  Icon: History,
  requiredRole: "admin",
  load: () => import("./AuditPanel"),
};
