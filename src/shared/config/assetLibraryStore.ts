/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   assetLibraryStore.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccountAssetKind = 'cover' | 'image' | 'video' | 'audio' | 'file' | 'emoji';
export type AccountAssetOrigin = 'preloaded' | 'url' | 'unsplash' | 'upload';

export interface AccountAsset {
  id: string;
  userId: string;
  kind: AccountAssetKind;
  name: string;
  source: string;
  origin: AccountAssetOrigin;
  mimeType?: string;
  size?: number;
  createdAt: string;
}

interface AssetLibraryStore {
  assetsByUser: Record<string, AccountAsset[]>;
  addAsset: (
    userId: string,
    asset: Omit<AccountAsset, 'id' | 'userId' | 'createdAt'>,
  ) => AccountAsset;
  removeAsset: (userId: string, assetId: string) => void;
  assetsForUser: (userId: string, kinds?: AccountAssetKind[]) => AccountAsset[];
}

export const useAssetLibraryStore = create<AssetLibraryStore>()(
  persist(
    (set, get) => ({
      assetsByUser: {},
      addAsset: (userId, asset) => {
        const nextAsset: AccountAsset = {
          ...asset,
          id: `asset-${crypto.randomUUID()}`,
          userId,
          createdAt: new Date().toISOString(),
        };

        set((state) => {
          const currentAssets = state.assetsByUser[userId] ?? [];
          const withoutDuplicate = currentAssets.filter(
            (item) => item.source !== nextAsset.source,
          );

          return {
            assetsByUser: {
              ...state.assetsByUser,
              [userId]: [nextAsset, ...withoutDuplicate].slice(0, 80),
            },
          };
        });

        return nextAsset;
      },
      removeAsset: (userId, assetId) => {
        set((state) => ({
          assetsByUser: {
            ...state.assetsByUser,
            [userId]: (state.assetsByUser[userId] ?? []).filter(
              (asset) => asset.id !== assetId,
            ),
          },
        }));
      },
      assetsForUser: (userId, kinds) => {
        const assets = get().assetsByUser[userId] ?? [];
        if (!kinds?.length) return assets;
        return assets.filter((asset) => kinds.includes(asset.kind));
      },
    }),
    { name: 'osionos:account-asset-library' },
  ),
);