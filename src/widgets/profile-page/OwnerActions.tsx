/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   OwnerActions.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The owner's two entry points on their own profile: Edit profile (Settings) and Customize
 * (the README page, created on the first click). Only ProfileActions renders this, and only
 * for the signed-in user's own page.
 */

import React from "react";

import { openSettings } from "@/features/settings/model/settingsNav";
import { useReadmeCustomize } from "./useReadmeCustomize";

const BUTTON = "inline-flex items-center gap-2 rounded-md border border-[var(--osio-border-default)] px-4 py-2 text-sm font-medium hover:bg-[var(--osio-bg-hover)] disabled:opacity-60";

export const OwnerActions: React.FC = () => {
  const { busy, message, gone, customize } = useReadmeCustomize();
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => openSettings("profile", "public-profile")} className={BUTTON}>
          Edit profile
        </button>
        <button type="button" disabled={busy} onClick={() => void customize(false)} className={BUTTON}>
          Customize
        </button>
      </div>
      {message && <p role="alert" className="mt-2 text-sm text-[var(--osio-danger)]">{message}</p>}
      {gone && (
        <button type="button" disabled={busy} onClick={() => void customize(true)} className={`mt-2 ${BUTTON}`}>
          Create a new README
        </button>
      )}
    </div>
  );
};
