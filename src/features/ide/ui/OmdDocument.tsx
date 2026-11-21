/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarkdownDocument.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { omdBody } from "@/features/page-file/model/omdPreviewContent";

import { OmdDocumentView } from "./OmdDocumentView";
import { usePreviewState } from "./usePreviewState";

/** An .omd file as a page, parsed in the preview's worker: no file can stall the tab beside it. */
export const OmdDocument = React.memo(function OmdDocument({ source }: Readonly<{ source: string }>) {
  const body = React.useMemo(() => omdBody(source), [source]);
  return <OmdDocumentView source={source} state={usePreviewState(body, "alt", "page")} />;
});
