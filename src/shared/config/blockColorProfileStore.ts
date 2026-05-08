import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface BlockColorProfile {
  id: string;
  name: string;
  textColor: string;
  backgroundColor: string;
  createdAt: string;
}

interface BlockColorProfileStore {
  profiles: BlockColorProfile[];
  addProfile: (profile: Omit<BlockColorProfile, "id" | "createdAt">) => BlockColorProfile;
  removeProfile: (profileId: string) => void;
}

export const useBlockColorProfileStore = create<BlockColorProfileStore>()(
  persist(
    (set) => ({
      profiles: [],
      addProfile: (profile) => {
        const nextProfile: BlockColorProfile = {
          ...profile,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          profiles: [
            nextProfile,
            ...state.profiles.filter(
              (candidate) =>
                candidate.name.trim().toLowerCase() !== profile.name.trim().toLowerCase(),
            ),
          ].slice(0, 24),
        }));

        return nextProfile;
      },
      removeProfile: (profileId) => {
        set((state) => ({
          profiles: state.profiles.filter((profile) => profile.id !== profileId),
        }));
      },
    }),
    { name: "osionos:block-color-profiles" },
  ),
);