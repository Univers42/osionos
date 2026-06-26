/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarketplaceAppEditor.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";

import { Modal } from "@/shared/ui/primitives/Modal";
import { Button } from "@/shared/ui/atoms/Button";
import type { PageEntry, PagePropertyEntry } from "@/entities/page";

import { APP_KEYS, readAppMeta } from "../model/appMeta";
import { updateApp, publishApp } from "../model/useMarketplaceApps";

const FIELD = "w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1.5 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--osio-accent)]";
const LABEL = "flex flex-col gap-1 text-xs font-medium text-[var(--osio-fg-subtle)]";

interface Props {
  app: PageEntry;
  onClose: () => void;
  onSaved: () => void;
}

/** Owner form to fill a draft app's fields, Save (PATCH) and Publish to the marketplace. */
export const MarketplaceAppEditor: React.FC<Props> = ({ app, onClose, onSaved }) => {
  const meta = readAppMeta(app);
  const [f, setF] = useState({
    title: app.title, icon: app.icon ?? "icon:box", company: meta.company, website: meta.website,
    description: meta.description, version: meta.version, launchUrl: meta.launchUrl, categories: meta.categories.join(", "), verified: meta.verified,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const properties = (): PagePropertyEntry[] => [
    { key: APP_KEYS.company, label: "Company", type: "text", value: f.company },
    { key: APP_KEYS.verified, label: "Verified", type: "checkbox", value: f.verified },
    { key: APP_KEYS.website, label: "Website", type: "url", value: f.website },
    { key: APP_KEYS.description, label: "Description", type: "text", value: f.description },
    { key: APP_KEYS.version, label: "Version", type: "text", value: f.version },
    { key: APP_KEYS.identifier, label: "Identifier", type: "text", value: meta.identifier },
    { key: APP_KEYS.categories, label: "Categories", type: "multi_select", value: f.categories.split(",").map((s) => s.trim()).filter(Boolean) },
    { key: APP_KEYS.resources, label: "Resources", type: "multi_select", value: meta.resources },
    { key: APP_KEYS.published, label: "Published", type: "checkbox", value: meta.published },
    { key: APP_KEYS.launchKind, label: "Launch", type: "text", value: "embed" },
    { key: APP_KEYS.launchUrl, label: "Launch URL", type: "url", value: f.launchUrl },
  ];

  const save = async () => {
    setBusy(true);
    await updateApp(app._id, { title: f.title, icon: f.icon, properties: properties() });
    setBusy(false);
    onSaved();
  };
  const publish = async () => {
    setBusy(true);
    await updateApp(app._id, { title: f.title, icon: f.icon, properties: properties() });
    await publishApp(app._id);
    setBusy(false);
    onSaved();
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="lg" title={meta.published ? "Edit app" : "Edit draft app"}>
      <div className="flex flex-col gap-3 p-4">
        <label className={LABEL}>Name<input className={FIELD} value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>Icon (iconValue)<input className={FIELD} value={f.icon} onChange={(e) => set("icon", e.target.value)} placeholder="icon:box" /></label>
          <label className={LABEL}>Company<input className={FIELD} value={f.company} onChange={(e) => set("company", e.target.value)} /></label>
        </div>
        <label className={LABEL}>Short description<input className={FIELD} value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>Website<input className={FIELD} value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://…" /></label>
          <label className={LABEL}>Launch URL (embed)<input className={FIELD} value={f.launchUrl} onChange={(e) => set("launchUrl", e.target.value)} placeholder="https://localhost:3002" /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>Version<input className={FIELD} value={f.version} onChange={(e) => set("version", e.target.value)} /></label>
          <label className={LABEL}>Categories (comma-separated)<input className={FIELD} value={f.categories} onChange={(e) => set("categories", e.target.value)} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--osio-fg-default)]">
          <input type="checkbox" checked={f.verified} onChange={(e) => set("verified", e.target.checked)} /> Verified publisher
        </label>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--osio-fg-subtle)]">{meta.published ? "Published — visible to everyone." : "Draft — only you see it until you publish."}</span>
          <div className="flex gap-2">
            <Button tone="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button tone="default" onClick={save} disabled={busy}>Save</Button>
            {!meta.published ? <Button tone="primary" onClick={publish} disabled={busy}>Publish</Button> : null}
          </div>
        </div>
      </div>
    </Modal>
  );
};
