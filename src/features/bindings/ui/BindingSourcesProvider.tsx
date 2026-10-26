/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BindingSourcesProvider.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";
import { BindingSourcesContext } from "@/entities/block/model/bindingSources";
import { getRecordSource } from "../model/sourceRegistry";
import "../sources";

export function BindingSourcesProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const value = useMemo(() => ({ get: getRecordSource }), []);
  return <BindingSourcesContext.Provider value={value}>{children}</BindingSourcesContext.Provider>;
}
