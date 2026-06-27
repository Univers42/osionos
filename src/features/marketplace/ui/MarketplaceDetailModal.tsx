/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarketplaceDetailModal.tsx                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { Modal } from "@/shared/ui/primitives/Modal";

import { useMarketplaceApp } from "../model/useMarketplaceApps";
import { MarketplaceDetailView } from "./MarketplaceDetailView";

interface Props {
  appId: string | null;
  onClose: () => void;
}

/** Full-screen detail overlay for a marketplace app (self-fetching). */
export const MarketplaceDetailModal: React.FC<Props> = ({ appId, onClose }) => {
  const { app, children, loading } = useMarketplaceApp(appId);
  return (
    <Modal open={!!appId} onClose={onClose} size="full" title={app?.title ?? "App"}>
      {loading && !app ? (
        <p className="p-6 text-sm text-[var(--osio-fg-subtle)]">Loading…</p>
      ) : app ? (
        <MarketplaceDetailView app={app} subPages={children} />
      ) : (
        <p className="p-6 text-sm text-[var(--osio-fg-subtle)]">App unavailable.</p>
      )}
    </Modal>
  );
};
