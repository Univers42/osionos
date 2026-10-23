/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModerationSection.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { ModerationQueue } from "./ModerationQueue";

/** The moderator's whole view: the queue the server already gates per request. */
const ModerationSection: React.FC = () => <ModerationQueue />;

export default ModerationSection;
