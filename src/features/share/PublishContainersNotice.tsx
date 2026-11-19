/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublishContainersNotice.tsx                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

/** What a re-publish now changes (ADR 0064 PS40): columns were dropped from every earlier copy. */
export const PUBLISH_CONTAINERS_NOTICE =
  "Publishing again now includes the content of columns, which earlier published copies left out. Pages you already published stay as they are until you publish them again.";

export const PublishContainersNotice: React.FC = () => (
  <p data-testid="publish-containers-notice" className="mt-2 text-2xs text-[var(--osio-fg-muted)]">
    {PUBLISH_CONTAINERS_NOTICE}
  </p>
);
