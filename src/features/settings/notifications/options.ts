/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   options.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export const NOTIFICATION_MODE_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "mentions", label: "Mentions only" },
  { value: "all", label: "All activity" },
] as const;
