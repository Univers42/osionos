/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   storedIconSchema.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/03 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/03 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { z } from "zod";
import { type StoredIcon, parseStoredIcon } from "@osionos/ui";

export type { StoredIcon };

export const storedIconSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("emoji"),
    value: z.string().min(1),
    bg: z.string().optional(),
  }),
  z.object({
    type: z.literal("icon"),
    name: z.string().min(1),
    color: z.string().optional(),
  }),
  z.object({
    type: z.literal("image"),
    url: z.string().min(1),
    color: z.string().optional(),
  }),
]);

export const lenientStoredIconSchema = z.preprocess((val) => parseStoredIcon(val), storedIconSchema.nullable());
