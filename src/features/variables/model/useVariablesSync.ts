/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useVariablesSync.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import { startVariablesSync } from "./variablesSync";

export function useVariablesSync(): void {
  useEffect(() => startVariablesSync(), []);
}
