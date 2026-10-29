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

import { Users } from "lucide-react";

import type { AdminSection } from "../../model/adminSections";

export const section: AdminSection = {
  id: "users",
  label: "Users",
  Icon: Users,
  requiredRole: "admin",
  load: () => import("./UsersPanel"),
};
