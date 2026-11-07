/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CodePreviewPane.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import type { Block } from "@/entities/block";
import type { PreviewFlavor } from "../model/markdownPreview";
import { MarkdownDocument } from "./MarkdownDocument";

const OmdPreview = React.lazy(async () => {
  const [{ RawPreviewPane }, { fileToPage }] = await Promise.all([
    import("@/features/raw-mode/ui/RawPreviewPane"),
    import("@/features/page-file/model/pageFileCodec"),
  ]);
  // Built once per module load: a stable parse keeps RawPreviewPane's memo effective.
  const parse = (text: string): Block[] => fileToPage(text).content;
  return { default: ({ source }: Readonly<{ source: string }>) => <RawPreviewPane source={source} parse={parse} /> };
});

/**
 * The app's preview: an .omd file is an osionos page and renders as one (blocks, the
 * engine's effects); a plain .md renders as plain Markdown, so nothing osionos-only
 * changes how a README written elsewhere looks.
 */
export function CodePreviewPane({ flavor, source }: Readonly<{ flavor: PreviewFlavor; source: string }>) {
  if (flavor === "markdown") return <MarkdownDocument source={source} images="remote" />;
  return (
    <React.Suspense fallback={null}>
      <OmdPreview source={source} />
    </React.Suspense>
  );
}
