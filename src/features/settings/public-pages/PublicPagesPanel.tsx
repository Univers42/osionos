/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublicPagesPanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";

import { Button, IconButton, IconValueView } from "@/shared/ui";
import { isPublishEnabled } from "@/shared/config/featureFlags";
import { publishPage, unpublishPage } from "@/features/share/publishApi";

import { DataTable, Section, SettingRow } from "../ui/settingsKit";
import { fetchPublishedPages, type PublishedPagesOutcome } from "./publishedPagesApi";
import { errorMessage, publicUrlFor, statusLabel, type PublishedPage } from "./publishedPages";

/** The day a page was published, for the table. */
function publishedOn(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** A row's own failure: the bridge's message, shown on the row that failed. */
interface RowFailure {
  pageId: string;
  message: string;
}

export const PublicPagesPanel = () => {
  const publishEnabled = isPublishEnabled();
  const [outcome, setOutcome] = useState<PublishedPagesOutcome | null>(null);
  const [busyPageId, setBusyPageId] = useState<string | null>(null);
  const [failure, setFailure] = useState<RowFailure | null>(null);

  const load = useCallback(async () => {
    setOutcome(await fetchPublishedPages());
  }, []);

  useEffect(() => {
    if (!isPublishEnabled()) return;
    void load();
  }, [load]);

  /**
   * Republish and unpublish go through the EXISTING publish API, so the
   * Share dialog and this panel publish the same way. A republish keeps the
   * token (the bridge upserts on page_id), so a link the user already shared
   * keeps working.
   */
  const act = async (page: PublishedPage, action: "republish" | "unpublish") => {
    setBusyPageId(page.pageId);
    setFailure(null);
    try {
      if (action === "republish") {
        const token = await publishPage(page.pageId);
        if (!token) throw new Error("The page was not published.");
      } else {
        await unpublishPage(page.pageId);
      }
      await load();
    } catch (error) {
      // The bridge's message goes on the row: the panel never throws out of it.
      setFailure({ pageId: page.pageId, message: errorMessage(error) });
    } finally {
      setBusyPageId(null);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // The clipboard can be refused (no permission, no secure context); the
      // field beside the button holds the URL, so it stays copyable by hand.
    }
  };

  /**
   * The publish feature is a client flag on top of the bridge's own switch.
   * Turning it on writes the flag the app reads and reloads, so the panel
   * then answers with what the bridge says.
   * Caveat: a ?osio.publish=0 in the URL outranks the stored value, so the
   * button cannot win against the URL.
   */
  const turnOnPublishing = () => {
    try {
      globalThis.localStorage?.setItem("osio.publish", "1");
    } catch {
      // A browser that refuses storage (private mode) keeps the feature off.
    }
    globalThis.location.reload();
  };

  const pages = outcome?.kind === "pages" ? outcome.pages : [];
  const origin = globalThis.location?.origin ?? "";
  const rows = pages.map((page) => {
    const title = page.title || "Untitled";
    // A token that is not the bridge's shape builds no URL: no href, no field.
    const url = publicUrlFor(page.token, origin);
    const busy = busyPageId === page.pageId;
    return [
      <span key={page.pageId} className="flex items-center gap-2">
        <IconValueView value={page.icon} size={16} />
        <span className="truncate">{title}</span>
      </span>,
      <span key={`${page.pageId}-status`} className="whitespace-nowrap">
        {statusLabel(page.status)}
      </span>,
      <span key={`${page.pageId}-published`} className="whitespace-nowrap text-[var(--osio-fg-muted)]">
        {publishedOn(page.publishedAt)}
      </span>,
      <span key={`${page.pageId}-link`} className="flex min-w-0 items-center gap-1">
        {url ? (
          <>
            <input
              readOnly
              value={url}
              aria-label={`Public link of ${title}`}
              className="min-w-0 flex-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1 text-xs text-[var(--osio-fg-default)]"
            />
            <IconButton label={`Copy the public link of ${title}`} onClick={() => void copy(url)}>
              <Copy size={14} />
            </IconButton>
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open the public page of ${title}`}
              className="inline-flex h-[var(--osio-control-h-sm)] w-[var(--osio-control-h-sm)] shrink-0 items-center justify-center rounded-[var(--osio-control-radius)] text-[var(--osio-fg-muted)] transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-control-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
            >
              <ExternalLink size={14} />
            </a>
          </>
        ) : (
          <span className="text-xs text-[var(--osio-fg-muted)]">No public link</span>
        )}
      </span>,
      <span key={`${page.pageId}-actions`} className="flex flex-col items-end gap-1">
        <span className="flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => void act(page, "republish")}>
            Republish
          </Button>
          <Button
            size="sm"
            tone="danger-subtle"
            disabled={busy}
            onClick={() => void act(page, "unpublish")}
          >
            Unpublish
          </Button>
        </span>
        {failure?.pageId === page.pageId ? (
          <span className="text-xs text-[var(--osio-danger)]">{failure.message}</span>
        ) : null}
      </span>,
    ];
  });

  const body = (() => {
    if (!publishEnabled) {
      return (
        <SettingRow
          title="Publishing is off for this build."
          description="Turn it on to publish a page from its Share dialog."
          action={<Button size="sm" onClick={turnOnPublishing}>Turn on publishing</Button>}
        />
      );
    }
    if (outcome === null) {
      return <p className="text-sm text-[var(--osio-fg-muted)]">Loading published pages…</p>;
    }
    if (outcome.kind === "disabled") {
      return (
        <SettingRow
          title="Publishing is off on the server."
          description="The bridge runs without the publish feature, so no page can be published."
          action={<Button size="sm" onClick={() => void load()}>Refresh</Button>}
        />
      );
    }
    if (outcome.kind === "error") {
      return (
        <SettingRow
          title="The published pages could not be loaded."
          description={outcome.message}
          action={<Button size="sm" onClick={() => void load()}>Try again</Button>}
        />
      );
    }
    if (outcome.pages.length === 0) {
      return (
        <SettingRow
          title="No published pages yet."
          description="Publish a page from its Share dialog to put a copy of it on the web."
          action={<Button size="sm" onClick={() => void load()}>Refresh</Button>}
        />
      );
    }
    return (
      <DataTable
        headers={["Page", "Status", "Published", "Link", "Actions"]}
        rows={rows}
      />
    );
  })();

  return (
    <Section title="Published pages">
      {/* The registry's anchor id is "public-pages" (saved deep links point at
          it); the Section derives its own from its title, so it is restated. */}
      <div data-settings-anchor="public-pages" className="space-y-4">
        {body}
      </div>
    </Section>
  );
};
