/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MessengerPanel.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ChannelList } from "@/widgets/channel-list";
import { DmList } from "@/widgets/dm-list";

/** Messenger panel = workspace channels + direct messages (existing widgets). */
export const MessengerPanel: React.FC = () => (
  <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-2 pb-5">
    <ChannelList />
    <DmList />
  </nav>
);
