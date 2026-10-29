/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockTypePreview.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import {
  ChevronRight,
  FileText,
  Info,
  Square,
  SquareCheck,
} from "lucide-react";
import type { BlockType } from "@/entities/block";

export type BlockTypePreviewKind = BlockType | "page";

const HEADING_CLASS: Partial<Record<BlockTypePreviewKind, string>> = {
  heading_1: "osio-h1",
  heading_2: "osio-h2",
  heading_3: "osio-h3",
  heading_4: "osio-h4",
};

const HEADING_LABEL: Partial<Record<BlockTypePreviewKind, string>> = {
  heading_1: "Heading 1",
  heading_2: "Heading 2",
  heading_3: "Heading 3",
  heading_4: "Heading 4",
};

/** One muted text line — the body that follows a heading or a list marker. */
const MutedLine: React.FC<{ width: string }> = ({ width }) => (
  <span
    aria-hidden
    className="block h-1.5 rounded-full bg-[var(--osio-bg-muted)]"
    style={{ width }}
  />
);

const BulletRow: React.FC<{ width: string }> = ({ width }) => (
  <div className="flex items-center gap-2">
    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--osio-fg-muted)]" />
    <MutedLine width={width} />
  </div>
);

const NumberRow: React.FC<{ n: number; width: string }> = ({ n, width }) => (
  <div className="flex items-center gap-2">
    <span className="w-3 shrink-0 text-2xs text-[var(--osio-fg-muted)]">{n}.</span>
    <MutedLine width={width} />
  </div>
);

const TodoRow: React.FC<{ checked?: boolean; width: string }> = ({
  checked,
  width,
}) => (
  <div className="flex items-center gap-2">
    {checked ? (
      <SquareCheck
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 text-[var(--osio-accent)]"
      />
    ) : (
      <Square
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 text-[var(--osio-fg-muted)]"
      />
    )}
    <MutedLine width={width} />
  </div>
);

const PreviewBody: React.FC<{ type: BlockTypePreviewKind }> = ({ type }) => {
  if (type === "page") {
    return (
      <div className="flex items-center gap-2">
        <FileText aria-hidden className="h-4 w-4 text-[var(--osio-fg-muted)]" />
        <span className="text-sm font-medium text-[var(--osio-fg-default)]">
          Page
        </span>
      </div>
    );
  }

  if (HEADING_CLASS[type]) {
    return (
      <div className="flex h-full flex-col justify-center gap-2">
        <span className={`${HEADING_CLASS[type]} text-[var(--osio-fg-default)]`}>
          {HEADING_LABEL[type]}
        </span>
        <MutedLine width="82%" />
      </div>
    );
  }

  switch (type) {
    case "bulleted_list":
      return (
        <div className="flex h-full flex-col justify-center gap-2.5">
          <BulletRow width="70%" />
          <BulletRow width="56%" />
          <BulletRow width="62%" />
        </div>
      );
    case "numbered_list":
      return (
        <div className="flex h-full flex-col justify-center gap-2.5">
          <NumberRow n={1} width="68%" />
          <NumberRow n={2} width="54%" />
          <NumberRow n={3} width="60%" />
        </div>
      );
    case "to_do":
      return (
        <div className="flex h-full flex-col justify-center gap-2.5">
          <TodoRow checked width="66%" />
          <TodoRow width="58%" />
          <TodoRow width="50%" />
        </div>
      );
    case "toggle":
      return (
        <div className="flex h-full flex-col justify-center gap-2">
          <div className="flex items-center gap-1.5">
            <ChevronRight
              aria-hidden
              className="h-3.5 w-3.5 text-[var(--osio-fg-muted)]"
            />
            <span className="text-sm font-medium text-[var(--osio-fg-default)]">
              Toggle
            </span>
          </div>
          <div className="ml-5 flex flex-col gap-2">
            <MutedLine width="62%" />
            <MutedLine width="48%" />
          </div>
        </div>
      );
    case "code":
      return (
        <div className="h-full rounded-md border border-[var(--osio-code-border)] bg-[var(--osio-code-bg)] p-2 font-mono text-2xs leading-5 text-[var(--osio-code-fg)]">
          <div>
            <span className="text-[var(--osio-code-fg-muted)]">const</span> answer
            = <span className="text-[var(--osio-code-caret)]">42</span>;
          </div>
          <div className="text-[var(--osio-code-fg-muted)]">{"// preview"}</div>
        </div>
      );
    case "quote":
      return (
        <div className="flex h-full items-center gap-3">
          <span className="h-12 w-1 shrink-0 rounded-full bg-[var(--osio-fg-default)]" />
          <span className="text-sm italic leading-relaxed text-[var(--osio-fg-muted)]">
            A quote keeps its voice.
          </span>
        </div>
      );
    case "callout":
      return (
        <div className="flex h-full items-center gap-2.5 rounded-md bg-[var(--osio-block-tint-blue-bg)] px-3">
          <Info
            aria-hidden
            className="h-4 w-4 shrink-0 text-[var(--osio-block-tint-blue-fg)]"
          />
          <span className="text-sm text-[var(--osio-fg-default)]">
            A callout that stands out.
          </span>
        </div>
      );
    case "equation":
      return (
        <div className="flex h-full items-center justify-center">
          <span className="font-serif text-xl italic text-[var(--osio-fg-default)]">
            a² + b² = c²
          </span>
        </div>
      );
    default:
      return (
        <div className="flex h-full flex-col justify-center gap-2.5">
          <span className="text-sm leading-relaxed text-[var(--osio-fg-default)]">
            Plain text with a clear voice.
          </span>
          <MutedLine width="72%" />
        </div>
      );
  }
};

/** A 200×120 picture of a block type, drawn with the app's own typography and tokens. */
export const BlockTypePreview: React.FC<{ type: BlockTypePreviewKind }> = ({
  type,
}) => (
  <div
    aria-hidden
    data-block-type-preview={type}
    className="overflow-hidden border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]"
    style={{
      width: 200,
      height: 120,
      borderRadius: "var(--osio-radius-lg)",
      padding: "14px 16px",
      boxShadow: "var(--osio-e1)",
    }}
  >
    <PreviewBody type={type} />
  </div>
);
