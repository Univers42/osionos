/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReportIssueDialog.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";
import { Modal } from "@osionos/ui/primitives/Modal";
import { useToastStore } from "@/shared/ui";
import { API_BASE } from "@/shared/api/client";
import { uploadPageMedia } from "@/shared/lib/media/pageMediaUpload";
import { createIssue } from "@/features/issues/api/issuesApi";
import { useIssueReportRequest } from "@/features/issues/model/issueReportRequest";
import { redactIssueText } from "@/features/issues/model/redact";
import { routeKindOf } from "@/features/issues/model/routeKind";
import { recentErrors } from "@/features/issues/model/errorRing";
import { useUserStore } from "@/features/auth/model/useUserStore";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { findPane } from "@/widgets/workspace-grid/model/layoutTree";

export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface ScreenshotValidation {
  ok: boolean;
  error?: string;
}

export function validateScreenshotFile(file: { size: number; type: string }): ScreenshotValidation {
  if (!ALLOWED_SCREENSHOT_TYPES.has(file.type)) {
    return { ok: false, error: "Only PNG, JPEG, or WebP images can be attached." };
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: "That image is over 5 MB. Choose a smaller one." };
  }
  return { ok: true };
}

export interface ReportIssueDialogProps {
  open?: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
}

function activeTabKind(): string | undefined {
  try {
    const layout = useWorkspaceLayout.getState();
    const pane = layout.activePaneId ? findPane(layout.root, layout.activePaneId) : null;
    const tab = pane?.tabs.find((item) => item.tabId === pane.activeTabId) ?? pane?.tabs[0];
    return tab?.kind;
  } catch {
    return undefined;
  }
}

