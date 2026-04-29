/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabaseBlock.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:04:37 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/29 12:00:00 by copilot          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import {
  DatabaseBlock as SubmoduleDatabaseBlock,
  type DatabaseBlockProps,
} from "@/components/database/src/components/DatabaseBlock";

export const DatabaseBlock: React.FC<DatabaseBlockProps> = (props) => {
  return <SubmoduleDatabaseBlock {...props} />;
};