export const ReportIssueDialog: React.FC<ReportIssueDialogProps> = ({ open: openProp, onClose, title: titleProp, description: descriptionProp }) => {
  const request = useIssueReportRequest((state) => state.request);
  const isOpen = openProp ?? request !== null;

  const initialTitle = titleProp ?? request?.title ?? "";
  const initialDescription = descriptionProp ?? request?.description ?? "";

  const [titleText, setTitleText] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [attachErrors, setAttachErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captured, setCaptured] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitleText(initialTitle);
    setDescription(initialDescription);
    setScreenshot(null);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setAttachErrors(false);
    setError(null);
    setBusy(false);
    setCaptured("");
  }, [isOpen, initialTitle, initialDescription]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const close = () => {
    if (request) useIssueReportRequest.getState().clear();
    onClose?.();
  };

  const pickFile = (file: File | null) => {
    if (!file) return;
    const check = validateScreenshotFile(file);
    if (!check.ok) {
      setError(check.error ?? "That file cannot be attached.");
      return;
    }
    setError(null);
    setScreenshot(file);
    try {
      setPreviewUrl(URL.createObjectURL(file));
    } catch {
      setPreviewUrl(null);
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          pickFile(file);
          return;
        }
      }
    }
  };

  const captureScreen = async () => {
    const mediaDevices = (globalThis.navigator as { mediaDevices?: { getDisplayMedia?: (constraints: unknown) => Promise<MediaStream> } })?.mediaDevices;
    if (!mediaDevices?.getDisplayMedia) return;
    let stream: MediaStream | null = null;
    try {
      stream = await mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1;
      canvas.height = video.videoHeight || 1;
      const context = canvas.getContext("2d");
      context?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((result) => resolve(result), "image/png"));
      if (!blob) throw new Error("The screen could not be captured.");
      const file = new File([blob], "screenshot.png", { type: "image/png" });
      pickFile(file);
      setCaptured("Screen captured");
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "The screen could not be captured.");
    } finally {
      // A failed play() or toBlob() must not leave the browser sharing the screen.
      stream?.getTracks().forEach((track) => track.stop());
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  };

  const submit = async () => {
    if (!titleText.trim() || !description.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      let screenshotPath: string | undefined;
      if (screenshot) {
        const absolute = await uploadPageMedia(screenshot);
        const relative = API_BASE && absolute.startsWith(API_BASE) ? absolute.slice(API_BASE.length) : absolute;
        if (!/^\/api\/media\/uploads\/[^/]+\/[0-9a-f]{64}\.(png|jpg|jpeg|webp)$/.test(relative)) {
          throw new Error("The screenshot upload did not return a usable path.");
        }
        screenshotPath = relative;
      }

      const workspaceId = useUserStore.getState().activeWorkspace()?._id;
      const errors = attachErrors ? recentErrors().map((line) => redactIssueText(line)) : undefined;
      await createIssue({
        title: redactIssueText(titleText).slice(0, 120),
        body: redactIssueText(description),
        routeKind: routeKindOf(
          typeof window !== "undefined" ? window.location.pathname : "/",
          activeTabKind(),
        ),
        appVersion: (import.meta.env?.VITE_APP_VERSION as string | undefined) ?? undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : undefined,
        errors,
        screenshotPath,
        workspaceId: workspaceId ?? undefined,
      });

      useToastStore.getState().push({ kind: "success", title: "Report sent" });
      close();
    } catch (submitError) {
      const apiError = submitError as { code?: string; message?: string };
      if (apiError?.code === "issue_report_daily_cap") {
        setError("You have sent 20 reports today; try again tomorrow.");
      } else {
        setError(apiError?.message ?? "The report could not be sent.");
      }
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const hasDisplayMedia = typeof navigator !== "undefined" && Boolean((navigator as { mediaDevices?: { getDisplayMedia?: unknown } }).mediaDevices?.getDisplayMedia);

  const content = (
    <div className="flex flex-col gap-4 p-6" onPaste={onPaste}>
        <label className="flex flex-col gap-1 text-sm">
          <span>Title</span>
          <input
            type="text"
            value={titleText}
            maxLength={120}
            onChange={(event) => setTitleText(event.target.value)}
            aria-label="Title"
            className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-[var(--osio-fg-subtle)]">{titleText.length}/120</span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>Description</span>
          <textarea
            value={description}
            maxLength={4000}
            onChange={(event) => setDescription(event.target.value)}
            aria-label="Description"
            rows={5}
            className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-[var(--osio-fg-subtle)]">{description.length}/4000</span>
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm">Screenshot</span>
          <div className="flex flex-wrap gap-2">
            {hasDisplayMedia ? (
              <button type="button" onClick={() => void captureScreen()} aria-label="Capture screen" className="rounded-md border px-3 py-1.5 text-sm">
                Capture screen
              </button>
            ) : null}
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Choose image" className="rounded-md border px-3 py-1.5 text-sm">
              Choose image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
          </div>
          {previewUrl ? (
            <div className="flex items-center gap-2">
              <img src={previewUrl} alt="Screenshot preview" className="h-24 rounded-md border" />
              <button type="button" onClick={removeScreenshot} aria-label="Remove screenshot" className="rounded-md px-2 py-1 text-sm">
                Remove
              </button>
            </div>
          ) : null}
        </div>

        <div aria-live="polite" className="text-xs text-[var(--osio-fg-subtle)]">{captured}</div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={attachErrors} onChange={(event) => setAttachErrors(event.target.checked)} aria-label="Attach recent errors" />
          Attach recent errors ({recentErrors().length})
        </label>
        {attachErrors ? (
          <pre className="max-h-24 overflow-auto rounded-md border p-2 text-xs">{recentErrors().join("\n")}</pre>
        ) : null}

        <p className="text-xs text-[var(--osio-fg-subtle)]">
          Sent to osionos staff. They see your name, this text, the screenshot and the kind of screen you were on (not its content).
        </p>
        <p className="text-xs text-[var(--osio-fg-subtle)]">Preview: {redactIssueText(description)}</p>

        {error ? <div role="alert" className="text-sm text-red-600">{error}</div> : null}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-md px-3 py-1.5 text-sm">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={busy || !titleText.trim() || !description.trim()} className="rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] disabled:opacity-50">
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
  );

  if (typeof document === "undefined") {
    return isOpen ? <div data-report-issue-dialog="">{content}</div> : null;
  }

  return isOpen ? (
    <Modal open={isOpen} onClose={close} title="Report an issue" description="Tell us what went wrong." size="md">
      {content}
    </Modal>
  ) : null;
};
